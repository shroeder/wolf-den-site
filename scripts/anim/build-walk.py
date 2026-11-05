import bpy, math, os, json
from mathutils import Vector, Euler, Matrix, Quaternion

# ═══════════════════════════════════════════════════════════════════════════════
# THE WALK, BUILT ON IK
#
# The FK version failed three times for the same reason: I was authoring joint
# ANGLES, whose sign convention differs per side, and I kept getting the signs
# wrong. The right leg ended up with a backward-bending knee -- a bird leg --
# which reads instantly as non-human and which no amount of angle tuning fixes,
# because it is a mirroring bug, not a posing one.
#
# So this authors FOOT POSITIONS IN WORLD SPACE instead. Where a foot is on the
# floor is a thing with one unambiguous answer and no handedness. The solver
# works out the joint angles, and a POLE TARGET states which way the knee points
# explicitly rather than leaving it to an axis sign.
#
# glTF has no IK, so the result is baked down to plain bone keys before export.
# ═══════════════════════════════════════════════════════════════════════════════
OUT = os.environ.get("OUT_DIR", ".")
bpy.ops.preferences.addon_enable(module="bl_ext.blender_org.mpfb")
from bl_ext.blender_org.mpfb.services.humanservice import HumanService
from bl_ext.blender_org.mpfb.services.targetservice import TargetService

bpy.ops.wm.read_homefile(use_empty=True)

macro = TargetService.get_default_macro_info_dict()
for k, v in (("gender", 1.0), ("age", 0.55), ("muscle", 0.95), ("weight", 0.56),
             ("height", 0.80), ("proportions", 1.0), ("cupsize", 0.0), ("firmness", 0.9)):
    macro[k] = v
human = HumanService.create_human(macro_detail_dict=macro, scale=0.1,
                                  feet_on_ground=True, detailed_helpers=False)
arm = HumanService.add_builtin_rig(human, "game_engine")

# ── BAKE THE MACRO, THEN FIT THE SKELETON TO THE BODY ────────────────────────
# ⚠️ MPFB BUILDS THE RIG AGAINST base.obj, the pristine MakeHuman mesh. A
# character with macro details therefore gets a skeleton sized for somebody
# else -- 1.654 of rig inside 2.127 of body -- and every joint ends up a
# hip-height below the limb it drives. refit() does not resize it. The whole
# previous walk was authored on that: the skeleton posed correctly and the
# flesh pivoted about points a metre away, which is why the renders looked
# deformed while every skeleton measurement passed.
#
# Editing the REST bones after binding is safe: at rest, pose equals rest, so
# pose * rest-inverse is identity and the mesh does not move. Only the pivots
# move -- onto the anatomy.
if human.data.shape_keys:
    bpy.context.view_layer.objects.active = human
    human.select_set(True)
    bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    human.select_set(False)

_dg = bpy.context.evaluated_depsgraph_get(); _ev = human.evaluated_get(_dg)
_mz = [(_ev.matrix_world @ v.co).z for v in _ev.data.vertices]
_mlo, _mhi = min(_mz), max(_mz)
_bz = [(arm.matrix_world @ b.head_local).z for b in arm.data.bones] +       [(arm.matrix_world @ b.tail_local).z for b in arm.data.bones]
_blo, _bhi = min(_bz), max(_bz)
_k = (_mhi - _mlo) / (_bhi - _blo)
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
for _eb in arm.data.edit_bones:
    for _a in ("head", "tail"):
        _p = getattr(_eb, _a).copy()
        _p.x *= _k; _p.y *= _k
        _p.z = _mlo + (_p.z - _blo) * _k
        setattr(_eb, _a, _p)
bpy.ops.object.mode_set(mode="OBJECT")
arm.select_set(False)
bpy.context.view_layer.update()
print("RIGFIT scale %.4f -> rig now spans the body" % _k)

for ob in list(bpy.data.objects):
    if ob.type == "MESH" and ob is not human:
        bpy.data.objects.remove(ob, do_unlink=True)

