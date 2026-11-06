import bpy, math
from mathutils import Vector

# ── THE FOREARM HAS TO BE ABLE TO TWIST ─────────────────────────────────────
# ⚠️ THE RIG HAD NO TWIST BONE AND THAT IS WHY EVERY TOOL ANIMATION LOOKED
# WRUNG. The arm chain was clavicle -> upperarm -> lowerarm -> hand: fifty-three
# bones and not one of them could pronate. A real arm turns the palm over at
# the radioulnar joint, along the FOREARM. With that joint missing, every
# degree of palm orientation has to be found in the shoulder or the wrist --
# the two joints that cannot supply it.
#
# It showed up as a merry-go-round rather than as an obvious fault, which is
# why it survived so long. Measured on Mine before this file existed:
#
#     upperarm twist  165 deg      shoulder taking the roll
#     hand twist       69 deg      wrist taking the rest
#     lowerarm twist    0.1 deg    the joint that should have taken it
#
# Tuning moved the damage around and never removed it. Scoring shoulder twist
# in the pole sweep took the shoulder 165 -> 24 and pushed the wrist 71 -> 78.
# Re-sweeping the shaft roll found 310 was already optimal: 260 gave a 90 deg
# wrist, 350 gave 98. There was nowhere left to put it, because the arm was
# short a degree of freedom.
#
# Luke's framing, which is the reason this is a rig file and not a clip tweak:
# "the product that we're creating isn't the animations. It's the harness that
# creates the animations." A clip fix helps Mine. This helps every clip that
# ever holds anything.
#
# ⚠️ IT MUST RUN BEFORE build-armour. The plates are cut from the hero's own
# surface and inherit the bone weights of the flesh underneath them, so the
# twist group has to exist before they are made or the armour will not follow
# the forearm it is strapped to.

TWIST_FRACTION = 0.5    # 0.8 was tried and made no visible difference at all

_ebones = None
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
_made = []
for _s in ("l", "r"):
    lo = arm.data.edit_bones["lowerarm_%s" % _s]
    hd = arm.data.edit_bones["hand_%s" % _s]
    tb = arm.data.edit_bones.new("lowerarm_twist_%s" % _s)
    # Spans the DISTAL HALF of the forearm. Twist is not uniform along a real
    # forearm -- the radius crosses the ulna toward the wrist, so the skin near
    # the elbow barely rotates while the skin at the wrist rotates fully. A
    # bone over the far half, with weights ramped along it, reproduces that.
    tb.head = lo.head.lerp(lo.tail, 0.5)
    tb.tail = lo.tail.copy()
    tb.roll = lo.roll
    tb.parent = lo
    tb.use_connect = False
    _made.append(tb.name)
bpy.ops.object.mode_set(mode="OBJECT")

# ── THE CONSTRAINT: FOLLOW THE HAND'S ROLL, AND ONLY ITS ROLL ───────────────
# Y is the bone's own length in Blender, so limiting the copy to Y takes the
# twist and leaves bend alone. Without that restriction the forearm would also
# try to follow the wrist's flexion and the elbow would bend sideways.
for _s in ("l", "r"):
    pb = arm.pose.bones["lowerarm_twist_%s" % _s]
    c = pb.constraints.new("COPY_ROTATION")
    c.target = arm
    c.subtarget = "hand_%s" % _s
    c.use_x = c.use_z = False
    c.use_y = True
    c.target_space = "LOCAL"
    c.owner_space = "LOCAL"
    c.influence = TWIST_FRACTION

# ── WEIGHTS: RAMP THE FOREARM FROM ELBOW TO WRIST ──────────────────────────
# ⚠️ MOVED, NOT ADDED. A vertex that keeps its full lowerarm weight AND gains a
# twist weight is driven twice and the forearm inflates. Each vertex hands over
# exactly the fraction of its lowerarm weight that corresponds to how far down
# the forearm it sits, so the totals still sum to what they were.
for _s in ("l", "r"):
    g_lo = human.vertex_groups.get("lowerarm_%s" % _s)
    if g_lo is None:
        continue
    g_tw = human.vertex_groups.get("lowerarm_twist_%s" % _s) \
        or human.vertex_groups.new(name="lowerarm_twist_%s" % _s)
    b = arm.data.bones["lowerarm_%s" % _s]
    a0 = arm.matrix_world @ b.head_local
    a1 = arm.matrix_world @ b.tail_local
    d = a1 - a0
    moved = 0
    for v in human.data.vertices:
        w = next((gel.weight for gel in v.groups if gel.group == g_lo.index), None)
        if w is None or w <= 0.0:
            continue
        p = human.matrix_world @ v.co
        t = max(0.0, min(1.0, (p - a0).dot(d) / max(d.dot(d), 1e-9)))
        # Nothing at the elbow, everything at the wrist, smooth between.
        share = t * t
        if share <= 1e-4:
            continue
        g_tw.add([v.index], w * share, "REPLACE")
        g_lo.add([v.index], w * (1.0 - share), "REPLACE")
        moved += 1
    print("TWIST %s  %d verts ramped onto lowerarm_twist_%s" % (_s, moved, _s))

print("TWIST bones added: %s (influence %.2f)" % (", ".join(_made), TWIST_FRACTION))
