import bpy, os, sys, math
from mathutils import Vector

# Point a tight camera AT the grip, computed from the skeleton, for the
# frames asked for. ⚠️ Do not guess crop boxes in pixels -- the first attempt
# at this cropped his knees and I nearly critiqued them as hands.
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
exec(open(os.path.join(HERE, "export-all.py")).read())
OUT = os.environ.get("OUT_DIR", HERE)
CLIP = os.environ.get("CLIP", "Mine")
FRAMES = [int(x) for x in os.environ.get("FRAMES", "1,12,18,22,23,30").split(",")]
AZIM = float(os.environ.get("AZIM", "72"))

arm.animation_data_create()
arm.animation_data.action = bpy.data.actions[CLIP]
dg = bpy.context.evaluated_depsgraph_get()
for n in ("Shield", "Cuirass", "Pauldron_L", "Pauldron_R", "Greave_L", "Greave_R"):
    ob = bpy.data.objects.get(n)
    if ob:
        ob.hide_render = True

sc.render.engine = "BLENDER_EEVEE_NEXT"
sc.view_settings.view_transform = "Standard"
sc.render.resolution_x = sc.render.resolution_y = 520
sc.world = bpy.data.worlds.new("W"); sc.world.use_nodes = True
sc.world.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.58, 0.62, 1)
for n_, en, l in (("k", 240, (3, -4, 3)), ("f", 90, (-4, -3, 1)), ("r", 150, (0, 4, 3))):
    d = bpy.data.lights.new(n_, type="AREA"); d.energy = en; d.size = 3
    o = bpy.data.objects.new(n_, d); bpy.context.collection.objects.link(o)
    o.location = l
    o.rotation_euler = (Vector((0, 0, 1)) - Vector(l)).to_track_quat("-Z", "Y").to_euler()
cd = bpy.data.cameras.new("C"); cd.type = "ORTHO"; cd.ortho_scale = 0.62
cam = bpy.data.objects.new("C", cd); bpy.context.collection.objects.link(cam)
sc.camera = cam

for f in FRAMES:
    sc.frame_set(f)
    dg.update()
    hl = arm.matrix_world @ arm.pose.bones["hand_l"].head
    hr = arm.matrix_world @ arm.pose.bones["hand_r"].head
    mid = (hl + hr) * 0.5
    a, e, D = math.radians(AZIM), math.radians(6), 6
    cam.location = mid + Vector((D * math.sin(a) * math.cos(e),
                                 -D * math.cos(a) * math.cos(e), D * math.sin(e)))
    cam.rotation_euler = (mid - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = os.path.join(OUT, "grip_%02d.png" % f)
    bpy.ops.render.render(write_still=True)
    print("G_OK %d  hands %.3f apart" % (f, (hl - hr).length))
