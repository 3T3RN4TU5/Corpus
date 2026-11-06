"""Measures how well the built anatomy fits: the share of each part's vertices outside the skin.

Run with: blender --background --factory-startup --python tools/blender/audit_models.py -- <models dir> <report.json>
"""
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

models, report_path = sys.argv[sys.argv.index("--") + 1:]
models = Path(models)
report = {}

for body in ("female", "male"):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for path in sorted((models / body).glob("*-high.glb")):
        if "fat" in path.name:
            continue
        bpy.ops.import_scene.gltf(filepath=str(path))
    bpy.context.view_layer.update()
    skin = bpy.data.objects["skin"]
    tree = BVHTree.FromPolygons(
        [skin.matrix_world @ v.co for v in skin.data.vertices],
        [tuple(p.vertices) for p in skin.data.polygons],
    )
    parts = {}
    for obj in bpy.data.objects:
        if obj.type != "MESH" or obj is skin:
            continue
        name = obj.name.split(".")[0]
        matrix = obj.matrix_world
        entry = parts.setdefault(name, {"count": 0, "outside": 0, "max_mm": 0.0, "x": 0.0, "z": 0.0})
        for vertex in obj.data.vertices:
            point = matrix @ vertex.co
            location, normal, _, distance = tree.find_nearest(point)
            entry["count"] += 1
            entry["x"] += point.x
            entry["z"] += point.z
            if (point - location).dot(normal) > 0:
                entry["outside"] += 1
                entry["max_mm"] = max(entry["max_mm"], distance * 1000)
    for entry in parts.values():
        entry["outside_pct"] = round(100 * entry.pop("outside") / max(1, entry["count"]), 2)
        entry["max_mm"] = round(entry["max_mm"], 1)
        entry["mean_x"] = round(entry.pop("x") / max(1, entry["count"]), 3)
        entry["mean_height"] = round(entry.pop("z") / max(1, entry["count"]), 3)
    report[body] = parts

Path(report_path).write_text(json.dumps(report, indent=1))
print("AUDIT_DONE")
