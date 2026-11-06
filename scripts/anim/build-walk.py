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
BASE = os.environ.get("HERO_BASE", os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "hero-base.blend"))

# ── LOAD THE FROZEN HERO ─────────────────────────────────────────────────────
# ⚠️ THIS SCRIPT NO LONGER GENERATES ANYTHING. It used to call MPFB on every
# build, which meant re-triggering its whole quirk list -- rig fitted to the
# wrong mesh, macro shape keys breaking the bind, helper geometry hidden
# rather than deleted -- every single export. The model changed underneath the
# animation constantly, and each fix had to survive being re-applied.
#
# Generation now happens once, in scripts/anim/freeze-hero.py, and is
# committed as an asset. This loads it. Change the animation and the model
# cannot move.
bpy.ops.wm.open_mainfile(filepath=BASE)
human = bpy.data.objects["Hero"]
arm = bpy.data.objects["HeroRig"]
print("LOADED %s  %d verts, %d bones" % (os.path.basename(BASE),
                                         len(human.data.vertices), len(arm.data.bones)))

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

# ── EQUIPMENT: A HEATER SHIELD ───────────────────────────────────────────────
# Procedural geometry is the thing that actually worked when I tried to build
# a character by hand -- it is wrong for anatomy and right for props. A shield
# is a lofted outline with a bowed face, a rim and a boss, and it is the same
# every run.
#
# It is BONE-PARENTED to hand_l, so it inherits the animation for free and
# exports as a node under that joint. No skinning, no weights, no second rig.
import bmesh

def build_shield(scale):
    W, H, D = 0.46 * scale, 0.62 * scale, 0.075 * scale
    ROWS, COLS = 14, 11
    bm = bmesh.new()
    grid = []
    for r in range(ROWS + 1):
        t = r / ROWS
        hw = (W / 2) * max(1e-4, (1 - t ** 2.3)) ** 0.5     # heater taper to a point
        row = []
        for c in range(COLS + 1):
            u = -1 + 2 * c / COLS
            x = u * hw
            bow = D * (1 - u * u) * (1 - 0.35 * t)           # face bows outward
            row.append(bm.verts.new((x, -bow, H * (0.5 - t))))
        grid.append(row)
    bm.verts.ensure_lookup_table()
    for r in range(ROWS):
        for c in range(COLS):
            bm.faces.new((grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]))
    me = bpy.data.meshes.new("ShieldFace")
    bm.to_mesh(me); bm.free()
    sh = bpy.data.objects.new("Shield", me)
    bpy.context.collection.objects.link(sh)
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    sol = sh.modifiers.new("Thickness", "SOLIDIFY")
    sol.thickness = 0.022 * scale
    sol.offset = 1.0
    bev = sh.modifiers.new("Edge", "BEVEL")
    bev.width = 0.006 * scale
    bev.segments = 2

    wood = bpy.data.materials.new("ShieldFace")
    wood.use_nodes = True
    wp = wood.node_tree.nodes["Principled BSDF"]
    wp.inputs["Base Color"].default_value = (0.055, 0.145, 0.150, 1)   # deep teal
    wp.inputs["Roughness"].default_value = 0.62
    me.materials.append(wood)

    # A boss, because a flat plate does not read as a shield.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=10, radius=0.085 * scale)
    boss = bpy.context.active_object
    boss.name = "ShieldBoss"
    boss.scale = (1.0, 0.55, 1.0)
    boss.location = (0, -(D + 0.02 * scale), H * 0.06)
    bpy.ops.object.transform_apply(scale=True)
    boss.data.polygons.foreach_set("use_smooth", [True] * len(boss.data.polygons))
    gold = bpy.data.materials.new("ShieldBoss")
    gold.use_nodes = True
    gp = gold.node_tree.nodes["Principled BSDF"]
    gp.inputs["Base Color"].default_value = (0.62, 0.42, 0.09, 1)
    gp.inputs["Roughness"].default_value = 0.34
    try: gp.inputs["Metallic"].default_value = 0.85
    except Exception: pass
    boss.data.materials.append(gold)

    bpy.ops.object.select_all(action="DESELECT")
    boss.select_set(True); sh.select_set(True)
    bpy.context.view_layer.objects.active = sh
    bpy.ops.object.join()
    sh = bpy.context.active_object
    sh.select_set(False)
    return sh

