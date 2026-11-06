"""Hand-placed shapes for anatomy that neither dataset provides: major nerve paths, lymph nodes and two muscles.

They are written in BodyParts3D coordinates (metres, front is -y, left is +x) and fitted like everything else.
The app labels all of them as illustrative.
"""
import numpy as np


def _catmull(points, steps=10):
    points = np.array(points, dtype=np.float64)
    padded = np.vstack([points[0], points, points[-1]])
    result = []
    for i in range(1, len(padded) - 2):
        p0, p1, p2, p3 = padded[i - 1], padded[i], padded[i + 1], padded[i + 2]
        for t in np.linspace(0, 1, steps, endpoint=False):
            result.append(0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t ** 3))
    result.append(points[-1])
    return np.array(result)


def _sweep(centres, rx, rz, segments):
    """Skins a line with elliptical rings, closed at both ends."""
    count = len(centres)
    tangents = np.gradient(centres, axis=0)
    tangents /= np.linalg.norm(tangents, axis=1, keepdims=True)
    angle = np.linspace(0, 2 * np.pi, segments, endpoint=False)
    vertices = []
    for centre, tangent, a, b in zip(centres, tangents, rx, rz):
        reference = np.array([1.0, 0, 0]) if abs(tangent[0]) < 0.9 else np.array([0, 0, 1.0])
        u = reference - tangent * (reference @ tangent)
        u /= np.linalg.norm(u)
        w = np.cross(u, tangent)
        vertices.extend(centre + u * a * np.cos(t) + w * b * np.sin(t) for t in angle)
    vertices.extend([centres[0], centres[-1]])
    faces = []
    for i in range(count - 1):
        for j in range(segments):
            a, b, c, d = i * segments + j, i * segments + (j + 1) % segments, (i + 1) * segments + j, (i + 1) * segments + (j + 1) % segments
            faces += [[a, c, b], [b, c, d]]
    start, end = count * segments, count * segments + 1
    for j in range(segments):
        faces.append([start, j, (j + 1) % segments])
        faces.append([end, (count - 1) * segments + (j + 1) % segments, (count - 1) * segments + j])
    return np.array(vertices), np.array(faces, dtype=np.int32)


def _tube(points_mm, radius_mm):
    centres = _catmull(np.array(points_mm) / 1000.0)
    radii = np.full(len(centres), radius_mm / 1000.0)
    return _sweep(centres, radii, radii, 8)


def _sphere(centre, radius, rings=6, segments=8):
    vertices = [np.array(centre) + np.array([0, 0, radius])]
    faces = []
    for i in range(1, rings):
        phi = np.pi * i / rings
        for j in range(segments):
            theta = 2 * np.pi * j / segments
            vertices.append(np.array(centre) + radius * np.array([np.sin(phi) * np.cos(theta), np.sin(phi) * np.sin(theta), np.cos(phi)]))
    vertices.append(np.array(centre) - np.array([0, 0, radius]))
    last = len(vertices) - 1
    for j in range(segments):
        faces.append([0, 1 + j, 1 + (j + 1) % segments])
        faces.append([last, 1 + (rings - 2) * segments + (j + 1) % segments, 1 + (rings - 2) * segments + j])
    for i in range(rings - 2):
        for j in range(segments):
            a, b = 1 + i * segments + j, 1 + i * segments + (j + 1) % segments
            c, d = a + segments, b + segments
            faces += [[a, c, b], [b, c, d]]
    return np.array(vertices), np.array(faces, dtype=np.int32)


def _mirror(mesh):
    vertices, faces = mesh
    flipped = vertices * np.array([-1.0, 1.0, 1.0])
    return flipped, faces[:, ::-1]


def _both(mesh):
    return [mesh, _mirror(mesh)]


