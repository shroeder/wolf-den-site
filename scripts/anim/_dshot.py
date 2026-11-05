import bpy, math, os
from mathutils import Vector
_here = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get("OUT_DIR", _here)
exec(open(os.path.join(_here, "build-dragon.py")).read())

bpy.context.view_layer.objects.active = drg
drg.select_set(True)
bpy.ops.object.convert(target="MESH")
drg = bpy.context.active_object
for mo in MEMBRANES:
    bpy.context.view_layer.objects.active = mo
    mo.select_set(True)
    bpy.ops.object.convert(target="MESH")
bpy.ops.object.select_all(action="DESELECT")
for o in [drg] + MEMBRANES:
    o.select_set(True)
bpy.context.view_layer.objects.active = drg
bpy.ops.object.join()
drg = bpy.context.active_object
print("MESH faces=%d" % len(drg.data.polygons))

m = bpy.data.materials.new("scale"); m.use_nodes = True
p = m.node_tree.nodes["Principled BSDF"]
p.inputs["Base Color"].default_value = (0.085, 0.165, 0.135, 1)
p.inputs["Roughness"].default_value = 0.58
drg.data.materials.append(m)

sc = bpy.context.scene
sc.render.engine = "BLENDER_EEVEE_NEXT"
sc.view_settings.view_transform = "Standard"; sc.view_settings.look = "None"
sc.render.resolution_x, sc.render.resolution_y = 760, 520
sc.world = bpy.data.worlds.new("W"); sc.world.use_nodes = True
sc.world.node_tree.nodes["Background"].inputs[0].default_value = (0.52, 0.56, 0.60, 1)
pts = [drg.matrix_world @ v.co for v in drg.data.vertices]
lo = min(p_.z for p_ in pts); hi = max(p_.z for p_ in pts)
cx = sum(p_.x for p_ in pts)/len(pts); cy = sum(p_.y for p_ in pts)/len(pts)
span = max(max(p_.x for p_ in pts)-min(p_.x for p_ in pts),
           max(p_.y for p_ in pts)-min(p_.y for p_ in pts), hi-lo)
bpy.ops.mesh.primitive_plane_add(size=18, location=(0, 0, lo))
g = bpy.context.active_object
gm = bpy.data.materials.new("g"); gm.use_nodes = True
gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.34, 0.37, 0.40, 1)
g.data.materials.append(gm)
mid = Vector((0, cy, lo + (hi-lo)*0.5))
for n_, en, l, sz in (("k", 420, (4, -6, 6), 6.0), ("f", 130, (-6, -4, 3), 7.0), ("r", 220, (-2, 7, 4), 4.0)):
    d = bpy.data.lights.new(n_, type="AREA"); d.energy = en; d.size = sz
    o = bpy.data.objects.new(n_, d); bpy.context.collection.objects.link(o); o.location = l
    o.rotation_euler = (mid - Vector(l)).to_track_quat("-Z","Y").to_euler()
cd = bpy.data.cameras.new("C"); cd.type = "ORTHO"; cd.ortho_scale = span * 1.15
cam = bpy.data.objects.new("C", cd); bpy.context.collection.objects.link(cam); sc.camera = cam
for tag, azim, elev in (("side", 90, 8), ("tq", 40, 18), ("front", 0, 8), ("top", 0, 85)):
    a, e = math.radians(azim), math.radians(elev)
    D = 16
    cam.location = (D*math.sin(a)*math.cos(e), cy - D*math.cos(a)*math.cos(e), mid.z + D*math.sin(e))
    cam.rotation_euler = (mid - Vector(cam.location)).to_track_quat("-Z","Y").to_euler()
    sc.render.filepath = os.path.join(OUT, "dragon_%s.png" % tag)
    bpy.ops.render.render(write_still=True)
    print("D_OK %s" % tag)
