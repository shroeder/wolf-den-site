import bpy, math, os, sys
from mathutils import Vector, Euler, Quaternion

# ═══════════════════════════════════════════════════════════════════════════
# DRAGON CLIPS
#
# ⚠️ NO ROTATION SIGN IS TYPED IN THIS FILE. Every hand-written joint angle in
# this project has been wrong at least once -- the hero's right knee bent
# backwards for three rounds because the convention mirrors per side and I had
# only ever measured the left. So each bone is PROBED: rotate it, look at
# where the child actually went, keep the axis and sign that moved it the way
# the animation needs. The probe is the spec; the number it returns is not my
# opinion about the rig.
# ═══════════════════════════════════════════════════════════════════════════
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, "rig-dragon.py")).read())

sc = bpy.context.scene
sc.render.fps = 24
for pb in arm.pose.bones:
    pb.rotation_mode = "XYZ"

_dg = bpy.context.evaluated_depsgraph_get()

def _world(bone, use_tail=True):
    _dg.update()
    pb = arm.pose.bones[bone]
    return (arm.matrix_world @ (pb.tail if use_tail else pb.head)).copy()


def axis_for(bone, watch, score, use_tail=True, deg=22.0):
    """Which local axis and sign moves `watch` the way `score` rewards?

    Tries all six, keeps the winner. `score` takes the world-space delta of
    the watched point and returns a number to maximise."""
    pb = arm.pose.bones[bone]
    rest = pb.rotation_euler.copy()
    base = _world(watch, use_tail)
    best, pick = -1e18, (0, 1.0)
    for ax in range(3):
        for sg in (1.0, -1.0):
            e = [0.0, 0.0, 0.0]
            e[ax] = math.radians(deg) * sg
            pb.rotation_euler = Euler(e, "XYZ")
            v = score(_world(watch, use_tail) - base)
            if v > best:
                best, pick = v, (ax, sg)
    pb.rotation_euler = rest
    _dg.update()
    return pick


def rot(bone, axis_sign, radians, extra=None):
    ax, sg = axis_sign
    e = [0.0, 0.0, 0.0] if extra is None else list(extra)
    e[ax] += radians * sg
    arm.pose.bones[bone].rotation_euler = Euler(e, "XYZ")


def key(bone):
    arm.pose.bones[bone].keyframe_insert("rotation_euler", frame=F)


# ── THE PROBES ──────────────────────────────────────────────────────────────
UP = lambda d: d.z                       # raise it
DOWN = lambda d: -d.z                    # drop it
BACK = lambda d: d.y                     # toward the tail (+Y is behind)
FWD = lambda d: -d.y                     # toward the snout
OUTL = lambda d: d.x                     # toward the dragon's left

WING = {}
for sd in ("l", "r"):
    WING[sd] = {
        "arm": axis_for("wing_%s_01" % sd, "wing_%s_03" % sd, UP),
        "fore": axis_for("wing_%s_02" % sd, "wing_%s_03" % sd, UP),
        "hand": axis_for("wing_%s_03" % sd, "spar1_%s_02" % sd, UP),
        # The fingers curl the membrane in; measured toward the body, not up.
        "curl": axis_for("spar1_%s_01" % sd, "spar1_%s_02" % sd,
                         (lambda d, s=sd: -d.x if s == "l" else d.x)),
    }

def axis_toward(bone, watch, target, use_tail=True, deg=22.0):
    """Which axis and sign moves `watch` TOWARD a fixed point?

    ⚠️ FOLDING IS NOT A DIRECTION, SO axis_for CANNOT EXPRESS IT. A folded
    wing is a Z: the forearm comes back over the upper arm and the hand back
    over the forearm. "Up" was the best any fixed direction could do for that,
    and it produced an idle with both wings fanned straight into the air like
    antlers. Score the delta by how much of it points at the joint the limb
    has to close onto instead."""
    base = _world(watch, use_tail)
    want = (Vector(target) - base)
    if want.length < 1e-6:
        return (0, 1.0)
    want.normalize()
    return axis_for(bone, watch, lambda d: d.dot(want), use_tail, deg)


