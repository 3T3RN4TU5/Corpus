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
    "muscle": "deltoid pectoralis-major rectus-abdominis external-oblique trapezius latissimus-dorsi shoulder-girdle-muscles rotator-cuff biceps-brachii triceps-brachii forearm-muscles hand-muscles gluteus-maximus hip-muscles thigh-adductors quadriceps hamstrings gastrocnemius tibialis-anterior deep-calf-muscles foot-muscles chest-wall-muscles diaphragm back-muscles neck-muscles pelvic-floor".split(),
    "skeleton": "skull mandible vertebral-column rib-cage sternum clavicle scapula humerus radius ulna hand-bones pelvis femur patella tibia fibula foot-bones".split(),
    "organs": "brain heart lung-left lung-right trachea esophagus stomach liver gallbladder pancreas spleen small-intestine large-intestine kidneys ureters bladder uterus vagina ovaries testes prostate".split(),
    "vessels": "aorta carotid-arteries arm-arteries leg-arteries vena-cava jugular-veins arm-veins leg-veins pulmonary-vessels coronary-vessels abdominal-vessels".split(),
    "nerves": "spinal-cord vagus-nerve arm-nerves sciatic-nerve femoral-nerve".split(),
    "lymph": "thoracic-duct thymus cervical-nodes axillary-nodes inguinal-nodes".split(),
}.items():
    for part_id in ids:
        LAYER[part_id] = layer

ILLUSTRATIVE = {"sciatic-nerve", "femoral-nerve", "arm-nerves", "vagus-nerve", "thoracic-duct", "cervical-nodes", "axillary-nodes", "inguinal-nodes", "rectus-abdominis", "latissimus-dorsi"}
RIGID_GROUP = {"hand-bones", "foot-bones"}
# These muscles wrap the trunk and spine, so they bend with the body. Limb muscles keep straighter shapes.
BENDING_MUSCLES = {"back-muscles", "neck-muscles", "chest-wall-muscles", "diaphragm", "pelvic-floor"}
# The brain has hundreds of regions, so a size-based share would leave it too coarse.
MINIMUM_TRIANGLES = {"brain": 60000}


def classify(name):
    vascular = bool(VASCULAR_NAME.search(name))
    if not vascular and EXCLUDE.search(name):
        return None
    for pattern, part in BP3D_RULES:
        if (part in VESSEL_PARTS) == vascular and pattern.search(name):
            return part
    return None


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


def affine_fit(source, target):
    """Best straight-line fit from source onto target points. It can stretch a shape, but cannot kink it."""
    homogeneous = np.hstack([source, np.ones((len(source), 1))])
    matrix, *_ = np.linalg.lstsq(homogeneous, target, rcond=None)
    return lambda points: np.hstack([points, np.ones((len(points), 1))]) @ matrix


log("reading BodyParts3D")
_, isa_pieces = read_bp3d(raw / "bp3d" / "isa_BP3D_4.0_obj_99")
joined, part_of_pieces = read_bp3d(raw / "bp3d" / "partof_BP3D_4.0_obj_99")
pieces_by_name = {**part_of_pieces, **isa_pieces}
bp3d = {name: merge(pieces) for name, pieces in pieces_by_name.items()}
log("names", len(bp3d))
bp3d_parts = {}
unmapped = []
for name, pieces in pieces_by_name.items():
    part = classify(name)
    if part:
        bp3d_parts.setdefault(part, []).extend((name, piece) for piece in pieces)
    else:
        unmapped.append(name)
log("mapped parts", len(bp3d_parts), "unused names", len(unmapped))
(Path(log_path).parent / "unused_bp3d_names.txt").write_text("\n".join(sorted(unmapped)))
source_skin_v, source_skin_t = bp3d["Skin"]
source_measure = measure(source_skin_v, source_skin_t)
hand_placed = illustrative.build(source_skin_v)

BODIES = {"female": ("VH_Female", "VH_F_", "Allen_F_Brain"), "male": ("VH_Male", "VH_M_", "Allen_M_Brain")}
hra_files = {}


def load_hra(body, key):
    folder, prefix, brain = BODIES[body]
    base = raw / "hra" / folder / "v1.2"
    matches = [p for p in base.glob("*.glb") if p.stem == f"{prefix}{key}" or p.stem.endswith(f"_{key}") or (key == "Brain" and p.stem == brain)]
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


def decimated_copy(obj, ratio):
    if ratio >= 0.999:
        return
    modifier = obj.modifiers.new("reduce", "DECIMATE")
    modifier.decimate_type = "COLLAPSE"
    modifier.ratio = ratio
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

    for part, named in bp3d_parts.items():
        layer = LAYER.get(part)
        if not layer:
            log("no layer for", part)
            continue
        fitted = []
        if layer == "skeleton":
            groups = {}
            for name, piece in named:
                if part in RIGID_GROUP:
                    side = "left" if piece[0][:, 0].mean() > 0 else "right"
                    groups.setdefault(side, []).append(piece)
                else:
                    groups[id(piece)] = [piece]
            for group in groups.values():
                vertices, triangles = merge(group)
                sample = vertices[:: max(1, len(vertices) // 1500)]
                fitted.append((rigid_fit(sample, spline.apply(sample))(vertices), triangles))
        else:
            for _, (vertices, triangles) in named:
                if layer == "muscle" and part not in BENDING_MUSCLES:
                    sample = vertices[:: max(1, len(vertices) // 1500)]
                    fitted.append((affine_fit(sample, spline.apply(sample))(vertices), triangles))
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

    objects = []
    for (part, source), pieces in sorted(sources.items()):
        vertices, triangles = weld(*merge(pieces))
        vertices = vertices + offset
        count = len(triangles)
        log(f"  start {part}/{source}: {count} triangles, {sum(1 for _ in pieces)} pieces")
        obj = to_object(part, vertices, triangles)
        share = count / sum(len(t) for _, t in all_pieces[part])
        decimated_copy(obj, min(1.0, part_budget[part] * share / max(1, count)))
        obj.data.shade_smooth()
        objects.append((obj, part, source))
        log(f"  {part}/{source}: {count} -> {len(obj.data.polygons)}")

    # The fat layer is the skin moved inward along its normals. It shows no real fat distribution.
    skin_obj = next(o for o, p, _ in objects if p == "skin")
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
