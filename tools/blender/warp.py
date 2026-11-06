"""Fits BodyParts3D anatomy into an NIH atlas body with a thin-plate spline.

BodyParts3D stands with its arms down, and the atlas bodies stand with their arms out, and they
differ in size and shape. The same measurements are taken on both skins (cross-sections along the
trunk, arms, legs and head), which gives matching points, and named bones add matching points inside
the body. The spline then moves every vertex to follow those points. The fit is an approximation.
"""
import re

import numpy as np

ORDINALS = "first second third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth".split()


def weld(vertices, triangles):
    """Merges duplicate vertices, because file formats split them at seams and that breaks connectivity."""
    keys = np.round(vertices * 1e4).astype(np.int64)
    _, first, inverse = np.unique(keys, axis=0, return_index=True, return_inverse=True)
    welded = inverse.ravel()[triangles]
    # Welding can collapse tiny triangles and create duplicates, which break mesh reduction.
    valid = (welded[:, 0] != welded[:, 1]) & (welded[:, 1] != welded[:, 2]) & (welded[:, 2] != welded[:, 0])
    welded = welded[valid]
    _, unique_faces = np.unique(np.sort(welded, axis=1), axis=0, return_index=True)
    return vertices[first], welded[np.sort(unique_faces)]


def _components(vertices, triangles, mask):
    """Splits the vertices in a band into separate pieces of connected surface."""
    parent = {}

    def find(item):
        root = item
        while parent.setdefault(root, root) != root:
            root = parent[root]
        while parent[item] != root:
            parent[item], item = root, parent[item]
        return root

    for a, b, c in triangles[mask[triangles].any(axis=1)].tolist():
        root = find(a)
        parent[find(b)] = root
        parent[find(c)] = root

    groups = {}
    for item in parent:
        groups.setdefault(find(item), []).append(item)
    return [vertices[group] for group in groups.values() if len(group) >= 6]


def _section_points(points):
    """A centre and four extreme points describing one cross-section. Returns five points."""
    centre = (points.min(axis=0) + points.max(axis=0)) / 2
    result = [centre]
    for value in (points[:, 0].min(), points[:, 0].max()):
        point = centre.copy()
        point[0] = value
        result.append(point)
    # Front and back are read near the midline. The widest points can be breasts or a shoulder blade,
    # and matching those to a flat chest pushes the sternum out through the skin.
    near_middle = points[np.abs(points[:, 0] - centre[0]) < max(0.015, np.ptp(points[:, 0]) * 0.12)]
    if len(near_middle) < 2:
        near_middle = points
    for value in (near_middle[:, 1].min(), near_middle[:, 1].max()):
        point = centre.copy()
        point[1] = value
        result.append(point)
    return result


def _crotch_height(vertices, triangles, centre_x, floor, height):
    """The highest level where a section shows two separate legs and no wide piece across the midline."""
    half_band = height * 0.004
    for z in np.arange(floor + height * 0.58, floor + height * 0.35, -height * 0.004):
        pieces = _components(vertices, triangles, np.abs(vertices[:, 2] - z) < half_band)
        wide = [p for p in pieces if np.ptp(p[:, 0]) > height * 0.03]
        crossing = [p for p in wide if p[:, 0].min() < centre_x < p[:, 0].max()]
        left = [p for p in wide if p[:, 0].min() >= centre_x]
        right = [p for p in wide if p[:, 0].max() <= centre_x]
        if not crossing and left and right:
            return z
    raise ValueError("Could not find where the legs separate")


def _leg_section(pieces, centre_x, side, height):
    """The leg is the wide piece nearest the midline, because a hanging hand is always further out."""
    same_side = [p for p in pieces if (p[:, 0].mean() - centre_x) * side > 0]
    wide = [p for p in same_side if np.ptp(p[:, 0]) > height * 0.025] or same_side
    return min(wide, key=lambda p: abs(p[:, 0].mean() - centre_x))


