import bpy, math, os
from mathutils import Vector

OUT = os.environ.get("OUT_DIR", ".")
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "build-walk.py")).read())

sc = bpy.context.scene

# ── MATERIAL BEFORE EXPORT ───────────────────────────────────────────────────
# ⚠️ THE LAST BUILD SHIPPED A GLB WITH NO MATERIALS AT ALL. The clay was
# assigned in the PREVIEW section, which runs after export_scene.gltf, so the
# browser got bare geometry and three.js substituted its default grey. That is
# the whole reason the lab looked nothing like the render.
skin = human.data.materials[0] if human.data.materials else bpy.data.materials.new("HeroSkin")
skin.use_nodes = True
p = skin.node_tree.nodes["Principled BSDF"]
p.inputs["Base Color"].default_value = (0.78, 0.55, 0.45, 1)
p.inputs["Roughness"].default_value = 0.58
try:
    p.inputs["Metallic"].default_value = 0.0
except Exception:
    pass
human.data.materials.clear()
human.data.materials.append(skin)
for poly in human.data.polygons:
    poly.material_index = 0

# ── BAKE IK DOWN TO BONE KEYS ────────────────────────────────────────────────
# glTF has no constraints. Everything the IK and the Copy Rotation solved has
# to become plain per-bone keyframes, or the exported clip is the REST pose
# with a hip bob.
bpy.ops.object.select_all(action="DESELECT")
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="POSE")
bpy.ops.pose.select_all(action="SELECT")
bpy.ops.nla.bake(frame_start=1, frame_end=FRAMES, step=1,
                 only_selected=True, visual_keying=True, clear_constraints=True,
                 clear_parents=False, use_current_action=True, bake_types={"POSE", "OBJECT"})
bpy.ops.object.mode_set(mode="OBJECT")
print("BAKED")

for e in helpers:
    bpy.data.objects.remove(e, do_unlink=True)

act = arm.animation_data.action
act.name = "Walk"
try:
    act.use_frame_range = True
    act.frame_start, act.frame_end = 1, FRAMES + 1
except Exception:
    pass
# Loop cleanly: frame FRAMES+1 must equal frame 1.
for fc in act.fcurves:
    v1 = next((k.co[1] for k in fc.keyframe_points if abs(k.co[0] - 1) < 0.01), None)
    if v1 is None:
        continue
    fc.keyframe_points.insert(FRAMES + 1, v1, options={"FAST"})
    for k in fc.keyframe_points:
        k.interpolation = "BEZIER"
act.fcurves.update()
print("LOOPED keys=%d" % len(act.fcurves))

# ── SHAPE KEYS OUT, OR THE FILE IS 10MB ──────────────────────────────────────
if human.data.shape_keys and len(human.data.shape_keys.key_blocks) > 1:
    n = len(human.data.shape_keys.key_blocks)
    bpy.context.view_layer.objects.active = human
    bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    print("BAKED %d shape keys" % n)

# ── DELETE THE HELPER GEOMETRY FOR REAL ──────────────────────────────────────
# ⚠️ THE MASK MODIFIER ONLY HIDES IT. MakeHuman's base mesh carries proxy
# volumes for fitting clothes and hair, plus anatomical detail, and MPFB hides
# them behind a MASK modifier rather than deleting them. Blender renders look
# clean; the GLB does not, because export_apply must stay FALSE (applying
# modifiers would flatten the Armature and destroy the skinning). So the
# browser got a figure wearing a robe, with hair and genitals, while every
# render here showed a bare base mesh.
#
# Applying the MASK alone removes those vertices permanently and leaves the
# Armature modifier intact.
before = len(human.data.vertices)
bpy.ops.object.select_all(action="DESELECT")
human.select_set(True)
bpy.context.view_layer.objects.active = human
for m in list(human.modifiers):
    if m.type == "MASK":
        try:
            bpy.ops.object.modifier_apply(modifier=m.name)
            print("MASK APPLIED %s" % m.name)
        except Exception as e:
            print("MASK APPLY FAILED: %s" % e)
print("VERTS %d -> %d (removed %d helper verts)" % (before, len(human.data.vertices), before - len(human.data.vertices)))