# Where each wing segment closes onto when the wing folds against the back.
for sd in ("l", "r"):
    _root = _world("wing_%s_01" % sd, False)
    _elbow = _world("wing_%s_02" % sd, False)
    WING[sd]["fold_fore"] = axis_toward("wing_%s_02" % sd, "wing_%s_03" % sd, _root)
    WING[sd]["fold_hand"] = axis_toward("wing_%s_03" % sd, "spar1_%s_02" % sd, _elbow)
    WING[sd]["fold_spar"] = axis_toward("spar1_%s_01" % sd, "spar1_%s_02" % sd, _elbow)

# The folded resting wing, and how far each joint opens from it. Everything
# grounded blends against these, so Idle and Roar cannot disagree about where
# a closed wing is.
# ⚠️ DO NOT FOLD IT ALL THE WAY. Linear blend skinning has no cloth in it:
# past about 110 degrees at the wrist the membrane stops folding and starts
# crumpling, and the resting dragon grew a vertical blob over its shoulder.
# Games that show a tightly furled wing model that state separately. This is
# a half-furled rest -- held up, partly closed, drooping.
FOLD = {"arm": 10.0, "fore": 74.0, "hand": 62.0, "spar": 34.0}
JAW = axis_for("jaw_01", "jaw_02", DOWN)
HEAD_UP = axis_for("head_01", "head_03", UP)
NECK_UP = [axis_for("neck_%02d" % n, "neck_04", UP) for n in (1, 2, 3)]
NECK_SIDE = [axis_for("neck_%02d" % n, "neck_04", OUTL) for n in (1, 2, 3)]
TAIL_UP = [axis_for("tail_%02d" % n, "tail_01", UP) for n in (7, 6, 5, 4, 3, 2)]
TAIL_SIDE = [axis_for("tail_%02d" % n, "tail_01", OUTL) for n in (7, 6, 5, 4, 3, 2)]
SPINE_UP = axis_for("spine_03", "spine_04", UP)
LEG = {}
for kind in ("fore", "hind"):
    for sd in ("l", "r"):
        LEG[kind, sd] = {
            "swing": axis_for("%s_%s_01" % (kind, sd), "%s_%s_04" % (kind, sd), FWD),
            "knee": axis_for("%s_%s_02" % (kind, sd), "%s_%s_04" % (kind, sd), BACK),
            "ankle": axis_for("%s_%s_03" % (kind, sd), "%s_%s_04" % (kind, sd), FWD),
        }
print("PROBES done: wing arm axis %s, jaw %s" % (WING["l"]["arm"], JAW))

HELD = []


def stash(name, end, loop=True):
    act = arm.animation_data.action
    act.name = name
    act.use_fake_user = True
    if loop:
        for fc in act.fcurves:
            v1 = next((k.co[1] for k in fc.keyframe_points if abs(k.co[0] - 1) < 0.01), None)
            if v1 is not None:
                fc.keyframe_points.insert(end + 1, v1, options={"FAST"})
        act.fcurves.update()
    for fc in act.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = "BEZIER"
    arm.animation_data.action = None
    HELD.append((name, end))
    print("CLIP %-6s %2d frames, %d curves" % (name, end, len(act.fcurves)))


def fresh():
    if arm.animation_data:
        arm.animation_data.action = None
    arm.animation_data_clear()
    for pb in arm.pose.bones:
        pb.rotation_euler = Euler((0, 0, 0), "XYZ")
        pb.location = (0, 0, 0)
    arm.location = (0, 0, 0)


def wave(chain_axes, prefix, nums, amp, phase, speed=1.0, decay=1.0):
    """Push a travelling sine down a chain. Each link lags the one before it,
    which is the whole of why a tail reads as a tail and not a rod."""
    a = amp
    for i, n in enumerate(nums):
        rot("%s_%02d" % (prefix, n), chain_axes[i], a * math.sin(phase - i * 0.55 * speed))
        key("%s_%02d" % (prefix, n))
        a *= decay