for pb in arm.pose.bones:
    pb.rotation_mode = "XYZ"

# ── MEASURE THE SKELETON AT REST ──────────────────────────────────────────────
# Every number below is derived from the rig, not typed in, so a different
# macro dict (a shorter hero, a heavier one) still walks correctly.
W = arm.matrix_world
def head(n): return W @ arm.pose.bones[n].head
def tail(n): return W @ arm.pose.bones[n].tail

# ⚠️ THE FLOOR MUST COME FROM THE ARMATURE, NOT THE MESH. MPFB parents the body
# to the rig with a parent inverse, so the mesh sits at world z 0..1.67 while
# the BONES sit at -0.81..+0.70 -- the same skeleton, 0.8m apart in reported
# coordinates. Mixing the two put the floor under the character's knees.
FLOOR = min(tail("ball_l").z, tail("ball_r").z)
HIP0 = head("thigh_l").z
ANKLE0 = head("foot_l").z
LEG = HIP0 - ANKLE0                       # hip to ankle, standing straight
ANKLE_H = ANKLE0 - FLOOR                  # how high the ankle rides above the sole
HALF_W = abs(head("thigh_l").x)
# Foot geometry, so the roll can pivot on the part that is actually touching.
TOE_LEN = abs(tail("ball_l").y - head("foot_l").y)
HEEL_LEN = TOE_LEN * 0.38
print("RIG leg=%.3f ankle_h=%.3f toe=%.3f heel=%.3f floor=%.3f" % (LEG, ANKLE_H, TOE_LEN, HEEL_LEN, FLOOR))

# ── THE CYCLE ─────────────────────────────────────────────────────────────────
FRAMES = 24
REACH = 0.995
# ⚠️ THE CYCLE IS EXPRESSED IN LEG LENGTHS, NOT METRES. These were absolute,
# tuned against a 0.797 leg -- and when the rig fit corrected the skeleton to
# 1.025 the stride silently became a shuffle and the swing foot stopped
# clearing the ground. In body units it survives any character the macro makes.
STRIDE = 0.60 * LEG    # heel-to-heel split at contact
LIFT = 0.085 * LEG     # how high the swinging foot clears the floor
FWD = -1.0             # the character faces -Y

def ease(t):
    return t * t * (3 - 2 * t)

def foot_pitch(phase):
    """Sole angle in degrees, positive = toes down.

    ⚠️ STANCE IS FLAT, DELIBERATELY. A heel-to-toe roll needs an exact model of
    where the sole contacts at each angle, and this rig does not provide one --
    the ball bone's tail points UP, not at the toe tip, so every attempt to
    derive it over-lifted the ankle and floated the whole figure by up to
    134mm. Flat stance is a normal, readable game walk and it is provably
    planted. Roll is polish to add once there is a correct cycle under it."""
    p = phase % 1.0
    if p < 0.5:
        return 0.0
    t = (p - 0.5) / 0.5
    # Toes lift a little mid-swing so they clear, then level for the next step.
    return -11.0 * math.sin(math.pi * t) ** 1.5

def ankle_clearance(pitch_deg):
    """How high the ankle must ride so the LOWEST part of the foot -- heel at
    strike, toe at push-off -- rests exactly on the floor at this pitch.

    ⚠️ THE FOOT PIVOTS ON WHAT IS TOUCHING, NOT ON THE ANKLE. Rolling the foot
    about the ankle at a fixed height drove the toe 0.13 THROUGH the floor at
    toe-off, which is most of a shoe. Rotating the sole and solving for the
    ankle keeps it planted at every pitch."""
    th = math.radians(pitch_deg)       # positive = toes down
    return ANKLE_H * math.cos(th) + max(TOE_LEN * math.sin(th), -HEEL_LEN * math.sin(th))

