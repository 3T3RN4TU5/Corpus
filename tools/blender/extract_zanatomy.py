"""Extracts the nerves and lymph nodes from Z-Anatomy into one file that the body build can read.

Z-Anatomy stores nerves as curves with a round profile, so each curve is turned into a mesh here. The blend file comes from
outside this project, so it is opened with its scripts disabled.

Run with: blender --background --factory-startup --disable-autoexec --python tools/blender/extract_zanatomy.py -- <Startup.blend> <output.npz> <report.json>
"""
import json
import re
import sys

import bpy
import numpy as np

blend, out, report_path = sys.argv[sys.argv.index("--") + 1:]
bpy.ops.wm.open_mainfile(filepath=blend, load_ui=False, use_scripts=False)

# These come from models whose licences do not allow commercial use, according to Z-Anatomy's own list.
EXCLUDED = re.compile(r"cochlear|vestibul|inner ear|central canal|ciliary body|zonular|optic nerve|-path$", re.I)
NERVE_MESH = re.compile(r"ganglia of sympathetic|sympathetic trunk|\bganglion\b|\bganglia\b|plexus", re.I)
LABEL_ONLY = re.compile(r"\.[ij]$")
REFERENCE_BONES = {
    "Femur.l": "Left femur",
    "Femur.r": "Right femur",
    "Tibia.l": "Left tibia",
    "Tibia.r": "Right tibia",
    "Humerus.l": "Left humerus",
    "Humerus.r": "Right humerus",
}
TUBE_RADIUS = 0.0012
# Z-Anatomy gives each curve point its own thickness, up to 12 times this base, and the sciatic nerve is the thickest. The whole
# layer is drawn 1.4 times thicker than the source, so that the finest branches can be seen at body scale.
NERVE_BASE_RADIUS = 0.0007
MAJOR_NERVE = re.compile(r"^(sciatic|tibial|common fibular|femoral|median|ulnar|radial|musculocutaneous|axillary|obturator) nerve|plexus|^vagus|cauda equina|sympathetic trunk|^intercostal", re.I)


def collection_of(name):
    found = {}

    def walk(collection):
        if name in collection.name:
            for obj in collection.all_objects:
                found[obj.name] = obj
        for child in collection.children:
            walk(child)

    walk(bpy.context.scene.collection)
    return found


def evaluated_mesh(obj):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    if mesh is None or len(mesh.vertices) == 0:
        evaluated.to_mesh_clear()
        return None
    mesh.calc_loop_triangles()
    vertices = np.empty(len(mesh.vertices) * 3)
    mesh.vertices.foreach_get("co", vertices)
    vertices = vertices.reshape(-1, 3)
    triangles = np.empty(len(mesh.loop_triangles) * 3, dtype=np.int32)
    mesh.loop_triangles.foreach_get("vertices", triangles)
    triangles = triangles.reshape(-1, 3)
    matrix = np.array(obj.matrix_world)
    vertices = vertices @ matrix[:3, :3].T + matrix[:3, 3]
    # Left-side objects are stored mirrored, which would turn their surfaces inside out.
    if np.linalg.det(matrix[:3, :3]) < 0:
        triangles = triangles[:, ::-1]
    evaluated.to_mesh_clear()
    return vertices, triangles


pieces = {}
report = {"nerve_curves": [], "nerve_meshes": [], "lymph": [], "excluded": [], "gave_tube": [], "other_vessels": []}

for name, obj in collection_of("Nervous system").items():
    if EXCLUDED.search(name):
        report["excluded"].append(name)
        continue
    if obj.type == "CURVE":
        curve = obj.data
        curve.bevel_mode = "ROUND"
        curve.bevel_object = None
        curve.taper_object = None
        curve.bevel_depth = NERVE_BASE_RADIUS
        curve.bevel_resolution = 1 if MAJOR_NERVE.search(name) else 0
        curve.use_fill_caps = True
        curve.resolution_u = min(curve.resolution_u, 3)
        result = evaluated_mesh(obj)
        if result and len(result[1]):
            pieces["nerve|" + name] = result
            report["nerve_curves"].append({"name": name, "tris": len(result[1]), "radius": float(curve.bevel_depth), "min": result[0].min(axis=0).round(3).tolist(), "max": result[0].max(axis=0).round(3).tolist()})
    elif obj.type == "MESH" and NERVE_MESH.search(name) and not LABEL_ONLY.search(name) and not re.search(r"choroid", name, re.I):
        result = evaluated_mesh(obj)
        if result and len(result[1]):
            pieces["nerve|" + name] = result
            report["nerve_meshes"].append({"name": name, "tris": len(result[1])})

for name, obj in collection_of("Lymphoid organs").items():
    if obj.type == "MESH" and not LABEL_ONLY.search(name) and not name.endswith(".g"):
        result = evaluated_mesh(obj)
        if result and len(result[1]):
            pieces["lymph|" + name] = result
            report["lymph"].append({"name": name, "tris": len(result[1]), "min": result[0].min(axis=0).round(3).tolist(), "max": result[0].max(axis=0).round(3).tolist()})

for obj in bpy.data.objects:
    if re.search(r"thoracic duct|cisterna|lymphatic|lymph trunk|lymphatic trunk|right lymph", obj.name, re.I):
        report["other_vessels"].append({"name": obj.name, "type": obj.type})
        if obj.type in {"MESH", "CURVE"} and not LABEL_ONLY.search(obj.name):
            if obj.type == "CURVE" and obj.data.bevel_depth == 0 and obj.data.bevel_object is None:
                obj.data.bevel_depth = TUBE_RADIUS * 1.2
            result = evaluated_mesh(obj)
            if result and len(result[1]):
                pieces["duct|" + obj.name] = result

for name, label in REFERENCE_BONES.items():
    result = evaluated_mesh(bpy.data.objects[name])
    pieces["bone|" + label] = result

arrays = {}
for key, (vertices, triangles) in pieces.items():
    arrays[key + "|v"] = vertices.astype(np.float32)
    arrays[key + "|t"] = triangles
np.savez_compressed(out, **arrays)
report["pieces"] = len(pieces)
report["all_curve_names"] = sorted(c["name"] for c in report["nerve_curves"])
json.dump(report, open(report_path, "w"), indent=0)