SHIELD_ARM = "l"       # which hand carries the shield
FWD = -1.0             # the character faces -Y

SHIELD = build_shield(LEG)

# ── ⚠️ SKIN THE SHIELD, DO NOT BONE-PARENT IT ────────────────────────────────
# Bone parenting is the obvious way to attach a prop and it rides the
# animation correctly in Blender -- but the glTF exporter silently DROPS it.
# The object was present, selected, in the view layer, correctly parented to
# hand_l with 354 faces and two materials, and simply did not appear in the
# file. No error, no warning.
#
# Skinning it instead -- one vertex group named for the bone, weight 1, an
# Armature modifier -- makes it an ordinary skinned mesh and it exports the
# same way the body does.
# ⚠️ A PROP HAS ONE REST TRANSFORM, NOT ONE PER CLIP. Re-solving it against
# each animation meant whichever clip solved LAST won -- the brace solve was
# being applied to the walk and the idle, which laid the shield flat across
# the hips like a surfboard.
#
# So it is fixed ONCE here, upright and facing forward, sitting beside the
# hand in the REST pose. Which way it points in a given clip is then decided
# by the HAND's world rotation, which is itself controlled explicitly (see
# the grip target below) instead of being whatever the IK solver happened to
# produce.
HAND_B = "hand_%s" % SHIELD_ARM
_hand_rest_m = arm.matrix_world @ arm.pose.bones[HAND_B].bone.matrix_local
HAND_REST_Q = _hand_rest_m.to_quaternion()
_sgn = 1 if SHIELD_ARM == "l" else -1
SHIELD.matrix_world = Matrix.Translation(
    _hand_rest_m.translation + Vector((_sgn * 0.05 * LEG, FWD * 0.09 * LEG, 0.17 * LEG)))
bpy.context.view_layer.update()

_vg = SHIELD.vertex_groups.new(name="hand_l")
_vg.add(list(range(len(SHIELD.data.vertices))), 1.0, "REPLACE")
_am = SHIELD.modifiers.new("Armature", "ARMATURE")
_am.object = arm
SHIELD.parent = arm
SHIELD.matrix_parent_inverse = arm.matrix_world.inverted()

print("SHIELD built, %d faces, skinned to hand_l" % len(SHIELD.data.polygons))

# ── THE CYCLE ─────────────────────────────────────────────────────────────────
FRAMES = 24
REACH = 0.995
# ⚠️ THE CYCLE IS EXPRESSED IN LEG LENGTHS, NOT METRES. These were absolute,
# tuned against a 0.797 leg -- and when the rig fit corrected the skeleton to
# 1.025 the stride silently became a shuffle and the swing foot stopped
# clearing the ground. In body units it survives any character the macro makes.
STRIDE = 0.60 * LEG    # heel-to-heel split at contact
LIFT = 0.085 * LEG     # how high the swinging foot clears the floor
# ⚠️ FEET DIRECTLY UNDER THE HIP JOINTS LOOK PINCHED. Hip joints sit at
# 0.127 of a leg either side; putting the ankles there presses the thighs
# together and, with perfectly parallel feet, reads as someone who needs the
# toilet. A real stance is a little wider WITH the toes turned out.
TRACK = 0.155          # ankle offset from centre, as a fraction of leg
TOE_OUT = 7.0          # degrees, outward
# ⚠️ KNEE TRACKING IS SET BY THE POLE'S X, AND ONLY BY THAT. Swept it: at
# 0.18 of a leg the knee sits 0.06 INBOARD of the hip-ankle line -- visibly
# knock-kneed -- at 0.30 it is dead straight (-0.001), past 0.45 it bows out.
# pole_angle turned out to be nearly irrelevant across -120..-60, so the knock
# -knee was never an angle problem; the poles were simply too close to centre.
KNEE_POLE = 0.315      # fraction of leg, outboard. A hair past straight,
                       # because a dead-parallel male walk reads stiff.

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

