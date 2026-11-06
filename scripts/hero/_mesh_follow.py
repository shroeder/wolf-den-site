import bpy, math, os, sys
from mathutils import Euler

# ⚠️ MEASURE THE EVALUATED MESH, NOT THE SKELETON. The raise probe reports
# the WRIST BONE lifting 0.388 m, and a previous pipeline lost a day to ten
# green assertions that all measured bones while the body deformed wrongly
# underneath them. A skinned mesh's own transform never moves; the
# deformation lives only in the evaluated mesh.
#
# So: pose the arm up, then ask where the FLESH of each arm bone actually
# went. If the upper arm rises and the forearm does not, the sheet stretched
# between them is the fin.
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import importlib
import body as body_mod, rig as rig_mod, look
for m in (body_mod, rig_mod, look):
    importlib.reload(m)

bpy.ops.wm.read_homefile(use_empty=True)
ob = body_mod.build()
rig = rig_mod.build(ob, body_mod)
rig_mod.skin(ob, rig, body_mod)

groups = {g.name: g.index for g in ob.vertex_groups}
WATCH = ["deltoid_r", "upperarm_r", "lowerarm_r", "hand_r", "chest", "thigh_r"]


# ⚠️ SUBSURF REORDERS VERTICES. The evaluated mesh is not the cage with the
# same indices -- the first N verts of a subdivided result are NOT the
# originals -- so reading me.vertices[v.index] measured arbitrary points and
# reported the thigh rising 0.43 m when an ARM was raised. Turn subdivision
# off for the measurement; then the evaluated mesh IS the deformed cage.
for _m in ob.modifiers:
    if _m.type == "SUBSURF":
        _m.show_viewport = False


def flesh_z(tag):
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    # the evaluated mesh is subdivided, so walk the CAGE and read the same
    # indices -- the first N verts of a subsurf result are the originals
    n = len(ob.data.vertices)
    out = {}
    for bn in WATCH:
        gi = groups.get(bn)
        if gi is None:
            continue
        zs = [(ob.matrix_world @ me.vertices[v.index].co).z
              for v in ob.data.vertices
              if any(g.group == gi and g.weight > 0.4 for g in v.groups)]
        if zs:
            out[bn] = (min(zs), max(zs))
    ev.to_mesh_clear()
    print("  %-8s %s" % (tag, "  ".join("%s %.2f..%.2f" % (b, lo, hi)
                                        for b, (lo, hi) in out.items())))
    return out


print("")
print("WHERE THE FLESH GOES (evaluated mesh, z range per bone's own verts)")
rest = flesh_z("rest")
pb = rig.pose.bones["upperarm_r"]
pb.rotation_mode = "XYZ"
pb.rotation_euler = Euler((0, 0, math.radians(150)), "XYZ")
bpy.context.view_layer.update()
up = flesh_z("raised")

print("")
for bn in WATCH:
    if bn in rest and bn in up:
        d = up[bn][1] - rest[bn][1]
        print("  %-11s top moved %+.3f m%s"
              % (bn, d, "   <-- did not follow the arm" if
                 bn in ("lowerarm_r", "hand_r") and d < 0.15 else ""))
