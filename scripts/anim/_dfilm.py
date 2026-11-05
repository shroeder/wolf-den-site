import bpy, math, os
from mathutils import Vector

# Throwaway: run the clips and photograph a few frames of one, so the
# deformation can be LOOKED AT before anything is exported. A rig that binds
# cleanly can still fold a wing through the ribs, and no number says so.
_here = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(_here, "anim-dragon.py")).read())
OUT = os.environ.get("OUT_DIR", _here)
CLIP = os.environ.get("CLIP", "Fly")
FRAMES = [int(x) for x in os.environ.get("FRAMES", "1,7,13,19").split(",")]
AZIM = float(os.environ.get("AZIM", "48"))

arm.animation_data_create()
arm.animation_data.action = bpy.data.actions[CLIP]

m = bpy.data.materials.new("scale"); m.use_nodes = True
p = m.node_tree.nodes["Principled BSDF"]
p.inputs["Base Color"].default_value = (0.085, 0.165, 0.135, 1)
p.inputs["Roughness"].default_value = 0.58
drg.data.materials.append(m)

sc.render.engine = "BLENDER_EEVEE_NEXT"
sc.view_settings.view_transform = "Standard"; sc.view_settings.look = "None"
sc.render.resolution_x, sc.render.resolution_y = 720, 520
sc.world = bpy.data.worlds.new("W"); sc.world.use_nodes = True
sc.world.node_tree.nodes["Background"].inputs[0].default_value = (0.52, 0.56, 0.60, 1)

mid = Vector((0, 0.1, 1.9))
bpy.ops.mesh.primitive_plane_add(size=22, location=(0, 0, 0))
g = bpy.context.active_object
gm = bpy.data.materials.new("g"); gm.use_nodes = True
gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.34, 0.37, 0.40, 1)
g.data.materials.append(gm)
for n_, en, l, sz in (("k", 520, (5, -7, 7), 6.0), ("f", 150, (-7, -5, 3), 8.0), ("r", 260, (-2, 8, 5), 5.0)):
    d = bpy.data.lights.new(n_, type="AREA"); d.energy = en; d.size = sz
    o = bpy.data.objects.new(n_, d); bpy.context.collection.objects.link(o); o.location = l
    o.rotation_euler = (mid - Vector(l)).to_track_quat("-Z", "Y").to_euler()

cd = bpy.data.cameras.new("C"); cd.type = "ORTHO"; cd.ortho_scale = 8.4
cam = bpy.data.objects.new("C", cd); bpy.context.collection.objects.link(cam); sc.camera = cam
a, e, D = math.radians(AZIM), math.radians(16), 18
cam.location = (D * math.sin(a) * math.cos(e), -D * math.cos(a) * math.cos(e), mid.z + D * math.sin(e))
cam.rotation_euler = (mid - Vector(cam.location)).to_track_quat("-Z", "Y").to_euler()

for f in FRAMES:
    sc.frame_set(f)
    sc.render.filepath = os.path.join(OUT, "%s_%02d.png" % (CLIP.lower(), f))
    bpy.ops.render.render(write_still=True)
    print("F_OK %s %d" % (CLIP, f))
