import bpy, math, os
from mathutils import Vector

# ── ROUND-TRIP CHECK ─────────────────────────────────────────────────────────
# Render the EXPORTED FILE, not the scene that produced it. Everything the
# browser sees passes through glTF, and the scene can look right while the
# export does not -- helper geometry hidden by a modifier that never applies,
# materials assigned after the export call, a clip that did not come across.
# This is the only view that is actually the deliverable.
OUT = os.environ.get("OUT_DIR", ".")
bpy.ops.wm.read_homefile(use_empty=True)
# ⚠️ THE HARNESS MUST NOT COUNT ITS OWN FURNITURE. An enabled add-on can leave
# objects in a "use_empty" file -- MPFB leaves an icosphere -- and counting
# them as part of the import reported a stray mesh in a GLB that was clean.
PRE = {o.name for o in bpy.data.objects}
for _o in list(bpy.data.objects):
    bpy.data.objects.remove(_o, do_unlink=True)
print("PRE-EXISTING objects removed: %s" % (sorted(PRE) or "none",))

bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, "hero-walk.glb"))

meshes = [o for o in bpy.data.objects if o.type == "MESH"]
arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]
print("IMPORTED meshes=%d armatures=%d verts=%d" % (
    len(meshes), len(arms), sum(len(m.data.vertices) for m in meshes)))
for m in meshes:
    zs = [(m.matrix_world @ v.co).z for v in m.data.vertices]
    print("  MESH %-22s verts %6d   z %+.3f .. %+.3f   mats %s" % (
        m.name, len(m.data.vertices), min(zs), max(zs), [mm.name for mm in m.data.materials]))
print("MATERIALS %s" % ([m.name for m in bpy.data.materials],))
acts = [a.name for a in bpy.data.actions]
print("ACTIONS %s" % (acts,))

sc = bpy.context.scene
sc.render.engine = "BLENDER_EEVEE_NEXT"
sc.view_settings.view_transform = "Standard"; sc.view_settings.look = "None"
sc.render.resolution_x, sc.render.resolution_y = 560, 760
sc.world = bpy.data.worlds.new("W"); sc.world.use_nodes = True
sc.world.node_tree.nodes["Background"].inputs[0].default_value = (0.88, 0.89, 0.91, 1)

allz, ally, allx = [], [], []
for m in meshes:
    for v in m.data.vertices:
        p = m.matrix_world @ v.co
        allx.append(p.x); ally.append(p.y); allz.append(p.z)
lo, hi = min(allz), max(allz)
HHt = hi - lo
print("IMPORTED bounds z %.3f..%.3f (h %.3f)" % (lo, hi, HHt))

for n_, en, l in (("k", 300, (2.8, -3.2, 3.4)), ("f", 90, (-3.4, -2.4, 1.8)), ("r", 170, (-1.2, 3.4, 2.6))):
    d = bpy.data.lights.new(n_, type="AREA"); d.energy = en; d.size = 4.0
    o = bpy.data.objects.new(n_, d); bpy.context.collection.objects.link(o); o.location = l
    o.rotation_euler = (Vector((0, 0, lo + HHt * 0.5)) - Vector(l)).to_track_quat("-Z", "Y").to_euler()
cd = bpy.data.cameras.new("C"); cd.type = "ORTHO"; cd.ortho_scale = HHt * 1.15
cam = bpy.data.objects.new("C", cd); bpy.context.collection.objects.link(cam); sc.camera = cam
mid = lo + HHt * 0.5
for tag, azim in (("front", 0), ("side", 90)):
    a = math.radians(azim)
    cam.location = (9 * math.sin(a), -9 * math.cos(a), mid)
    cam.rotation_euler = (Vector((0, 0, mid)) - Vector(cam.location)).to_track_quat("-Z", "Y").to_euler()
    sc.frame_set(1)
    sc.render.filepath = os.path.join(OUT, "rt_%s.png" % tag)
    bpy.ops.render.render(write_still=True)
    print("RT_OK %s" % tag)

print("")
print("  ════ EXPORT GATE ══════════════════════════════════════════════")
# ⚠️ STRUCTURAL FACTS COME FROM THE FILE, NOT FROM BLENDER'S IMPORT. The glTF
# importer fabricates a 42-vertex Icosphere as a bone display shape, and
# counting Blender's objects reported a stray mesh in a GLB that has exactly
# one. Parse the container; use the import only to LOOK at it.
import json, struct
raw = open(os.path.join(OUT, "hero-walk.glb"), "rb").read()
jlen = struct.unpack_from("<I", raw, 12)[0]
G = json.loads(raw[20:20 + jlen].decode("utf-8"))

fails = []
def chk(name, ok, detail):
    print("  %-26s %s  %s" % (name, "PASS" if ok else "FAIL", detail))
    if not ok: fails.append(name)

gm = G.get("meshes", [])
prim_mats = [p.get("material") for m in gm for p in m.get("primitives", [])]
chk("exactly one mesh", len(gm) == 1, "%d: %s" % (len(gm), [m.get("name") for m in gm]))
chk("every primitive textured", prim_mats and all(x is not None for x in prim_mats),
    "materials %s -> prims %s" % ([m.get("name") for m in G.get("materials", [])], prim_mats))
chk("walk clip present", any(a.get("name") == "Walk" for a in G.get("animations", [])),
    "%s" % ([a.get("name") for a in G.get("animations", [])],))
chk("rigged", len(G.get("skins", [])) == 1, "%d skin(s), %d joints" % (
    len(G.get("skins", [])), len(G.get("skins", [{}])[0].get("joints", []))))
body = max(meshes, key=lambda m: len(m.data.vertices))
bz = [(body.matrix_world @ v.co).z for v in body.data.vertices]
chk("stands on the floor", abs(min(bz)) < 0.08, "lowest vertex %+.3f" % min(bz))
chk("no helper geometry", len(body.data.vertices) < 16000,
    "%d verts (helpers would push this past 19k)" % len(body.data.vertices))
chk("file size sane", len(raw) < 3_000_000, "%d KB" % (len(raw) // 1024))
print("")
print("  RESULT: %s" % ("EXPORT OK" if not fails else "FAILED -> " + ", ".join(fails)))
