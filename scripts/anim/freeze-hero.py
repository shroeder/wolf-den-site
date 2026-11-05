import bpy, os
from mathutils import Vector

# ═══════════════════════════════════════════════════════════════════════════
# FREEZE THE HERO
#
# Runs MPFB ONCE and writes hero-base.blend. Nothing downstream ever calls the
# generator again.
#
# ⚠️ THIS IS THE ONLY SCRIPT ALLOWED TO TOUCH MPFB. Every defect in this
# pipeline came from its generation step -- a rig fitted to the wrong mesh,
# macro shape keys that break the bind, helper geometry hidden rather than
# deleted -- and the animation build used to re-run all of it on every export.
# That is why the model kept changing underneath the animation. Generation
# happens here, once, under the gates; everything after loads a fixed asset.
#
# To make a NEW character: edit MACRO, run this, run the gates, commit the
# .blend. That should be a deliberate act, not a side effect of a build.
# ═══════════════════════════════════════════════════════════════════════════
OUT = os.environ.get("OUT_DIR", ".")
DEST = os.environ.get("DEST", os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "hero-base.blend"))

bpy.ops.preferences.addon_enable(module="bl_ext.blender_org.mpfb")
from bl_ext.blender_org.mpfb.services.humanservice import HumanService
from bl_ext.blender_org.mpfb.services.targetservice import TargetService
bpy.ops.wm.read_homefile(use_empty=True)
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)

MACRO = {"gender": 1.0, "age": 0.55, "muscle": 0.95, "weight": 0.56,
         "height": 0.80, "proportions": 1.0, "cupsize": 0.0, "firmness": 0.9}

macro = TargetService.get_default_macro_info_dict()
macro.update({k: v for k, v in MACRO.items() if k in macro})
human = HumanService.create_human(macro_detail_dict=macro, scale=0.1,
                                  feet_on_ground=True, detailed_helpers=False)
print("1. generated   %d verts" % len(human.data.vertices))

# ── 2. BAKE THE MACRO ────────────────────────────────────────────────────────
# The macro details are SHAPE KEYS. Fitting a rig while they are live binds
# against geometry you cannot see, and the armature then stretches the body.
if human.data.shape_keys:
    n = len(human.data.shape_keys.key_blocks)
    bpy.context.view_layer.objects.active = human
    human.select_set(True)
    bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    human.select_set(False)
    print("2. baked       %d shape keys" % n)

arm = HumanService.add_builtin_rig(human, "game_engine")
print("3. rigged      %d bones" % len(arm.data.bones))

# ── 4. FIT THE SKELETON TO THE BODY ──────────────────────────────────────────
# MPFB builds the rig against base.obj, the pristine MakeHuman mesh, and does
# not resize it for the macro. Without this the joints sit a hip-height below
# the limbs they drive and posing swings flesh about points a metre away.
dg = bpy.context.evaluated_depsgraph_get(); ev = human.evaluated_get(dg)
mz = [(ev.matrix_world @ v.co).z for v in ev.data.vertices]
mlo, mhi = min(mz), max(mz)
bz = [(arm.matrix_world @ b.head_local).z for b in arm.data.bones] + \
     [(arm.matrix_world @ b.tail_local).z for b in arm.data.bones]
blo, bhi = min(bz), max(bz)
k = (mhi - mlo) / (bhi - blo)
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
for eb in arm.data.edit_bones:
    for a in ("head", "tail"):
        p = getattr(eb, a).copy()
        p.x *= k; p.y *= k
        p.z = mlo + (p.z - blo) * k
        setattr(eb, a, p)
bpy.ops.object.mode_set(mode="OBJECT")
arm.select_set(False)
print("4. fitted      rig scaled %.4f onto a %.3f body" % (k, mhi - mlo))

# ── 5. DELETE THE HELPER GEOMETRY ────────────────────────────────────────────
# The MASK modifier only HIDES MakeHuman's clothes/hair proxies and anatomical
# detail. Renders looked clean while every export shipped a figure in a robe.
before = len(human.data.vertices)
bpy.ops.object.select_all(action="DESELECT")
human.select_set(True)
bpy.context.view_layer.objects.active = human
for m in list(human.modifiers):
    if m.type == "MASK":
        bpy.ops.object.modifier_apply(modifier=m.name)
print("5. stripped    %d helper verts (%d -> %d)" % (before - len(human.data.vertices), before, len(human.data.vertices)))

for ob in list(bpy.data.objects):
    if ob not in (human, arm):
        bpy.data.objects.remove(ob, do_unlink=True)

skin = bpy.data.materials.new("HeroSkin")
skin.use_nodes = True
p = skin.node_tree.nodes["Principled BSDF"]
p.inputs["Base Color"].default_value = (0.78, 0.55, 0.45, 1)
p.inputs["Roughness"].default_value = 0.58
human.data.materials.clear()
human.data.materials.append(skin)

human.name = "Hero"; human.data.name = "HeroBody"
arm.name = "HeroRig"; arm.data.name = "HeroSkeleton"
for pb in arm.pose.bones:
    pb.rotation_mode = "XYZ"
    pb.custom_shape = None

bpy.ops.wm.save_as_mainfile(filepath=DEST)
print("6. saved       %s  (%d KB)" % (DEST, os.path.getsize(DEST) // 1024))
print("FREEZE_OK")
