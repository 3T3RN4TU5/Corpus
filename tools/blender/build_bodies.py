"""Builds the web-ready body models from the raw datasets.

Run with: blender --background --factory-startup --python tools/blender/build_bodies.py -- <raw dir> <out dir> <log>
Each body gets one file per data source and layer, so that differently licensed data stays in separate files.
"""
import json
import re
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

import hand_rig
import joints
import illustrative
from meshio import merge, read_bp3d, read_glb, to_object
from warp import ThinPlateSpline, bone_landmarks, measure, weld

raw, out, log_path = sys.argv[sys.argv.index("--") + 1:]
raw, out = Path(raw), Path(out)
sys.stdout = sys.stderr = open(log_path, "w", buffering=1)
started = time.time()


def log(*items):
    print(f"[{time.time() - started:6.0f}s]", *items)


RULES = json.loads((HERE / "part_rules.json").read_text())
EXCLUDE = re.compile(RULES["bp3d_exclude"], re.I)
BP3D_RULES = [(re.compile(pattern, re.I), part) for pattern, part in RULES["bp3d"]]
VASCULAR_NAME = re.compile(r"arter|\bvein|venous|plantar arch|palmar arch", re.I)
VESSEL_PARTS = {"carotid-arteries", "arm-arteries", "leg-arteries", "jugular-veins", "arm-veins", "leg-veins"}

LAYER = {}
for layer, ids in {
    "skin": ["skin"],
    "fat": ["subcutaneous-fat"],
    "muscle": "deltoid pectoralis-major rectus-abdominis external-oblique trapezius latissimus-dorsi shoulder-girdle-muscles rotator-cuff biceps-brachii triceps-brachii forearm-muscles hand-muscles gluteus-maximus hip-muscles thigh-adductors quadriceps sartorius hamstrings gastrocnemius tibialis-anterior deep-calf-muscles foot-muscles chest-wall-muscles diaphragm back-muscles neck-muscles pelvic-floor eye-muscles".split(),
    "skeleton": "skull mandible teeth ear-nose-cartilage vertebral-column rib-cage sternum clavicle scapula humerus radius ulna hand-bones pelvis femur patella tibia fibula foot-bones".split(),
    "organs": "brain-frontal brain-parietal brain-temporal brain-occipital brain-insula-cingulate brain-hippocampus brain-thalamus brain-hypothalamus brain-basal-ganglia brain-cerebellum brain-brainstem brain-inner eyes eye-iris eye-pupil tongue salivary-glands pharynx heart heart-left-ventricle heart-right-ventricle heart-left-atrium heart-right-atrium heart-valves lung-left lung-right trachea esophagus stomach liver gallbladder bile-ducts pancreas spleen thyroid adrenal-glands pituitary-pineal small-intestine large-intestine kidneys ureters bladder uterus vagina ovaries testes prostate penis".split(),
    "vessels": "aorta carotid-arteries arm-arteries leg-arteries vena-cava jugular-veins arm-veins leg-veins pulmonary-vessels coronary-vessels abdominal-vessels".split(),
    "nerves": "spinal-cord optic-nerves cranial-nerves vagus-nerve spinal-nerve-roots sympathetic-trunk intercostal-nerves brachial-plexus axillary-nerve musculocutaneous-nerve radial-nerve median-nerve ulnar-nerve lumbar-nerves femoral-nerve obturator-nerve sciatic-nerve tibial-nerve fibular-nerve".split(),
    "lymph": "thoracic-duct thymus tonsils cervical-nodes axillary-nodes thoracic-nodes abdominal-nodes pelvic-nodes inguinal-nodes".split(),
}.items():
    for part_id in ids:
        LAYER[part_id] = layer

