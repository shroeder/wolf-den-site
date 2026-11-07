import bpy, math, os, sys
from mathutils import Vector, Euler

# ═══════════════════════════════════════════════════════════════════════════
# THE ACCEPTANCE TEST FOR THE HAND — close it, and look at it.
#
# ⚠️ THIS CANNOT BE A NUMBER AND THAT IS NOT AN OPINION. The last pipeline
# shipped a hero whose left fist was curled BACKWARDS in all six clips, with
# every check green the whole time, because every check it owned measured the
# ANGLE between two bone vectors -- and a fist curled the wrong way has
# exactly the same angles as one curled the right way. The sign is the whole
# defect and the metric could not see it. So this renders a fist and an open
# hand side by side and the answer is whether the fist looks like a fist.
#
# ⚠️ AND THE AXIS IS MEASURED, NEVER TYPED. Bone roll is computed by Blender
# from each bone's direction, it differs per finger and mirrors per side, and
# every hand-typed axis in this project has been wrong at least once. Which
# of a bone's own local axes is the hinge is therefore read off its matrix.
# ═══════════════════════════════════════════════════════════════════════════

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import importlib
import body as body_mod
import hand as hand_mod
import rig as rig_mod
import look
for m in (hand_mod, body_mod, rig_mod, look):
    importlib.reload(m)

# ⚠️ A FIST IS MOSTLY KNUCKLE. Driving all three joints off one number with
# the knuckle taking the SMALLEST share gave four fingers that stuck out in
# front of the palm and then curled their tips into little rings -- every
# joint bent, nothing folded. What puts a finger onto the palm is the first
# joint swinging the whole finger through a right angle; the two past it
# close the loop and the last one barely moves. So the pose is three angles,
# not one angle and three fractions.
FIST_FINGER = (95.0, 85.0, 16.0)
FIST_THUMB = (34.0, 46.0, 34.0)
CURL = float(os.environ.get("CURL_DEG", "100"))     # per cent of a full fist
SIDE = os.environ.get("SIDE", "l")


def palm_point(side):
    """Where a closing fingertip is trying to get to: just off the palm."""
    pl = body_mod.hand_plan(side)
    return pl["P"](pl["palm_len"] * 0.45, 0.0, -body_mod.PALM_HALF_T * 2.2)


def hinge(rig, bone, fold):
    """The axis this bone must turn about to fold toward the palm, and the
    sign that does it.

    ⚠️ EVERY FINGER FOLDS IN ITS OWN PLANE. AIMING THEM AT A POINT CROSSES
    THEM. The first version took the hinge as (bone direction) x (direction
    to a point on the palm), which is a correct hinge -- for one finger. Give
    all four the same point and all four converge on it: the index swings
    toward the middle, the little swings back the other way, and they fold
    through each other into the shredded knot this test exists to catch. A
    finger does not aim, it FLEXES: the plane it moves in contains its own
    axis and the palm's NORMAL, and the four planes are parallel.

    ⚠️ SEARCHING SIX AXES FOR "WHICHEVER GETS CLOSEST TO THE PALM" IS WORSE
    AND IT IS WHERE THIS STARTED. A finger folded sideways also moves its tip
    nearer the palm, so the search scored a lateral fold as a success.

    So the hinge has a closed form, (bone direction) x (palm normal), and the
    only thing looked up is which local axis that is.
    """
    pb = rig.pose.bones[bone]
    head = rig.matrix_world @ pb.head
    tail = rig.matrix_world @ pb.tail
    d = (tail - head).normalized()
    p = fold - d * fold.dot(d)
    if p.length < 1e-6:
        return 0, 1.0, 0.0
    axis_w = d.cross(p.normalized()).normalized()
    m = rig.matrix_world @ pb.matrix
    best, score = 0, -1.0
    for i in range(3):
        col = Vector((m[0][i], m[1][i], m[2][i])).normalized()
        if abs(col.dot(axis_w)) > score:
            best, score = i, abs(col.dot(axis_w))
    col = Vector((m[0][best], m[1][best], m[2][best])).normalized()
    return best, (1.0 if col.dot(axis_w) > 0.0 else -1.0), score


