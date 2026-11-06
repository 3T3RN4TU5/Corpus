"""Measures every skeletal joint in the built models: the gap between the two bones and how deeply they overlap.

Run with: blender --background --factory-startup --python tools/blender/audit_joints.py -- <models dir> <report.json>
It writes the full results to <report.json> and a readable table next to it, as <report.json>.txt.

Most bones share a node with others, so they are told apart by connected islands of the mesh, then named by position.
Hands and feet are named by walking outward from the carpals or tarsals, which still works when fingers are posed.
"""
import json
import re
import sys
import time
import traceback
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

models, report_path = sys.argv[sys.argv.index("--") + 1:]
models = Path(models)
report_path = Path(report_path)

# The largest believable gap, in mm, for each kind of joint. The bone meshes have no cartilage, so a healthy gap is the
# cartilage or disc that would fill it. The smallest believable gap is always 0, since a mesh reduced for the web can touch.
RANGES = {
    "large synovial": (10, "hip, knee, shoulder, elbow, ankle: 2-4 mm of cartilage on each face"),
    "patellofemoral": (10, "the patella has the thickest cartilage in the body, up to about 5 mm"),
    "small synovial": (6, "finger, toe, wrist and foot joints: 1-3 mm joint spaces on radiographs, plus reduced-mesh error"),
    "with disc": (10, "sternoclavicular and temporomandibular joints, and the pubic symphysis, hold a disc"),
    "acromioclavicular": (8, "a small joint with a small disc"),
    "ulna-carpal": (10, "the ulna does not reach the carpals: a cartilage disc about 5 mm thick sits between them"),
    "skull-atlas": (8, "occipital condyles on the C1 facets, with 1-3 mm of cartilage on each"),
    "spine": (10, "nearest points are normally the facet joints, or the bodies across a disc"),
    "disc contact": (4, "a disc is attached to the bone above and below it"),
    "sacroiliac": (6, "a narrow joint, about 1-3 mm"),
    "bone contact": (6, "the bones are bound together, as at the rib heads and the ends of the tibia and fibula"),
    "cartilage contact": (5, "costal cartilage is continuous with its rib and joins the sternum directly"),
}
# Bones never pass through each other. A little is allowed, because reducing a mesh moves its surface by a millimetre or so.
OVERLAP_TOLERANCE_MM = 2.0
ASYMMETRY_LIMIT_MM = 10.0
# Rough adult proportions, as well-known textbook ratios. A body outside these is worth a look, not necessarily wrong.
PROPORTIONS = (
    ("femur / height", ("femur", None), (0.25, 0.29)),
    ("tibia / height", ("tibia", None), (0.20, 0.24)),
    ("fibula / height", ("fibula", None), (0.20, 0.24)),
    ("humerus / height", ("humerus", None), (0.18, 0.21)),
    ("radius / height", ("radius", None), (0.13, 0.16)),
    ("ulna / height", ("ulna", None), (0.14, 0.17)),
    ("clavicle / height", ("clavicle", None), (0.08, 0.10)),
    ("hand / height", ("hand", None), (0.095, 0.12)),
    ("foot / height", ("foot", None), (0.14, 0.17)),
    ("tibia / femur", ("tibia", "femur"), (0.78, 0.88)),
    ("radius / humerus", ("radius", "humerus"), (0.70, 0.80)),
)
NOT_CHECKED = (
    "Ribs 8-10 to their cartilages: BodyParts3D has costal cartilages for ribs 1-7 only.",
    "A joint's orientation: a bone can pass here at the right distance from its neighbour but be turned the wrong way.",
    "Joints between individual carpals, between metacarpals, and between metatarsals. Wrist rows treat the carpals as one mass.",
    "Rib tubercle to transverse process, apart from what falls within 3 cm of the rib head.",
    "The low-detail models. Only the -high files are read.",
)
HAND_BONES = 27  # 8 carpals, 5 metacarpals, 14 phalanges.
FOOT_BONES = 26  # 7 tarsals, 5 metatarsals, 14 phalanges.
FINGERS = ("index", "middle", "ring", "little")
TOES = ("toe 2", "toe 3", "toe 4", "toe 5")