# ═══════════════════════════════════════════════════════════════════════════
# FLY -- 24 frames. The signature move, and the one that proves the wing
# chain. Real flapping is ASYMMETRIC: the downstroke is the power stroke and
# takes longer than the recovery, so a plain sine reads as a flag in wind.
# The forearm and hand LAG the upper arm, the body rises a beat AFTER the
# downstroke (lift arrives late), and the fingers curl on the recovery to
# spill air.
# ═══════════════════════════════════════════════════════════════════════════
FLY = 24
# The rest wing is folded up off the back; ARM_BASE swings it down to level so
# the stroke is centred on horizontal instead of living in its top half.
ARM_BASE, ARM_AMP = -42.0, 26.0
AIRBORNE = 2.30          # measured: at 1.45 the wingtips passed 0.79 BELOW
                         # the floor on the downstroke. 2.30 clears it.
fresh()
for F in range(1, FLY + 1):
    u = (F - 1) / FLY

    def stroke(off):
        """0 at the top of the upstroke, 1 at the bottom. Power stroke uses
        60% of the cycle; the recovery snaps back in the other 40%."""
        p = (u + off) % 1.0
        return (0.5 - 0.5 * math.cos(math.pi * (p / 0.60 if p < 0.60
                                                else 1 + (p - 0.60) / 0.40)))

    s0, s1, s2 = stroke(0.0), stroke(-0.055), stroke(-0.11)
    for sd in ("l", "r"):
        W = WING[sd]
        # ⚠️ AMPLITUDES COMPOUND DOWN THE CHAIN. The first pass used 84, 48
        # and 40 degrees on arm, forearm and hand, which sounds moderate and
        # is not: they stack, and the spars are three units long, so the tip
        # swept about 170 degrees. The downstroke drove both wings through
        # the floor and swallowed the whole animal. The arm is also BASED
        # off level, not off the rest pose -- the rest wing is folded up at
        # 56 degrees, so oscillating around zero only ever flaps the top half
        # of the stroke.
        rot("wing_%s_01" % sd, W["arm"], math.radians(ARM_BASE + ARM_AMP * (0.5 - s0) * 2))
        rot("wing_%s_02" % sd, W["fold_fore"], math.radians(12 - 10 * (0.5 - s1) * 2))
        rot("wing_%s_03" % sd, W["fold_hand"], math.radians(10 - 8 * (0.5 - s2) * 2))
        for b in ("wing_%s_01" % sd, "wing_%s_02" % sd, "wing_%s_03" % sd):
            key(b)
        # Fingers spread on the power stroke, curl in on the recovery.
        curl = math.radians(13) * max(0.0, math.cos(2 * math.pi * (u + 0.25)))
        for k in range(1, 5):
            rot("spar%d_%s_01" % (k, sd), W["fold_spar"], curl * (0.4 + 0.2 * k))
            key("spar%d_%s_01" % (k, sd))

    # Lift arrives after the wing has already pushed: the body rises LATE.
    arm.location.z = AIRBORNE + 0.22 * math.sin(2 * math.pi * (u - 0.18))
    arm.location.y = 0.06 * math.sin(2 * math.pi * (u - 0.30))
    arm.keyframe_insert("location", frame=F)
    rot("spine_03", SPINE_UP, math.radians(4.0) * math.sin(2 * math.pi * (u - 0.22)))
    key("spine_03")

    # Neck holds the head steady against the body's bob -- animals stabilise
    # the head, they do not let it ride the chest.
    ph = 2 * math.pi * (u - 0.18)
    for i, n in enumerate((1, 2, 3)):
        rot("neck_%02d" % n, NECK_UP[i], math.radians(-3.2) * math.sin(ph))
        key("neck_%02d" % n)
    rot("head_01", HEAD_UP, math.radians(3.0) * math.sin(ph) + math.radians(4))
    key("head_01")
    wave(TAIL_UP, "tail", (7, 6, 5, 4, 3, 2), math.radians(7.5),
         2 * math.pi * u, decay=0.93)
    # Legs trail, tucked.
    for kind, tuck in (("fore", 38), ("hind", 30)):
        for sd in ("l", "r"):
            L = LEG[kind, sd]
            rot("%s_%s_01" % (kind, sd), L["swing"], math.radians(-tuck * 0.5))
            rot("%s_%s_02" % (kind, sd), L["knee"], math.radians(tuck))
            rot("%s_%s_03" % (kind, sd), L["ankle"], math.radians(tuck * 0.5))
            for j in (1, 2, 3):
                key("%s_%s_%02d" % (kind, sd, j))
