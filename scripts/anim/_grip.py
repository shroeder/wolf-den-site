import bpy, os, math
from mathutils import Vector

# ⚠️ DO NOT exec export-all FOR THIS. It strips every helper empty and
# constraint at the end so the GLB is clean, which leaves nothing to measure.
# Build the rig, key the clip, and look -- before the teardown.
import sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
exec(open(os.path.join(HERE, "build-walk.py")).read())
exec(open(os.path.join(HERE, "build-pick.py")).read())
import clips
clips.init(globals())
clips.key_mine()
arm.animation_data.action.name = "Mine"

dg = bpy.context.evaluated_depsgraph_get()
print("")
print("frame  wrist->goal  wrist->haft  reach used / max")
worst=(0,0)
for f in range(1, 41):
    sc.frame_set(f)
    dg.update()
    w = arm.matrix_world @ arm.pose.bones["hand_l"].head
    s = arm.matrix_world @ arm.pose.bones["upperarm_l"].head
    goal = _hand_goal.matrix_world.translation
    ev = PICK.evaluated_get(dg)
    near = min(((PICK.matrix_world @ v.co) - w).length for v in ev.data.vertices)
    gap=(w - goal).length
    if gap>worst[1]: worst=(f,gap)
    if gap>0.02 and _gc.influence > 0.5: print("%5d   %7.4f     %7.4f     %.3f / %.3f" % (f, gap, near, (w - s).length, ARM_R))
print("WORST frame %d, off by %.4f  (%d frames over 2cm)" % (worst[0], worst[1], -1))