class Bone:
    """A mesh in world coordinates, with its search tree built only when needed."""

    def __init__(self, name, vertices, triangles, closed=True, source=None):
        self.name = name
        self.vertices = vertices
        self.triangles = triangles
        self.closed = closed
        self.source = source
        self._tree = None
        self.centre = vertices.mean(axis=0)
        self.low = vertices.min(axis=0)
        self.high = vertices.max(axis=0)

    @property
    def tree(self):
        if self._tree is None:
            self._tree = BVHTree.FromPolygons(self.vertices.tolist(), self.triangles.tolist(), all_triangles=True)
        return self._tree

    @property
    def axis(self):
        """The bone's longest direction."""
        return np.linalg.svd(self.vertices - self.centre, full_matrices=False)[2][0]

    @property
    def length(self):
        return float(np.ptp((self.vertices - self.centre) @ self.axis))

    @property
    def volume(self):
        a, b, c = (self.vertices[self.triangles[:, corner]] - self.centre for corner in range(3))
        return abs(float((a * np.cross(b, c)).sum())) / 6

    def subset(self, mask, name=None):
        """The part of the bone made of the chosen vertices. It is an open surface, so nothing can be inside it."""
        chosen = self.triangles[mask[self.triangles].all(axis=1)]
        remap = np.cumsum(mask) - 1
        return Bone(name or self.name, self.vertices[mask], remap[chosen], closed=False)

    def end(self, toward, fraction=1 / 3, name=None):
        """The end of the bone nearest a point."""
        along = (self.vertices - self.centre) @ self.axis
        if (toward - self.centre) @ self.axis < 0:
            along = -along
        return self.subset(along > along.max() - np.ptp(along) * fraction, name)


def union(name, bones):
    bones = [bone for bone in bones if bone is not None]
    if not bones:
        return None
    offsets = np.cumsum([0] + [len(bone.vertices) for bone in bones[:-1]])
    return Bone(
        name,
        np.vstack([bone.vertices for bone in bones]),
        np.vstack([bone.triangles + offset for bone, offset in zip(bones, offsets)]),
        closed=all(bone.closed for bone in bones),
    )


def split_islands(vertices, triangles):
    """Splits a mesh into its connected pieces, largest first."""
    parent = list(range(len(vertices)))

    def find(item):
        while parent[item] != item:
            parent[item] = parent[parent[item]]
            item = parent[item]
        return item

    for a, b, c in triangles.tolist():
        root = find(a)
        parent[find(b)] = root
        parent[find(c)] = root
    roots = np.array([find(item) for item in range(len(vertices))])
    pieces = []
    for root in np.unique(roots):
        mask = roots == root
        remap = np.cumsum(mask) - 1
        chosen = triangles[mask[triangles[:, 0]]]
        if len(chosen):
            pieces.append((vertices[mask], remap[chosen]))
    return sorted(pieces, key=lambda piece: -len(piece[0]))