def close(rig, side, deg):
    """Close every digit on its own hinge, and report what actually moved."""
    report = []
    pl = body_mod.hand_plan(side)
    target = palm_point(side)

    # The direction each digit folds is hand.plan()'s, not this file's --
    # the rig rolled the bones to those same vectors, and a poser that
    # invents its own is a poser whose degrees leak into twist.
    folds = pl["folds"]
    for name in hand_mod.DIGITS:
        chain = ["%s_%02d_%s" % (name, k, side) for k in (1, 2, 3)]
        tip = chain[-1]
        angles = FIST_THUMB if name == "thumb" else FIST_FINGER
        fold = folds[name]
        start = (rig.matrix_world @ rig.pose.bones[tip].tail - target).length

        # ⚠️ EVERY HINGE IS READ AT REST, BEFORE ANY OF THEM IS APPLIED.
        # Solving them one at a time and posing as you go measures the LAST
        # two against a finger that has already curled -- and once a bone has
        # swung more than ninety degrees it points toward the palm instead of
        # away from it, so "the way to the palm" reverses and the joint is
        # told to straighten. Measured, not deduced: the chain came out
        # bent 62/94/31 against 62/78/74 asked for, the last joint undoing
        # the other two, and the hand closed into a cup instead of a fist.
        # The direction a knuckle flexes is a fact about the knuckle; it does
        # not change because the finger has already moved.
        hinges = [hinge(rig, bn, fold) for bn in chain]
        # ⚠️ HOW SQUARE THE HINGE IS, AS A NUMBER. 1.0 means the bone's own
        # axis IS the flexion axis and every degree asked for is a degree of
        # flex; 0.7 means a third of it is going into twist and the fist
        # quietly does not close. This is the measurement that would have
        # caught the roll defect on sight.
        square = min(h[2] for h in hinges)
        for k, bn in enumerate(chain):
            axis, sign, _sq = hinges[k]
            e = [0.0, 0.0, 0.0]
            e[axis] = math.radians(angles[k] * deg / 100.0 * sign)
            pb = rig.pose.bones[bn]
            pb.rotation_mode = "XYZ"
            pb.rotation_euler = Euler(e, "XYZ")
        bpy.context.view_layer.update()
        rest = (rig.matrix_world @ rig.pose.bones[tip].tail)
        end = (rest - target).length
        # ⚠️ ASKED-FOR IS NOT ACHIEVED. Report the angle the chain ACTUALLY
        # turned through, measured off the bones, next to what was requested.
        # ⚠️ MEASURE THE JOINT, NOT THE DISTANCE FROM REST. A cumulative
        # angle wraps: 214 degrees of curl reads as 146 and looks like the
        # last joint did almost nothing, which sent me looking for a bug
        # that was not there. The angle BETWEEN a bone and its parent is the
        # joint, it is what anatomy quotes, and it cannot wrap.
        bends = []
        for k, bn in enumerate(chain):
            pb = rig.pose.bones[bn]
            posed = (pb.tail - pb.head).normalized()
            par = rig.pose.bones[chain[k - 1]] if k else rig.pose.bones["hand_%s" % side]
            pd = (par.tail - par.head).normalized()
            bends.append(math.degrees(posed.angle(pd)))
        report.append("   %-7s tip %.3f -> %.3f m   joints %s  (sum %.0f)"
                      "   hinge %.2f%s"
                      % (name, start, end,
                         "/".join("%.0f" % x for x in bends), sum(angles), square,
                         "   <-- OFF AXIS, flex is leaking into twist"
                         if square < 0.97 else ""))
    return report


def open_hand(rig, side):
    for name in hand_mod.DIGITS:
        for k in (1, 2, 3):
            pb = rig.pose.bones["%s_%02d_%s" % (name, k, side)]
            pb.rotation_mode = "XYZ"
            pb.rotation_euler = Euler((0, 0, 0), "XYZ")
    bpy.context.view_layer.update()


def main():
    bpy.ops.wm.read_homefile(use_empty=True)
    ob = body_mod.build()
    rig = rig_mod.build(ob, body_mod)
    rig_mod.skin(ob, rig, body_mod)
    look.clay(ob)
    look.stage(floor_z=0.0)
    out = os.path.join(HERE, "_look")
    centre = body_mod.hand_centre(SIDE)

    # ⚠️ THE OPEN HAND IS THE CONTROL, not a second picture. A probe with no
    # known-good to compare against has told me a wrong thing twice: the pair
    # is what makes "the fist is curling the wrong way" visible at a glance
    # instead of a thing I have to reason my way to from one render.
    open_hand(rig, SIDE)
    look.sheet(out, "grip_open", centre, 0.30, res=(900, 900))

    print("FIST at %.0f degrees" % CURL)
    for line in close(rig, SIDE, CURL):
        print(line)
    look.sheet(out, "grip_fist", centre, 0.30, res=(900, 900))
    print("GRIP_OK %s" % out)


if __name__ == "__main__":
    main()
