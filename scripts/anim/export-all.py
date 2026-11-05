import bpy, math, os, sys
from mathutils import Vector, Matrix

# ═══════════════════════════════════════════════════════════════════════════
# EXPORT EVERY CLIP INTO ONE GLB
#
# ⚠️ BLENDING NEEDS ONE FILE. Two GLBs cannot cross-fade -- a three.js
# AnimationMixer blends actions that share a skeleton, so every clip has to
# ride in the same container on the same rig.
#
# Each clip is keyed, baked down to plain bone keys (glTF has no IK), then
# STASHED so the next one can be keyed on a clean slate. The constraints must
# survive all the bakes, so clear_constraints stays FALSE until the end.
# ═══════════════════════════════════════════════════════════════════════════
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)

# build-walk.py leaves the hero, the shield, the leg IK, the guard IK, the
# closed fist -- and a keyed Walk.
exec(open(os.path.join(HERE, "build-walk.py")).read())

import clips
clips.init(globals())

STASHED = []

def bake_and_stash(name, end):
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    # ⚠️ clear_constraints MUST be False. The IK rig has to survive to key the
    # next clip; clearing it on the first bake leaves everything after it
    # stuck in the rest pose.
    bpy.ops.nla.bake(frame_start=1, frame_end=end, step=1, only_selected=True,
                     visual_keying=True, clear_constraints=False, clear_parents=False,
                     use_current_action=True, bake_types={"POSE", "OBJECT"})
    bpy.ops.object.mode_set(mode="OBJECT")
    act = arm.animation_data.action
    act.name = name
    act.use_fake_user = True
    try:
        act.use_frame_range = True
        act.frame_start, act.frame_end = 1, end + 1
    except Exception:
        pass
    # Loop seam: frame end+1 repeats frame 1. Impact is a one-shot and is
    # deliberately left alone -- looping a hit reaction makes it stutter.
    if name != "Impact":
        for fc in act.fcurves:
            v1 = next((k.co[1] for k in fc.keyframe_points if abs(k.co[0] - 1) < 0.01), None)
            if v1 is not None:
                fc.keyframe_points.insert(end + 1, v1, options={"FAST"})
        act.fcurves.update()
    arm.animation_data.action = None
    STASHED.append((name, end, len(act.fcurves)))
    print("CLIP %-7s %2d frames, %d curves" % (name, end, len(act.fcurves)))

bake_and_stash("Walk", FRAMES)

# Brace: keyed by its own script against the same rig.
_brace_src = open(os.path.join(HERE, "build-brace.py")).read()
_brace_src = _brace_src.split('exec(open(os.path.join(_here, "build-walk.py")).read())', 1)[1]
exec(_brace_src)
bake_and_stash("Brace", BF)

bake_and_stash("Idle", clips.key_idle())
bake_and_stash("Impact", clips.key_impact())

# Constraints and helpers go now that every clip is baked.
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode="POSE")
for pb in arm.pose.bones:
    for c in list(pb.constraints):
        pb.constraints.remove(c)
bpy.ops.object.mode_set(mode="OBJECT")
for e in helpers:
    bpy.data.objects.remove(e, do_unlink=True)

if human.data.shape_keys and len(human.data.shape_keys.key_blocks) > 1:
    bpy.context.view_layer.objects.active = human
    bpy.ops.object.shape_key_remove(all=True, apply_mix=True)

KEEP = {human}
KEEP |= {o for o in bpy.data.objects
         if o.type == "MESH" and any(m.type == "ARMATURE" and m.object is arm for m in o.modifiers)}
for ob in list(bpy.data.objects):
    if ob.type == "MESH" and ob not in KEEP:
        bpy.data.objects.remove(ob, do_unlink=True)
for ob in bpy.data.objects:
    ob.select_set(ob in KEEP or ob is arm)
bpy.context.view_layer.objects.active = arm

path = os.path.join(REPO, "public", "models", "hero.glb")
bpy.ops.export_scene.gltf(
    filepath=path, export_format="GLB", use_selection=True,
    export_animations=True, export_animation_mode="ACTIONS",
    export_frame_range=False, export_yup=True, export_apply=False,
    export_materials="EXPORT",
)
print("GLB_OK %s  %d KB" % (os.path.basename(path), os.path.getsize(path) // 1024))
for n, e, c in STASHED:
    print("   %-7s %2d frames" % (n, e))
