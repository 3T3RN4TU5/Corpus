"""Places one BodyParts3D hand inside a body's hand skin.

The two datasets pose their hands differently, so a single rigid placement cannot work: BodyParts3D's fingers are curled
and close together, and the atlas's are straight and spread. The hand is anchored at the wrist joint and sized from its
real length, and then each finger is bent, joint by joint, until its bones sit inside that body's own skin fingers.
"""
import re

import numpy as np

FINGERS = ("index finger", "middle finger", "ring finger", "little finger")
METACARPALS = {"index finger": "second", "middle finger": "third", "ring finger": "fourth", "little finger": "fifth"}
FLEX_DEGREES = np.arange(-60, 61, 5)
SPREAD_DEGREES = np.arange(-35, 36, 5)
THUMB_DEGREES = np.arange(-70, 71, 5)
PALM_DEGREES = np.arange(-30, 31, 3)
BONE_RADIUS = 0.004
REACH_WEIGHT = 0.1


def _unit(vector):
    return vector / np.linalg.norm(vector)


def _axes(points):
    """Principal axes of a point set, longest first."""
    _, _, axes = np.linalg.svd(points - points.mean(axis=0), full_matrices=False)
    return axes


def _frame(along, normal):
    along = _unit(along)
    normal = _unit(normal - along * (normal @ along))
    return np.column_stack([along, normal, np.cross(along, normal)])


def _matrix(rotation, scale, source, target):
    matrix = np.eye(4)
    matrix[:3, :3] = rotation * scale
    matrix[:3, 3] = target - rotation @ source * scale
    return matrix


def _turn(axis, degrees, pivot):
    """A rotation about a line through a pivot."""
    x, y, z = _unit(axis)
    angle = np.radians(degrees)
    skew = np.array([[0, -z, y], [z, 0, -x], [-y, x, 0]])
    rotation = np.eye(3) + np.sin(angle) * skew + (1 - np.cos(angle)) * skew @ skew
    return _matrix(rotation, 1.0, pivot, pivot)


def _apply(matrix, points):
    return points @ matrix[:3, :3].T + matrix[:3, 3]