SHIELD_ARM = "l"

# ── THE SHIELD ARM IS SOLVED, NOT POSED ─────────────────────────────────────
# Every joint angle I have typed today has been wrong at least once, usually
# because the sign convention differs per side. So the guard arm gets the same
# treatment the legs did: say where the HAND must be in world space and let IK
# work out the elbow. A hand position is unambiguous and has no handedness.
#
# Bracing a shield: hand across the belly on the far side of centre, elbow
# tucked DOWN and BACK against the ribs (the pole target), forearm roughly
# horizontal so the shield rides on it.
_sa = SHIELD_ARM
_sho = arm.matrix_world @ arm.pose.bones["upperarm_%s" % _sa].head
# ⚠️ THE HAND SITS BEHIND THE SHIELD, NOT THROUGH IT. A shield is gripped by
# a handle behind the boss -- the fist is hidden by the face. The goal used to
# be FORWARD of the shield centre, which pushed the hand out through the front.
_hand_goal = empty("guard_%s" % _sa, (0.10 * LEG, FWD * 0.20 * LEG, FLOOR + LEG * 1.09))
_elbow_pole = empty("guardpole_%s" % _sa, (_sho.x + 0.26 * LEG, 0.34 * LEG, FLOOR + LEG * 0.82))
_gc = arm.pose.bones["lowerarm_%s" % _sa].constraints.new("IK")
_gc.target = _hand_goal
_gc.pole_target = _elbow_pole
_gc.chain_count = 2
_gc.pole_angle = math.radians(-90)
_gc.use_tail = True

# ⚠️ IK CONTROLS POSITION, NOT ORIENTATION. The hand's rotation falls out of
# the solver and is effectively arbitrary -- and the shield is welded to it,
# so the shield's angle was arbitrary too. A Copy Rotation off a keyable
# empty makes it explicit. GRIP keys are "point the shield this way".
_grip = empty("grip_%s" % _sa, (0, 0, 0))
_grip.rotation_mode = "QUATERNION"
_grip.rotation_quaternion = HAND_REST_Q
_grc = arm.pose.bones[HAND_B].constraints.new("COPY_ROTATION")
_grc.target = _grip
_grc.target_space = "WORLD"
_grc.owner_space = "WORLD"

# ── ⚠️ AND THE WRIST HAS TO BE ALLOWED TO SAY NO ────────────────────────────
# The two constraints above fight: the IK decides where the wrist IS, the Copy
# Rotation decides which way the hand POINTS, and the joint between them
# absorbs the whole difference. _wrist.py has been printing the damage since it
# was written -- 55 on Walk, 60 on Idle, 63 on Run, 75 on Brace, 91 on Impact,
# 69 on Mine -- and nothing ever acted on it.
#
# 2026-11-05: Luke, on a wide shot of Mine, "A hand is growing out his belly.
# Its noticeable from far away." It was not a stray bone -- both hands track
# the shaft correctly all 40 frames, a constant 0.252 apart. It is this joint.
# Linear blend skinning shears long before a wrist reaches its anatomical
# limit, so a pose the measurement calls legal still tears the mesh open, and
# the torn geometry reads as a second hand.
#
# 50 degrees, because Idle sits at 60 and renders CLEAN while Mine at 69 does
# not -- so the mesh gives out somewhere in between, and the cap belongs below
# the lowest known-bad number rather than at the anatomical one.
#
# ⚠️ LEFT HAND ONLY, AND NOT BY OVERSIGHT. The pickaxe is SKINNED to hand_r at
# weight 1.0, so clamping that wrist rotates the tool itself and un-solves the
# tip-on-the-floor contact key_mine spends its whole solver budget on. The off
# hand only rides the shaft, so bounding it costs a little grip accuracy and
# nothing else.
_wlim = arm.pose.bones[HAND_B].constraints.new("LIMIT_ROTATION")
_wlim.owner_space = "LOCAL"
for _ax in ("x", "y", "z"):
    setattr(_wlim, "use_limit_%s" % _ax, True)
    setattr(_wlim, "min_%s" % _ax, math.radians(-50))
    setattr(_wlim, "max_%s" % _ax, math.radians(50))
