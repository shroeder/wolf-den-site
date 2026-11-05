import bpy, math, os
from mathutils import Vector, Euler, Quaternion, Matrix

# ═══════════════════════════════════════════════════════════════════════════
# BRACE — a shield guard, held and breathing. 36 frames, seamless loop.
#
# A brace is not an arm position. It is the whole body committing:
#
#   WEIGHT      hips drop ~14% and sit over the BACK leg. A brace that stands
#               tall reads as someone holding a sign.
#   STANCE      feet split front/back AND wider than the hips, both flat. The
#               back leg is the strut taking the impact.
#   PROFILE     torso rotates so the shield shoulder LEADS. You turn edge-on
#               and put the shield between you and the threat; a square chest
#               is a target.
#   LINE        the spine leans INTO the hit, not away. Leaning back reads as
#               flinching.
#   HEAD        chin tucked, eyes over the rim.
#   COUNTER     the free arm pulls back and down -- it balances the shield and
#               keeps the silhouette asymmetric. A symmetrical pose is dead.
#
# Then it has to LIVE: a hold that does not move is a freeze-frame, so the
# weight rocks between the feet on a slow cycle, the ribs breathe, and the
# shield answers both a beat later.
#
# Everything positional is solved by IK, in world space, because every joint
# angle typed by hand in this project has been wrong at least once.
# ═══════════════════════════════════════════════════════════════════════════
OUT = os.environ.get("OUT_DIR", ".")
_here = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(_here, "build-walk.py")).read())

# build-walk left a Walk action and its keys on the rig. Strip them; the rig,
# the shield, the leg IK and the guard IK all stay.
if arm.animation_data and arm.animation_data.action:
    bpy.data.actions.remove(arm.animation_data.action)
for e in helpers:
    if e.animation_data and e.animation_data.action:
        bpy.data.actions.remove(e.animation_data.action)
arm.animation_data_clear()
for e in helpers:
    e.animation_data_clear()

BF = 36
sc.frame_start, sc.frame_end = 1, BF
sc.render.fps = 24

# ── THE STANCE ───────────────────────────────────────────────────────────────
SHIELD_SIDE = 1 if SHIELD_ARM == "l" else -1     # thigh_l sits at +x
LEAD_Y = FWD * 0.26 * LEG        # shield-side foot forward
REAR_Y = -FWD * 0.34 * LEG       # back foot planted behind: the strut
LEAD_X = SHIELD_SIDE * 0.26 * LEG
REAR_X = -SHIELD_SIDE * 0.30 * LEG
HIP_BRACE = FLOOR + LEG * 0.845  # dropped; standing is ~1.0
TURN = math.radians(-24 * SHIELD_SIDE)   # shoulder leads, body goes edge-on

def breath(f):
    """Two slow cycles over the loop: one weight rock, one ribcage."""
    t = (f - 1) / BF
    rock = math.sin(2 * math.pi * t)              # weight between the feet
    rise = math.sin(2 * math.pi * t + math.pi / 2)
    return rock, rise