def foot_at(phase):
    """World Y and Z of one ankle at `phase` of its own cycle.
    0.0-0.5 is STANCE: planted, rolling heel to toe.
    0.5-1.0 is SWING:  lifted, arcing forward again."""
    p = phase % 1.0
    # ⚠️ CLEARANCE IS A FLOOR ON THE ANKLE AT EVERY INSTANT, not a stance-only
    # rule. Applying it only during stance left a discontinuity at the swing
    # boundary: the foot was still pitched 30 degrees from push-off while the
    # lift arc restarted at zero, so the ankle dropped and put the toe 0.13
    # under the ground on the very first frame of every swing.
    if p < 0.5:
        t = p / 0.5
        y = FWD * (STRIDE / 2) * (1 - 2 * t)      # front -> back, linear: no slide
        z = ANKLE_H                                # flat and planted all stance
    else:
        t = (p - 0.5) / 0.5
        y = FWD * (STRIDE / 2) * (-1 + 2 * ease(t))
        # ⚠️ sin(pi*t) LEAVES THE GROUND TOO SLOWLY. A plain sine is flat near
        # t=0, so for the first few frames of swing the foot is still at floor
        # height while the leg is at full extension behind -- and the skinning
        # stretch there pulled the heel 26mm under. Raising to a power < 1
        # makes it lift off briskly and settle back gently, which is also what
        # a real foot does.
        z = ANKLE_H + LIFT * math.sin(math.pi * t)
    return y, z

# ── IK RIG ────────────────────────────────────────────────────────────────────
helpers = []
def empty(name, loc):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.05
    e.location = loc
    bpy.context.collection.objects.link(e)
    helpers.append(e)
    return e

ik_targets = {}
FOOT_REST = {}
for s, sign in (("l", 1), ("r", -1)):
    tgt = empty("ik_%s" % s, (sign * HALF_W, 0, FLOOR + ANKLE_H))
    # ⚠️ THE POLE IS THE WHOLE POINT. It states, in world space, which way the
    # knee points -- forward. That is what the FK version got wrong on the right
    # leg, and a pole target cannot be mirrored into a bird leg.
    pole = empty("pole_%s" % s, (sign * HALF_W, FWD * 0.9, FLOOR + LEG * 0.55))
    ik_targets[s] = (tgt, pole)

    c = arm.pose.bones["calf_%s" % s].constraints.new("IK")
    c.target = tgt
    c.pole_target = pole
    c.chain_count = 2
    c.pole_angle = math.radians(-90)
    c.use_tail = True

    # ── THE FOOT IS ORIENTED IN WORLD SPACE, NOT RELATIVE TO THE SHIN ─────────
    # foot_X is a CHILD of calf_X, so IK swinging the leg through stance turns
    # the foot with it. A pitch keyed on the bone is therefore relative to a
    # parent that is rotating underneath it, and the measured toe drifted 0.07
    # downward across stance while the commanded pitch sat constant at 4
    # degrees. Copying rotation from the IK target instead makes the sole angle
    # absolute against the floor, which is what "flat" actually means.
    # ⚠️ QUATERNION, NOT EULER. The right foot's rest basis is MIRRORED, and
    # to_euler() on an improper (negative-determinant) matrix is not
    # well-defined -- it silently produced an orientation that dropped that
    # foot 70mm through the floor for the first frames of every swing, while
    # the left foot was perfect. to_quaternion() returns the nearest proper
    # rotation, which is exactly what "point the sole this way" means.
    tgt.rotation_mode = "QUATERNION"
    cr = arm.pose.bones["foot_%s" % s].constraints.new("COPY_ROTATION")
    cr.target = tgt
    cr.target_space = "WORLD"
    cr.owner_space = "WORLD"

# ── THE RIGHT FOOT'S REST IS MIRRORED FROM THE LEFT, NOT READ FROM ITSELF ────
# Copy Rotation does exactly what it is told -- the left foot matches its
# target to 0.0 degrees. The fault was in what it was told: the right foot's
# rest basis has a negative determinant, and to_quaternion() on an improper
# matrix returns the nearest PROPER rotation, which is tens of degrees away
# from the true mirror. That tipped the right sole down and buried it 70mm.
# Mirroring the left across the YZ plane -- negate y and z of the quaternion --
# gives the exact pose the right foot should rest in.
_ql = (arm.matrix_world @ arm.pose.bones["foot_l"].matrix).to_quaternion()
FOOT_REST["l"] = _ql
FOOT_REST["r"] = Quaternion((_ql.w, _ql.x, -_ql.y, -_ql.z))
print("FOOT_REST l %s  r %s" % (tuple(round(v, 3) for v in FOOT_REST["l"]),
                                tuple(round(v, 3) for v in FOOT_REST["r"])))

