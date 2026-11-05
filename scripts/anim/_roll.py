import bpy, os, sys, math
from mathutils import Vector, Matrix, Quaternion
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
exec(open(os.path.join(HERE, "build-walk.py")).read())
exec(open(os.path.join(HERE, "build-pick.py")).read())
import clips
clips.init(globals())

# Luke's hypothesis: the pickaxe is overspun about its own shaft, and the
# hands are twisting to follow it. Rolling a shaft about its own axis is
# nearly free visually -- so sweep it and measure what each roll does to the
# WRISTS. If he is right, one of these collapses the twist.
dg = bpy.context.evaluated_depsgraph_get()
print("")
print(" roll   worst wrist L   worst wrist R   (a wrist does about 70 deg)")
best = None
for roll in range(280, 341, 10):
    clips.ROLL_TEST = roll
    clips.key_mine()
    w = {"l": 0.0, "r": 0.0}
    for f in range(1, 41):
        sc.frame_set(f); dg.update()
        for s_ in ("l", "r"):
            fa = (arm.matrix_world @ arm.pose.bones["lowerarm_%s" % s_].tail) - \
                 (arm.matrix_world @ arm.pose.bones["lowerarm_%s" % s_].head)
            hd = (arm.matrix_world @ arm.pose.bones["hand_%s" % s_].tail) - \
                 (arm.matrix_world @ arm.pose.bones["hand_%s" % s_].head)
            if fa.length > 1e-6 and hd.length > 1e-6:
                w[s_] = max(w[s_], math.degrees(fa.angle(hd)))
    tot = w["l"] + w["r"]
    print("%4d       %5.0f           %5.0f %s" % (roll, w["l"], w["r"],
          "  <-- best so far" if best is None or tot < best[0] else ""))
    if best is None or tot < best[0]:
        best = (tot, roll, w["l"], w["r"])
print("")
print("BEST roll %d deg  ->  wrists L %.0f  R %.0f" % (best[1], best[2], best[3]))