for f in range(1, BF + 2):
    rock, rise = breath(f)

    # ── WEIGHT ── hips low, drifting between the feet, ribs rising.
    arm.location.z = (HIP_BRACE + 0.009 * LEG * rise) - HIP0
    arm.location.x = 0.012 * LEG * rock * SHIELD_SIDE
    arm.keyframe_insert("location", frame=f)

    pb = arm.pose.bones["pelvis"]
    pb.rotation_euler = Euler((math.radians(6), math.radians(-3 * rock * SHIELD_SIDE), TURN * 0.45), "XYZ")
    pb.keyframe_insert("rotation_euler", frame=f)

    # ── PROFILE AND LINE ── turn behind the shield and lean into the hit.
    for bone, turn_f, lean in (("spine_01", 0.22, 3.2), ("spine_02", 0.26, 3.6), ("spine_03", 0.20, 2.4)):
        b = arm.pose.bones.get(bone)
        if not b:
            continue
        b.rotation_euler = Euler((math.radians(lean + 0.5 * rise), 0, TURN * turn_f), "XYZ")
        b.keyframe_insert("rotation_euler", frame=f)

    # ── HEAD ── counter-rotate back onto the threat, chin down over the rim.
    nb = arm.pose.bones.get("neck_01")
    if nb:
        nb.rotation_euler = Euler((math.radians(7), 0, -TURN * 0.30), "XYZ")
        nb.keyframe_insert("rotation_euler", frame=f)
    hb = arm.pose.bones.get("head")
    if hb:
        hb.rotation_euler = Euler((math.radians(9 + 0.8 * rock), 0, -TURN * 0.34), "XYZ")
        hb.keyframe_insert("rotation_euler", frame=f)

    # ── FEET ── planted, flat, no slide. Only the hips move over them.
    for side, (fx, fy) in ((SHIELD_ARM, (LEAD_X, LEAD_Y)),
                           ("r" if SHIELD_ARM == "l" else "l", (REAR_X, REAR_Y))):
        tgt, pole = ik_targets[side]
        tgt.location = (fx, fy, FLOOR + ANKLE_H)
        tgt.keyframe_insert("location", frame=f)
        tgt.rotation_quaternion = FOOT_REST[side]
        tgt.keyframe_insert("rotation_quaternion", frame=f)
        pole.location = (fx * 1.1, fy + FWD * 0.40 * LEG, FLOOR + LEG * 0.50)
        pole.keyframe_insert("location", frame=f)

    # ── THE SHIELD ── up at the chin, across the centreline, answering the
    # breath a beat LATE so it reads as weight being carried, not glued on.
    lag = math.sin(2 * math.pi * ((f - 1) / BF) - 0.9)
    _hand_goal.location = (SHIELD_SIDE * 0.02 * LEG + 0.010 * LEG * lag,
                           FWD * (0.44 * LEG + 0.012 * LEG * lag),
                           FLOOR + LEG * 1.16 + 0.011 * LEG * lag)
    _hand_goal.keyframe_insert("location", frame=f)
    _elbow_pole.location = (SHIELD_SIDE * (0.30 * LEG), 0.40 * LEG, FLOOR + LEG * 0.76)
    _elbow_pole.keyframe_insert("location", frame=f)

    # ── COUNTERWEIGHT ── free arm back and down, elbow out.
    free = "r" if SHIELD_ARM == "l" else "l"
    ab = arm.pose.bones["upperarm_%s" % free]
    (_ax, _sg), _b0, _b1 = TUCK_SIGN[free]
    _e = [math.radians(-26 * ARM_SIGN[free] + 1.5 * rock), 0.0, 0.0]
    _e[_ax] += math.radians((ARM_TUCK - 9) * _sg)
    ab.rotation_euler = Euler(_e, "XYZ")
    ab.keyframe_insert("rotation_euler", frame=f)
    lb = arm.pose.bones["lowerarm_%s" % free]
    lb.rotation_euler = Euler((math.radians((-48 - 3 * rock) * ARM_SIGN[free]), 0, 0), "XYZ")
    lb.keyframe_insert("rotation_euler", frame=f)

arm.animation_data.action.name = "Brace"
for ob in (arm, *helpers):
    if ob.animation_data and ob.animation_data.action:
        for fc in ob.animation_data.action.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = "BEZIER"

# Re-solve the shield's rest transform against THIS pose -- it was solved
# against a walk frame and the hand is somewhere else entirely now.
sc.frame_set(1)
bpy.context.view_layer.update()
_hand_posed = arm.matrix_world @ arm.pose.bones["hand_%s" % SHIELD_ARM].matrix
_hr = arm.matrix_world @ arm.pose.bones["hand_%s" % SHIELD_ARM].bone.matrix_local
_want = Matrix.Translation(Vector((SHIELD_SIDE * 0.10 * LEG, FWD * 0.40 * LEG, FLOOR + LEG * 1.16))) @ \
        Matrix.Rotation(math.radians(-16 * SHIELD_SIDE), 4, "Y") @ \
        Matrix.Rotation(math.radians(11), 4, "X") @ \
        Matrix.Rotation(math.radians(-10 * SHIELD_SIDE), 4, "Z")
SHIELD.matrix_world = (_hand_posed @ _hr.inverted()).inverted() @ _want
bpy.context.view_layer.update()
print("BRACE built, %d frames, shield re-solved" % BF)