stash("Fly", FLY)


# ═══════════════════════════════════════════════════════════════════════════
# IDLE -- 72 frames, grounded. Nothing in it is large; the job is to not be a
# statue. Breath through the ribs, the head drifting off the breath rather
# than on it, the wings settling, the tail with a slow wander that is NOT the
# same period as the breath -- two cycles of the same length read as a
# machine.
# ═══════════════════════════════════════════════════════════════════════════
IDLE = 72
fresh()
for F in range(1, IDLE + 1):
    u = (F - 1) / IDLE
    br = math.sin(2 * math.pi * u)                 # breath
    dr = math.sin(2 * math.pi * u * 0.5 + 1.1)     # a slower wander

    arm.location.z = 0.09 + 0.018 * br
    arm.keyframe_insert("location", frame=F)
    rot("spine_03", SPINE_UP, math.radians(1.5) * br)
    key("spine_03")

    for i, n in enumerate((1, 2, 3)):
        rot("neck_%02d" % n, NECK_UP[i], math.radians(-1.8) * math.sin(2 * math.pi * u - 0.7),
            extra=None)
        key("neck_%02d" % n)
        rot("neck_%02d" % n, NECK_SIDE[i], math.radians(2.6) * dr)
        key("neck_%02d" % n)
    rot("head_01", HEAD_UP, math.radians(2.4) * math.sin(2 * math.pi * u - 1.3))
    key("head_01")

    for sd in ("l", "r"):
        W = WING[sd]
        rot("wing_%s_01" % sd, W["arm"], math.radians(FOLD["arm"] + 1.6 * br))
        rot("wing_%s_02" % sd, W["fold_fore"], math.radians(FOLD["fore"] - 1.4 * br))
        rot("wing_%s_03" % sd, W["fold_hand"], math.radians(FOLD["hand"] - 1.0 * br))
        for b in ("wing_%s_01" % sd, "wing_%s_02" % sd, "wing_%s_03" % sd):
            key(b)
        for k in range(1, 5):
            rot("spar%d_%s_01" % (k, sd), W["fold_spar"], math.radians(FOLD["spar"] - 1.2 * br))
            key("spar%d_%s_01" % (k, sd))

    wave(TAIL_SIDE, "tail", (7, 6, 5, 4, 3, 2), math.radians(6.0),
         2 * math.pi * u * 0.5, decay=0.95)
stash("Idle", IDLE)


# ═══════════════════════════════════════════════════════════════════════════
# ROAR -- 34 frames, a ONE-SHOT. Built to the same rules as the hero's hit
# reaction, because it is the same problem: a beat the player has to feel.
#
#   ANTICIPATION  frames 1-9, the head draws BACK and down and the wings fold
#                 in. Everything goes the wrong way first; without that the
#                 roar has nowhere to come from.
#   ATTACK        frame 12, head thrown forward and up, jaw wide, wings
#                 snapped open. LINEAR into it -- easing the attack frame is
#                 exactly how you kill it.
#   SUSTAIN       13-24, held with a tremor, the tail lashing.
#   RELEASE       25-34, settles back to where Idle starts so it can hand off.
# ═══════════════════════════════════════════════════════════════════════════
ROAR = 34
fresh()
BEATS = [(1, 0.0), (9, -0.55), (12, 1.0), (16, 0.86), (24, 0.78), (30, -0.08), (34, 0.0)]