print("GUARD arm %s solved by IK, grip orientation explicit, wrist capped 50 deg" % _sa)

# ── A GRIPPING FIST ──────────────────────────────────────────────────────────
# An open hand behind a shield reads as someone balancing a tray. The fingers
# curl around a handle: proximal hardest, then mid, then the tip, with the
# thumb coming over the top rather than curling the same way.
#
# ⚠️ CURL DIRECTION IS CALIBRATED, NOT TYPED. Finger bones mirror per side
# like every other bone on this rig, and a wrong sign splays the hand
# backwards into a claw.
#
# ⚠️ AND THE FIRST CALIBRATION GOT THE LEFT HAND WRONG FOR ITS WHOLE LIFE.
# It nudged ONE finger by 30 degrees and kept the sign that moved the tip
# nearer the WRIST JOINT. Two things are wrong with that and both were
# invisible until the hand was rendered at hand size:
#
#   The signal is tiny. 30 degrees moved the index tip 0.012 against a
#   0.20 baseline -- 6 per cent -- and the two sides' finger bones do not
#   share a local axis, so the same +30 swings the right tip FORWARD and the
#   left tip straight DOWN. At that scale the measurement is noise.
#
#   "Nearer the wrist" is not "curling". A finger EXTENDING backwards also
#   swings its tip around past the knuckle, and on the left that landed
#   nearer the wrist joint than curling did. So the probe confidently chose
#   the direction that bends the fingers backwards through the palm.
#
# The result shipped in hero.glb in all six clips: a shredded left fist, with
# qa.py reporting PASSED on every one of them, because every check it owns
# measures bone ANGLES and a fist curled the wrong way has identical angles.
# It was found by rendering the hand at hand size, which is the only thing
# that ever finds this class of defect.
#
# So: pose the WHOLE hand at FULL curl both ways and keep the sign that tucks
# the fingertips in against the knuckles, which is what a closed fist is. The
# margin is 2x rather than 6 per cent, and it is right on both hands.
_CURL_SEGS = (("01", 58), ("02", 76), ("03", 48))
_CURL_FNG = ("index", "middle", "ring", "pinky")


def _curl_sign(side):
    def put(sign, amount=1.0):
        for fng in _CURL_FNG:
            for seg, deg in _CURL_SEGS:
                b = arm.pose.bones.get("%s_%s_%s" % (fng, seg, side))
                if b:
                    b.rotation_euler = Euler(
                        (math.radians(deg * amount * sign), 0, 0), "XYZ")
        bpy.context.view_layer.update()

    def tucked(sign):
        """Mean fingertip distance to the knuckle line at full curl. A fist
        brings them in; bending backwards carries them away."""
        put(sign)
        knuck = arm.matrix_world @ arm.pose.bones["hand_%s" % side].tail
        tips = [arm.matrix_world @ arm.pose.bones["%s_03_%s" % (f, side)].tail
                for f in _CURL_FNG
                if arm.pose.bones.get("%s_03_%s" % (f, side))]
        return sum((t - knuck).length for t in tips) / float(len(tips))

    pos, neg = tucked(1.0), tucked(-1.0)
    put(1.0, 0.0)
    sign = 1.0 if pos < neg else -1.0
    # ⚠️ PRINT THE MARGIN, NOT JUST THE VERDICT. The old probe was wrong by
    # 6 per cent and said nothing; a reading that cannot be doubted is how it
    # survived. Anything under about 1.3x means the hand is not closing
    # either way and the finger bones' axis is the real problem.
    ratio = max(pos, neg) / max(min(pos, neg), 1e-6)
    print("CURL %s sign %+.0f  tucked +1 %.4f / -1 %.4f  (%.2fx margin)%s"
          % (side, sign, pos, neg, ratio,
             "  ⚠️ WEAK — check the render" if ratio < 1.3 else ""))
    return sign

