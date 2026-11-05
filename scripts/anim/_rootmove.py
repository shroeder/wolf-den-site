import bpy, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, "export-all.py")).read())
for name in ("Walk", "Idle"):
    arm.animation_data_create()
    arm.animation_data.action = bpy.data.actions[name]
    dg = bpy.context.evaluated_depsgraph_get()
    end = dict((n, e) for n, e, c in STASHED)[name]
    xs, ys, zs = [], [], []
    for f in range(1, end + 1):
        sc.frame_set(f); dg.update()
        p = arm.matrix_world @ arm.pose.bones["pelvis"].head
        xs.append(p.x); ys.append(p.y); zs.append(p.z)
    print("ROOT %-5s  x %.4f..%.4f   y %.4f..%.4f   z %.4f..%.4f   netY %+.4f"
          % (name, min(xs), max(xs), min(ys), max(ys), min(zs), max(zs), ys[-1] - ys[0]))