def load_nodes(body):
    """Reads a body's skeleton files into {part id: [Bone per island]}. A part can come from more than one file."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    nodes = {}
    files = sorted((models / body).glob("*-skeleton-high.glb"))
    for path in files:
        known = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(path))
        bpy.context.view_layer.update()
        for obj in set(bpy.data.objects) - known:
            if obj.type != "MESH":
                continue
            mesh = obj.data
            mesh.calc_loop_triangles()
            vertices = np.empty(len(mesh.vertices) * 3)
            mesh.vertices.foreach_get("co", vertices)
            triangles = np.empty(len(mesh.loop_triangles) * 3, dtype=np.int64)
            mesh.loop_triangles.foreach_get("vertices", triangles)
            matrix = np.array(obj.matrix_world)
            world = vertices.reshape(-1, 3) @ matrix[:3, :3].T + matrix[:3, 3]
            part = obj.name.split(".")[0]
            for index, (v, t) in enumerate(split_islands(world, triangles.reshape(-1, 3))):
                nodes.setdefault(part, []).append(Bone(f"{part}#{index}", v, t, source=path.name))
    for islands in nodes.values():
        islands.sort(key=lambda bone: -len(bone.vertices))
    return nodes, {path.name: time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(path.stat().st_mtime)) for path in files}


def smallest_distances(points, others):
    """For each point, the distance to the nearest of the other points."""
    others = others[:: max(1, len(others) // 4000)]
    result = np.empty(len(points))
    for start in range(0, len(points), 400):
        chunk = points[start : start + 400]
        result[start : start + 400] = np.sqrt(((chunk[:, None, :] - others[None, :, :]) ** 2).sum(axis=2).min(axis=1))
    return result


def vertex_gap(a, b):
    return float(smallest_distances(a.vertices, b.vertices).min())


def is_inside(tree, point):
    """Counts surface crossings along three directions. Two of the three must agree, to survive a stray hit."""
    votes = 0
    for direction in ((1, 0, 0), (0, 1, 0), (0, 0, 1)):
        direction = Vector(direction)
        origin = Vector(point)
        crossings = 0
        for _ in range(60):
            hit = tree.ray_cast(origin, direction)[0]
            if hit is None:
                break
            crossings += 1
            origin = hit + direction * 1e-6
        votes += crossings % 2
    return votes >= 2


def measure(a, b):
    """Returns the surface gap, the overlap depth, the share of vertices inside the other bone, and where they meet."""
    gap = np.inf
    depth = 0.0
    inside_count = 0
    near_points = []
    for source, target in ((a, b), (b, a)):
        rough = smallest_distances(source.vertices, target.vertices)
        for index in np.argsort(rough)[:300]:
            found = target.tree.find_nearest(Vector(source.vertices[index]))
            if found[0] is not None:
                gap = min(gap, found[3])
        near_points.append(source.vertices[rough <= rough.min() + 0.004])
        if target.closed:
            within = np.all((source.vertices >= target.low) & (source.vertices <= target.high), axis=1)
            for point in source.vertices[within]:
                if is_inside(target.tree, point):
                    inside_count += 1
                    depth = max(depth, target.tree.find_nearest(Vector(point))[3])
    crossing = bool(a.tree.overlap(b.tree))
    return {
        "gap_mm": 0.0 if crossing or depth > 0 else round(gap * 1000, 1),
        "overlap_mm": round(depth * 1000, 1),
        "inside_pct": round(100 * inside_count / (len(a.vertices) + len(b.vertices)), 1),
        "at": np.round(np.vstack(near_points).mean(axis=0), 4).tolist(),
    }


def paired(islands, midline):
    """The two largest islands of a part that has one bone on each side."""
    result = {}
    for bone in islands[:2]:
        result["left" if bone.centre[0] > midline else "right"] = bone
    return result


def walk_outward(roots, pool, anchor):
    """Builds the digits outward from their metacarpals or metatarsals, one level of phalanges at a time."""
    chains = [[root] for root in roots]
    pool = list(pool)
    while pool:
        options = []
        for index, chain in enumerate(chains):
            start = chain[-2].centre if len(chain) > 1 else anchor
            distances = np.linalg.norm(chain[-1].vertices - start, axis=1)
            tip = chain[-1].vertices[distances >= np.percentile(distances, 60)]
            for bone in pool:
                options.append((float(smallest_distances(tip, bone.vertices).min()), index, bone))
        options.sort(key=lambda option: option[0])
        extended = set()
        placed = []
        for _, index, bone in options:
            if index not in extended and not any(bone is other for other in placed):
                chains[index].append(bone)
                extended.add(index)
                placed.append(bone)
                if len(extended) == len(chains):
                    break
        pool = [bone for bone in pool if not any(bone is other for other in placed)]
    return chains


def order_digits(chains, short_digit, others, warnings, where):
    """Names the digits. The thumb or big toe is the one with a bone fewer, and the rest follow in order away from it."""
    short = [chain for chain in chains if len(chain) == 3]
    if len(short) != 1 or any(len(chain) not in (3, 4) for chain in chains):
        warnings.append(f"{where}: digit lengths are {[len(chain) for chain in chains]}, so the digits may be misnamed")
        short = [min(chains, key=len)]
    rest = sorted((chain for chain in chains if chain is not short[0]), key=lambda chain: np.linalg.norm(chain[0].centre - short[0][0].centre))
    return {short_digit: short[0], **dict(zip(others, rest))}


def label_hand(bones, side, warnings):
    if len(bones) < HAND_BONES:
        warnings.append(f"{side} hand has {len(bones)} bones, not {HAND_BONES}, so it was not measured joint by joint")
        return None
    fragments = len(bones) - HAND_BONES
    bones = bones[:HAND_BONES]
    # The capitate touches the most neighbours, and the other carpals are the bones nearest to it. Contact is judged
    # against the size of the bones, so that this still works on a hand scaled wrongly.
    reach = 0.25 * float(np.median([bone.length for bone in bones]))
    contacts = [sum(vertex_gap(bone, other) < reach for other in bones if other is not bone) for bone in bones]
    seed = bones[int(np.argmax(contacts))]
    by_distance = sorted(bones, key=lambda bone: np.linalg.norm(bone.centre - seed.centre))
    carpals = by_distance[:8]
    rest = by_distance[8:]
    carpal_mass = union("carpals", carpals)
    rest.sort(key=lambda bone: vertex_gap(bone, carpal_mass))
    chains = walk_outward(rest[:5], rest[5:], carpal_mass.centre)
    digits = order_digits(chains, "thumb", FINGERS, warnings, f"{side} hand")
    check_digits(digits, carpals, warnings, f"{side} hand")
    if fragments:
        warnings.append(f"{side} hand: {fragments} tiny fragment(s) ignored")
    return {"carpals": carpals, "carpal_mass": carpal_mass, "digits": digits}


def label_foot(bones, side, midline, warnings):
    if len(bones) < FOOT_BONES:
        warnings.append(f"{side} foot has {len(bones)} bones, not {FOOT_BONES}, so it was not measured joint by joint")
        return None
    fragments = len(bones) - FOOT_BONES
    bones = bones[:FOOT_BONES]
    outward = 1 if side == "left" else -1
    # The two biggest bones are the talus, on top, and the calcaneus, beneath it.
    biggest = sorted(bones, key=lambda bone: -bone.volume)[:2]
    talus, calcaneus = sorted(biggest, key=lambda bone: -bone.centre[2])
    near_talus = sorted((b for b in bones if b is not talus and b is not calcaneus), key=lambda b: np.linalg.norm(b.centre - talus.centre))
    tarsals, rest = near_talus[:5], near_talus[5:]
    navicular = min(tarsals, key=lambda bone: vertex_gap(bone, talus))
    others = sorted((bone for bone in tarsals if bone is not navicular), key=lambda bone: (bone.centre[0] - midline) * outward)
    cuboid, cuneiforms = others[-1], others[:-1]
    tarsal_mass = union("tarsals", [talus, calcaneus, navicular, cuboid, *cuneiforms])
    rest.sort(key=lambda bone: vertex_gap(bone, tarsal_mass))
    chains = walk_outward(rest[:5], rest[5:], tarsal_mass.centre)
    digits = order_digits(chains, "big toe", TOES, warnings, f"{side} foot")
    check_digits(digits, [talus, calcaneus], warnings, f"{side} foot")
    if fragments:
        warnings.append(f"{side} foot: {fragments} tiny fragment(s) ignored")
    return {"talus": talus, "calcaneus": calcaneus, "navicular": navicular, "cuboid": cuboid, "cuneiforms": cuneiforms, "digits": digits}


def check_digits(digits, base_bones, warnings, where):
    """A metacarpal or metatarsal, and then a first phalanx, should each be longer than the next bone. If not, the names
    are probably wrong. The last phalanx is left out, because a little toe's distal one can outgrow its middle one."""
    for digit, chain in digits.items():
        lengths = [bone.length for bone in chain]
        if any(later > earlier * 1.15 for earlier, later in zip(lengths[:2], lengths[1:3])):
            warnings.append(f"{where} {digit}: bone lengths {np.round(np.array(lengths) * 1000).tolist()} mm do not shrink outward, so check the naming")