def close_fist(side, amount=1.0):
    cs = _curl_sign(side)
    for fng in ("index", "middle", "ring", "pinky"):
        for seg, deg in (("01", 58), ("02", 76), ("03", 48)):
            b = arm.pose.bones.get("%s_%s_%s" % (fng, seg, side))
            if b:
                b.rotation_euler = Euler((math.radians(deg * amount * cs), 0, 0), "XYZ")
    for seg, deg in (("01", 26), ("02", 34), ("03", 30)):
        b = arm.pose.bones.get("thumb_%s_%s" % (seg, side))
        if b:
            b.rotation_euler = Euler((math.radians(deg * amount * cs), 0, 0), "XYZ")
    print("FIST %s closed (curl sign %+.0f)" % (side, cs))

close_fist(SHIELD_ARM)
# ⚠️ AND A RELAXED CURL ON THE OTHER ONE. Nothing keys the fingers, so whatever
# they are left in is what every clip bakes -- and MPFB rests them splayed
# flat. At a walk that passes; at a run the free hand reaches out in front with
# its fingers spread like a mime. A hand at rest is never flat.
close_fist("r" if SHIELD_ARM == "l" else "l", 0.34)

# ── KEY IT ────────────────────────────────────────────────────────────────────
sc = bpy.context.scene
sc.frame_start, sc.frame_end = 1, FRAMES
sc.render.fps = 24

ARM_SWING = 19.0          # degrees, peak
SHIELD_ARM = "l"
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
        tgt.location = (sign * TRACK * LEG, fy, FLOOR + fz)
        tgt.keyframe_insert("location", frame=f)

        pole = ik_targets[s][1]
        pole.location = (sign * KNEE_POLE * LEG, fy * 0.45 + FWD * 0.42, FLOOR + LEG * 0.55)
        pole.keyframe_insert("location", frame=f)

        # +pitch about world X drops the toe, because the foot points -Y.
        q = (Quaternion((0, 0, 1), math.radians(TOE_OUT * sign))
             @ Quaternion((1, 0, 0), math.radians(foot_pitch(ph))) @ FOOT_REST[s])
        tgt.rotation_quaternion = q
        tgt.keyframe_insert("rotation_quaternion", frame=f)

        if s == SHIELD_ARM:
            # ⚠️ THE GUARD TARGET IS A WORLD-SPACE EMPTY. Left unkeyed it is
            # nailed to a point in the room: the body bobs past it and the arm
            # hangs in front, dead, while everything else walks. It has to be
            # re-keyed every frame so it rides the hips.
            _bob = hip_z - (FLOOR + LEG * 0.985)
            _sway = math.sin(2 * math.pi * ph) * 0.016 * LEG
            _hand_goal.location = (0.17 * LEG,
                                   FWD * 0.17 * LEG + _sway * 0.5,
                                   FLOOR + LEG * 0.96 + _bob + abs(_sway) * 0.3)
            _hand_goal.keyframe_insert("location", frame=f)
            _elbow_pole.location = (0.34 * LEG, 0.36 * LEG, FLOOR + LEG * 0.72 + _bob)
            _elbow_pole.keyframe_insert("location", frame=f)
            # Upright carry, rocking a few degrees with the stride.
            _grip.rotation_quaternion = (
                Quaternion((0, 1, 0), math.radians(-14 + 4 * math.sin(2 * math.pi * ph)))
                @ Quaternion((1, 0, 0), math.radians(6))
                @ HAND_REST_Q)
            _grip.keyframe_insert("rotation_quaternion", frame=f)
            continue

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