ILLUSTRATIVE = {"thyroid", "thoracic-duct", "rectus-abdominis", "latissimus-dorsi"}
CLOSED_BONES = ("rib-cage", "sternum", "clavicle", "scapula", "humerus", "radius", "ulna", "femur", "patella", "tibia", "fibula", "vertebral-column")
NODE_PARTS = {"cervical-nodes", "axillary-nodes", "thoracic-nodes", "abdominal-nodes", "pelvic-nodes", "inguinal-nodes"}
# Lymph nodes are small enough that mesh reduction breaks them, so each is redrawn as a small sphere at its source position.
# Real nodes range from a few millimetres to about two centimetres, so sizes are kept within that and raised to stay visible.
NODE_RADIUS_RANGE = (0.003, 0.008)
NODE_SIZE_FACTOR = 1.6
NODE_SHAPE = illustrative.sphere_mesh()
FACE_DETAIL_HEIGHT = 0.27
ANKLE_FOLLOWERS = ("leg-arteries", "leg-veins", "deep-calf-muscles", "tibialis-anterior", "gastrocnemius")
HEAD_UNIT = ("skull", "mandible", "teeth")
HAND_VESSEL = re.compile(r"digital|palmar|metacarpal", re.I)
# These muscles wrap the trunk and spine, so they bend with the body. Limb muscles keep straighter shapes.
BENDING_MUSCLES = {"back-muscles", "neck-muscles", "chest-wall-muscles", "diaphragm", "pelvic-floor"}
# The brain has hundreds of regions, so a size-based share would leave it too coarse.
MINIMUM_TRIANGLES = {
    "brain-frontal": 12000,
    "brain-parietal": 8000,
    "brain-temporal": 10000,
    "brain-occipital": 6000,
    "brain-insula-cingulate": 4000,
    "brain-hippocampus": 3000,
    "brain-thalamus": 3000,
    "brain-hypothalamus": 1500,
    "brain-basal-ganglia": 3000,
    "brain-cerebellum": 7000,
    "brain-brainstem": 4000,
    "brain-inner": 5000,
    "heart-left-ventricle": 5000,
    "heart-right-ventricle": 5000,
    "heart-left-atrium": 4000,
    "heart-right-atrium": 4000,
    "heart-valves": 2500,
    "liver": 9000,
    "eyes": 4000,
    "eye-iris": 1200,
    "eye-pupil": 300,
}


def classify(name):
    vascular = bool(VASCULAR_NAME.search(name))
    if not vascular and EXCLUDE.search(name):
        return None
    for pattern, part in BP3D_RULES:
        if (part in VESSEL_PARTS) == vascular and pattern.search(name):
            return part
    return None


def keep_inside_skin(obj, tree, margin=0.0025):
    """Moves any vertex outside the skin to just inside it, because a fitted shape can stick out slightly."""
    moved = 0
    furthest = 0.0
    for vertex in obj.data.vertices:
        location, normal, _, _ = tree.find_nearest(vertex.co)
        if location is not None and (vertex.co - location).dot(normal) > -0.0005:
            furthest = max(furthest, (vertex.co - location).length)
            vertex.co = location - normal * margin
            moved += 1
    obj.data.update()
    if furthest > 0.03:
        log(f"  LARGE MOVE: {obj.name} had a vertex {furthest * 100:.1f} cm outside the skin")
    return moved


def rigid_fit(source, target):
    """Best rotation, uniform scale and translation from source onto target points."""
    source_mean, target_mean = source.mean(axis=0), target.mean(axis=0)
    a, b = source - source_mean, target - target_mean
    u, s, vt = np.linalg.svd(a.T @ b)
    flip = np.sign(np.linalg.det(vt.T @ u.T))
    d = np.diag([1, 1, flip])
    rotation = vt.T @ d @ u.T
    scale = (s * np.diag(d)).sum() / (a * a).sum()
    return lambda points: (points - source_mean) @ rotation.T * scale + target_mean


