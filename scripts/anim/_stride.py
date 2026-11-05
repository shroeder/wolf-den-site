import bpy, os, sys
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
exec(open(os.path.join(HERE, "export-all.py")).read())

arm.animation_data_create()
act = bpy.data.actions["Walk"]
arm.animation_data.action = act
dg = bpy.context.evaluated_depsgraph_get()
n = FRAMES
rows = []
for f in range(1, n + 1):
    sc.frame_set(f)
    dg.update()
    hip = arm.matrix_world @ arm.pose.bones["pelvis"].head
    out = {}
    for s in ("l", "r"):
        b = arm.pose.bones["ball_%s" % s]
        p = arm.matrix_world @ b.tail
        out[s] = (p - hip)
    rows.append((f, out["l"], out["r"]))

for s, i in (("l", 1), ("r", 2)):
    ys = [r[i].y for r in rows]
    zs = [r[i].z for r in rows]
    print("FOOT_%s  rel-Y %.4f .. %.4f  (excursion %.4f)   z %.4f .. %.4f"
          % (s.upper(), min(ys), max(ys), max(ys) - min(ys), min(zs), max(zs)))
print("CYCLE frames=%d fps=%d  -> %.3f s" % (n, sc.render.fps, n / sc.render.fps))
print("LEG %.4f  FLOOR %.4f" % (LEG, FLOOR))
zs = [(human.matrix_world @ v.co).z for v in human.data.vertices]
print("HEIGHT %.4f" % (max(zs) - min(zs)))
