import bpy, os, sys
from mathutils import Vector

# ⚠️ GROUND SPEED IS STANCE SWEEP OVER STANCE TIME, NOT STRIDE OVER CYCLE.
#
# The first version computed 2 * step / cycle. That is correct for a WALK and
# only for a walk: it quietly assumes each foot is down for half the cycle, so
# the two stances exactly tile the loop. A run's whole definition is that they
# do not -- at a duty factor of 0.34 the feet are only down for 68% of the
# time, and the clip therefore demands 1/0.68 more ground speed than the old
# formula reported. The iso lab was driving the run 32% too slow, which is
# both "the run feels sluggish" and a foot skating forward under a planted
# ankle, from one arithmetic error.
#
# The honest measurement needs no duty factor at all: while a foot is planted
# it is stationary on the ground, so the rate it travels BACKWARD relative to
# the hips IS the body's forward speed. Measure that and the formula works for
# any gait, including ones nobody has authored yet.
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
    dt = 1.0 / sc.render.fps
    samples, planted, air, hips = [], 0, 0, []

    prev = {}
    for f in range(1, n + 2):                 # +1 so the loop seam is sampled
        sc.frame_set(((f - 1) % n) + 1)
        dg.update()
        hip = arm.matrix_world @ arm.pose.bones["pelvis"].head
        hips.append(hip.z - FLOOR)
        lo = 1e9
        for s in ("l", "r"):
            p = arm.matrix_world @ arm.pose.bones["ball_%s" % s].tail
            rel = (p - hip).y
            lo = min(lo, p.z - FLOOR)
            down = (p.z - FLOOR) < 0.030
            if down:
                planted += 1
                if s in prev and prev[s][1]:
                    # FWD is -Y, so a planted foot's rel-Y increases as the
                    # body advances. Speed is that rate.
                    samples.append((rel - prev[s][0]) / dt)
            prev[s] = (rel, down)
        if lo > 0.035:
            air += 1

    good = [v for v in samples if v > 0.05]
    spd = sum(good) / len(good) if good else 0.0
    print("%-5s  cycle %.3fs   GROUND SPEED %.3f u/s   duty %.2f/foot   airborne %.0f%%   "
          "hip %.3f..%.3f (%.1f%% of leg)"
          % (name, n / sc.render.fps, spd, planted / (2.0 * n), 100.0 * air / n,
             min(hips), max(hips), 100.0 * min(hips) / LEG))
