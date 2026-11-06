import bpy, os, sys, math

# ── DOES THE HAND CLOSE INTO A RING, OR ARCH OVER THE SHAFT? ───────────────
# At az34 the grip looks wrapped. At az-55 it looks draped over the top. One
# of those two views is lying to me and I have now argued both sides.
#
# ⚠️ AND MY "CONTROL" WAS NOT ONE. I measured encirclement, got -0.97 for
# BOTH hands (knuckles and fingertips on the same side of the shaft, i.e.
# nothing wrapped), and threw the metric away for "failing its control" --
# where the control was the driving hand, which I had assumed grips correctly
# because a DIFFERENT frame at a DIFFERENT angle looked right. A control you
# have not verified in the pose you are testing is an assumption wearing a
# control's clothes.
#
# So remove the ambiguity instead of arguing with it: hide the tool. A hand
# that grips leaves a closed hole where the shaft was. A hand that drapes
# leaves an arch, open underneath. No metric, no occlusion, no opinion.
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

import shot as _shot
_shot.stage(human)
_PROBE_OUT = os.path.join(ANIM, "_film", "_ring")
sc = bpy.context.scene
dg = bpy.context.evaluated_depsgraph_get()

for nm in ("Shield", "ShieldBoss", "ShieldFace", "Pickaxe"):
    ob = bpy.data.objects.get(nm)
    if ob:
        ob.hide_render = True

# Look down the shaft's own axis: a ring reads as a ring only from there.
for f in (1, 18):
    sc.frame_set(f)
    dg.update()
    for side in ("l", "r"):
        c, w = _shot.region(arm, human, "hand_%s" % side)
        for az in (34, -55, 125, 215):
            _shot.frame_on(c, w, az)
            _shot.shoot(os.path.join(_PROBE_OUT, "%s_f%02d_az%d.png"
                                     % (side, f, az)), res=(900, 900))
        print("   hand_%s f%d bare, 4 angles" % (side, f))
print("RING_OK %s" % _PROBE_OUT)
