import bpy, os, sys, math

# ── SWEEP THE SHAFT ROLL ───────────────────────────────────────────────────
#
# 🛑 THIS FILE IS A ROUGH GUIDE. IT DOES NOT AGREE WITH qa.py. Confirm every
# answer it gives with harness/_rollq.py, which measures through the real
# exporter. At roll 278 this reports a worst wrist of 68.8 and qa reports
# 99.2 -- reproducibly, on a freshly built rig.
#
# The reason is the same one this file was already fixed for once today, one
# level further out: export-all.py keys and BAKES Walk, Brace, Run, Idle and
# Impact before Mine is keyed, and Mine is authored on top of whatever that
# leaves in the rig. Building only the four geometry stages is not the
# shipping scene, however many stages you add.
#
# Keep it for its speed -- it is the only way to see the SHAPE of the cost
# surface cheaply, and that shape is what exposed the pole-flip cliff. Do not
# take a constant from it without _rollq.py confirming the number.

# Luke's hypothesis, 2026-11-05: "it looks like you've overspun the pickaxe
# and it's causing his hands to twist". He was right, by 50 degrees. Rolling
# a shaft about its own axis is nearly free visually -- the tool looks
# identical -- but the HANDS are welded to it, so every degree of roll is a
# degree of forearm twist the wrist has to find.
#
# ⚠️ IT USED TO SWEEP A RIG THAT DOES NOT SHIP. This file exec'd build-walk
# and build-pick and nothing else, so it measured a hero with no forearm
# twist joint and no armour -- then its answer was baked into clips.py as a
# constant. A number is only evidence if it measures the thing you are
# shipping. It now runs the same stack, in the same order, as export-all.py.
#
# ⚠️ AND IT SWEPT 280-340, A WINDOW CENTRED ON THE ANSWER IT ALREADY HAD.
# A sweep that cannot return a surprise is an assertion wearing a sweep's
# clothes. Full circle now, coarse then refined.
#
#   ROLL_LO / ROLL_HI / ROLL_N   override the coarse pass
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "harness"))
exec(open(os.path.join(HERE, "build-walk.py")).read())
exec(open(os.path.join(HERE, "build-twist.py")).read())
exec(open(os.path.join(HERE, "build-armour.py")).read())
exec(open(os.path.join(HERE, "build-pick.py")).read())
import clips
clips.init(globals())
import search

dg = bpy.context.evaluated_depsgraph_get()


def worst_wrist(roll):
    """The largest wrist bend anywhere in the clip, either hand.

    ⚠️ THE WORST FRAME, NOT THE MEAN AND NOT THE SUM. qa.py gates on the
    worst frame, and a sum lets a clip with one broken frame beat a clip
    that is merely mediocre everywhere. The old version summed the two
    hands, which is the same mistake across arms instead of across time.
    """
    clips.ROLL_TEST = roll
    clips.key_mine()
    worst, at = 0.0, 0
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
                if d > worst:
                    worst, at = d, f
    print("   roll %5.1f  ->  worst wrist %5.1f deg at f%d" % (roll, worst, at))
    return worst


LO = float(os.environ.get("ROLL_LO", "0"))
HI = float(os.environ.get("ROLL_HI", "345"))
N = int(os.environ.get("ROLL_N", "24"))

print("")
print("SHAFT ROLL SWEEP — full circle, measured on the shipping rig")
coarse = search.sweep("roll", search.linspace(LO, HI, N), worst_wrist)
coarse.report()
step = (HI - LO) / float(N - 1)
fine = search.sweep("roll-fine",
                    search.linspace(coarse.best - step, coarse.best + step, 9),
                    worst_wrist)
fine.report()
print("")
print("BEST roll %.1f deg  ->  worst wrist %.1f deg   (qa limit 80)"
      % (fine.best, fine.cost))
print("Set ROLL_TEST in clips.key_mine to this and re-run qa.py.")