def beat(f):
    for i in range(len(BEATS) - 1):
        f0, v0 = BEATS[i]
        f1, v1 = BEATS[i + 1]
        if f0 <= f <= f1:
            t = (f - f0) / max(1, f1 - f0)
            if i == 1:
                return v0 + (v1 - v0) * t          # LINEAR into the attack
            return v0 + (v1 - v0) * (t * t * (3 - 2 * t))
    return BEATS[-1][1]


for F in range(1, ROAR + 1):
    k = beat(F)
    trem = math.sin(F * 1.9) * max(0.0, min(1.0, (F - 12) / 4.0)) * max(0.0, 1 - (F - 12) / 20.0)

    arm.location.z = 0.09 + 0.10 * max(0.0, k)
    arm.location.y = -0.14 * k
    arm.keyframe_insert("location", frame=F)
    rot("spine_03", SPINE_UP, math.radians(7) * k)
    key("spine_03")

    # ⚠️ THE SAME ANGLE ON EVERY LINK OF A CHAIN IS A CURL, NOT A LIFT. The
    # first pass gave all three neck bones 17 degrees and the head 21. That
    # is 72 degrees of cumulative bend: the neck rolled over past vertical
    # and delivered the head pointing at the FLOOR on the frame of the roar.
    # Pitch from the BASE and taper to nothing, and the head arrives up and
    # still in line with the neck.
    for i, (n, amt) in enumerate(zip((1, 2, 3), (17.0, 8.0, 2.0))):
        rot("neck_%02d" % n, NECK_UP[i], math.radians(amt + 0.8 * trem) * k)
        key("neck_%02d" % n)
    rot("head_01", HEAD_UP, math.radians(11 + 3.0 * trem) * k)
    key("head_01")
    rot("jaw_01", JAW, math.radians(34) * max(0.0, k) + math.radians(2.5) * trem)
    key("jaw_01")
    rot("jaw_02", JAW, math.radians(10) * max(0.0, k))
    key("jaw_02")

    for sd in ("l", "r"):
        W = WING[sd]
        # Starts from the Idle fold and SPREADS. The first pass added 54
        # degrees to the arm at the peak, which folds it further up the back:
        # the threat display ended with the wings tighter shut than it began.
        # Spreading is what the display IS.
        # A grounded display MANTLES: the shoulder stays high and the elbow
        # and wrist STRAIGHTEN out of the fold. Spreading by dropping the
        # shoulder instead just drapes both wings on the floor -- the
        # shoulder is only 1.6 up and the wing is three units long.
        op = max(0.0, k)                      # anticipation closes, it does
        sh = min(0.0, k)                      # not open
        rot("wing_%s_01" % sd, W["arm"], math.radians(FOLD["arm"] + 34 * op + 10 * sh))
        rot("wing_%s_02" % sd, W["fold_fore"], math.radians(FOLD["fore"] * (1 - 0.86 * op) - 9 * sh))
        rot("wing_%s_03" % sd, W["fold_hand"], math.radians(FOLD["hand"] * (1 - 0.88 * op) - 8 * sh))
        for b in ("wing_%s_01" % sd, "wing_%s_02" % sd, "wing_%s_03" % sd):
            key(b)
        for n in range(1, 5):
            rot("spar%d_%s_01" % (n, sd), W["fold_spar"], math.radians(FOLD["spar"] * (1 - 0.92 * op)))
            key("spar%d_%s_01" % (n, sd))

    wave(TAIL_SIDE, "tail", (7, 6, 5, 4, 3, 2), math.radians(13) * abs(k),
         F * 0.42, decay=0.94)
stash("Roar", ROAR, loop=False)
# The attack frame must not be eased into from the anticipation.
_ra = bpy.data.actions["Roar"]
for fc in _ra.fcurves:
    for kp in fc.keyframe_points:
        if 9 <= kp.co[0] <= 12:
            kp.interpolation = "LINEAR"

for pb in arm.pose.bones:
    pb.rotation_euler = Euler((0, 0, 0), "XYZ")
arm.location = (0, 0, 0)
print("CLIPS_READY %s" % ", ".join(n for n, _ in HELD))
