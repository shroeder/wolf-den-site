import bpy, os, sys, math
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
exec(open(os.path.join(HERE, "build-walk.py")).read())
exec(open(os.path.join(HERE, "build-pick.py")).read())
OUT = os.environ.get("OUT_DIR", HERE)

for ob in list(bpy.data.objects):
    if ob.type == "MESH" and ob is not PICK:
        ob.hide_render = True
sc = bpy.context.scene
sc.render.engine = "BLENDER_EEVEE_NEXT"
sc.view_settings.view_transform = "Standard"
sc.render.resolution_x, sc.render.resolution_y = 760, 760
sc.world = bpy.data.worlds.new("W"); sc.world.use_nodes = True
sc.world.node_tree.nodes["Background"].inputs[0].default_value = (0.62, 0.65, 0.69, 1)
pts = [PICK.matrix_world @ v.co for v in PICK.data.vertices]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
mid = (lo + hi) * 0.5
span = max(hi.y - lo.y, hi.z - lo.z) * 1.25
print("TOOL  length %.3f  head width %.3f  (hero is %.3f tall, leg %.3f)" % (hi.z - lo.z, hi.y - lo.y, 2.2118, LEG))
for n, en, l in (("k", 260, (2, -3, 2.5)), ("f", 90, (-3, -2, 1)), ("r", 150, (0, 3, 2))):
    d = bpy.data.lights.new(n, type="AREA"); d.energy = en; d.size = 3
    o = bpy.data.objects.new(n, d); bpy.context.collection.objects.link(o); o.location = Vector(l) + mid
    o.rotation_euler = (mid - (Vector(l) + mid)).to_track_quat("-Z", "Y").to_euler()
cd = bpy.data.cameras.new("C"); cd.type = "ORTHO"; cd.ortho_scale = span
cam = bpy.data.objects.new("C", cd); bpy.context.collection.objects.link(cam); sc.camera = cam
cam.location = mid + Vector((8, 0, 0))     # straight side-on: the swing's angle
cam.rotation_euler = (mid - cam.location).to_track_quat("-Z", "Y").to_euler()
sc.render.filepath = os.path.join(OUT, "pick_side.png")
bpy.ops.render.render(write_still=True)
print("P_OK  %d faces" % len(PICK.data.polygons))
