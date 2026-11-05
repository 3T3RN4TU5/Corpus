"""Reads the raw datasets into plain vertex and triangle arrays, in metres, with Z up."""
import re
from pathlib import Path

import bpy
import numpy as np

_NAME = re.compile(r"English name : (.+)")


def read_bp3d(folder):
    """Reads a BodyParts3D folder of OBJ files.

    Left and right copies of a part can share a name, such as "Fourth rib". Returns two dictionaries keyed
    by English name: one with those copies joined, and one with the separate (vertices, triangles) pieces.
    """
    grouped = {}
    for path in sorted(Path(folder).glob("*.obj")):
        vertices, faces, name = [], [], None
        with open(path, encoding="utf-8", errors="replace") as handle:
            for line in handle:
                if line.startswith("v "):
                    vertices.append(line[2:].split()[:3])
                elif line.startswith("f "):
                    indices = [int(item.split("/")[0]) - 1 for item in line[2:].split()]
                    faces.extend([indices[0], indices[i], indices[i + 1]] for i in range(1, len(indices) - 1))
                elif name is None and line.startswith("#"):
                    match = _NAME.search(line)
                    if match:
                        name = match.group(1).strip()
        if name and vertices and faces:
            grouped.setdefault(name, []).append((np.array(vertices, dtype=np.float64) / 1000.0, np.array(faces, dtype=np.int32)))
    return {name: merge(pieces) for name, pieces in grouped.items()}, grouped


def read_glb(path):
    """Returns {node name: (vertices, triangles)} with world transforms applied."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    bpy.context.view_layer.update()
    parts = {}
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        mesh = obj.data
        mesh.calc_loop_triangles()
        vertices = np.empty(len(mesh.vertices) * 3, dtype=np.float64)
        mesh.vertices.foreach_get("co", vertices)
        vertices = vertices.reshape(-1, 3)
        triangles = np.empty(len(mesh.loop_triangles) * 3, dtype=np.int32)
        mesh.loop_triangles.foreach_get("vertices", triangles)
        matrix = np.array(obj.matrix_world)
        world = vertices @ matrix[:3, :3].T + matrix[:3, 3]
        parts[obj.name] = (world, triangles.reshape(-1, 3))
    return parts


def merge(pieces):
    """Joins (vertices, triangles) pairs into one pair."""
    all_vertices, all_triangles, offset = [], [], 0
    for vertices, triangles in pieces:
        all_vertices.append(vertices)
        all_triangles.append(triangles + offset)
        offset += len(vertices)
    return np.vstack(all_vertices), np.vstack(all_triangles)


def to_object(name, vertices, triangles):
    """Creates a Blender mesh object from arrays and links it to the scene."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices.tolist(), [], triangles.tolist())
    mesh.validate(verbose=False)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj
