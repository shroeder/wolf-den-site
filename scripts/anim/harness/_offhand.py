import bpy, os, sys, math
from mathutils import Vector

# Reading: on Mine the off hand renders off the haft at the apex. Before
# theorising, ask TWO different questions, because they have different fixes:
#
#   1. Is the hand where the rig TOLD it to go?   (wrist vs its own IK goal)
#      If not, the IK is not reaching and the arm is the problem.
#   2. Is that instruction on the haft?           (goal vs the shaft axis)
#      If the hand is on its goal and the goal is off the shaft, the arm is
#      innocent and hand_mount() computed the wrong offset.
#
# ⚠️ THE FIRST VERSION OF THIS PROBE DERIVED THE SHAFT FROM THE PICKAXE POINT
# CLOUD, taking the farthest vertex from the centroid as the long axis -- and
# got the pick SPIKE, not the haft. It then reported the DRIVING hand, which
# grips correctly by construction, as 0.02-0.26 away. The control caught it
# in one run. There is no need to derive anything: build-pick mounts both
# grips at Vector((0, 0, along * LEG)), so IN TOOL SPACE THE HAFT IS THE Z
# AXIS and the distance to it is the XY magnitude. Exact, not estimated.
HERE = os.path.dirname(os.path.abspath(__file__))
ANIM = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, ANIM)

for _s in ("build-walk.py", "build-twist.py", "build-armour.py", "build-pick.py"):
    _real = __file__
    __file__ = os.path.join(ANIM, _s)
    exec(open(__file__).read())
    __file__ = _real

import clips
clips.init(globals())
clips.key_mine()

dg = bpy.context.evaluated_depsgraph_get()
sc = bpy.context.scene

print("")
print("=" * 78)
print("OFF HAND — Mine.  DRIVING hand is the control: it grips by construction.")
print("%4s | %9s %9s | %9s %9s" % ("f", "off->goal", "drv->goal",
                                   "off->haft", "drv->haft"))
print("=" * 78)
worst_goal = (0.0, 0)
worst_haft = (0.0, 0)
ctrl_goal = 0.0
for f in range(1, 41):
    sc.frame_set(f)
    dg.update()
    inv = TOOL.matrix_world.inverted()
    row = {}
    for tag, bone, goal in (("off", "hand_%s" % OFF_HAND, _hand_goal),
                            ("drv", "hand_%s" % PICK_HAND, _pick_goal)):
        wrist = arm.matrix_world @ arm.pose.bones[bone].head
        row[tag + "goal"] = (wrist - goal.matrix_world.translation).length
        local = inv @ wrist
        row[tag + "haft"] = math.hypot(local.x, local.y)
    if row["offgoal"] > worst_goal[0]:
        worst_goal = (row["offgoal"], f)
    if row["offhaft"] > worst_haft[0]:
        worst_haft = (row["offhaft"], f)
    ctrl_goal = max(ctrl_goal, row["drvgoal"])
    print("%4d | %9.4f %9.4f | %9.4f %9.4f"
          % (f, row["offgoal"], row["drvgoal"], row["offhaft"], row["drvhaft"]))
print("=" * 78)
print("CONTROL  driving hand is never more than %.4f from its goal%s"
      % (ctrl_goal, "" if ctrl_goal < 0.02
         else "   ⚠️ NOT A CONTROL — the probe or the rig is wrong"))
print("off hand worst %.4f from its goal (f%d), %.4f from the haft axis (f%d)"
      % (worst_goal[0], worst_goal[1], worst_haft[0], worst_haft[1]))
print("shaft radius %.4f; a fist is about 0.05 across" % SHAFT_R)

# ⚠️ DISTANCE TO AN INFINITE AXIS IS NOT "ON THE HAFT". Both hands measure the
# same distance to the shaft LINE; that says nothing about whether the shaft
# is still there. Where does the wood actually stop?
sc.frame_set(18)
dg.update()
inv = TOOL.matrix_world.inverted()
ev = bpy.data.objects["Pickaxe"].evaluated_get(dg)
me = ev.to_mesh()
zs = [(inv @ (ev.matrix_world @ v.co)).z for v in me.vertices]
rs = [(inv @ (ev.matrix_world @ v.co)) for v in me.vertices]
haft = [p.z for p in rs if (p.x * p.x + p.y * p.y) ** 0.5 < SHAFT_R * 1.6]
ev.to_mesh_clear()
print("")
print("TOOL-LOCAL Z, frame 18")
print("   whole pickaxe spans      %+.4f .. %+.4f" % (min(zs), max(zs)))
print("   the HAFT (near the axis) %+.4f .. %+.4f" % (min(haft), max(haft)))
print("   driving hand grip at     %+.4f   (GRIP_HI %.2f * LEG %.3f)"
      % (GRIP_HI * LEG, GRIP_HI, LEG))
print("   off     hand grip at     %+.4f   (GRIP_LO %.2f * LEG %.3f)"
      % (GRIP_LO * LEG, GRIP_LO, LEG))
for nm, z in (("driving", GRIP_HI * LEG), ("off", GRIP_LO * LEG)):
    inside = min(haft) <= z <= max(haft)
    print("   -> %s hand is %s the wood%s"
          % (nm, "ON" if inside else "PAST THE END OF",
             "" if inside else "  <-- gripping air"))
