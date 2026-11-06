import bpy, os, sys

# Throwaway probe: WHICH STAGE BREAKS THE HAND.
#
# The curl amount was the obvious suspect and it is not guilty -- the fist is
# clean at 1.0, at 1.3 and even at the absurd 1.6 the grip solver can reach.
# Two dead hypotheses means the premise is wrong, so stop guessing at a cause
# and bisect the PIPELINE: build-walk.py alone renders a clean hand, the
# exported clip renders a shredded one, and there are three stages in between.
#
# Photograph the same hand after each one.
HERE = os.path.dirname(os.path.abspath(__file__))
ANIM = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, ANIM)

_PROBE_OUT = os.path.join(ANIM, "_film", "_stage")
_real = __file__


def run(stage):
    global __file__
    __file__ = os.path.join(ANIM, stage)
    exec(open(__file__).read(), globals())
    __file__ = _real


run("build-walk.py")

import shot as _shot
_shot.stage(human)
bpy.context.scene.frame_set(1)


def look(tag):
    # ⚠️ THE SHIELD HID THE EVIDENCE. The first run of this probe photographed
    # a teal shield four times and I nearly read "clean" off it. The left hand
    # is the shield arm, and the clips where it renders shredded are the ones
    # NOT carrying a shield.
    for _n in ("Shield", "ShieldBoss", "ShieldFace"):
        _o = bpy.data.objects.get(_n)
        if _o:
            _o.hide_render = True
    bpy.context.view_layer.update()
    for side in ("l", "r"):
        c, w = _shot.region(arm, human, "hand_%s" % side)
        for az in (34, 125):
            _shot.frame_on(c, w, az)
            _shot.shoot(os.path.join(_PROBE_OUT, "%s_%s_az%d.png" % (tag, side, az)),
                        res=(900, 900))
    print("STAGE %s photographed" % tag)


look("1_walk")
run("build-twist.py")
look("2_twist")
run("build-armour.py")
look("3_armour")
run("build-pick.py")
look("4_pick")
print("STAGEBISECT_OK %s" % _PROBE_OUT)