def label_spine(nodes, warnings):
    """Returns the vertebrae from the top down, and the discs. The atlas's female body really has six lumbar vertebrae."""
    islands = [bone for bone in nodes.get("vertebral-column", []) if len(bone.vertices) >= 20]
    sources = {bone.source for bone in islands}
    atlas = [source for source in sources if source.startswith("hra")]
    if atlas:
        vertebrae = [bone for bone in islands if bone.source in atlas]
        discs = [bone for bone in islands if bone.source not in atlas]
    else:
        # Without the atlas's vertebrae, a disc is told apart by being thin from top to bottom.
        vertebrae = [bone for bone in islands if np.ptp(bone.vertices[:, 2]) >= 0.03]
        discs = [bone for bone in islands if np.ptp(bone.vertices[:, 2]) < 0.03]
    vertebrae.sort(key=lambda bone: -bone.centre[2])
    names = [f"C{i}" for i in range(1, 8)] + [f"T{i}" for i in range(1, 13)]
    names += [f"L{i}" for i in range(1, len(vertebrae) - 18)]
    if len(vertebrae) not in (24, 25):
        warnings.append(f"spine has {len(vertebrae)} vertebrae, so the level names may be wrong")
    for name, bone in zip(names, vertebrae):
        bone.name = name
    return vertebrae, discs