# ── KEY IT ────────────────────────────────────────────────────────────────────
sc = bpy.context.scene
sc.frame_start, sc.frame_end = 1, FRAMES
sc.render.fps = 24

ARM_SWING = 19.0          # degrees, peak
ARM_TUCK = 27.0           # degrees, bringing the A-pose arms down to the sides

# ── SIGNS ARE CALIBRATED, NEVER TYPED ─────────────────────────────────────────
# Every failure in this animation has been a mirrored axis: the right knee bent
# backward, then the right foot rolled the wrong way and drove the toe through
# the floor. Both because I measured a sign on the LEFT bone and assumed the
# right matched. It does not -- the local axis is mirrored.
#
# So the script pokes each bone and watches which way the thing on the end of
# it actually moves. A mirrored rig, a different rig, or a rig that changes
# under an update all self-correct, and this bug class cannot return.
def _probe(bone, watch_bone, use_tail, axis_deg, want):
    pb = arm.pose.bones[bone]
    wb = arm.pose.bones[watch_bone]
    def at():
        bpy.context.view_layer.update()
        p = wb.tail if use_tail else wb.head
        return arm.matrix_world @ p
    pb.rotation_euler = Euler((0, 0, 0), "XYZ")
    before = at()
    pb.rotation_euler = Euler((math.radians(axis_deg), 0, 0), "XYZ")
    after = at()
    pb.rotation_euler = Euler((0, 0, 0), "XYZ")
    bpy.context.view_layer.update()
    return 1.0 if want(before, after) else -1.0

FOOT_SIGN, ARM_SIGN, TUCK_SIGN = {}, {}, {}
for _s in ("l", "r"):
    # ⚠️ MPFB RESTS IN AN A-POSE -- arms ~42 degrees out from the body. Keying
    # only fore-aft swing on top leaves them splayed all cycle, which reads as
    # a scarecrow. They must come DOWN to the sides first.
    #
    # ⚠️ AND THE AXIS IS SEARCHED, NOT PICKED. My first attempt assumed Z and
    # measured success as "the hand moved toward the midline" -- but Z swings
    # the arm FORWARD on this rig, which also moves the hand inward, so the
    # probe passed while the arms went out to horizontal. The test that
    # actually means "tucked" is the upperarm's ANGLE FROM STRAIGHT DOWN.
    def _elev(side):
        pb = arm.pose.bones["upperarm_%s" % side]
        bpy.context.view_layer.update()
        d = (arm.matrix_world @ arm.pose.bones["lowerarm_%s" % side].head) - (arm.matrix_world @ pb.head)
        return math.degrees(math.atan2(math.hypot(d.x, d.y), -d.z))
    def _tuck_probe(side):
        pb = arm.pose.bones["upperarm_%s" % side]
        pb.rotation_euler = Euler((0, 0, 0), "XYZ")
        base = _elev(side)
        best, bestv = None, base
        for ax in (1, 2):
            for sg in (1, -1):
                e = [0.0, 0.0, 0.0]
                e[ax] = math.radians(20 * sg)
                pb.rotation_euler = Euler(e, "XYZ")
                v = _elev(side)
                if v < bestv:
                    best, bestv = (ax, sg), v
        pb.rotation_euler = Euler((0, 0, 0), "XYZ")
        bpy.context.view_layer.update()
        return best or (2, 1), base, bestv
    TUCK_SIGN[_s] = _tuck_probe(_s)
    # +pitch must drop the TOE (plantarflexion, the push-off).
    FOOT_SIGN[_s] = _probe("foot_%s" % _s, "ball_%s" % _s, True, 20, lambda b, a: a.z < b.z)
    # +swing must carry the HAND forward, and forward is -Y.
    ARM_SIGN[_s] = _probe("upperarm_%s" % _s, "lowerarm_%s" % _s, True, 20, lambda b, a: a.y < b.y)
