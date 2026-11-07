"""Closes the joints of a fitted skeleton.

Each bone is fitted to the body on its own, so nothing holds two bones together. BodyParts3D's bones do meet correctly, so
each bone is moved to meet its parent at the place where the two touch in BodyParts3D. Moves are translations, which keep
every bone's shape and size.
"""
import re

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from hand_rig import _apply, _turn, _unit

ORDINALS = "first second third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth".split()
NEAREST_ANY_CONTACT = 0.015


def _thin(points, count):
    return points[:: max(1, len(points) // count)]


def contact(child, parent, reach=0.004):
    """Matching points where two source bones touch. Returns None if they are not neighbours."""
    a, b = _thin(child, 2500), _thin(parent, 4000)
    best = np.empty(len(a))
    partner = np.empty(len(a), dtype=int)
    for start in range(0, len(a), 500):
        gaps = ((a[start : start + 500, None, :] - b[None, :, :]) ** 2).sum(axis=2)
        partner[start : start + 500] = gaps.argmin(axis=1)
        best[start : start + 500] = np.sqrt(gaps.min(axis=1))
    if best.min() > NEAREST_ANY_CONTACT:
        return None
    keep = best <= max(reach, np.quantile(best, 0.03))
    return a[keep], b[partner[keep]]


def box_map(source, target):
    """Maps one bone onto the same bone from another dataset, by their bounding boxes."""
    low, size = source.min(axis=0), np.ptp(source, axis=0)
    target_low, target_size = target.min(axis=0), np.ptp(target, axis=0)
    return lambda points: target_low + (points - low) * target_size / size


def closing_move(child, place_child, parents):
    """The translation that seats a bone on its parents. parents: a list of (source bone, how that bone is placed)."""
    moves = []
    for parent, place_parent in parents:
        touching = contact(child, parent)
        if touching is not None:
            moves.append((place_parent(touching[1]) - place_child(touching[0])).mean(axis=0))
    return np.mean(moves, axis=0) if moves else np.zeros(3)


def separate_nodes(vertices, triangles):
    """Splits a mesh of many separate lymph nodes into each node's centre and size."""
    parent = list(range(len(vertices)))

    def root(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    for a, b, c in triangles.tolist():
        parent[root(b)] = root(a)
        parent[root(c)] = root(a)
    groups = {}
    for index in range(len(vertices)):
        groups.setdefault(root(index), []).append(index)
    centres, radii = [], []
    for members in groups.values():
        points = vertices[members]
        centre = (points.min(axis=0) + points.max(axis=0)) / 2
        centres.append(centre)
        radii.append(float(np.linalg.norm(points - centre, axis=1).max()))
    return np.array(centres), np.array(radii)


def smoothstep(values):
    values = np.clip(values, 0, 1)
    return values * values * (3 - 2 * values)


def face_oval(eye_centre, chin_height):
    """An oval around the face in front of the head: (centre x, centre height, half width, half height, depth limit)."""
    brow = eye_centre[2] + 0.05
    return eye_centre[0], (brow + chin_height) / 2, 0.066, (brow - chin_height) / 2 + 0.012, eye_centre[1] + 0.035


def oval_position(points, oval):
    """0 at the centre of the oval and 1 at its edge. Points behind the face count as outside."""
    centre_x, centre_z, half_x, half_z, depth = oval
    distance = ((points[:, 0] - centre_x) / half_x) ** 2 + ((points[:, 2] - centre_z) / half_z) ** 2
    return np.where(points[:, 1] < depth, distance, 9.0)


def reshape_face(skin_v, skin_t, face_v, face_t, oval, cuts=2):
    """Gives a skin the face shape of another mesh, while it stays one continuous surface.

    The face area gets finer triangles, and each point moves straight back or forward onto the other face, by less toward the
    edge of the oval. Where a sight line passes through an opening in the other face, such as an eye, the skin is opened too.
    """
    mesh = bpy.data.meshes.new("face")
    mesh.from_pydata(skin_v.tolist(), [], skin_t.tolist())
    built = bmesh.new()
    built.from_mesh(mesh)
    bmesh.ops.remove_doubles(built, verts=built.verts, dist=0.00002)
    built.verts.ensure_lookup_table()
    points = np.array([list(vertex.co) for vertex in built.verts])
    near = oval_position(points, oval) < 1.05
    built.edges.ensure_lookup_table()
    edges = [edge for edge in built.edges if near[edge.verts[0].index] and near[edge.verts[1].index]]
    bmesh.ops.subdivide_edges(built, edges=edges, cuts=cuts, use_grid_fill=True)
    bmesh.ops.triangulate(built, faces=built.faces)
    built.verts.ensure_lookup_table()
    built.faces.ensure_lookup_table()

    tree = BVHTree.FromPolygons([Vector(p) for p in face_v.tolist()], face_t.tolist())
    points = np.array([list(vertex.co) for vertex in built.verts])
    position = oval_position(points, oval)
    weight = smoothstep((1 - position) / 0.45)
    front = points[:, 1].min() - 0.2
    behind_face = oval[4]
    opening = np.zeros(len(points), dtype=bool)
    moved = points.copy()
    for index in np.nonzero(weight > 0)[0].tolist():
        x, _, z = points[index]
        hit = tree.ray_cast(Vector((x, front, z)), Vector((0, 1, 0)))[0]
        if hit is None or hit.y > behind_face:
            opening[index] = weight[index] > 0.5
        else:
            moved[index, 1] = points[index, 1] * (1 - weight[index]) + hit.y * weight[index]
    triangles = np.array([[vertex.index for vertex in face.verts] for face in built.faces])
    triangles = triangles[~opening[triangles].any(axis=1)]
    built.free()
    bpy.data.meshes.remove(mesh)
    return moved, triangles, int(opening.sum())


def follow_bones(entries):
    """Returns a placement that moves any point with its nearest bones. entries: a list of (source bone, how it is placed).

    The warp kinks the upper thigh and cannot follow a hand's pose, so structures that run alongside bones, such as nerves,
    stay in place better by following the bones themselves.
    """
    samples = [_thin(bone, 40)[:40].astype(np.float32) for bone, _ in entries]
    places = [place for _, place in entries]

    def place(points):
        result = np.zeros_like(points)
        for start in range(0, len(points), 1500):
            chunk = points[start : start + 1500]
            single = chunk.astype(np.float32)
            gaps = np.stack([((single[:, None, :] - sample[None, :, :]) ** 2).sum(axis=2).min(axis=1) for sample in samples], axis=1)
            weights = 1 / (gaps + 1e-5) ** 2
            weights /= weights.sum(axis=1, keepdims=True)
            used = np.nonzero(weights.max(axis=0) > 0.004)[0]
            weights = weights[:, used] / weights[:, used].sum(axis=1, keepdims=True)
            moved = np.zeros_like(chunk)
            for column, index in enumerate(used):
                moved += places[index](chunk) * weights[:, column, None]
            result[start : start + 1500] = moved
        return result

    return place


def vertebra_maps(bp3d, vertebrae):
    """How each BodyParts3D vertebra maps onto the atlas's vertebra of the same name."""
    aliases = {"First cervical vertebra": "Atlas", "Second cervical vertebra": "Axis"}
    maps = {}
    for node, (vertices, _) in vertebrae.items():
        match = re.search(r"(cervical|thoracic|lumbar)_vertebra_(\d+)", node)
        if not match or int(match.group(2)) > 12:
            continue
        label = f"{ORDINALS[int(match.group(2)) - 1].capitalize()} {match.group(1)} vertebra"
        label = aliases.get(label, label)
        if label in bp3d:
            maps[label] = (bp3d[label][0], box_map(bp3d[label][0], vertices))
    return maps


def close_skeleton(bp3d, merged, place, vertebrae, hip_targets):
    """Seats the bones down each chain. merged: {bone name: source vertices}. place: {bone name: fitted placement}.

    Returns the placements with their joints closed, and the size of the largest move in metres for the log.
    """
    moved = dict(place)
    largest = {}

    def seat(child, parents):
        if child not in moved:
            return
        delta = closing_move(merged[child], moved[child], parents)
        before = moved[child]
        moved[child] = lambda points, before=before, delta=delta: before(points) + delta
        largest[child] = float(np.linalg.norm(delta))

    def own(name):
        return (merged[name], moved[name])

    seat("Body of sternum", [own("Manubrium")])
    seat("Xiphoid process", [own("Body of sternum")])

    spine = vertebra_maps(bp3d, vertebrae)
    for side in ("Left", "Right"):
        hip = bp3d[f"{side} hip bone"][0]
        hip_map = box_map(hip, hip_targets[side])
        seat(f"{side} femur", [(hip, hip_map)])
        seat(f"{side} tibia", [own(f"{side} femur")])
        seat(f"{side} patella", [own(f"{side} femur")])
        moved[f"{side} fibula"] = moved[f"{side} tibia"]

        seat(f"{side} clavicle", [own("Manubrium")])
        seat(f"{side} scapula", [own(f"{side} clavicle")])
        seat(f"{side} humerus", [own(f"{side} scapula")])
        seat(f"{side} radius", [own(f"{side} humerus")])
        moved[f"{side} ulna"] = moved[f"{side} radius"]

        for number, ordinal in enumerate(ORDINALS, start=1):
            vertebra = f"{ordinal.capitalize()} thoracic vertebra"
            if vertebra in spine:
                seat(f"{side} {ordinal} rib", [spine[vertebra]])
            cartilage = f"{side} {ordinal} costal cartilage"
            if cartilage in moved and f"{side} {ordinal} rib" in moved:
                seat(cartilage, [own(f"{side} {ordinal} rib"), own("Manubrium"), own("Body of sternum")])

    order = ["Atlas", "Axis"] + [f"{o.capitalize()} cervical vertebra" for o in ORDINALS[2:7]]
    order += [f"{o.capitalize()} thoracic vertebra" for o in ORDINALS]
    order += [f"{o.capitalize()} lumbar vertebra" for o in ORDINALS[:5]]
    for index, vertebra in enumerate(order):
        name = "Intervertebral disk of axis" if vertebra == "Axis" else f"Intervertebral disk of {vertebra[0].lower()}{vertebra[1:]}"
        if name in moved:
            seat(name, [spine[v] for v in order[index : index + 2] if v in spine])

    return moved, largest


def fit_foot(place, delta_source, skin, depth, tibia_contact):
    """Sizes and turns one foot to fit the skin's foot, keeping the ankle joined to the tibia.

    place: the foot's fitted placement. delta_source: source points of the foot's bones. tibia_contact: (points on the
    talus, the same points' target position). Returns the placement.
    """
    talus_points, talus_targets = tibia_contact
    pivot = talus_targets.mean(axis=0)
    shift = pivot - place(talus_points).mean(axis=0)
    bones = place(delta_source) + shift

    near = skin[(skin[:, 2] < pivot[2] + 0.01) & (np.linalg.norm(skin[:, :2] - pivot[:2], axis=1) < 0.26)]
    near = near[np.abs(near[:, 0] - pivot[0]) < 0.16]
    skin_axis = np.linalg.svd(near[:, :2] - near[:, :2].mean(axis=0), full_matrices=False)[2][0]
    bone_axis = np.linalg.svd(bones[:, :2] - bones[:, :2].mean(axis=0), full_matrices=False)[2][0]
    across = np.array([-bone_axis[1], bone_axis[0]])
    skin_across = np.array([-skin_axis[1], skin_axis[0]])

    # Length, width and height are sized separately, because feet differ in proportion. About 9 mm of soft tissue lies
    # beyond the bones at each end of a foot, 6 mm at each side and 6 mm under the heel.
    scale_long = float(np.clip((np.ptp(near[:, :2] @ skin_axis) - 0.018) / np.ptp(bones[:, :2] @ bone_axis), 0.9, 1.4))
    scale_wide = float(np.clip((np.ptp(near[:, :2] @ skin_across) - 0.012) / np.ptp(bones[:, :2] @ across), 0.8, 1.3))
    scale_tall = float(np.clip((pivot[2] - near[:, 2].min() - 0.006) / (pivot[2] - bones[:, 2].min()), 0.8, 1.2))
    long_3d = np.array([bone_axis[0], bone_axis[1], 0.0])
    wide_3d = np.array([across[0], across[1], 0.0])
    tall_3d = np.array([0.0, 0.0, 1.0])
    sizing = scale_long * np.outer(long_3d, long_3d) + scale_wide * np.outer(wide_3d, wide_3d) + scale_tall * np.outer(tall_3d, tall_3d)

    sized = pivot + (bones - pivot) @ sizing.T
    sample = _thin(sized, 400)
    best, best_score = np.eye(4), -np.inf
    for yaw in np.arange(-30, 31, 3):
        for pitch in np.arange(-24, 25, 3):
            for roll in (-8, -4, 0, 4, 8):
                turn = _turn(tall_3d, yaw, pivot) @ _turn(np.array([1.0, 0.0, 0.0]), pitch, pivot) @ _turn(np.array([0.0, 1.0, 0.0]), roll, pivot)
                score = np.minimum(depth(_apply(turn, sample)), 0.008).mean() - 1e-6 * (abs(yaw) + abs(pitch) + abs(roll))
                if score > best_score:
                    best, best_score = turn, score

    def placed(points):
        return _apply(best, pivot + (place(points) + shift - pivot) @ sizing.T)

    return placed, {"long": round(scale_long, 3), "wide": round(scale_wide, 3), "tall": round(scale_tall, 3)}