def stiff_fit(vertices, warp, limit=0.08):
    """Fits a muscle with a straight-line fit, because the warp itself kinks the upper thigh.

    A long thin tendon gives that fit almost nothing to measure across, so if it strays far the bone-style fit is used.
    """
    sample = vertices[:: max(1, len(vertices) // 1500)]
    warped_sample = warp.apply(sample)
    straight = affine_fit(sample, warped_sample)
    if np.linalg.norm(straight(sample) - warped_sample, axis=1).max() < limit:
        return straight(vertices)
    return rigid_fit(sample, warped_sample)(vertices)


def box_centre(points):
    return (points.min(axis=0) + points.max(axis=0)) / 2


def fit_head(place, skull, skin, scalp=0.005):
    """Sizes a placed skull to sit inside the skin's scalp, leaving a layer of soft tissue all around the cranium."""
    placed = place(skull)
    level = box_centre(placed)[2] + 0.02
    cranium, scalp_skin = placed[placed[:, 2] > level], skin[skin[:, 2] > level]
    scale = (np.ptp(scalp_skin, axis=0) - 2 * scalp) / np.ptp(cranium, axis=0)
    scale[2] = (scale[0] + scale[1]) / 2
    shift = box_centre(scalp_skin) - box_centre(cranium) * scale
    shift[2] = scalp_skin[:, 2].max() - scalp - cranium[:, 2].max() * scale[2]
    log("  head scale", np.round(scale, 3))
    return lambda points: place(points) * scale + shift


def affine_fit(source, target):
    """Best straight-line fit from source onto target points. It can stretch a shape, but cannot kink it."""
    homogeneous = np.hstack([source, np.ones((len(source), 1))])
    matrix, *_ = np.linalg.lstsq(homogeneous, target, rcond=None)
    return lambda points: np.hstack([points, np.ones((len(points), 1))]) @ matrix


LEFT_ONLY_MUSCLES = (
    "External intercostal muscle",
    "Internal intercostal muscle",
    "Innermost intercostal muscle",
    "Lateral lumbar intertransversarius",
    "Medial lumbar intertransversarius",
    "Set of anterior cervical intertransversarii",
    "Set of posterior cervical intertransversarii",
)

log("reading BodyParts3D")
_, isa_pieces = read_bp3d(raw / "bp3d" / "isa_BP3D_4.0_obj_99")
joined, part_of_pieces = read_bp3d(raw / "bp3d" / "partof_BP3D_4.0_obj_99")
pieces_by_name = {**part_of_pieces, **isa_pieces}

# BodyParts3D models these muscles on the left side only, so the right side is a mirror image.
midline = merge(pieces_by_name["Sixth thoracic vertebra"])[0][:, 0]
midline = (midline.min() + midline.max()) / 2
for name in LEFT_ONLY_MUSCLES:
    mirrored = []
    for vertices, triangles in pieces_by_name[name]:
        flipped = vertices.copy()
        flipped[:, 0] = 2 * midline - flipped[:, 0]
        mirrored.append((flipped, triangles[:, ::-1]))
    pieces_by_name[name] = pieces_by_name[name] + mirrored

bp3d = {name: merge(pieces) for name, pieces in pieces_by_name.items()}
log("names", len(bp3d))
bp3d_parts = {}
unmapped = []
source_height = bp3d["Skin"][0][:, 2]
hand_floor = source_height.min() + 0.36 * np.ptp(source_height)


def in_leg(vertices):
    """True for anything below the fingertips, which can only be part of a leg."""
    return vertices[:, 2].mean() < hand_floor



for name, pieces in pieces_by_name.items():
    part = classify(name)
    if part:
        for piece in pieces:
            # Arm and leg vessels share names such as "dorsal digital" and "recurrent", so the height decides which limb it is.
            target = "leg-arteries" if part == "arm-arteries" and in_leg(piece[0]) else part
            bp3d_parts.setdefault(target, []).append((name, piece))
    else:
        unmapped.append(name)
log("mapped parts", len(bp3d_parts), "unused names", len(unmapped))
(Path(log_path).parent / "unused_bp3d_names.txt").write_text("\n".join(sorted(unmapped)))
source_skin_v, source_skin_t = bp3d["Skin"]
source_measure = measure(source_skin_v, source_skin_t)
# Nerves and lymph nodes come from Z-Anatomy, whose bones are BodyParts3D's in another position. The bones they share say how
# to move Z-Anatomy's coordinates into BodyParts3D's.
zanatomy = np.load(raw / "zanatomy" / "extracted.npz")
zanatomy_keys = sorted({key.rsplit("|", 1)[0] for key in zanatomy.files})
box_corners = lambda v: np.array([[x, y, z] for x in (v[:, 0].min(), v[:, 0].max()) for y in (v[:, 1].min(), v[:, 1].max()) for z in (v[:, 2].min(), v[:, 2].max())])
shared_bones = [key.split("|")[1] for key in zanatomy_keys if key.startswith("bone|")]
zanatomy_points = np.vstack([box_corners(zanatomy[f"bone|{name}|v"]) for name in shared_bones]).astype(np.float64)
bp3d_points = np.vstack([box_corners(bp3d[name][0]) for name in shared_bones])
to_bp3d = rigid_fit(zanatomy_points, bp3d_points)
log("Z-Anatomy to BodyParts3D, worst bone box corner (mm)", round(float(np.linalg.norm(to_bp3d(zanatomy_points) - bp3d_points, axis=1).max()) * 1000, 1))
ZANATOMY_RULES = {kind: [(re.compile(pattern, re.I), part) for pattern, part in RULES[f"zanatomy_{kind}"]] for kind in ("nerve", "lymph")}
zanatomy_parts = {}
for key in zanatomy_keys:
    kind, name = key.split("|")
    if kind not in ZANATOMY_RULES:
        continue
    part = next((part for pattern, part in ZANATOMY_RULES[kind] if pattern.search(name)), None)
    if part is None:
        log("Z-Anatomy piece has no part:", name)
    elif part != "SKIP":
        zanatomy_parts.setdefault(part, []).append((to_bp3d(zanatomy[f"{key}|v"].astype(np.float64)), zanatomy[f"{key}|t"]))
log("Z-Anatomy parts", {part: len(pieces) for part, pieces in zanatomy_parts.items()})

hand_placed = illustrative.build(source_skin_v, bp3d["Thyroid cartilage"][0] if "Thyroid cartilage" in bp3d else None)

BODIES = {"female": ("VH_Female", "VH_F_", "Allen_F_Brain"), "male": ("VH_Male", "VH_M_", "Allen_M_Brain")}
hra_files = {}


def load_hra(body, key):
    folder, prefix, brain = BODIES[body]
    base = raw / "hra" / folder / "v1.2"
    # An exact name comes first. A loose suffix match would take "Blood_Vasculature_Liver" for "Liver", so it
    # applies only to files from other contributors, such as "SBU_F_Intestine_Large".
    files = sorted(base.glob("*.glb"))
    matches = [p for p in files if p.stem == f"{prefix}{key}"]
    if not matches:
        matches = [p for p in files if (key == "Brain" and p.stem == brain) or (not p.stem.startswith("VH_") and p.stem.endswith(f"_{key}"))]
    if not matches:
        return {}
    cache_key = (body, key)
    if cache_key not in hra_files:
        hra_files[cache_key] = read_glb(matches[0])
    return hra_files[cache_key]


def hra_parts(body, foreign_only=False):
    """Returns {part id: [pieces]} from one atlas body."""
    parts = {}
    prefix = BODIES[body][1]
    for key, node_pattern, part in RULES["hra"]:
        pattern = re.compile(node_pattern, re.I)
        for node, piece in load_hra(body, key).items():
            short = node.replace(prefix, "")
            if not pattern.search(short):
                continue
            target = part
            if part == "LUNG":
                target = "lung-left" if re.search(r"left|_L(_|$)|lingula", short, re.I) else "lung-right"
            parts.setdefault(target, []).append(piece)
    for key, rule_name in (("Heart", "hra_heart"), ("Brain", "hra_brain"), ("Eye_L", "hra_eye"), ("Eye_R", "hra_eye")):
        for node, piece in load_hra(body, key).items():
            short = node.replace(prefix, "")
            for pattern, part in RULES[rule_name]:
                if re.search(pattern, short, re.I):
                    if part != "SKIP":
                        parts.setdefault(part, []).append(piece)
                    break
    for node, piece in load_hra(body, "Blood_Vasculature").items():
        short = node.replace(prefix, "")
        for pattern, part in RULES["hra_vessels"]:
            if re.search(pattern, short, re.I):
                if part != "SKIP":
                    parts.setdefault(part, []).append(piece)
                break
    return parts


def budgets(pieces_by_part):
    """Shares each layer's triangle budget, favouring detail in small parts more than their size alone would."""
    weights = {}
    for part, pieces in pieces_by_part.items():
        weights.setdefault(LAYER[part], {})[part] = sum(len(t) for _, t in pieces) ** 0.6
    result = {}
    for layer, parts in weights.items():
        total = sum(parts.values())
        for part, weight in parts.items():
            result[part] = max(400, MINIMUM_TRIANGLES.get(part, 0), int(RULES["budgets"][layer] * weight / total))
    return result


def decimated_copy(obj, ratio, protect_above=None):
    """Reduces a mesh. Anything above protect_above is kept in detail for as long as there is other detail to remove."""
    if ratio >= 0.999:
        return
    modifier = obj.modifiers.new("reduce", "DECIMATE")
    modifier.decimate_type = "COLLAPSE"
    modifier.ratio = ratio
    if protect_above is not None:
        group = obj.vertex_groups.new(name="protected")
        group.add([vertex.index for vertex in obj.data.vertices if vertex.co.z > protect_above], 1.0, "REPLACE")
        modifier.vertex_group = group.name
        # A high weight means free to collapse, so the group is inverted to protect what is in it.
        modifier.invert_vertex_group = True
        modifier.vertex_group_factor = 1000.0
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier="reduce")
    obj.select_set(False)


manifest = {"bodies": {}}

for body, (folder, prefix, _) in BODIES.items():
    log("BODY", body)
    other = "male" if body == "female" else "female"
    own = hra_parts(body)
    skin_v, skin_t = own["skin"][0]
    vertebrae = load_hra(body, "Vertebrae")
    knees = {**load_hra(body, "Knee_L"), **load_hra(body, "Knee_R")}
    pelvis = load_hra(body, "Pelvis")

    target_measure = measure(skin_v, skin_t)
    bone_s, bone_t = bone_landmarks(bp3d, vertebrae, knees, pelvis, prefix)
    spline = ThinPlateSpline(np.vstack([source_measure, bone_s]), np.vstack([target_measure, bone_t]), smoothing=3e-3)
    log("spline points", len(spline.source))

    welded_skin, welded_skin_t = weld(skin_v, skin_t)
    fit_tree = BVHTree.FromPolygons([Vector(p) for p in welded_skin.tolist()], welded_skin_t.tolist())

    def skin_depth(points):
        """How far each point lies inside the skin, negative when outside."""
        depths = np.empty(len(points))
        for index, point in enumerate(points.tolist()):
            location, normal, _, _ = fit_tree.find_nearest(Vector(point))
            depths[index] = -(Vector(point) - location).dot(normal)
        return depths

    # Bones are fitted one by one, and then seated on each other down each chain, so that the joints meet.
    merged_bones = {}
    for part in CLOSED_BONES:
        grouped = {}
        for name, (vertices, _) in bp3d_parts[part]:
            grouped.setdefault(name, []).append(vertices)
        merged_bones.update({name: np.vstack(pieces) for name, pieces in grouped.items()})
    fitted_bones = {}
    for name, vertices in merged_bones.items():
        sample = vertices[:: max(1, len(vertices) // 1500)]
        fitted_bones[name] = rigid_fit(sample, spline.apply(sample))
    # The two bones of the forearm and of the lower leg lie side by side and are joined along their length, so each pair
    # is placed as one unit.
    for side_name in ("Left", "Right"):
        for first, second in (("tibia", "fibula"), ("radius", "ulna")):
            pair = np.vstack([merged_bones[f"{side_name} {first}"], merged_bones[f"{side_name} {second}"]])
            sample = pair[:: max(1, len(pair) // 2000)]
            fitted_bones[f"{side_name} {first}"] = fitted_bones[f"{side_name} {second}"] = rigid_fit(sample, spline.apply(sample))
    hip_targets = {
        side_name: np.vstack([v for n, (v, _) in pelvis.items() if re.search(rf"(ilium|ischium|pubis)_compact_bone_{suffix}", n)])
        for side_name, suffix in (("Left", "L"), ("Right", "R"))
    }
    bone_place, largest_moves = joints.close_skeleton(bp3d, merged_bones, fitted_bones, vertebrae, hip_targets)
    log("  largest joint moves (mm)", {k: round(v * 1000) for k, v in sorted(largest_moves.items(), key=lambda item: -item[1])[:8]})

    # Each foot is sized and turned to fit the skin's foot, staying joined to the tibia at the ankle.
    foot_place, ankle_heights = {}, {}
    for side_key, side_name in (("left", "Left"), ("right", "Right")):
        foot_vertices = np.vstack([v for _, (v, _) in bp3d_parts["foot-bones"] if (v[:, 0].mean() > 0) == (side_key == "left")])
        sample = foot_vertices[:: max(1, len(foot_vertices) // 1500)]
        base = rigid_fit(sample, spline.apply(sample))
        talus, tibia = bp3d[f"{side_name} talus"][0], merged_bones[f"{side_name} tibia"]
        touching = joints.contact(talus, tibia)
        ankle = (touching[0], bone_place[f"{side_name} tibia"](touching[1]))
        foot_place[side_key], report = joints.fit_foot(base, foot_vertices[:: max(1, len(foot_vertices) // 4000)], welded_skin, skin_depth, ankle)
        ankle_heights[side_key] = touching[0][:, 2].mean()
        log(f"  {side_key} foot", report)

    def follow_foot(vertices, placed, blend=0.03):
        """Moves the part of a tendon or vessel below the ankle with the foot."""
        side_key = "left" if vertices[:, 0].mean() > 0 else "right"
        weight = np.clip((ankle_heights[side_key] - vertices[:, 2]) / blend + 0.5, 0, 1)[:, None]
        if weight.max() == 0:
            return placed
        return placed * (1 - weight) + foot_place[side_key](vertices) * weight

    # Each hand is fitted at the end of that arm's own forearm bones, so that the wrist joint stays joined.
    hand_rigs, wrist_heights = {}, {}
    for side_key, side_name in (("left", "Left"), ("right", "Right")):
        ends, placed_ends, placed_tops = [], [], []
        for bone in ("radius", "ulna"):
            vertices = bp3d[f"{side_name} {bone}"][0]
            place = bone_place[f"{side_name} {bone}"]
            end = vertices[vertices[:, 2] < vertices[:, 2].min() + 0.03].mean(axis=0)
            top = vertices[vertices[:, 2] > vertices[:, 2].max() - 0.03].mean(axis=0)
            ends.append(end)
            placed_ends.append(place(end[None])[0])
            placed_tops.append(place(top[None])[0])
        wrist_source, wrist_target = np.mean(ends, axis=0), np.mean(placed_ends, axis=0)
        forearm_axis = wrist_target - np.mean(placed_tops, axis=0)
        forearm_axis /= np.linalg.norm(forearm_axis)
        hand_bones = {}
        for name, (vertices, _) in bp3d_parts["hand-bones"]:
            if (vertices[:, 0].mean() > 0) == (side_key == "left"):
                hand_bones[name] = np.vstack([hand_bones[name], vertices]) if name in hand_bones else vertices
        hand_rigs[side_key], report = hand_rig.build(hand_bones, side_key, wrist_source, wrist_target, forearm_axis, welded_skin, skin_depth)
        wrist_heights[side_key] = wrist_source[2]
        log(f"  {side_key} hand", report)

    def follow_hand(vertices, placed, blend=0.04):
        """Moves the part of a tendon or vessel past the wrist with the hand.

        The hand sits about 3 cm from the thigh in BodyParts3D and about 17 cm in the atlas, so the warp stretches that
        gap, and a point just inside the hand would otherwise be flung across it.
        """
        side_key = "left" if vertices[:, 0].mean() > 0 else "right"
        weight = np.clip((wrist_heights[side_key] - vertices[:, 2]) / blend + 0.5, 0, 1)[:, None]
        if weight.max() == 0:
            return placed
        return placed * (1 - weight) + hand_rigs[side_key](vertices) * weight

    # The atlas keeps sex-specific organs in one body only. Move the other body's set across, using the pelvis.
    foreign = hra_parts(other)
    own_pelvis = np.vstack([v for v, _ in pelvis.values()])
    other_pelvis = np.vstack([v for v, _ in load_hra(other, "Pelvis").values()])
    scale = np.ptp(own_pelvis, axis=0) / np.ptp(other_pelvis, axis=0)
    move = lambda v: (v - other_pelvis.min(axis=0)) * scale + own_pelvis.min(axis=0)
    sources = {}
    for part, pieces in own.items():
        sources.setdefault((part, "hra"), []).extend(pieces)
    for part in ("uterus", "vagina", "ovaries", "prostate"):
        if part not in own and part in foreign:
            sources[(part, "hra")] = [(move(v), t) for v, t in foreign[part]]

    # The skull's bones, jaw and teeth move as one unit, so that they stay joined and the eye sockets keep their shape.
    head_vertices = np.vstack([vertices for part in HEAD_UNIT for _, (vertices, _) in bp3d_parts[part]])
    head_sample = head_vertices[:: max(1, len(head_vertices) // 3000)]
    head_place = fit_head(
        rigid_fit(head_sample, spline.apply(head_sample)),
        np.vstack([vertices for _, (vertices, _) in bp3d_parts["skull"]]),
        skin_v,
    )

    # Nerves and lymph nodes run alongside the bones, so they follow the fitted bones.
    bone_field = [(merged_bones[name], bone_place[name]) for name in merged_bones]
    bone_field += list(joints.vertebra_maps(bp3d, vertebrae).values())
    bone_field += [(bp3d[f"{side_name} hip bone"][0], joints.box_map(bp3d[f"{side_name} hip bone"][0], hip_targets[side_name])) for side_name in ("Left", "Right")]
    bone_field += [(np.vstack([v for _, (v, _) in bp3d_parts["skull"]]), head_place)]
    for side_key in ("left", "right"):
        on_side = lambda part: np.vstack([v for _, (v, _) in bp3d_parts[part] if (v[:, 0].mean() > 0) == (side_key == "left")])
        bone_field += [(on_side("hand-bones"), hand_rigs[side_key]), (on_side("foot-bones"), foot_place[side_key])]
    along_bones = joints.follow_bones(bone_field)
    for part, pieces in zanatomy_parts.items():
        if part not in NODE_PARTS:
            sources[(part, "zanatomy")] = [(along_bones(vertices), triangles) for vertices, triangles in pieces]
            continue
        spheres = []
        for vertices, triangles in pieces:
            centres, radii = joints.separate_nodes(vertices, triangles)
            placed = along_bones(centres)
            radii = np.clip(radii * NODE_SIZE_FACTOR, *NODE_RADIUS_RANGE)
            for centre, radius in zip(placed, radii):
                location, normal, _, _ = fit_tree.find_nearest(Vector(centre.tolist()))
                # A whole node stays inside the skin, instead of being flattened against it.
                if -(Vector(centre.tolist()) - location).dot(normal) < radius + 0.002:
                    centre = np.array(location - normal * (radius + 0.002))
                spheres.append((NODE_SHAPE[0] * radius + centre, NODE_SHAPE[1]))
        sources[(part, "zanatomy")] = spheres

    # The male atlas face comes from a blurred scan with almost no mouth. BodyParts3D is also a male body and its face has eye
    # openings that fit its own skull, so the atlas skin takes that shape. The female atlas face is kept, because a male face
    # would not be accurate on it.
    if body == "male":
        eye_centre = (head_place(bp3d["Left vitreous body"][0]).mean(axis=0) + head_place(bp3d["Right vitreous body"][0]).mean(axis=0)) / 2
        chin = np.vstack([head_place(v) for _, (v, _) in bp3d_parts["mandible"]])[:, 2].min()
        oval = joints.face_oval(eye_centre, chin)
        new_skin_v, new_skin_t, opened = joints.reshape_face(skin_v, skin_t, head_place(source_skin_v), source_skin_t, oval)
        sources[("skin", "hra")] = [(new_skin_v, new_skin_t)]
        log("  male face: skin has", len(new_skin_t), "triangles, opened", opened, "points for the eyes")

    # The atlas eyes come from a different body, so each is moved into the skull's socket at its own size, along with
    # the muscles and nerve attached to it. The vitreous body marks the socket, because BodyParts3D's "Right sclera"
    # file also holds a piece of the left eye.
    for key, suffix, side_name in (("Eye_L", "L", "Left"), ("Eye_R", "R", "Right")):
        eye_nodes = load_hra(body, key)
        sclera = next(v for n, (v, _) in eye_nodes.items() if re.search(rf"sclera_{suffix}$", n))
        socket = head_place(bp3d[f"{side_name} vitreous body"][0])
        shift = box_centre(socket) - box_centre(sclera)
        log(f"  {side_name} eye moved by {np.round(shift * 1000, 1)} mm")
        moved = {id(t) for _, t in eye_nodes.values()}
        for source_key, pieces in sources.items():
            sources[source_key] = [(v + shift, t) if id(t) in moved else (v, t) for v, t in pieces]

    for part, named in bp3d_parts.items():
        layer = LAYER.get(part)
        if not layer:
            log("no layer for", part)
            continue
        fitted = []
        if part == "hand-bones":
            for name, (vertices, triangles) in named:
                side_key = "left" if vertices[:, 0].mean() > 0 else "right"
                fitted.append((hand_rigs[side_key].bone(name, vertices), triangles))
        elif part == "foot-bones":
            for name, (vertices, triangles) in named:
                side_key = "left" if vertices[:, 0].mean() > 0 else "right"
                fitted.append((foot_place[side_key](vertices), triangles))
        elif part in CLOSED_BONES:
            for name, (vertices, triangles) in named:
                fitted.append((bone_place[name](vertices), triangles))
        elif layer == "skeleton":
            for name, (vertices, triangles) in named:
                sample = vertices[:: max(1, len(vertices) // 1500)]
                place = head_place if part in HEAD_UNIT else rigid_fit(sample, spline.apply(sample))
                fitted.append((place(vertices), triangles))
        else:
            for piece_name, (vertices, triangles) in named:
                if re.search(r"nasal cartilage|major alar", piece_name, re.I):
                    fitted.append((head_place(vertices), triangles))
                elif part == "foot-muscles":
                    side_key = "left" if vertices[:, 0].mean() > 0 else "right"
                    fitted.append((foot_place[side_key](vertices), triangles))
                elif part == "hand-muscles" or (HAND_VESSEL.search(piece_name) and not in_leg(vertices)):
                    side_key = "left" if vertices[:, 0].mean() > 0 else "right"
                    fitted.append((hand_rigs[side_key](vertices), triangles))
                elif layer == "muscle" and part not in BENDING_MUSCLES:
                    placed = stiff_fit(vertices, spline)
                    if part == "forearm-muscles":
                        placed = follow_hand(vertices, placed)
                    if part in ANKLE_FOLLOWERS:
                        placed = follow_foot(vertices, placed)
                    fitted.append((placed, triangles))
                elif part in ("arm-arteries", "arm-veins"):
                    fitted.append((follow_hand(vertices, spline.apply(vertices)), triangles))
                elif part in ANKLE_FOLLOWERS:
                    fitted.append((follow_foot(vertices, spline.apply(vertices)), triangles))
                else:
                    fitted.append((spline.apply(vertices), triangles))
        sources[(part, "bp3d")] = fitted

    for part, pieces in hand_placed.items():
        sources[(part, "illustrative")] = [(spline.apply(v), t) for v, t in pieces]

    # Soles on the ground and the body centred, in every part.
    offset = np.array([-(skin_v[:, 0].min() + skin_v[:, 0].max()) / 2, -(skin_v[:, 1].min() + skin_v[:, 1].max()) / 2, -skin_v[:, 2].min()])

    bpy.ops.wm.read_factory_settings(use_empty=True)
    all_pieces = {}
    for (part, _), pieces in sources.items():
        all_pieces.setdefault(part, []).extend(pieces)
    part_budget = budgets(all_pieces)
    body_info = {"height": float(np.ptp(skin_v[:, 2])), "width": float(np.ptp(skin_v[:, 0])), "files": [], "parts": {}}
    centre = (own_pelvis.min(axis=0) + own_pelvis.max(axis=0)) / 2 + offset
    body_info["pelvisCentre"] = [float(centre[0]), float(centre[2]), float(-centre[1])]

    skin_for_tree, skin_tree_t = weld(skin_v + offset, skin_t)
    skin_tree = BVHTree.FromPolygons([Vector(p) for p in skin_for_tree.tolist()], skin_tree_t.tolist())

    objects = []
    for (part, source), pieces in sorted(sources.items()):
        vertices, triangles = weld(*merge(pieces))
        vertices = vertices + offset
        count = len(triangles)
        log(f"  start {part}/{source}: {count} triangles, {sum(1 for _ in pieces)} pieces")
        obj = to_object(part, vertices, triangles)
        share = count / sum(len(t) for _, t in all_pieces[part])
        if part not in NODE_PARTS:
            # The face has the finest shapes in the skin, so it is the last place to lose detail.
            protect_above = vertices[:, 2].max() - FACE_DETAIL_HEIGHT if (part, source) == ("skin", "hra") else None
            decimated_copy(obj, min(1.0, part_budget[part] * share / max(1, count)), protect_above)
        if source != "hra" and part != "skin" and part not in NODE_PARTS:
            moved = keep_inside_skin(obj, skin_tree)
            if moved:
                log(f"  moved inside skin: {part}/{source}: {moved} of {len(obj.data.vertices)} vertices")
        obj.data.shade_smooth()
        objects.append((obj, part, source))
        log(f"  {part}/{source}: {count} -> {len(obj.data.polygons)}")

    # The fat layer is the skin moved inward along its normals. It shows no real fat distribution.
    skin_obj = next(o for o, p, s in objects if p == "skin" and s == "hra")
    fat_mesh = skin_obj.data.copy()
    normals = np.empty(len(fat_mesh.vertices) * 3)
    fat_mesh.vertex_normals.foreach_get("vector", normals)
    coordinates = np.empty(len(fat_mesh.vertices) * 3)
    fat_mesh.vertices.foreach_get("co", coordinates)
    fat_mesh.vertices.foreach_set("co", coordinates - normals * 0.006)
    fat_mesh.update()
    fat = bpy.data.objects.new("subcutaneous-fat", fat_mesh)
    bpy.context.scene.collection.objects.link(fat)
    decimated_copy(fat, RULES["budgets"]["fat"] / max(1, len(fat_mesh.polygons)))
    objects.append((fat, "subcutaneous-fat", "illustrative"))

    def export(lod):
        groups = {}
        for obj, part, source in objects:
            groups.setdefault((source, LAYER[part]), []).append(obj)
        for (source, layer), group in sorted(groups.items()):
            bpy.ops.object.select_all(action="DESELECT")
            for obj in group:
                obj.select_set(True)
            name = f"{body}/{source}-{layer}-{lod}.glb"
            path = out / name
            path.parent.mkdir(parents=True, exist_ok=True)
            bpy.ops.export_scene.gltf(
                filepath=str(path),
                use_selection=True,
                export_format="GLB",
                export_draco_mesh_compression_enable=True,
                export_draco_mesh_compression_level=7,
                export_normals=True,
                export_materials="NONE",
                export_yup=True,
                export_animations=False,
            )
            body_info["files"].append({"file": name, "lod": lod, "layer": layer, "source": source, "bytes": path.stat().st_size})
            log("  wrote", name, round(path.stat().st_size / 1e6, 2), "MB")

    export("high")

    for obj, part, source in objects:
        count = np.empty(len(obj.data.vertices) * 3)
        obj.data.vertices.foreach_get("co", count)
        vertices = count.reshape(-1, 3)
        low, high = vertices.min(axis=0), vertices.max(axis=0)
        entry = body_info["parts"].setdefault(part, {"layer": LAYER[part], "sources": [], "triangles": 0, "low": low.tolist(), "high": high.tolist()})
        entry["sources"].append(source)
        entry["triangles"] += len(obj.data.polygons)
        entry["low"] = np.minimum(entry["low"], low).tolist()
        entry["high"] = np.maximum(entry["high"], high).tolist()
        entry["illustrative"] = part in ILLUSTRATIVE or part == "subcutaneous-fat"

    for part_entry in body_info["parts"].values():
        low, high = np.array(part_entry.pop("low")), np.array(part_entry.pop("high"))
        middle = (low + high) / 2
        part_entry["centre"] = [round(float(middle[0]), 4), round(float(middle[2]), 4), round(float(-middle[1]), 4)]
        part_entry["radius"] = round(float(np.linalg.norm(high - low) / 2), 4)

    for obj, _, _ in objects:
        decimated_copy(obj, RULES["low_lod_ratio"])
    export("low")
    body_info["triangles"] = sum(entry["triangles"] for entry in body_info["parts"].values())
    manifest["bodies"][body] = body_info
    log("triangles", body_info["triangles"])

manifest["unusedBodyPartsNames"] = len(unmapped)
(out / "manifest.json").write_text(json.dumps(manifest, indent=1))
log("BUILD_DONE")