def _nodes(centre_mm, spread_mm, count=7):
    pieces = []
    for i in range(count):
        a = i * 2.4
        k = (i + 1) / count
        offset = np.array([np.cos(a) * spread_mm[0], np.sin(a) * spread_mm[1], np.sin(a * 1.3) * spread_mm[2]]) * k
        pieces.append(_sphere((np.array(centre_mm) + offset) / 1000.0, 0.0055))
    return pieces


def _surface_muscle(skin, stations_mm, front, half_width_mm, thickness_mm):
    """A flat shape that follows just under the skin, at the given (x, z) stations."""
    centres, rx, rz = [], [], []
    for x, z, scale in stations_mm:
        x_m, z_m = x / 1000.0, z / 1000.0
        near = skin[(np.abs(skin[:, 2] - z_m) < 0.012) & (np.abs(skin[:, 0] - x_m) < 0.02)]
        y = near[:, 1].min() + 0.012 if front else near[:, 1].max() - 0.012
        centres.append([x_m, y, z_m])
        rx.append(half_width_mm * scale / 1000.0)
        rz.append(thickness_mm / 1000.0)
    return _sweep(_catmull(centres, steps=4), np.interp(np.linspace(0, 1, (len(centres) - 1) * 4 + 1), np.linspace(0, 1, len(rx)), rx), np.full((len(centres) - 1) * 4 + 1, rz[0]), 12)


def build(skin, thyroid_cartilage=None):
    """Returns {part id: [(vertices, triangles), ...]} in BodyParts3D coordinates."""
    parts = {
        "sciatic-nerve": _both(_tube([(40, -50, 900), (90, -30, 800), (92, -38, 600), (88, -48, 400), (85, -40, 200), (82, -50, 30)], 3.2)),
        "femoral-nerve": _both(_tube([(50, -90, 950), (82, -130, 790), (86, -125, 650), (84, -112, 500)], 2.4)),
        "arm-nerves": _both(_tube([(30, -60, 1400), (100, -72, 1330), (190, -82, 1250), (212, -92, 1040), (246, -92, 820), (292, -96, 720)], 2.3)),
        "vagus-nerve": _both(_tube([(20, -60, 1500), (26, -72, 1380), (20, -72, 1250), (14, -62, 1100)], 1.8)),
        "thoracic-duct": [_tube([(5, -90, 1060), (0, -80, 1250), (10, -85, 1380), (30, -90, 1430)], 2.4)],
        "cervical-nodes": _nodes((45, -70, 1450), (12, 16, 40)) + [_mirror(p) for p in _nodes((45, -70, 1450), (12, 16, 40))],
        "axillary-nodes": _nodes((150, -70, 1250), (14, 24, 26)) + [_mirror(p) for p in _nodes((150, -70, 1250), (14, 24, 26))],
        "inguinal-nodes": _nodes((85, -150, 790), (24, 10, 14)) + [_mirror(p) for p in _nodes((85, -150, 790), (24, 10, 14))],
        "rectus-abdominis": _both(_surface_muscle(skin, [(38, 800, 0.6), (40, 880, 0.85), (42, 960, 1.0), (42, 1040, 1.0), (42, 1120, 1.0), (42, 1190, 0.8)], True, 34, 7)),
        "latissimus-dorsi": _both(_surface_muscle(skin, [(60, 960, 0.5), (90, 1040, 0.85), (115, 1120, 1.0), (135, 1200, 0.9), (150, 1260, 0.5)], False, 55, 6)),
    }
    # The thyroid is not in either dataset. Two small lobes are placed just below the thyroid cartilage.
    if thyroid_cartilage is not None:
        centre = (thyroid_cartilage.min(axis=0) + thyroid_cartilage.max(axis=0)) / 2
        low = thyroid_cartilage[:, 2].min()
        front = thyroid_cartilage[:, 1].min()
        lobe = _sphere((0, 0, 0), 1.0, rings=8, segments=12)
        vertices = lobe[0] * np.array([0.011, 0.009, 0.022]) + np.array([centre[0] + 0.016, front + 0.008, low - 0.016])
        parts["thyroid"] = _both((vertices, lobe[1]))
    return parts
