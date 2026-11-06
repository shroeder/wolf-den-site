import bpy, os, sys

# Is the figure floating, or is the ground plane in the wrong place?
#
# ⚠️ shot.stage() PUTS THE GROUND AT THE MESH'S LOWEST VERTEX AT CALL TIME,
# and film.py calls it once, before any clip or frame is set -- so the floor
# is placed from whatever pose export-all happened to leave the rig in. That
# is a rendering bug that looks exactly like an animation bug, and I was one
# step from re-posing a clip to fix it.
#
# So measure instead: the lowest vertex of the human, per frame, against the
# rig's own FLOOR constant. Idle is the control -- it is a shipping clip whose
# feet visibly sit on the ground.
HERE = os.path.dirname(os.path.abspath(__file__))
ANIM = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, ANIM)

_real = __file__
__file__ = os.path.join(ANIM, "export-all.py")
exec(open(__file__).read())
__file__ = _real

dg = bpy.context.evaluated_depsgraph_get()
print("")
print("=" * 66)
print("FOOT HEIGHT vs the rig's FLOOR (%.4f).  Idle is the control." % FLOOR)
print("%-7s %9s %9s %9s" % ("clip", "min z", "vs FLOOR", "worst f"))
print("=" * 66)
for name, end, _c in STASHED:
    arm.animation_data_create()
    arm.animation_data.action = bpy.data.actions[name]
    lo_all, lo_at, hi_all = 1e9, 0, -1e9
    for f in range(1, end + 1):
        sc.frame_set(f)
        dg.update()
        ev = human.evaluated_get(dg)
        me = ev.to_mesh()
        z = min((human.matrix_world @ v.co).z for v in me.vertices)
        ev.to_mesh_clear()
        if z < lo_all:
            lo_all, lo_at = z, f
        hi_all = max(hi_all, z)
    print("%-7s %9.4f %9.4f %9d   (highest %.4f)"
          % (name, lo_all, lo_all - FLOOR, lo_at, hi_all))
print("=" * 66)
print("A clip whose MINIMUM never comes near the others is off the ground.")
