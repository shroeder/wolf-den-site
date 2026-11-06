import bpy, os, sys, math
from mathutils import Vector

# ── IS THE HAND WRAPPED AROUND THE HAFT, OR DRAPED OVER IT? ────────────────
# The off hand is in exactly the right PLACE -- 0.0000 from its IK goal, same
# 0.1168 from the shaft axis as the driving hand, and inside the wood. It
# still is not holding the tool: at the apex it lies over the shaft with the
# fingers curling across it and down the near side, like a hand resting on a
# bar. That is orientation, and _grc (its copy-rotation) sits at 0.75.
#
# ⚠️ READ THIS BEFORE BELIEVING THE "DOES NOT DISCRIMINATE" IT PRINTS.
# This probe reported BOTH hands at about -0.97 -- knuckles and fingertips on
# the same side of the shaft, i.e. NEITHER hand wrapped -- and I threw it away
# for failing to separate them, because the driving hand was my control and it
# "obviously grips".
#
# The probe was right. The control was wrong. Rendering the hands BARE, with
# the tool hidden, settled it in one frame: both hands were an open C and the
# shaft was merely sitting in the cradle. I had promoted the driving hand to a
# control on the strength of a DIFFERENT frame at a DIFFERENT azimuth.
#
# A control has to be verified in the pose you are testing, by a method that
# cannot be fooled by the thing you are measuring. "It looks right from over
# here" is not that method, and it cost the whole middle of this session.
#
# THE METRIC. Project into the plane perpendicular to the shaft (tool-local
# XY, because build-pick puts the haft on local Z). A hand that WRAPS has the
# axis BETWEEN its knuckles and its fingertips -- they are on opposite sides.
# A hand that drapes has both on the same side. So:
#
#     encirclement = -cos(angle between knuckle-dir and fingertip-dir)
#     +1 = fingers came round the far side     -1 = both on the same side
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
import search

dg = bpy.context.evaluated_depsgraph_get()
sc = bpy.context.scene
FNG = ("index", "middle", "ring", "pinky")


def encircle(side):
    """+1 fingers came round the far side of the shaft, -1 same side."""
    inv = TOOL.matrix_world.inverted()
    def flat(p):
        q = inv @ p
        return Vector((q.x, q.y))
    knuck = flat(arm.matrix_world @ arm.pose.bones["hand_%s" % side].tail)
    tips = [flat(arm.matrix_world @ arm.pose.bones["%s_03_%s" % (f, side)].tail)
            for f in FNG if arm.pose.bones.get("%s_03_%s" % (f, side))]
    tip = sum(tips, Vector((0, 0))) / len(tips)
    if knuck.length < 1e-6 or tip.length < 1e-6:
        return None
    return -(knuck.normalized().dot(tip.normalized()))


clips.key_mine()
print("")
print("=" * 70)
print("ENCIRCLEMENT per frame   (+1 wrapped, -1 draped over)")
print("%4s %9s %9s" % ("f", "off", "driving(control)"))
print("=" * 70)
rows = []
for f in range(1, 41):
    sc.frame_set(f)
    dg.update()
    o, d = encircle(OFF_HAND), encircle(PICK_HAND)
    rows.append((f, o, d))
    print("%4d %9.3f %9.3f" % (f, o, d))
print("=" * 70)

off = [o for _f, o, _d in rows]
drv = [d for _f, _o, d in rows]
print("off      min %.3f  mean %.3f  max %.3f" % (min(off), sum(off) / len(off), max(off)))
print("driving  min %.3f  mean %.3f  max %.3f" % (min(drv), sum(drv) / len(drv), max(drv)))
print("")
# The control decides whether this metric is worth anything at all.
ok = search.discriminates(
    "encirclement",
    lambda v: -v,                                    # higher = better, so negate
    [("driving f%d" % f, d) for f, _o, d in rows[::6]],
    [("off f%d" % f, o) for f, o, _d in rows[::6]])
print("")
print("USABLE AS A COST" if ok else
      "⚠️ NOT USABLE — it does not separate the hand that works from the one "
      "that does not. Do not tune against it.")