class BodyAudit:
    def __init__(self, body):
        self.body = body
        self.rows = []
        self.lengths = {}
        self.warnings = []
        self.labels = {}

    def record_digits(self, where, named):
        """Keeps where each named bone is, so that the naming of a hand or foot can be checked afterwards."""
        self.labels[where] = {name: np.round((bone.low + bone.high) / 2, 4).tolist() for name, bone in named.items()}

    def joint(self, group, side, name, a, b, kind, note=None):
        row = {"body": self.body, "group": group, "side": side, "joint": name, "kind": kind}
        if a is None or b is None:
            row.update(status="not measured", note=note or "a bone could not be identified")
            self.rows.append(row)
            return row
        row.update(measure(a, b))
        limit = RANGES[kind][0]
        row["max_gap_mm"] = limit
        excess = max(row["gap_mm"] - limit, row["overlap_mm"] - OVERLAP_TOLERANCE_MM)
        row["excess_mm"] = round(max(0.0, excess), 1)
        row["status"] = "fail" if excess > 0 else "pass"
        if row["status"] == "fail":
            row["problem"] = "gap" if row["gap_mm"] > limit else "overlap"
        if note:
            row["note"] = note
        self.rows.append(row)
        return row

    def length(self, side, name, bone):
        if bone is not None:
            self.lengths.setdefault(name, {})[side] = round(bone.length * 1000, 1)

    def run(self, nodes):
        spine, discs = label_spine(nodes, self.warnings)
        if not spine:
            raise RuntimeError("no vertebrae found")
        midline = float(np.median([bone.centre[0] for bone in spine]))
        self.midline = midline
        level = {bone.name: bone for bone in spine}
        pelvis = self.audit_spine_and_pelvis(nodes, spine, discs, midline)
        limbs = {
            part: paired(nodes.get(part, []), midline)
            for part in ("clavicle", "scapula", "humerus", "radius", "ulna", "femur", "patella", "tibia", "fibula")
        }
        for part, bones in limbs.items():
            for side, bone in bones.items():
                self.length(side, part, bone)
        self.audit_head(nodes, spine[0], midline)
        ribs = self.audit_chest(nodes, level, limbs, midline)
        self.audit_arms(nodes, limbs, midline)
        self.audit_legs(nodes, limbs, pelvis, midline)
        return {"midline_x": round(midline, 4), "vertebrae": len(spine), "discs": len(discs), "ribs": ribs}

    def audit_spine_and_pelvis(self, nodes, spine, discs, midline):
        islands = [bone for bone in nodes.get("pelvis", []) if len(bone.vertices) >= 20]
        straddling = sorted(
            (bone for bone in islands if abs(bone.centre[0] - midline) < 0.02),
            key=lambda bone: -len(bone.vertices),
        )
        sacrum = straddling[0] if straddling else None
        coccyx = straddling[1] if len(straddling) > 1 else None
        pieces = [bone for bone in islands if bone is not sacrum and bone is not coccyx]
        hips = {
            "left": union("left hip bone", [bone for bone in pieces if bone.centre[0] > midline]),
            "right": union("right hip bone", [bone for bone in pieces if bone.centre[0] <= midline]),
        }

        for upper, lower in zip(spine, spine[1:]):
            self.joint("spine", "mid", f"{upper.name}-{lower.name}", upper, lower, "spine")
        self.joint("spine", "mid", f"{spine[-1].name}-sacrum", spine[-1], sacrum, "spine")
        self.joint("spine", "mid", "sacrum-coccyx", sacrum, coccyx, "bone contact")

        for disc in sorted(discs, key=lambda bone: -bone.centre[2]):
            # A disc belongs between the two vertebrae (or the last vertebra and the sacrum) nearest it.
            candidates = spine + ([sacrum] if sacrum else [])
            pair = sorted(candidates, key=lambda bone: vertex_gap(disc, bone))[:2]
            first, second = sorted(pair, key=lambda bone: -bone.centre[2])
            first_name = "sacrum" if first is sacrum else first.name
            second_name = "sacrum" if second is sacrum else second.name
            label = f"disc nearest {first_name}/{second_name}"
            self.joint("discs", "mid", f"{label}: to {first_name}", disc, first, "disc contact")
            self.joint("discs", "mid", f"{label}: to {second_name}", disc, second, "disc contact")

        for side, hip in hips.items():
            self.joint("pelvis", side, "sacrum-hip bone", sacrum, hip, "sacroiliac")
        self.joint("pelvis", "mid", "pubic symphysis", hips["left"], hips["right"], "with disc")
        return hips

    def audit_head(self, nodes, atlas, midline):
        islands = nodes.get("skull", [])
        skull = None
        if islands:
            # The hyoid is counted in the skull part, but it floats below the jaw and meets neither joint.
            floating = min(islands, key=lambda bone: bone.high[2])
            skull = union("skull", [bone for bone in islands if bone is not floating])
        self.joint("head", "mid", "skull-C1", skull, atlas, "skull-atlas")
        mandible = union("mandible", nodes.get("mandible", []))
        for side, sign in (("left", 1), ("right", -1)):
            condyle = None
            if mandible is not None:
                v = mandible.vertices
                mask = ((v[:, 0] - midline) * sign > 0) & (v[:, 1] > v[:, 1].min() + 0.55 * np.ptp(v[:, 1])) & (v[:, 2] > v[:, 2].min() + 0.6 * np.ptp(v[:, 2]))
                if mask.sum() >= 4:
                    condyle = mandible.subset(mask, "condyle")
            self.joint("head", side, "jaw-skull (temporomandibular)", condyle, skull, "with disc")

    def audit_chest(self, nodes, level, limbs, midline):
        islands = [bone for bone in nodes.get("rib-cage", []) if len(bone.vertices) >= 20]
        sternum_pieces = sorted((bone for bone in nodes.get("sternum", []) if len(bone.vertices) >= 20), key=lambda bone: -bone.centre[2])
        sternum = union("sternum", sternum_pieces)
        for upper, lower, name in zip(sternum_pieces, sternum_pieces[1:], ("manubrium-sternal body", "sternal body-xiphoid")):
            self.joint("chest", "mid", name, upper, lower, "bone contact")
        front_of_spine = min(bone.low[1] for name, bone in level.items() if name.startswith("T"))
        counts = {}
        for side, sign in (("left", 1), ("right", -1)):
            on_side = [bone for bone in islands if (bone.centre[0] - midline) * sign > 0]
            # A rib reaches back to the spine, and a costal cartilage stays at the front. BodyParts3D has only seven per side.
            ribs = sorted((bone for bone in on_side if bone.high[1] > front_of_spine), key=lambda bone: -bone.centre[2])
            cartilages = sorted((bone for bone in on_side if bone.high[1] <= front_of_spine), key=lambda bone: -bone.centre[2])
            counts[side] = {"ribs": len(ribs), "cartilages": len(cartilages)}
            if len(ribs) != 12:
                self.warnings.append(f"{side} side has {len(ribs)} ribs, so the rib numbers may be wrong")
            thoracic = [level[f"T{i}"] for i in range(1, 13) if f"T{i}" in level]
            for number, rib in enumerate(ribs, start=1):
                self.length(side, f"rib {number}", rib)
                expected = [number - 1, number] if 2 <= number <= 9 else [number]
                facets = union(f"T{expected}", [level.get(f"T{i}") for i in expected])
                back = rib.vertices[:, 1] > rib.low[1] + 0.6 * np.ptp(rib.vertices[:, 1])
                inner = np.abs(rib.vertices[:, 0] - midline)
                head_point = rib.vertices[back][np.argmin(inner[back])]
                head = rib.subset(np.linalg.norm(rib.vertices - head_point, axis=1) < 0.03, "rib head")
                nearest = min(thoracic, key=lambda bone: vertex_gap(head, bone)) if thoracic else None
                label = "+".join(f"T{i}" for i in expected)
                self.joint("ribs", side, f"rib {number} head-{label}", head, facets, "bone contact", note=f"head is nearest {nearest.name}" if nearest else None)
                if number <= 7:
                    cartilage = cartilages[number - 1] if number <= len(cartilages) else None
                    self.joint("ribs", side, f"rib {number}-its cartilage", rib, cartilage, "cartilage contact")
                    self.joint("ribs", side, f"cartilage {number}-sternum", cartilage, sternum, "cartilage contact")
            clavicle = limbs["clavicle"].get(side)
            self.joint("shoulder", side, "clavicle-sternum", clavicle, sternum, "with disc")
            self.joint("shoulder", side, "clavicle-scapula", clavicle, limbs["scapula"].get(side), "acromioclavicular")
            self.joint("shoulder", side, "scapula-humerus", limbs["scapula"].get(side), limbs["humerus"].get(side), "large synovial")
        return counts

    def audit_arms(self, nodes, limbs, midline):
        bones = nodes.get("hand-bones", [])
        for side, sign in (("left", 1), ("right", -1)):
            humerus, radius, ulna = (limbs[part].get(side) for part in ("humerus", "radius", "ulna"))
            self.joint("arm", side, "humerus-radius", humerus, radius, "large synovial")
            self.joint("arm", side, "humerus-ulna", humerus, ulna, "large synovial")
            if humerus is not None and radius is not None and ulna is not None:
                self.joint("arm", side, "radius-ulna (elbow end)", radius.end(humerus.centre), ulna.end(humerus.centre), "bone contact")
                self.joint("arm", side, "radius-ulna (wrist end)", radius.end(2 * radius.centre - humerus.centre), ulna.end(2 * ulna.centre - humerus.centre), "bone contact")

            hand = label_hand([bone for bone in bones if (bone.centre[0] - midline) * sign > 0], side, self.warnings)
            if hand is None:
                for name in ("radius-carpals", "ulna-carpals", "carpals-metacarpals", "finger joints"):
                    self.joint("hand", side, name, None, None, "small synovial")
                continue
            carpals = hand["carpal_mass"]
            named = {f"carpal {i}": bone for i, bone in enumerate(hand["carpals"], start=1)}
            for digit, chain in hand["digits"].items():
                named.update({f"{digit} {i}": bone for i, bone in enumerate(chain)})
            self.record_digits(f"{side} hand", named)
            self.joint("hand", side, "radius-carpals (wrist)", radius, carpals, "small synovial")
            self.joint("hand", side, "ulna-carpals (wrist)", ulna, carpals, "ulna-carpal")
            for digit, chain in hand["digits"].items():
                self.joint("hand", side, f"{digit} metacarpal-carpals", chain[0], carpals, "small synovial")
                names = ["MCP", "IP"] if len(chain) == 3 else ["MCP", "PIP", "DIP"]
                for name, near, far in zip(names, chain, chain[1:]):
                    self.joint("hand", side, f"{digit} {name}", near, far, "small synovial")
                for name, bone in zip(("metacarpal", "proximal", "middle" if len(chain) == 4 else "distal", "distal"), chain):
                    self.length(side, f"{digit} {name}", bone)
            middle = hand["digits"].get("middle")
            if middle is not None:
                span = np.sqrt(((carpals.vertices[:, None, :] - middle[-1].vertices[None, :, :]) ** 2).sum(axis=2).max())
                self.lengths.setdefault("hand", {})[side] = round(float(span) * 1000, 1)

    def audit_legs(self, nodes, limbs, hips, midline):
        bones = nodes.get("foot-bones", [])
        for side, sign in (("left", 1), ("right", -1)):
            femur, patella, tibia, fibula = (limbs[part].get(side) for part in ("femur", "patella", "tibia", "fibula"))
            self.joint("leg", side, "hip bone-femur", hips.get(side), femur, "large synovial")
            self.joint("leg", side, "femur-tibia", femur, tibia, "large synovial")
            self.joint("leg", side, "femur-patella", femur, patella, "patellofemoral")
            if tibia is not None and fibula is not None:
                up, down = tibia.centre + [0, 0, 1], tibia.centre - [0, 0, 1]
                self.joint("leg", side, "tibia-fibula (knee end)", tibia.end(up), fibula.end(up), "bone contact")
                self.joint("leg", side, "tibia-fibula (ankle end)", tibia.end(down), fibula.end(down), "bone contact")

            foot = label_foot([bone for bone in bones if (bone.centre[0] - midline) * sign > 0], side, midline, self.warnings)
            if foot is None:
                for name in ("ankle", "tarsal joints", "toe joints"):
                    self.joint("foot", side, name, None, None, "small synovial")
                continue
            talus, calcaneus, navicular, cuboid = foot["talus"], foot["calcaneus"], foot["navicular"], foot["cuboid"]
            cuneiforms = foot["cuneiforms"]
            self.joint("foot", side, "tibia-talus (ankle)", tibia, talus, "large synovial")
            self.joint("foot", side, "fibula-talus (ankle)", fibula, talus, "small synovial")
            self.joint("foot", side, "talus-calcaneus", talus, calcaneus, "small synovial")
            self.joint("foot", side, "talus-navicular", talus, navicular, "small synovial")
            self.joint("foot", side, "calcaneus-cuboid", calcaneus, cuboid, "small synovial")
            for number, cuneiform in enumerate(cuneiforms, start=1):
                self.joint("foot", side, f"navicular-cuneiform {number}", navicular, cuneiform, "small synovial")
            digits = foot["digits"]
            named = {"talus": talus, "calcaneus": calcaneus, "navicular": navicular, "cuboid": cuboid}
            named.update({f"cuneiform {i}": bone for i, bone in enumerate(cuneiforms, start=1)})
            for digit, chain in digits.items():
                named.update({f"{digit} {i}": bone for i, bone in enumerate(chain)})
            self.record_digits(f"{side} foot", named)
            for digit, partner in zip(("big toe", "toe 2", "toe 3"), cuneiforms):
                if digit in digits:
                    self.joint("foot", side, f"{digit} metatarsal-cuneiform", digits[digit][0], partner, "small synovial")
            for digit in ("toe 4", "toe 5"):
                if digit in digits:
                    self.joint("foot", side, f"{digit} metatarsal-cuboid", digits[digit][0], cuboid, "small synovial")
            for digit, chain in digits.items():
                names = ["MTP", "IP"] if len(chain) == 3 else ["MTP", "PIP", "DIP"]
                for name, near, far in zip(names, chain, chain[1:]):
                    self.joint("foot", side, f"{digit} {name}", near, far, "small synovial")
                for name, bone in zip(("metatarsal", "proximal", "middle" if len(chain) == 4 else "distal", "distal"), chain):
                    self.length(side, f"{digit} {name}", bone)
            whole = union("foot", [talus, calcaneus, navicular, cuboid, *cuneiforms, *[bone for chain in digits.values() for bone in chain]])
            self.length(side, "foot", whole)

    def asymmetry(self):
        """Left against right, mirrored across the spine's midline. Flags differences above the limit."""
        found = []
        by_name = {}
        for row in self.rows:
            if "at" in row and row["side"] in ("left", "right"):
                by_name.setdefault(row["joint"], {})[row["side"]] = row["at"]
        for joint, sides in by_name.items():
            if len(sides) == 2:
                left, right = np.array(sides["left"]), np.array(sides["right"])
                right[0] = 2 * self.midline - right[0]
                difference = float(np.linalg.norm(left - right)) * 1000
                if difference > ASYMMETRY_LIMIT_MM:
                    found.append({"body": self.body, "type": "joint position", "name": joint, "difference_mm": round(difference, 1)})
        for name, sides in self.lengths.items():
            if len(sides) == 2:
                difference = abs(sides["left"] - sides["right"])
                if difference > ASYMMETRY_LIMIT_MM:
                    found.append({"body": self.body, "type": "bone length", "name": name, "left_mm": sides["left"], "right_mm": sides["right"], "difference_mm": round(difference, 1)})
        return sorted(found, key=lambda item: -item["difference_mm"])

    def proportions(self, height):
        rows = []
        for label, (top, bottom), (low, high) in PROPORTIONS:
            for side in ("left", "right"):
                value = self.lengths.get(top, {}).get(side)
                if bottom is None:
                    under = height * 1000 if height else None
                else:
                    under = self.lengths.get(bottom, {}).get(side)
                if value is None or under is None:
                    rows.append({"body": self.body, "side": side, "ratio": label, "status": "not measured"})
                    continue
                ratio = round(value / under, 3)
                rows.append({"body": self.body, "side": side, "ratio": label, "value": ratio, "range": [low, high], "status": "ok" if low <= ratio <= high else "outside rough range"})
        return rows