def measure(vertices, triangles):
    """Measures a skin in a fixed order, so that two skins produce matching lists of points."""
    vertices, triangles = weld(vertices, triangles)
    floor, top = vertices[:, 2].min(), vertices[:, 2].max()
    height = top - floor
    centre_x = np.median(vertices[:, 0])
    crotch = _crotch_height(vertices, triangles, centre_x, floor, height)
    shoulder = floor + height * 0.815
    neck = floor + height * 0.86
    half_band = height * 0.006
    points = []

    def trunk_section(z):
        pieces = _components(vertices, triangles, np.abs(vertices[:, 2] - z) < half_band)
        crossing = [p for p in pieces if p[:, 0].min() < centre_x < p[:, 0].max()]
        # The widest piece is the trunk, because genitals can also cross the midline.
        return max(crossing or pieces, key=lambda p: np.ptp(p[:, 0]))

    for fraction in np.linspace(0.02, 0.92, 10):
        points += _section_points(trunk_section(crotch + (shoulder - crotch) * fraction))
    for fraction in np.linspace(0.0, 0.92, 6):
        points += _section_points(trunk_section(neck + (top - neck) * fraction))
    points.append(vertices[np.argmax(vertices[:, 2])])

    for side in (1, -1):
        for fraction in np.linspace(0.04, 0.9, 9):
            z = crotch + (floor - crotch) * fraction
            pieces = _components(vertices, triangles, np.abs(vertices[:, 2] - z) < half_band)
            section = _section_points(_leg_section(pieces, centre_x, side, height))
            # High on the thigh, the legs touch and hands sit beside them, so only the centre is reliable there.
            points.extend(section[:1] if fraction < 0.25 else section)

        on_side = vertices[(vertices[:, 0] - centre_x) * side > 0]
        foot = on_side[on_side[:, 2] < floor + height * 0.03]
        points += [foot[np.argmin(foot[:, 1])], foot[np.argmax(foot[:, 1])], foot[np.argmin(foot[:, 0])], foot[np.argmax(foot[:, 0])]]

        # The arm is measured along the line from the shoulder to the fingertips.
        upper = on_side[on_side[:, 2] > crotch]
        tip = upper[np.argmax(np.abs(upper[:, 0] - centre_x) + (crotch + height * 0.3 - upper[:, 2]) * 0.6)]
        band = on_side[np.abs(on_side[:, 2] - (shoulder - height * 0.03)) < half_band * 2]
        outer = band[np.argmax((band[:, 0] - centre_x) * side)]
        start = outer - np.array([side * height * 0.03, 0, 0])
        axis = tip - start
        length = np.linalg.norm(axis)
        axis /= length
        across = np.cross(axis, [0.0, 1.0, 0.0])
        across /= np.linalg.norm(across)
        depth = np.cross(across, axis)
        for fraction in np.linspace(0.08, 0.92, 8):
            centre = start + axis * length * fraction
            relative = vertices - centre
            along = relative @ axis
            radial = np.linalg.norm(relative - np.outer(along, axis), axis=1)
            mask = (np.abs(along) < height * 0.012) & (radial < height * 0.075)
            pieces = _components(vertices, triangles, mask)
            near = [p[np.linalg.norm(p - centre, axis=1) < height * 0.09] for p in pieces]
            near = [p for p in near if len(p) >= 4]
            if not near:
                points += [centre] * 5
                continue
            piece = min(near, key=lambda p: np.linalg.norm(p.mean(axis=0) - centre))
            mid = piece.mean(axis=0)
            spread_a = np.abs((piece - mid) @ across).max()
            spread_d = np.abs((piece - mid) @ depth).max()
            points += [mid, mid + across * spread_a, mid - across * spread_a, mid + depth * spread_d, mid - depth * spread_d]
        points.append(tip)

    return np.array(points)


def _middle(vertices):
    return (vertices.min(axis=0) + vertices.max(axis=0)) / 2


