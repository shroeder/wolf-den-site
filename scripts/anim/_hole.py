import bpy, os, sys, math
from mathutils import Vector

# How big is the hole in this fist, and where is it?
#
# ⚠️ MEASURE THE SKIN, NOT THE BONES. Solving the grip centre against finger
# BONE positions cleared the bones and buried the knuckles in the wood
# instead -- skin sits about 2cm outside the bone it rides on, and skin is
# what you can see. The only honest test is whether any hand VERTEX is
# inside the shaft cylinder.
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
exec(open(os.path.join(HERE, "build-walk.py")).read())
exec(open(os.path.join(HERE, "build-pick.py")).read())
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()

for side in ("r", "l"):
    names = {g.name for g in human.vertex_groups
             if g.name.endswith("_" + side) and
             (g.name.startswith(("index", "middle", "ring", "pinky", "thumb"))
              or g.name == "hand_" + side)}
    idx = {g.index for g in human.vertex_groups if g.name in names}
    ev = human.evaluated_get(dg)
    me = ev.to_mesh()
    pts = []
    for v in human.data.vertices:
        if any(gr.group in idx and gr.weight > 0.5 for gr in v.groups):
            pts.append(human.matrix_world @ me.vertices[v.index].co)
    ev.to_mesh_clear()

    centre, basis = grip_frame(side)
    z = basis @ Vector((0, 0, 1))
    x = basis @ Vector((1, 0, 0))
    y = basis @ Vector((0, 1, 0))
    # only skin near the grip, along the axis
    near = [p for p in pts if abs((p - centre).dot(z)) < 0.06 * LEG]

    best = (-1.0, centre)
    for ix in range(-18, 19):
        for iy in range(-18, 19):
            c = centre + x * (ix * 0.0035 * LEG) + y * (iy * 0.0035 * LEG)
            r = min((p - c - z * (p - c).dot(z)).length for p in near)
            if r > best[0]:
                best = (r, c)
    off = best[1] - centre
    print("HAND %s: %4d skin verts | biggest shaft that fits r=%.4f "
          "(current shaft r=%.4f) | best centre is %.4f off mine"
          % (side, len(near), best[0], 0.0285 * LEG, off.length))