def _thin(points, count):
    return points[:: max(1, len(points) // count)]


class HandRig:
    """Each bone's movement, plus a blend of them for the soft tissue around the bones."""

    def __init__(self, bones, palm, moves):
        self.palm = palm
        self.moves = moves
        self.sample_names = [name for name in bones if len(_thin(bones[name], 60)) >= 60]
        self.samples = np.stack([_thin(bones[name], 60)[:60] for name in self.sample_names])

    def bone(self, name, points):
        return _apply(self.moves.get(name, self.palm), points)

    def __call__(self, points):
        """Moves any point with the bones nearest to it, so that tendons and vessels stay joined to them."""
        result = np.zeros_like(points)
        for start in range(0, len(points), 4000):
            chunk = points[start : start + 4000]
            gaps = ((chunk[:, None, None, :] - self.samples[None, :, :, :]) ** 2).sum(axis=3).min(axis=2)
            weights = 1 / (gaps + 1e-6) ** 2
            weights /= weights.sum(axis=1, keepdims=True)
            moved = np.zeros_like(chunk)
            for index, name in enumerate(self.sample_names):
                moved += _apply(self.moves.get(name, self.palm), chunk) * weights[:, index, None]
            result[start : start + 4000] = moved
        return result


def build(bones, side, wrist_source, wrist_target, forearm_axis, skin, depth):
    """Returns a HandRig for one side ("left" or "right").

    bones: {name: source vertices}. wrist_source and wrist_target: the wrist joint in each dataset. forearm_axis: the
    direction from elbow to wrist in the target. skin: the target body's skin vertices. depth: a function giving how far
    points lie inside the skin, negative when outside.
    """
    relative = skin - wrist_target
    along = relative @ forearm_axis
    radial = np.linalg.norm(relative - np.outer(along, forearm_axis), axis=1)
    hand_skin = skin[(along > 0) & (along < 0.3) & (radial < 0.12)]

    def named(text):
        return bones[text]

    middle_tip = named(f"Distal phalanx of {side} middle finger")
    source_along = _unit(middle_tip.mean(axis=0) - wrist_source)
    palm_bones = np.vstack([named(f"{side.capitalize()} {METACARPALS[f]} metacarpal bone") for f in FINGERS])
    source_normal = _axes(palm_bones)[2]
    every_bone = np.vstack(list(bones.values()))
    # Distances from the wrist, because the hand's lengthwise axis is uncertain until the palm has been fitted.
    # About 6 mm of fingertip lies beyond the end of the bone.
    source_length = np.linalg.norm(middle_tip - wrist_source, axis=1).max() + 0.006

    axes = _axes(hand_skin)
    target_along = axes[0] if (hand_skin.mean(axis=0) - wrist_target) @ axes[0] > 0 else -axes[0]
    target_length = np.linalg.norm(hand_skin - wrist_target, axis=1).max()
    scale = float(np.clip(target_length / source_length, 0.85, 1.25))

    def fit(sign):
        target_normal = sign * axes[2]
        rotation = _frame(target_along, target_normal) @ _frame(source_along, source_normal).T
        palm = _matrix(rotation, scale, wrist_source, wrist_target)
        flex_axis = np.cross(target_along, target_normal)
        moves = {}

        # The palm is turned about the wrist first, judged on the palm's own bones, to centre them in the palm's skin.
        palm_names = [n for n in bones if not re.search(r"phalanx|first metacarpal", n)]
        palm_points = np.vstack([_apply(palm, _thin(bones[n], 80)) for n in palm_names])
        best_turn, best_score = np.eye(4), -np.inf
        for flex in PALM_DEGREES:
            for spread in PALM_DEGREES:
                turn = _turn(target_normal, spread, wrist_target) @ _turn(flex_axis, flex, wrist_target)
                score = np.minimum(depth(_apply(turn, palm_points)), 0.008).mean() - 1e-6 * (abs(flex) + abs(spread))
                if score > best_score:
                    best_turn, best_score = turn, score
        palm = best_turn @ palm

        def bend(names, pivot, flexes, spreads, reach=None):
            points = np.vstack([_apply(moves.get(n, palm), _thin(bones[n], 60)) for n in names])
            tip = _apply(moves.get(names[-1], palm), bones[names[-1]]).mean(axis=0)
            best, best_score = None, -np.inf
            for flex in flexes:
                for spread in spreads:
                    turn = _turn(target_normal, spread, pivot) @ _turn(flex_axis, flex, pivot)
                    inside = np.minimum(depth(_apply(turn, points)), BONE_RADIUS)
                    # A small cost on the angle keeps a natural pose when several angles fit equally well.
                    score = inside.mean() - 1e-6 * (abs(flex) + abs(spread))
                    if reach is not None:
                        score -= REACH_WEIGHT * np.linalg.norm(_apply(turn, tip[None])[0] - reach)
                    if score > best_score:
                        best, best_score = turn, score
            for n in names:
                moves[n] = best @ moves.get(n, palm)

        def joint(name, previous):
            """The end of a bone nearest the previous bone, which is where the two meet."""
            near = _apply(moves.get(name, palm), bones[name])
            neighbour = _apply(moves.get(previous, palm), bones[previous]).mean(axis=0)
            gaps = np.linalg.norm(near - neighbour, axis=1)
            return near[gaps <= np.quantile(gaps, 0.15)].mean(axis=0)

        for finger in FINGERS:
            metacarpal = f"{side.capitalize()} {METACARPALS[finger]} metacarpal bone"
            proximal = f"Proximal phalanx of {side} {finger}"
            middle = f"Middle phalanx of {side} {finger}"
            distal = f"Distal phalanx of {side} {finger}"
            bend([proximal, middle, distal], joint(proximal, metacarpal), FLEX_DEGREES, SPREAD_DEGREES)
            bend([middle, distal], joint(middle, proximal), FLEX_DEGREES, [0])
            bend([distal], joint(distal, middle), FLEX_DEGREES, [0])

        first = f"{side.capitalize()} first metacarpal bone"
        proximal = f"Proximal phalanx of {side} thumb"
        distal = f"Distal phalanx of {side} thumb"

        # The palm is thick enough that a thumb tucked inside it also scores as "inside the skin", so the thumb is also
        # drawn toward the skin thumb's tip: the furthest point on the thumb's side of the palm, near the wrist end.
        hand_axis = _unit(_apply(palm, palm_bones).mean(axis=0) - wrist_target)
        across = np.cross(hand_axis, target_normal)
        if (_apply(palm, bones[first]).mean(axis=0) - wrist_target) @ across < 0:
            across = -across
        reach_along = (hand_skin - wrist_target) @ hand_axis
        low = hand_skin[reach_along < 0.62 * target_length]
        thumb_tip = low[np.argmax((low - wrist_target) @ across)]
        bend([first, proximal, distal], joint(first, f"{side.capitalize()} trapezium"), THUMB_DEGREES, THUMB_DEGREES, thumb_tip)
        bend([proximal, distal], joint(proximal, first), FLEX_DEGREES, [0], thumb_tip)
        bend([distal], joint(distal, proximal), FLEX_DEGREES, [0], thumb_tip)

        placed = np.vstack([_apply(moves.get(n, palm), _thin(bones[n], 80)) for n in bones])
        thumb_gap = np.linalg.norm(_apply(moves[distal], bones[distal]).mean(axis=0) - thumb_tip)
        return float(np.minimum(depth(placed), BONE_RADIUS).mean() - REACH_WEIGHT * thumb_gap), palm, moves

    # The skin alone does not say which side of the hand the thumb is on, so the better fit decides.
    _, palm, moves = max((fit(1), fit(-1)), key=lambda result: result[0])
    report = {"scale": round(scale, 3), "length": round(float(target_length), 3)}
    return HandRig(bones, palm, moves), report
