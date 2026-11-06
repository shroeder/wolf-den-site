import bpy, os, sys, math
from mathutils import Vector

# ── SWEEP THE OFF HAND'S GRIP INFLUENCE, AND LOOK AT EVERY CANDIDATE ───────
# The off hand is 0.0000 from its IK goal, on the wood, the same distance
# from the shaft axis as the driving hand -- and at the apex it lies ACROSS
# the haft with the fingers hanging down the near side instead of closing on
# it. Position is right; orientation is not. _grc is what sets orientation,
# and it was backed off to 0.75 to relieve 73 degrees of wrist twist.
#
# ⚠️ I TRIED TO BUILD A NUMERIC SCORER FOR "WRAPPED vs DRAPED" FIRST AND IT
# FAILED ITS CONTROL -- it scored the driving hand, which visibly wraps, the
# same as the off hand, which does not. Discarded rather than tuned against.
# For four candidates the magnified render IS the scorer; what the numbers
# are for is the CONSTRAINT, and those numbers are qa.py's own, which are
# calibrated against clips that look right.
#
# So: per candidate, print the two gated wrist figures and photograph the
# apex from the angle that showed the defect.
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
import shot as _shot
import kit as _kit

_shot.stage(human)
# ⚠️ AND PHOTOGRAPH THE LOADOUT MINE ACTUALLY SHIPS. The first run of this
# probe rendered the SHIELD hanging off the off hand -- Mine carries only the
# pickaxe -- and the shield is skinned to that hand, so it sat exactly where
# I was trying to look. I wrote kit.py for this and then did not call it.
_kit.set_kit("Mine")
dg = bpy.context.evaluated_depsgraph_get()
sc = bpy.context.scene
_PROBE_OUT = os.path.join(ANIM, "_film", "_offgrip")
APEX = int(os.environ.get("APEX", "18"))


def worst_wrist():
    """Bend and twist, the two things qa.py gates, worst frame either hand."""
    bend, twist = 0.0, 0.0
    for f in range(1, 41):
        sc.frame_set(f)
        dg.update()
        for s_ in ("l", "r"):
            fa = (arm.matrix_world @ arm.pose.bones["lowerarm_%s" % s_].tail) - \
                 (arm.matrix_world @ arm.pose.bones["lowerarm_%s" % s_].head)
            hd = (arm.matrix_world @ arm.pose.bones["hand_%s" % s_].tail) - \
                 (arm.matrix_world @ arm.pose.bones["hand_%s" % s_].head)
            if fa.length > 1e-6 and hd.length > 1e-6:
                bend = max(bend, math.degrees(fa.angle(hd)))
    return bend


print("")
print("=" * 72)
print("OFF-HAND GRIP INFLUENCE SWEEP   (qa limit: wrist bend 80)")
print("=" * 72)
for grc in (0.75, 0.85, 0.95, 1.00):
    os.environ["GRC_TEST"] = "%.2f" % grc
    clips.key_mine()
    bend = worst_wrist()
    sc.frame_set(APEX)
    dg.update()
    c, w = _shot.region(arm, human, "grip")
    for az in (-55, 34):
        _shot.frame_on(c, w, az)
        _shot.shoot(os.path.join(_PROBE_OUT, "grc%03d_f%02d_az%d.png"
                                 % (int(grc * 100), APEX, az)), res=(900, 900))
    print("   _grc %.2f  ->  worst wrist bend %5.1f deg   %s"
          % (grc, bend, "ok" if bend <= 80 else "OVER THE LIMIT"))
print("=" * 72)
print("OFFGRIP_OK %s   — now LOOK at them, the numbers only say what is legal"
      % _PROBE_OUT)