def _end(vertices, top, fraction=0.06):
    """The centre of the top or bottom end of a long bone."""
    low, high = vertices[:, 2].min(), vertices[:, 2].max()
    span = (high - low) * fraction
    chosen = vertices[vertices[:, 2] > high - span] if top else vertices[vertices[:, 2] < low + span]
    return _middle(chosen)


def bone_landmarks(bp3d, vertebrae, knees, pelvis, prefix):
    """Matching points inside the body, taken from bones that exist in both datasets."""
    source, target = [], []

    def pair(a, b):
        source.append(a)
        target.append(b)

    for name, (vertices, _) in vertebrae.items():
        match = re.search(r"(cervical|thoracic|lumbar)_vertebra_(\d+)", name)
        if match and int(match.group(2)) <= 12:
            label = f"{ORDINALS[int(match.group(2)) - 1].capitalize()} {match.group(1)} vertebra"
            if label in bp3d:
                pair(_middle(bp3d[label][0]), _middle(vertices))

    for side, suffix in (("Left", "L"), ("Right", "R")):
        hip_source = bp3d[f"{side} hip bone"][0]
        hip_target = np.vstack([v for n, (v, _) in pelvis.items() if re.search(rf"(ilium|ischium|pubis)_compact_bone_{suffix}", n)])
        for axis in range(3):
            for pick in (np.argmin, np.argmax):
                pair(hip_source[pick(hip_source[:, axis])], hip_target[pick(hip_target[:, axis])])

        # The atlas has no upper femur, so the hip joint is placed by scaling from the hip bone.
        femur = bp3d[f"{side} femur"][0]
        upper = femur[femur[:, 2] > femur[:, 2].max() - 0.06]
        # The head of the femur is the end of the upper bone nearest the midline.
        toward_midline = np.abs(upper[:, 0]) < np.percentile(np.abs(upper[:, 0]), 40)
        head = _middle(upper[toward_midline])
        ratio = (hip_target.max(axis=0) - hip_target.min(axis=0)) / (hip_source.max(axis=0) - hip_source.min(axis=0))
        pair(head, _middle(hip_target) + (head - _middle(hip_source)) * ratio)

        pair(_middle(bp3d[f"{side} patella"][0]), _middle(knees[f"{prefix}patella_{suffix}"][0]))
        pair(_end(femur, top=False), _end(knees[f"{prefix}femur_{suffix}"][0], top=False))
        pair(_end(bp3d[f"{side} tibia"][0], top=True), _end(knees[f"{prefix}tibia_{suffix}"][0], top=True))

    return np.array(source), np.array(target)


class ThinPlateSpline:
    """A 3D thin-plate spline that maps `source` points onto `target` points."""

    def __init__(self, source, target, smoothing=1e-4):
        keep = self.distinct(source)
        self.source = source[keep]
        self.target = target[keep]
        n = len(self.source)
        kernel = self._kernel(self.source, self.source) + np.eye(n) * smoothing
        basis = np.hstack([np.ones((n, 1)), self.source])
        system = np.zeros((n + 4, n + 4))
        system[:n, :n] = kernel
        system[:n, n:] = basis
        system[n:, :n] = basis.T
        right = np.zeros((n + 4, 3))
        right[:n] = self.target
        solution = np.linalg.solve(system, right)
        self.weights = solution[:n]
        self.affine = solution[n:]

    @staticmethod
    def distinct(points, tolerance=0.002):
        keep = []
        for index, point in enumerate(points):
            if not keep or np.min(np.linalg.norm(points[keep] - point, axis=1)) > tolerance:
                keep.append(index)
        return keep

    @staticmethod
    def _kernel(a, b):
        return np.linalg.norm(a[:, None, :] - b[None, :, :], axis=2)

    def apply(self, points, chunk=20000):
        result = np.empty_like(points)
        for start in range(0, len(points), chunk):
            part = points[start : start + chunk]
            result[start : start + chunk] = (
                self._kernel(part, self.source) @ self.weights + np.hstack([np.ones((len(part), 1)), part]) @ self.affine
            )
        return result