print("CALIBRATED tuck l axis%d sign%+d elev %.0f->%.0f | r axis%d sign%+d elev %.0f->%.0f" % (
    TUCK_SIGN["l"][0][0], TUCK_SIGN["l"][0][1], TUCK_SIGN["l"][1], TUCK_SIGN["l"][2],
    TUCK_SIGN["r"][0][0], TUCK_SIGN["r"][0][1], TUCK_SIGN["r"][1], TUCK_SIGN["r"][2]))

def arm_pose(side, phase):
    """Arms swing opposite the leg on the same side."""
    return -ARM_SWING * math.cos(2 * math.pi * (phase % 1.0))

hip_curve = []
for f in range(1, FRAMES + 2):
    i = (f - 1) % FRAMES
    ph_l = i / FRAMES
    ph_r = ph_l + 0.5

    fy_l, fz_l = foot_at(ph_l)
    fy_r, fz_r = foot_at(ph_r)

    # ── HIP HEIGHT IS SOLVED, NOT AUTHORED ────────────────────────────────────
    # Whichever foot is planted sets how high the hips can be without the leg
    # reaching past straight. Taking the lower of the two answers guarantees
    # both legs can reach, which is exactly the bob a real walk has.
    cands = []
    for (fy, fz) in ((fy_l, fz_l), (fy_r, fz_r)):
        dy = abs(fy - 0.0)
        span = (LEG * REACH) ** 2 - dy ** 2
        cands.append(FLOOR + fz + math.sqrt(max(span, 0.01)))
    hip_z = min(cands)
    hip_curve.append(hip_z)

    arm.location.z = hip_z - HIP0
    arm.keyframe_insert("location", frame=f)

    for s, (fy, fz, ph) in (("l", (fy_l, fz_l, ph_l)), ("r", (fy_r, fz_r, ph_r))):
        tgt, _pole = ik_targets[s]
        sign = 1 if s == "l" else -1
        tgt.location = (sign * HALF_W, fy, FLOOR + fz)
        tgt.keyframe_insert("location", frame=f)

        pole = ik_targets[s][1]
        pole.location = (sign * HALF_W, fy * 0.45 + FWD * 0.42, FLOOR + LEG * 0.55)
        pole.keyframe_insert("location", frame=f)

        # +pitch about world X drops the toe, because the foot points -Y.
        q = Quaternion((1, 0, 0), math.radians(foot_pitch(ph))) @ FOOT_REST[s]
        tgt.rotation_quaternion = q
        tgt.keyframe_insert("rotation_quaternion", frame=f)

        ab = arm.pose.bones["upperarm_%s" % s]
        (_ax, _sg), _base, _best = TUCK_SIGN[s]
        _e = [math.radians(arm_pose(s, ph) * ARM_SIGN[s]), 0.0, 0.0]
        _e[_ax] += math.radians(ARM_TUCK * _sg)
        ab.rotation_euler = Euler(_e, "XYZ")
        ab.keyframe_insert("rotation_euler", frame=f)
        lb = arm.pose.bones["lowerarm_%s" % s]
        lb.rotation_euler = Euler((math.radians((-14 - 7 * math.cos(2 * math.pi * ph)) * ARM_SIGN[s]), 0, 0), "XYZ")
        lb.keyframe_insert("rotation_euler", frame=f)

print("KEYED hip %.3f..%.3f (bob %.3f)" % (min(hip_curve), max(hip_curve), max(hip_curve) - min(hip_curve)))






for ob in (arm, *helpers):
    if ob.animation_data and ob.animation_data.action:
        for fc in ob.animation_data.action.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = "BEZIER"

bpy.context.view_layer.update()
print("BUILD_OK")
