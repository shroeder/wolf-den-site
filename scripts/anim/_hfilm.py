import bpy, math, os
from mathutils import Vector

# Throwaway: photograph the hero in whatever he is wearing. Runs the real
# exporter first, so what gets rendered is the scene that actually shipped --
# helpers stripped, constraints gone, modifiers in the state the GLB saw.
_here = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(_here, "export-all.py")).read())
OUT = os.environ.get("OUT_DIR", _here)
CLIP = os.environ.get("CLIP", "Brace")
FRAMES = [int(x) for x in os.environ.get("FRAMES", "1").split(",")]
AZIM = float(os.environ.get("AZIM", "34"))
STRIP = os.environ.get("STRIP")        # comma-separated pieces to take off

arm.animation_data_create()
arm.animation_data.action = bpy.data.actions[CLIP]
SOLO = os.environ.get("SOLO")
if SOLO:
    # Hide everything but one piece. Overlapping shells are unreadable in a
    # render -- a dark jagged patch could be a hole, a backface, or the next
    # plate along, and I have now guessed wrong about which three times.
    for ob in bpy.data.objects:
        if ob.type == "MESH" and ob.name != SOLO:
            ob.hide_render = True

if STRIP:
    for nm in STRIP.split(","):
        ob = bpy.data.objects.get(nm.strip())
        if ob:
            ob.hide_render = True

sc = bpy.context.scene
sc.render.engine = "BLENDER_EEVEE_NEXT"
sc.view_settings.view_transform = "Standard"; sc.view_settings.look = "None"
sc.render.resolution_x, sc.render.resolution_y = 640, 820
sc.world = bpy.data.worlds.new("W"); sc.world.use_nodes = True
sc.world.node_tree.nodes["Background"].inputs[0].default_value = (0.40, 0.44, 0.49, 1)

zs = [(human.matrix_world @ v.co).z for v in human.data.vertices]
lo, hi = min(zs), max(zs)
mid = Vector((0, 0, (lo + hi) * 0.52))
bpy.ops.mesh.primitive_plane_add(size=14, location=(0, 0, lo))
g = bpy.context.active_object
gm = bpy.data.materials.new("g"); gm.use_nodes = True
gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.26, 0.28, 0.31, 1)
g.data.materials.append(gm)

# ⚠️ KEEP THE KEY LOW AND FRONTAL -- the same note as the lab. A light high
# overhead carves a shadow under the pectoral that reads as a breast.
for n_, en, l, sz in (("k", 320, (2.4, -3.2, 2.2), 3.0),
                      ("f", 90, (-3.0, -2.2, 1.6), 4.0),
                      ("r", 190, (-1.0, 3.2, 2.6), 2.5)):
    d = bpy.data.lights.new(n_, type="AREA"); d.energy = en; d.size = sz
    o = bpy.data.objects.new(n_, d); bpy.context.collection.objects.link(o); o.location = l
    o.rotation_euler = (mid - Vector(l)).to_track_quat("-Z", "Y").to_euler()

cd = bpy.data.cameras.new("C"); cd.type = "ORTHO"; cd.ortho_scale = (hi - lo) * 1.22
cam = bpy.data.objects.new("C", cd); bpy.context.collection.objects.link(cam); sc.camera = cam
a, e, D = math.radians(AZIM), math.radians(7), 9
cam.location = (D * math.sin(a) * math.cos(e), -D * math.cos(a) * math.cos(e), mid.z + D * math.sin(e))
cam.rotation_euler = (mid - Vector(cam.location)).to_track_quat("-Z", "Y").to_euler()

tag = os.environ.get("TAG", CLIP.lower())
for f in FRAMES:
    sc.frame_set(f)
    sc.render.filepath = os.path.join(OUT, "hero_%s_%02d.png" % (tag, f))
    bpy.ops.render.render(write_still=True)
    print("H_OK %s %d" % (tag, f))