def body_height(body):
    try:
        return json.loads((models / "manifest.json").read_text())["bodies"][body]["height"]
    except (OSError, ValueError, KeyError):
        return None


def describe(row):
    return (
        f"{row['excess_mm']:7.1f}  {row['body']:6} {row['side']:5} {row['joint']:42} gap {row['gap_mm']:6.1f}  "
        f"overlap {row['overlap_mm']:5.1f}  allowed 0-{row['max_gap_mm']} gap, {OVERLAP_TOLERANCE_MM} overlap  {row.get('note', '')}"
    )


def write_text(report):
    lines = [f"Joint audit. Models from: {report['model_files_newest']}", ""]
    lines.append("FAILURES, worst first. Excess is the mm beyond the allowed range.")
    lines.append(f"{'excess':>7}  body   side  joint")
    lines += [describe(row) for row in report["failures"] if row["group"] != "hand"]
    lines += ["", "FAILURES IN HANDS"]
    lines += [describe(row) for row in report["failures"] if row["group"] == "hand"]
    lines += ["", "PASS COUNTS BY GROUP"]
    for body, groups in report["summary"].items():
        for group, counts in groups.items():
            lines.append(f"  {body:6} {group:10} pass {counts['pass']:3}  fail {counts['fail']:3}  not measured {counts['not measured']:3}")
    lines += ["", f"LEFT/RIGHT DIFFERENCES ABOVE {ASYMMETRY_LIMIT_MM} mm"]
    lines += [json.dumps(item) for item in report["asymmetry"]]
    lines += ["", "PROPORTIONS OUTSIDE ROUGH RANGES (rough textbook ratios)"]
    lines += [json.dumps(item) for item in report["proportions"] if item["status"] != "ok"]
    lines += ["", "NAMING WARNINGS AND ERRORS"]
    for body, info in report["bodies"].items():
        lines += [f"  {body}: {warning}" for warning in info.get("warnings", [])]
        if "error" in info:
            lines.append(f"  {body}: {info['error']}")
    lines += ["", "NOT CHECKED"]
    lines += [f"  {item}" for item in NOT_CHECKED]
    Path(str(report_path) + ".txt").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    report = {"ranges_mm": {kind: {"max_gap": limit, "why": why} for kind, (limit, why) in RANGES.items()}, "overlap_tolerance_mm": OVERLAP_TOLERANCE_MM, "not_checked": NOT_CHECKED, "bodies": {}, "failures": [], "not_measured": [], "asymmetry": [], "proportions": [], "summary": {}}
    newest = ""
    for body in ("female", "male"):
        info = report["bodies"].setdefault(body, {})
        audit = BodyAudit(body)
        try:
            nodes, files = load_nodes(body)
            info["files"] = files
            newest = max([newest, *files.values()])
            info["nodes"] = {part: {"islands": len(islands), "largest": [len(b.vertices) for b in islands[:3]], "sources": sorted({b.source for b in islands})} for part, islands in nodes.items()}
            info.update(audit.run(nodes))
            info["height_m"] = body_height(body)
            report["proportions"] += audit.proportions(info["height_m"])
            report["asymmetry"] += audit.asymmetry()
        except Exception:
            info["error"] = traceback.format_exc()
        info["warnings"] = audit.warnings
        info["joints"] = audit.rows
        info["lengths_mm"] = audit.lengths
        info["hand_and_foot_bones"] = audit.labels
        report["failures"] += [row for row in audit.rows if row["status"] == "fail"]
        report["not_measured"] += [row for row in audit.rows if row["status"] == "not measured"]
        groups = {}
        for row in audit.rows:
            counts = groups.setdefault(row["group"], {"pass": 0, "fail": 0, "not measured": 0})
            counts[row["status"]] += 1
        report["summary"][body] = groups
    report["failures"].sort(key=lambda row: -row["excess_mm"])
    report["asymmetry"].sort(key=lambda item: -item["difference_mm"])
    report["model_files_newest"] = newest
    report_path.write_text(json.dumps(report, indent=1), encoding="utf-8")
    write_text(report)


try:
    main()
except Exception:
    report_path.write_text(json.dumps({"fatal": traceback.format_exc()}, indent=1), encoding="utf-8")
print("AUDIT_DONE")
