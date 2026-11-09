import importlib
import json
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                "models"))

import kit      # noqa: E402
import style    # noqa: E402

# ═══════════════════════════════════════════════════════════════════════════
# MAKE — BUILD A MODEL, EXPORT IT, AND WRITE DOWN WHAT IT ACTUALLY IS
#
#     npm run lp:make                 # every model
#     MODEL=player npm run lp:make    # one
#
# ⚠️ THE MANIFEST IS THE ONLY REGISTRY, AND IT IS WRITTEN BY THE BUILD.
#    The old pipeline kept the list of what a model contained in two places:
#    a python table in the harness and a javascript table in the lab. They
#    disagreed, and the consequence was that the harness photographed a
#    character that does not ship -- a clip wearing a shield AND a pickaxe,
#    evidence about nothing.
#
#    So nothing here is typed twice. The build measures the mesh it just
#    exported and writes public/models/lp/manifest.json; the lab fetches that
#    file and renders whatever is in it. Add models/goblin.py, run this, and
#    the goblin appears in the lab with its real triangle count. There is no
#    second list to update, which is why there is no second list to forget.
# ═══════════════════════════════════════════════════════════════════════════

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                    "..", ".."))
OUT_DIR = os.path.join(ROOT, "public", "models", "lp")
MANIFEST = os.path.join(OUT_DIR, "manifest.json")
MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")


def discover():
    """Every models/*.py, in file order. No list to maintain."""
    return sorted(f[:-3] for f in os.listdir(MODELS_DIR)
                  if f.endswith(".py") and not f.startswith("_"))


def build_one(name):
    mod = importlib.import_module(name)
    importlib.reload(mod)
    kit.wipe()
    ob = mod.build()

    tris = kit.triangles(ob)
    h, w, d = kit.measure(ob)
    mats = [m.name for m in ob.data.materials if m]

    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, "%s.glb" % name)
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_materials="EXPORT",
        export_normals=True,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_extras=False,
    )

    return {
        "id": name,
        "label": getattr(mod, "LABEL", name.title()),
        "kind": getattr(mod, "KIND", "prop"),
        "scale": getattr(mod, "SCALE", "prop"),
        "note": getattr(mod, "NOTE", ""),
        "url": "/models/lp/%s.glb" % name,
        "tris": tris,
        "budget": style.budget(getattr(mod, "KIND", "prop")),
        "materials": mats,
        "height": round(h, 4),
        "width": round(w, 4),
        "depth": round(d, 4),
        "bytes": os.path.getsize(path),
    }


def main():
    want = os.environ.get("MODEL", "all").strip()
    names = discover() if want in ("", "all") else [want]
    missing = [n for n in names if not os.path.exists(
        os.path.join(MODELS_DIR, "%s.py" % n))]
    if missing:
        print("NO SUCH MODEL: %s. Have: %s" % (", ".join(missing),
                                               ", ".join(discover())))
        sys.exit(1)

    entries = {}
    if os.path.exists(MANIFEST):
        try:
            with open(MANIFEST, "r", encoding="utf-8") as fh:
                for e in json.load(fh).get("models", []):
                    entries[e["id"]] = e
        except (ValueError, KeyError):
            entries = {}

    for n in names:
        e = build_one(n)
        entries[n] = e
        print("BUILT %-10s %4d tris / %-3d budget   %.2f m   %d mats   %5.1f KB"
              % (e["id"], e["tris"], e["budget"], e["height"],
                 len(e["materials"]), e["bytes"] / 1024.0))

    # A model whose .py is gone should not linger in the lab.
    live = set(discover())
    ordered = [entries[k] for k in discover() if k in entries]
    for k in list(entries):
        if k not in live:
            print("DROPPED %s (no models/%s.py any more)" % (k, k))

    with open(MANIFEST, "w", encoding="utf-8") as fh:
        json.dump({"style": {"player_height": style.PLAYER_HEIGHT,
                             "palette": {k: list(v) for k, v in
                                         style.PALETTE.items()}},
                   "models": ordered}, fh, indent=1)
    print("MANIFEST %s (%d models)" % (MANIFEST, len(ordered)))


main()
