import bpy, os, sys

# A/B: does dual-quaternion skinning fix the shoulder collapse?
#
# Raising the arm flattens the deltoid into a sheet and the pec into a
# triangle -- the shoulder cap simply vanishes. That is the classic linear
# blend skinning failure ("candy wrapper"): each vertex is a weighted AVERAGE
# of two bone transforms, and averaging two widely separated rotations
# collapses the result toward the joint axis. It is arithmetic, not anatomy --
# a different base mesh with the same weights does exactly the same thing.
#
# Blender's Armature modifier has a one-checkbox alternative: Preserve Volume
# switches the deform to dual quaternion blending, which interpolates
# rotations instead of averaging matrices. It is the cheapest possible test
# and it costs nothing to try, so it goes first -- before helper bones,
# before corrective shapes, and a very long way before rebuilding the human.
HERE = os.path.dirname(os.path.abspath(__file__))
ANIM = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, ANIM)

_real = __file__
__file__ = os.path.join(ANIM, "export-all.py")
exec(open(__file__).read())
__file__ = _real

import shot as _shot
import kit as _kit
_shot.stage(human, floor_z=FLOOR)
_kit.set_kit("Raise")
_PROBE_OUT = os.path.join(ANIM, "_film", "_shoulder")

arm.animation_data_create()
arm.animation_data.action = bpy.data.actions["Raise"]
sc.frame_set(22)

mods = [m for ob in bpy.data.objects if ob.type == "MESH"
        for m in ob.modifiers if m.type == "ARMATURE"]
print("")
print("%d armature modifiers" % len(mods))

for tag, preserve in (("A_linear", False), ("B_dualquat", True)):
    for m in mods:
        m.use_deform_preserve_volume = preserve
    bpy.context.view_layer.update()
    c, w = _shot.region(arm, human, "shoulders")
    for az in (34, -55):
        _shot.frame_on(c, w, az)
        _shot.shoot(os.path.join(_PROBE_OUT, "%s_az%d.png" % (tag, az)),
                    res=(900, 900))
    print("   %-11s preserve_volume=%s  -> 2 angles" % (tag, preserve))
print("SHOULDER_OK %s" % _PROBE_OUT)
