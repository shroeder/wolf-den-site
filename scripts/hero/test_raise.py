import bpy, math, os, sys
from mathutils import Vector, Euler

# ═══════════════════════════════════════════════════════════════════════════
# THE ACCEPTANCE TEST — Luke's own: raise the arm, look at the shoulder.
#
# This is the defect that caused the rebuild. Raising the arm on the bought
# rig flattened the deltoid into a sheet and the pectoral into a triangle.
# Same test, our mesh, our bones, our weights.
#
# It renders an A/B so the helper bone has to EARN its place: the same pose
# with the deltoid's Copy Rotation at 0 (one joint carries the whole 150
# degrees, which is the old behaviour) and at 0.5 (two joints carry 75 each).
# If the pair look the same, the helper is doing nothing and should go.
# ═══════════════════════════════════════════════════════════════════════════

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import importlib
import body as body_mod
import rig as rig_mod
import look
for m in (body_mod, rig_mod, look):
    importlib.reload(m)

RAISE = float(os.environ.get("RAISE_DEG", "150"))
SIDE = os.environ.get("SIDE", "r")


def probe_axis(rig, side, deg=55.0):
    """⚠️ WHICH AXIS AND SIGN RAISES THIS ARM? Do not type it. Bone roll
    mirrors per side and every hand-typed angle in this project has been
    wrong at least once. Try all six, keep whichever lifts the wrist."""
    pb = rig.pose.bones["upperarm_%s" % side]
    hand = rig.pose.bones["hand_%s" % side]
    pb.rotation_mode = "XYZ"
    base = (rig.matrix_world @ hand.tail).z
    best = (None, -1e9)
    for axis in range(3):
        for sign in (1.0, -1.0):
            e = [0.0, 0.0, 0.0]
            e[axis] = math.radians(deg * sign)
            pb.rotation_euler = Euler(e, "XYZ")
            bpy.context.view_layer.update()
            lift = (rig.matrix_world @ hand.tail).z - base
            if lift > best[1]:
                best = ((axis, sign), lift)
    pb.rotation_euler = Euler((0, 0, 0), "XYZ")
    bpy.context.view_layer.update()
    print("PROBE upperarm_%s raises on axis %d sign %+.0f (wrist +%.3f m at %.0f deg)"
          % (side, best[0][0], best[0][1], best[1], deg))
    return best[0]


def main():
    bpy.ops.wm.read_homefile(use_empty=True)
    ob = body_mod.build()
    rig = rig_mod.build(ob, body_mod)
    rig_mod.skin(ob, rig, body_mod)
    look.clay(ob)
    look.stage(floor_z=0.0)
    out = os.path.join(HERE, "_look")

    axis, sign = probe_axis(rig, SIDE)
    pb = rig.pose.bones["upperarm_%s" % SIDE]
    e = [0.0, 0.0, 0.0]
    e[axis] = math.radians(RAISE * sign)

    for tag, infl in (("A_single_joint", 0.0), ("B_deltoid_helper", 0.5)):
        for s in ("l", "r"):
            for c in rig.pose.bones["deltoid_%s" % s].constraints:
                c.influence = infl
        pb.rotation_euler = Euler(e, "XYZ")
        bpy.context.view_layer.update()
        sh = rig.matrix_world @ rig.pose.bones["upperarm_%s" % SIDE].head
        look.sheet(out, "raise_%s" % tag, sh, 0.62, res=(900, 900))
        print("   %-18s deltoid influence %.1f" % (tag, infl))

    # and the whole figure, arm up, with the helper on
    look.sheet(out, "raise_body", (0, 0, 1.05), 2.05)
    print("TEST_OK %s" % out)


if __name__ == "__main__":
    main()
