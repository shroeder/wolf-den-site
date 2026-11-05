import bpy, os, sys
from mathutils import Vector

# A reading, not a gate. Two questions a render cannot answer:
#   1. How fast does this clip claim to travel? The iso lab drives each gait's
#      playback rate from that number, and a wrong one shows up as skating.
#   2. Does the run actually LEAVE THE GROUND? Duty factor below 0.5 is what
#      separates a run from a fast walk, and it is easy to author a run whose
#      stances still overlap -- which reads as a bouncy walk and looks like a
#      vague art problem rather than the arithmetic error it is.
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, "export-all.py")).read())

dg = bpy.context.evaluated_depsgraph_get()
ends = dict((n, e) for n, e, c in STASHED)
print("")
for name in ("Walk", "Run"):
    if name not in ends:
        continue
    arm.animation_data_create()
    arm.animation_data.action = bpy.data.actions[name]
    n = ends[name]
    rel, air = [], 0
    for f in range(1, n + 1):
        sc.frame_set(f)
        dg.update()
        hip = arm.matrix_world @ arm.pose.bones["pelvis"].head
        lo = 1e9
        for s in ("l", "r"):
            p = arm.matrix_world @ arm.pose.bones["ball_%s" % s].tail
            lo = min(lo, p.z - FLOOR)
            if s == "l":
                rel.append((p - hip).y)
        if lo > 0.035:
            air += 1
    step = max(rel) - min(rel)
    cycle = n / sc.render.fps
    print("%-5s  step %.4f  cycle %.3fs  ->  GROUND SPEED %.4f u/s   airborne %d/%d frames (%.0f%%)"
          % (name, step, cycle, 2 * step / cycle, air, n, 100.0 * air / n))
