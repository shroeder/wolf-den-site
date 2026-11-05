import bpy, os, sys, math
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
exec(open(os.path.join(HERE, "export-all.py")).read())
dg = bpy.context.evaluated_depsgraph_get()

# A wrist bends about 70 degrees and deviates about 25. Anything past that is
# not a pose, it is a break. IK sets the wrist POSITION and a Copy Rotation
# sets the hand's world ORIENTATION; the joint between them absorbs whatever
# is left over, and nothing in the rig says no.
print("")
print("clip     frame   wrist L   wrist R      (over ~70 deg is torqued)")
for name, end, _c in STASHED:
    arm.animation_data_create()
    arm.animation_data.action = bpy.data.actions[name]
    worst = {"l": (0, 0), "r": (0, 0)}
    for f in range(1, end + 1):
        sc.frame_set(f); dg.update()
        for s_ in ("l", "r"):
            fa = (arm.matrix_world @ arm.pose.bones["lowerarm_%s" % s_].tail) \
                 - (arm.matrix_world @ arm.pose.bones["lowerarm_%s" % s_].head)
            hd = (arm.matrix_world @ arm.pose.bones["hand_%s" % s_].tail) \
                 - (arm.matrix_world @ arm.pose.bones["hand_%s" % s_].head)
            a = math.degrees(fa.angle(hd)) if fa.length > 1e-6 and hd.length > 1e-6 else 0
            if a > worst[s_][0]:
                worst[s_] = (a, f)
    print("%-8s        %5.0f(f%-2d) %5.0f(f%-2d)%s"
          % (name, worst["l"][0], worst["l"][1], worst["r"][0], worst["r"][1],
             "   <-- BROKEN" if max(worst["l"][0], worst["r"][0]) > 70 else ""))
