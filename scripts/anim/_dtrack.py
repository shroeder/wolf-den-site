import bpy, math, os
from mathutils import Vector

# Throwaway: print where the wing actually goes, per frame. Eyeballing a
# render told me "too far down" three times without telling me how far.
_here = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(_here, "anim-dragon.py")).read())

CLIP = os.environ.get("CLIP", "Fly")
arm.animation_data_create()
arm.animation_data.action = bpy.data.actions[CLIP]
end = dict(HELD)[CLIP]
dg = bpy.context.evaluated_depsgraph_get()

print("BONE_NAMES "+",".join(sorted(b.name for b in arm.pose.bones)))
print("frame  tip1_z  tip4_z  tip1_x   bodylow  meshlow")
lo_all = 1e9
for f in range(1, end + 1):
    sc.frame_set(f)
    dg.update()
    t1 = arm.matrix_world @ arm.pose.bones["spar1_l_02"].tail
    t4 = arm.matrix_world @ arm.pose.bones["spar4_l_02"].tail
    ev = drg.evaluated_get(dg)
    zs = [(drg.matrix_world @ v.co).z for v in ev.data.vertices]
    belly = (arm.matrix_world @ arm.pose.bones["spine_01"].head).z
    lo_all = min(lo_all, min(zs))
    print("%5d  %6.2f  %6.2f  %6.2f   %6.2f   %6.2f"
          % (f, t1.z, t4.z, t1.x, belly, min(zs)))
print("MINZ_OVERALL %.3f" % lo_all)
