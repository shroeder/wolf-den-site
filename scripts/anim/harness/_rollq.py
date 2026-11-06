import bpy, os, sys, math

# ── MEASURE THE ROLL THROUGH THE EXPORTER, BECAUSE _roll.py DOES NOT ───────
# ⚠️ _roll.py AND qa.py DISAGREE BY THIRTY DEGREES. At roll 278 _roll.py
# reports a worst wrist of 68.8 and qa reports 99.2, on a freshly built rig,
# reproducibly. _roll.py was already fixed once today for measuring a rig
# that does not ship (it had no forearm twist joint and no armour); it still
# does not reproduce the shipping scene, because export-all.py keys and BAKES
# Walk, Brace, Run, Idle and Impact before Mine is ever keyed, and Mine is
# authored on whatever that leaves behind.
#
# Rather than chase the difference, measure through the thing that ships.
# This runs the real exporter and then reads the BAKED Mine action, exactly
# as qa.py does -- so a number from here is a number qa will agree with.
#
# One roll per process, because the roll is consumed inside export-all:
#     ROLL_TEST=300 blender -b --online-mode -P scripts/anim/harness/_rollq.py
HERE = os.path.dirname(os.path.abspath(__file__))
ANIM = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, ANIM)

_real = __file__
__file__ = os.path.join(ANIM, "export-all.py")
exec(open(__file__).read())
__file__ = _real

dg = bpy.context.evaluated_depsgraph_get()
arm.animation_data_create()
arm.animation_data.action = bpy.data.actions["Mine"]


# ⚠️ THIS FILE USED TO PRINT A TWIST COLUMN AND IT WAS JUNK. I wrote a quick
# euler-decomposition twist here and it read 125-179 degrees on every single
# candidate, including ones qa scores at 60. qa.py's twist_deg() carries a
# long comment about exactly that failure -- a near-binary jump to 180 is an
# axis flip when two up-vectors go antiparallel, not a wrung arm. I
# reinvented a metric that file had already solved, and badly. The bend
# figure below matches qa to the decimal, so that is all this prints; for
# twist, run qa.py.


bend, bend_at = 0.0, 0
tw, tw_at = 0.0, 0
for f in range(1, 41):
    sc.frame_set(f)
    dg.update()
    for s_ in ("l", "r"):
        fa = (arm.matrix_world @ arm.pose.bones["lowerarm_%s" % s_].tail) - \
             (arm.matrix_world @ arm.pose.bones["lowerarm_%s" % s_].head)
        hd = (arm.matrix_world @ arm.pose.bones["hand_%s" % s_].tail) - \
             (arm.matrix_world @ arm.pose.bones["hand_%s" % s_].head)
        if fa.length > 1e-6 and hd.length > 1e-6:
            d = math.degrees(fa.angle(hd))
            if d > bend:
                bend, bend_at = d, f
print("ROLLQ roll=%s jump=%s  wrist %.1f (f%d)  %s   (qa limit 80; run qa.py "
      "for everything else)"
      % (os.environ.get("ROLL_TEST", "default"),
         os.environ.get("POLE_JUMP", "default"),
         bend, bend_at, "ok" if bend <= 80 else "FAIL"))