# ⚠️ AND BONE CUSTOM SHAPES COME ALONG TOO. MPFB gives pose bones a display
# object -- an icosphere -- and the exporter ships it as real geometry even
# though it is never an object in the scene and never renders. That is a
# 42-vertex untextured ball riding inside every export.
_cleared = 0
for _pb in arm.pose.bones:
    if _pb.custom_shape:
        _pb.custom_shape = None
        _cleared += 1
print("CLEARED %d bone custom shapes" % _cleared)
for _d in list(bpy.data.objects):
    if _d.type == "MESH" and _d is not human and _d.users == 0:
        bpy.data.objects.remove(_d, do_unlink=True)

# ⚠️ THE EXPORTER FOLLOWS CHILDREN OF WHAT YOU SELECT. MPFB parents bone-shape
# helper objects to the armature, so selecting only the body and the rig still
# shipped a stray 42-vertex Icosphere with no material. Delete anything that is
# not the body outright.
for ob in list(bpy.data.objects):
    if ob.type == "MESH" and ob is not human:
        print("DROPPED stray mesh %s" % ob.name)
        bpy.data.objects.remove(ob, do_unlink=True)

for ob in bpy.data.objects:
    ob.select_set(ob in (arm, human))
bpy.context.view_layer.objects.active = arm
path = os.path.join(OUT, "hero-walk.glb")
bpy.ops.export_scene.gltf(
    filepath=path, export_format="GLB", use_selection=True,
    export_animations=True, export_animation_mode="ACTIONS",
    export_frame_range=True, export_yup=True, export_apply=False,
    export_materials="EXPORT",
)
print("GLB_OK %d bytes" % os.path.getsize(path))

# ── PREVIEW ──────────────────────────────────────────────────────────────────
sc.render.engine = "BLENDER_EEVEE_NEXT"
sc.view_settings.view_transform = "Standard"
sc.view_settings.look = "None"
sc.render.resolution_x, sc.render.resolution_y = 340, 430
sc.world = bpy.data.worlds.new("W"); sc.world.use_nodes = True
sc.world.node_tree.nodes["Background"].inputs[0].default_value = (0.10, 0.12, 0.14, 1)

dg = bpy.context.evaluated_depsgraph_get(); ev = human.evaluated_get(dg)
zs = [(ev.matrix_world @ v.co).z for v in ev.data.vertices]
lo, hi = min(zs), max(zs)
bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, lo))
gp = bpy.context.active_object
gm = bpy.data.materials.new("gm"); gm.use_nodes = True
gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.16, 0.20, 0.23, 1)
gp.data.materials.append(gm)

for n_, en, l in (("k", 240, (2.6, -3.0, 3.0)), ("f", 70, (-3.2, -2.0, 1.6)), ("r", 150, (-1.0, 3.2, 2.4))):
    d = bpy.data.lights.new(n_, type="AREA"); d.energy = en; d.size = 3.5
    o = bpy.data.objects.new(n_, d); bpy.context.collection.objects.link(o); o.location = l
    o.rotation_euler = (Vector((0, 0, (lo + hi) / 2)) - Vector(l)).to_track_quat("-Z", "Y").to_euler()

cd = bpy.data.cameras.new("C"); cd.type = "ORTHO"; cd.ortho_scale = (hi - lo) * 1.2
cam = bpy.data.objects.new("C", cd); bpy.context.collection.objects.link(cam); sc.camera = cam
for tag, azim in (("side", 90), ("tq", 40)):
    a = math.radians(azim); mid = (lo + hi) / 2
    cam.location = (9 * math.sin(a), -9 * math.cos(a), mid + 0.25)
    cam.rotation_euler = (Vector((0, 0, mid)) - Vector(cam.location)).to_track_quat("-Z", "Y").to_euler()
    for f in range(1, FRAMES + 1):
        sc.frame_set(f)
        sc.render.filepath = os.path.join(OUT, "fin_%s" % tag, "%02d.png" % f)
        bpy.ops.render.render(write_still=True)
    print("PREVIEW_OK %s" % tag)
