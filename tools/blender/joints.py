"""Closes the joints of a fitted skeleton.

Each bone is fitted to the body on its own, so nothing holds two bones together. BodyParts3D's bones do meet correctly, so
each bone is moved to meet its parent at the place where the two touch in BodyParts3D. Moves are translations, which keep
every bone's shape and size.
"""
import re

import numpy as np

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
