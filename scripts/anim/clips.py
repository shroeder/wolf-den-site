# ═══════════════════════════════════════════════════════════════════════════
# CLIP LIBRARY
#
# Each function writes keyframes for ONE clip onto a rig that already exists.
# They assume build-walk.py has run and left the hero, the shield, the leg IK
# and the guard IK in globals -- these are keying routines, not builders.
#
# Everything positional is driven through the IK targets in WORLD space.
# Every joint angle typed by hand in this project has been wrong at least
# once, because the sign convention mirrors per side; a position has no
# handedness.
# ═══════════════════════════════════════════════════════════════════════════
import bpy, os, math
from mathutils import Vector, Euler, Matrix, Quaternion

G = {}

def init(g):
    """Capture the globals build-walk.py left behind."""
    G.clear()
    G.update(g)


def _ctx():
    g = G
    return (g["arm"], g["ik_targets"], g["_hand_goal"], g["_elbow_pole"],
            g["LEG"], g["FLOOR"], g["ANKLE_H"], g["HIP0"], g["FWD"],
            g["FOOT_REST"], g["TUCK_SIGN"], g["ARM_SIGN"], g["ARM_TUCK"],
            g["SHIELD_ARM"], g["_grip"], g["HAND_REST_Q"])


def _fresh_action(name):
    arm = G["arm"]
    for ob in [arm] + list(G["helpers"]):
        if ob.animation_data and ob.animation_data.action:
            ob.animation_data.action = None
        ob.animation_data_clear()
    return name


def _elbow_axis(side):
    """Which local axis and sign FOLDS this elbow?

    ⚠️ DO NOT REUSE ARM_SIGN FOR THIS. ARM_SIGN was probed on the UPPERARM,
    for the question "which way swings the hand forward" -- a different bone
    and a different question. Driving the forearm's local X with it bends
    nothing on this rig; at the walk's -14 degrees that is invisible, and at
    a run's -90 it produced a straight arm with a splayed hand reaching out
    in front, which reads as a man hailing a cab.
    
    The test that means "elbow" is whether the HAND comes closer to the
    SHOULDER. That has one answer and no handedness."""
    a = G["arm"]
    pb = a.pose.bones["lowerarm_%s" % side]
    sh = a.pose.bones["upperarm_%s" % side]
    rest = pb.rotation_euler.copy()

    def reach():
        bpy.context.view_layer.update()
        return ((a.matrix_world @ a.pose.bones["hand_%s" % side].tail)
                - (a.matrix_world @ sh.head)).length

    pb.rotation_euler = Euler((0, 0, 0), "XYZ")
    best, pick = reach(), (0, 1.0)
    for ax in range(3):
        for sg in (1.0, -1.0):
            e = [0.0, 0.0, 0.0]
            e[ax] = math.radians(45) * sg
            pb.rotation_euler = Euler(e, "XYZ")
            d = reach()
            if d < best:
                best, pick = d, (ax, sg)
    pb.rotation_euler = rest
    bpy.context.view_layer.update()
    return pick


def _smooth(ob_list):
    for ob in ob_list:
        if ob.animation_data and ob.animation_data.action:
            for fc in ob.animation_data.action.fcurves:
                for kp in fc.keyframe_points:
                    kp.interpolation = "BEZIER"


# ───────────────────────────────────────────────────────────────────────────
def key_idle(frames=48):
    """Relaxed stand. Feet under the hips, weight rocking, ribs breathing,
    shield resting low at the side. The baseline every other clip blends
    out of, so it deliberately has NO attitude."""
    arm, iks, hand_goal, elbow_pole, LEG, FLOOR, ANKLE_H, HIP0, FWD, FOOT_REST, \
        TUCK, ARMS, TUCKAMT, SA, GRIP, HQ = _ctx()
    _fresh_action("Idle")
    side = 1 if SA == "l" else -1
    for f in range(1, frames + 2):
        t = (f - 1) / frames
        rock = math.sin(2 * math.pi * t)
        rise = math.sin(2 * math.pi * t + math.pi / 2)

        arm.location.z = (FLOOR + LEG * 0.985 + 0.006 * LEG * rise) - HIP0
        arm.location.x = 0.008 * LEG * rock
        arm.keyframe_insert("location", frame=f)

        pb = arm.pose.bones["pelvis"]
        pb.rotation_euler = Euler((0, math.radians(-1.6 * rock), 0), "XYZ")
        pb.keyframe_insert("rotation_euler", frame=f)
        for bn, amt in (("spine_02", 1.1), ("spine_03", 0.8)):
            b = arm.pose.bones.get(bn)
            if b:
                b.rotation_euler = Euler((math.radians(amt * rise * 0.6), 0, 0), "XYZ")
                b.keyframe_insert("rotation_euler", frame=f)
        hb = arm.pose.bones.get("head")
        if hb:
            hb.rotation_euler = Euler((math.radians(1.5 * rock), 0, math.radians(2.0 * rock)), "XYZ")
            hb.keyframe_insert("rotation_euler", frame=f)

        for s, sx in ((SA, side), ("r" if SA == "l" else "l", -side)):
            tgt, pole = iks[s]
            # Wider than the hip joints, or the thighs press together.
            tgt.location = (sx * 0.165 * LEG, 0.0, FLOOR + ANKLE_H)
            tgt.keyframe_insert("location", frame=f)
            tgt.rotation_quaternion = Quaternion((0, 0, 1), math.radians(8.0 * sx)) @ FOOT_REST[s]
            tgt.keyframe_insert("rotation_quaternion", frame=f)
            # 0.30 of a leg is where the knee tracks straight; see KNEE_POLE.
            pole.location = (sx * 0.305 * LEG, FWD * 0.40 * LEG, FLOOR + LEG * 0.52)
            pole.keyframe_insert("location", frame=f)

        # Shield hangs low and relaxed at the side.
        hand_goal.location = (side * 0.30 * LEG, FWD * 0.06 * LEG,
                              FLOOR + LEG * 0.62 + 0.008 * LEG * rise)
        hand_goal.keyframe_insert("location", frame=f)
        elbow_pole.location = (side * 0.46 * LEG, 0.30 * LEG, FLOOR + LEG * 0.62)
        elbow_pole.keyframe_insert("location", frame=f)
        # Hanging at the side, face outward, drifting a couple of degrees.
        GRIP.rotation_quaternion = (Quaternion((0, 1, 0), math.radians(-8 + 2.5 * rock))
                                    @ Quaternion((1, 0, 0), math.radians(3))
                                    @ HQ)
        GRIP.keyframe_insert("rotation_quaternion", frame=f)

        free = "r" if SA == "l" else "l"
        ab = arm.pose.bones["upperarm_%s" % free]
        (ax, sg), _b, _c = TUCK[free]
        e = [math.radians(2.5 * rock * ARMS[free]), 0.0, 0.0]
        e[ax] += math.radians(TUCKAMT * sg)
        ab.rotation_euler = Euler(e, "XYZ")
        ab.keyframe_insert("rotation_euler", frame=f)
        lb = arm.pose.bones["lowerarm_%s" % free]
        lb.rotation_euler = Euler((math.radians((-12 - 2 * rock) * ARMS[free]), 0, 0), "XYZ")
        lb.keyframe_insert("rotation_euler", frame=f)

    _smooth([arm] + list(G["helpers"]))
    return frames


# ───────────────────────────────────────────────────────────────────────────
def key_impact(frames=26):
    """A ONE-SHOT. The shield takes a hit.

    This is the clip that proves blending and cancels, so it is built the way
    a game hit-reaction is: a hard CONTACT on frame 3 with no ease-in (an
    impact that eases in has no impact), the body driven BACK and DOWN as it
    absorbs, then a push back to guard with a small overshoot. It does not
    loop -- it ends on the brace pose so it can hand back cleanly."""
    arm, iks, hand_goal, elbow_pole, LEG, FLOOR, ANKLE_H, HIP0, FWD, FOOT_REST, \
        TUCK, ARMS, TUCKAMT, SA, GRIP, HQ = _ctx()
    _fresh_action("Impact")
    side = 1 if SA == "l" else -1
    TURN = math.radians(-24 * side)

    # (frame, drive-back 0..1) -- 3 is the hit, then absorb, recover, settle.
    BEATS = [(1, 0.00), (3, 1.00), (7, 0.72), (12, 0.26), (17, -0.10), (22, 0.03), (26, 0.00)]

    def at(f):
        for i in range(len(BEATS) - 1):
            f0, v0 = BEATS[i]
            f1, v1 = BEATS[i + 1]
            if f0 <= f <= f1:
                u = (f - f0) / max(1, (f1 - f0))
                if i == 0:
                    return v0 + (v1 - v0) * u               # LINEAR into the hit
                u = u * u * (3 - 2 * u)                      # eased after it
                return v0 + (v1 - v0) * u
        return BEATS[-1][1]

    for f in range(1, frames + 1):
        k = at(f)
        arm.location.z = (FLOOR + LEG * (0.845 - 0.055 * k)) - HIP0
        arm.location.y = 0.085 * LEG * k                     # driven backward
        arm.location.x = side * 0.012 * LEG * k
        arm.keyframe_insert("location", frame=f)

        pb = arm.pose.bones["pelvis"]
        pb.rotation_euler = Euler((math.radians(6 + 5 * k), 0, TURN * 0.45), "XYZ")
        pb.keyframe_insert("rotation_euler", frame=f)
        for bn, tf, lean in (("spine_01", 0.22, 3.2), ("spine_02", 0.26, 3.6), ("spine_03", 0.20, 2.4)):
            b = arm.pose.bones.get(bn)
            if b:
                b.rotation_euler = Euler((math.radians(lean + 7.0 * k), 0, TURN * tf), "XYZ")
                b.keyframe_insert("rotation_euler", frame=f)
        hb = arm.pose.bones.get("head")
        if hb:
            hb.rotation_euler = Euler((math.radians(9 + 11 * k), 0, -TURN * 0.34), "XYZ")
            hb.keyframe_insert("rotation_euler", frame=f)

        LEAD_Y, REAR_Y = FWD * 0.26 * LEG, -FWD * 0.34 * LEG
        for s, (fx, fy) in ((SA, (side * 0.26 * LEG, LEAD_Y)),
                            ("r" if SA == "l" else "l", (-side * 0.30 * LEG, REAR_Y))):
            tgt, pole = iks[s]
            # The lead foot SKIDS back a little under the blow. The rear foot
            # is the strut and does not move -- that contrast sells the force.
            skid = (0.05 * LEG * k) if s == SA else 0.0
            tgt.location = (fx, fy + skid, FLOOR + ANKLE_H)
            tgt.keyframe_insert("location", frame=f)
            tgt.rotation_quaternion = FOOT_REST[s]
            tgt.keyframe_insert("rotation_quaternion", frame=f)
            pole.location = (fx * 1.15, fy + FWD * 0.40 * LEG, FLOOR + LEG * 0.50)
            pole.keyframe_insert("location", frame=f)

        # ⚠️ THE ABSORB USED TO PULL THE HAND INTO HIS CHEST. At full drive-back
        # the forward offset collapsed to 0.19 LEG while the body was also
        # travelling backward, and qa.py measures the guard hand 0.03 INSIDE
        # the torso surface at f3 -- the frame of the hit, the one frame
        # anybody looks at. 0.03 keeps a visible absorb and clears the ribs with
        # margin; 0.07 cleared them by only 0.01 against a 0.02 limit.
        hand_goal.location = (side * 0.02 * LEG,
                              FWD * (0.32 - 0.03 * k) * LEG,
                              FLOOR + LEG * (1.16 - 0.03 * k))
        hand_goal.keyframe_insert("location", frame=f)
        elbow_pole.location = (side * 0.30 * LEG, 0.40 * LEG, FLOOR + LEG * 0.76)
        elbow_pole.keyframe_insert("location", frame=f)
        GRIP.rotation_quaternion = (Quaternion((0, 1, 0), math.radians(-20 * side))
                                    @ Quaternion((1, 0, 0), math.radians(10 + 6 * k))
                                    @ Quaternion((0, 0, 1), math.radians(-12 * side))
                                    @ HQ)
        GRIP.keyframe_insert("rotation_quaternion", frame=f)

        free = "r" if SA == "l" else "l"
        ab = arm.pose.bones["upperarm_%s" % free]
        (ax, sg), _b, _c = TUCK[free]
        e = [math.radians((-26 - 14 * k) * ARMS[free]), 0.0, 0.0]
        e[ax] += math.radians((TUCKAMT - 9) * sg)
        ab.rotation_euler = Euler(e, "XYZ")
        ab.keyframe_insert("rotation_euler", frame=f)
        lb = arm.pose.bones["lowerarm_%s" % free]
        lb.rotation_euler = Euler((math.radians((-48 - 10 * k) * ARMS[free]), 0, 0), "XYZ")
        lb.keyframe_insert("rotation_euler", frame=f)

    _smooth([arm] + list(G["helpers"]))
    # ⚠️ NO EASE INTO THE HIT. Frames 1-3 stay linear so contact lands hard;
    # Bezier smoothing across them would soften exactly the frame that matters.
    for ob in [arm] + list(G["helpers"]):
        if ob.animation_data and ob.animation_data.action:
            for fc in ob.animation_data.action.fcurves:
                for kp in fc.keyframe_points:
                    if kp.co[0] <= 3:
                        kp.interpolation = "LINEAR"
    return frames


# ───────────────────────────────────────────────────────────────────────────
def key_run(frames=16):
    """A RUN. Not a fast walk -- the difference is structural.

    A walk always has a foot down: the two stances overlap, which is why the
    hips are HIGHEST at mid-stance (the planted leg is at its straightest)
    and why build-walk.py can solve hip height from whichever foot is
    planted. A run has a DUTY FACTOR BELOW 0.5, so each stance ends before
    the other begins and the body is airborne twice per cycle. Everything
    follows from that:

      BALLISTIC   there is no planted foot during flight, so nothing
                  constrains hip height and it has to be authored. The bob
                  INVERTS relative to a walk -- lowest at mid-stance, where
                  the leg compresses under the load, highest at the apex of
                  the flight. Getting that upside down is the single thing
                  that makes a run read as a bouncy walk.
      REACH       during stance the authored height is still clamped by what
                  the planted leg can reach, so the knee never snaps
                  straight through.
      LEAN        you fall forwards and catch yourself. A vertical run reads
                  as jogging on the spot.
      ARMS        bent near ninety degrees and driven hard. A runner with
                  straight swinging arms reads as a man chasing a bus.
    """
    arm, iks, hand_goal, elbow_pole, LEG, FLOOR, ANKLE_H, HIP0, FWD, FOOT_REST, \
        TUCK, ARMS, TUCKAMT, SA, GRIP, HQ = _ctx()
    _fresh_action("Run")
    side = 1 if SA == "l" else -1
    G_ = G

    # ⚠️ A LONG CONTACT SPLIT IS NOT WHERE A RUN'S SPEED COMES FROM, AND
    # REACHING FOR ONE PUTS THE CHARACTER IN A PERMANENT SQUAT. At a split of
    # 1.00 x leg the planted leg has to span sqrt(hip^2 + 0.5^2), which is
    # longer than the leg -- so the reach clamp below drags the hips down and
    # HOLDS them there. Measured: 83.8% of leg length against the walk's 103%.
    # Real running form lands the foot close under the body; the ground comes
    # from the flight phase and from cadence, not from reaching forward. A
    # shorter split and a shorter stance buy the same speed standing up.
    DUTY = 0.26               # fraction of the cycle a foot is down. < 0.5 IS the run
    STRIDE = 0.76 * LEG       # contact split -- see above
    LIFT = 0.190 * LEG        # the swinging foot comes up hard
    # ⚠️ HIP HEIGHT IS AN ABSOLUTE Z AND LEG IS A LENGTH. `BASE = 0.945 * LEG`
    # reads like "94.5% of leg extension" and is not: the value is compared
    # against world Z, where a straight leg puts the hip at
    # FLOOR + ANKLE_H + LEG. Leaving those two terms out dropped every hip
    # sample by 0.089 units -- 8.4% of a leg -- which is the entire squat.
    # The reach clamp below was never even binding; it was being handed a
    # number already lower than anything it would have enforced.
    BASE = FLOOR + ANKLE_H + 0.945 * LEG
    BOB = 0.030 * LEG
    LEAN = 13.0               # degrees of forward pitch through the spine
    TRACK = G_["TRACK"]
    REACH = G_["REACH"]
    free_side = "r" if SA == "l" else "l"
    ELBOW = _elbow_axis(free_side)
    print("RUN elbow axis %d sign %+.0f" % ELBOW)

    def foot(p):
        """Ankle Y and Z at `p` through this foot's own cycle."""
        p %= 1.0
        if p < DUTY:                                   # STANCE: planted, no slide
            t = p / DUTY
            return FWD * (STRIDE / 2) * (1 - 2 * t), ANKLE_H
        t = (p - DUTY) / (1 - DUTY)                    # FLIGHT: recover and reach
        y = FWD * (STRIDE / 2) * (-1 + 2 * G_["ease"](t))
        return y, ANKLE_H + LIFT * math.sin(math.pi * t) ** 0.75

    for f in range(1, frames + 2):
        i = (f - 1) % frames
        pl = i / frames
        pr = pl + 0.5
        fy_l, fz_l = foot(pl)
        fy_r, fz_r = foot(pr)
        down_l = (pl % 1.0) < DUTY
        down_r = (pr % 1.0) < DUTY

        # ── HEIGHT ── authored bob at twice cycle rate, lowest at mid-stance.
        # cos(4*pi*p) is +1 at p=0 and p=0.5, which are the two CONTACTS, and
        # -1 at the two mid-flights; mid-stance sits at DUTY/2 past each
        # contact, so the phase is shifted to put the trough there.
        # ⚠️ AND THE PHASE HAD AN EXTRA PI IN IT, SO IT DID THE WALK'S BOB.
        # cos(0) = 1 at mid-stance, so `BASE - BOB*cos(...)` puts the trough
        # exactly there, which is what the comment above says and what a run
        # does. The `+ pi` flipped it: hips PEAKED under the load and dipped
        # in the air, which is a walk, and is precisely the mistake the
        # docstring warns about. Written and then not done.
        hip = BASE - BOB * math.cos(4 * math.pi * (pl - DUTY / 2))
        for (fy, fz, dn) in ((fy_l, fz_l, down_l), (fy_r, fz_r, down_r)):
            if dn:
                span = (LEG * REACH) ** 2 - fy ** 2
                hip = min(hip, FLOOR + fz + math.sqrt(max(span, 0.01)))
        arm.location.z = hip - HIP0
        arm.location.x = 0.010 * LEG * math.sin(2 * math.pi * pl)
        arm.keyframe_insert("location", frame=f)

        # ── LEAN ── spread down the spine so it is a curve, not a hinge.
        pb = arm.pose.bones["pelvis"]
        pb.rotation_euler = Euler((math.radians(LEAN * 0.22), 0, 0), "XYZ")
        pb.keyframe_insert("rotation_euler", frame=f)
        for bn, k in (("spine_01", 0.30), ("spine_02", 0.34), ("spine_03", 0.26)):
            b = arm.pose.bones.get(bn)
            if b:
                b.rotation_euler = Euler((math.radians(LEAN * k), 0, 0), "XYZ")
                b.keyframe_insert("rotation_euler", frame=f)
        # The head stays level: a runner looks where he is going, so the neck
        # pays back most of what the spine just took.
        for bn, k in (("neck_01", -0.42), ("head", -0.34)):
            b = arm.pose.bones.get(bn)
            if b:
                b.rotation_euler = Euler((math.radians(LEAN * k), 0, 0), "XYZ")
                b.keyframe_insert("rotation_euler", frame=f)

        for s, (fy, fz, ph) in (("l", (fy_l, fz_l, pl)), ("r", (fy_r, fz_r, pr))):
            tgt, pole = iks[s]
            sx = 1 if s == "l" else -1
            tgt.location = (sx * TRACK * LEG, fy, FLOOR + fz)
            tgt.keyframe_insert("location", frame=f)
            # Toes down through flight and at contact -- a run lands on the
            # ball, not the heel, and a flat foot in the air reads as a clog.
            pitch = 14.0 * math.sin(math.pi * min(1.0, max(0.0, ((ph % 1.0) - DUTY) / (1 - DUTY))))
            tgt.rotation_quaternion = (
                Quaternion((0, 0, 1), math.radians(G_["TOE_OUT"] * sx))
                @ Quaternion((1, 0, 0), math.radians(pitch)) @ FOOT_REST[s])
            tgt.keyframe_insert("rotation_quaternion", frame=f)
            pole.location = (sx * G_["KNEE_POLE"] * LEG, fy * 0.45 + FWD * 0.52 * LEG,
                             FLOOR + LEG * 0.52)
            pole.keyframe_insert("location", frame=f)

        # ── SHIELD ARM ── carried high and tight across the chest, pumping
        # with the stride. Keyed every frame because the goal is a world-space
        # empty; left alone it stays nailed to the room while the body runs on.
        bob = hip - BASE
        sw = math.sin(2 * math.pi * pl)
        hand_goal.location = (side * 0.13 * LEG,
                              FWD * (0.26 + 0.07 * sw) * LEG,
                              FLOOR + LEG * 0.99 + bob)
        hand_goal.keyframe_insert("location", frame=f)
        elbow_pole.location = (side * 0.40 * LEG, 0.40 * LEG, FLOOR + LEG * 0.74 + bob)
        elbow_pole.keyframe_insert("location", frame=f)
        GRIP.rotation_quaternion = (Quaternion((0, 1, 0), math.radians(-24 + 6 * sw))
                                    @ Quaternion((1, 0, 0), math.radians(14))
                                    @ HQ)
        GRIP.keyframe_insert("rotation_quaternion", frame=f)

        # ── FREE ARM ── opposite the leg on its own side, elbow locked near
        # ninety. The amplitude is more than double the walk's.
        free = "r" if SA == "l" else "l"
        ab = arm.pose.bones["upperarm_%s" % free]
        (ax, sg), _b, _c = TUCK[free]
        e = [math.radians(-42.0 * math.cos(2 * math.pi * pr) * ARMS[free]), 0.0, 0.0]
        e[ax] += math.radians((TUCKAMT - 4) * sg)
        ab.rotation_euler = Euler(e, "XYZ")
        ab.keyframe_insert("rotation_euler", frame=f)
        lb = arm.pose.bones["lowerarm_%s" % free]
        _e2 = [0.0, 0.0, 0.0]
        _e2[ELBOW[0]] = math.radians(84 + 16 * math.cos(2 * math.pi * pr)) * ELBOW[1]
        lb.rotation_euler = Euler(_e2, "XYZ")
        lb.keyframe_insert("rotation_euler", frame=f)

    _smooth([arm] + list(G["helpers"]))
    return frames


# ───────────────────────────────────────────────────────────────────────────
def _twist_from_rest(pb):
    """Roll of a bone about its own length vs rest. Same logic as qa.py.

    ⚠️ THE OPTIMISER WAS BLIND TO THE FLIP IT WAS CAUSING. This read one axis
    only, which goes degenerate at exactly the elevations where the pick arm
    passes overhead -- so the sweep scored a 180-degree shoulder flip as free
    and took it. The per-frame profile of Mine made it undeniable:

        upperarm_r  f8: 0   f9: 141   f10: 146   f11: 156   f12: 180   f13: 3

    Four frames on the wrong branch, invisible to the ruler that chose them
    and plain in the render -- arms wrapped across his chest.

    ⚠️ KEEP IN STEP WITH qa.py's twist_deg. An optimiser graded with a
    different ruler from the judge optimises for the wrong thing, and that is
    not hypothetical here: it is this exact bug.

    The one deliberate difference is what "unmeasurable" means. qa.py EXCLUDES
    such a frame -- do not report a number you cannot stand behind. Here it
    scores 180, the worst possible, because for an optimiser "I cannot verify
    this candidate" must read as risky rather than as free.
    """
    if pb.parent is None:
        return 0.0

    def roll(axis, up, ref):
        if axis.length < 1e-6:
            return None
        axis = axis.normalized()
        u = up - axis * up.dot(axis)
        r = ref - axis * ref.dot(axis)
        if u.length < 0.45 or r.length < 0.45:
            return None
        u.normalize()
        r.normalize()
        return math.degrees(math.atan2(u.cross(r).dot(axis), u.dot(r)))

    def one(k):
        now = roll(pb.tail - pb.head, pb.matrix.to_3x3() @ k,
                   pb.parent.matrix.to_3x3() @ k)
        rb, rp = pb.bone, pb.parent.bone
        rest = roll(rb.tail_local - rb.head_local,
                    rb.matrix_local.to_3x3() @ k, rp.matrix_local.to_3x3() @ k)
        if now is None or rest is None:
            return None
        return abs((now - rest + 180.0) % 360.0 - 180.0)

    a = one(Vector((0.0, 0.0, 1.0)))
    b = one(Vector((1.0, 0.0, 0.0)))
    if a is None and b is None:
        return 180.0        # unverifiable is risky, not free
    if a is None or b is None:
        return a if b is None else b
    if abs(a - b) > 30.0:
        return min(a, b)    # the artifact inflates; trust the smaller
    return max(a, b)


def key_swing(frames=48):
    """An overhand swing with NOTHING in his hands, and the weight is the point.

    Replaces the pickaxe clip. The tool is gone and with it every constraint
    that made that clip unfixable: no shaft to roll, no grip frame to seat, no
    hand welded to a mount, no point that has to reach the floor. What is kept
    is the one thing that worked -- AUTHORING IN THE SHOULDERS' FRAME.

      REACH is a fraction of arm length, so an unreachable pose is not writable.
      ELEV  is the angle of the hands about the shoulders in the body's own
            sagittal plane: 0 is straight down, 90 forward, 180 overhead. So
            "behind his back" is a bounded number, not an emergent surprise.
      LEAD  orients the fists relative to the ARM, so the invisible haft always
            continues the line of the arm and cannot windmill into his chest.
      YAW   swings the whole plane out past the side of his head, because a
            strictly sagittal lift walks the hands across his face at the apex.

    ⚠️ WEIGHT IS TIMING AND SPACING, NOT POSES. A pose sheet of this clip would
    look identical with the weight taken out, which is exactly why it is judged
    from the video. Four things carry it, and all four are in the frame numbers
    rather than in the joint angles:

      ANTICIPATION   f4-f14 is the lift and it is SLOW -- ten frames to travel
                     110 degrees. Then f14-f18 is almost still. That near-stop
                     at the top is what makes the strike read as heavy; without
                     it the arms just change direction.
      ACCELERATION   f20-f26 covers 130 degrees in six frames, and those keys
                     interpolate LINEAR so nothing eases INTO the hit. A bezier
                     there decelerates the hands just before impact, which is
                     the single most common way a swing reads as weightless.
      THE HIT        one frame. Maximum forward flex, hips at their lowest, head
                     down. The knees absorbing it -- the hip dropping 0.17 of a
                     leg length while the feet stay planted -- is the biggest
                     single weight cue in the clip.
      RECOVERY       a small rebound at f28, then a long slow settle. Returning
                     straight to the ready pose makes the whole thing feel like
                     it weighed nothing.

    ⚠️ THE HANDS ARE NOT FORCED ONTO ANYTHING. In the pickaxe clip the hand had
    to match a tool's grip frame exactly, and every degree the arm chain could
    not supply landed in the wrist -- 73 degrees of twist in a joint that has no
    twist axis. Here the orientation is CHOSEN, derived from the arm itself, so
    there is nothing for the wrist to absorb. The fists stay closed because
    build-pick already solved the fingers; he reads as gripping a haft that
    simply is not drawn.
    """
    arm, iks, hand_goal, elbow_pole, LEG, FLOOR, ANKLE_H, HIP0, FWD, FOOT_REST, \
        TUCK, ARMS, TUCKAMT, SA, GRIP, HQ = _ctx()
    g = G
    _fresh_action("Swing")

    OFF, DRV = SA, ("r" if SA == "l" else "l")
    off_goal, drv_goal = hand_goal, g["_pick_goal"]
    off_grip, drv_grip = GRIP, g["_pgrip"]
    g["_gc"].influence = 1.0
    g["_pick_ik"].influence = 1.0
    # ⚠️ DO NOT FORCE THE HAND ORIENTATION. HE IS HOLDING NOTHING.
    # A Copy Rotation says which way the hand POINTS while the IK says where
    # the wrist IS, and the wrist silently absorbs every degree of difference
    # the arm chain cannot supply. Welded to an imaginary haft at influence
    # 1.0 that cost 101 degrees of bend in a joint that manages about 80 --
    # the exact failure that made the pickaxe clip unfixable, reproduced here
    # for a tool that is not even in the scene.
    #
    # The fists stay closed because build-pick solved the fingers; letting
    # them ride the forearm is both free and correct. A grip only needs
    # forcing when something real has to stay in it.
    g["_grc"].influence = 0.0
    g["_pgc"].influence = 0.0

    ARM = 0.5 * (g["ARM_FULL"]["l"] + g["ARM_FULL"]["r"])
    REACH_MAX = 0.92
    GAP = 0.09 * LEG                 # how far apart the fists sit on the haft
    _JUMP = float(os.environ.get("POLE_JUMP") or 45.0)
    _ROLL = float(os.environ.get("SWING_ROLL") or 0.0)

    def body(dz, dy, twist, spine, head):
        arm.location = (0.0, dy * LEG, (FLOOR + LEG * 0.985 + dz * LEG) - HIP0)
        pb = arm.pose.bones["pelvis"]
        pb.rotation_euler = Euler((math.radians(spine * 0.20), 0,
                                   math.radians(twist * 0.42)), "XYZ")
        for bn, ks, kt in (("spine_01", 0.26, 0.22), ("spine_02", 0.36, 0.30),
                           ("spine_03", 0.30, 0.26)):
            b = arm.pose.bones.get(bn)
            if b:
                b.rotation_euler = Euler((math.radians(spine * ks), 0,
                                          math.radians(twist * kt)), "XYZ")
        for bn, k in (("neck_01", 0.45), ("head", 0.55)):
            b = arm.pose.bones.get(bn)
            if b:
                b.rotation_euler = Euler((math.radians(head * k), 0,
                                          math.radians(-twist * 0.5 * k)), "XYZ")
        bpy.context.view_layer.update()

    def frame_axes():
        """The body's own up / forward / right, read from the POSED skeleton so
        the lean is already in it."""
        pel = arm.matrix_world @ arm.pose.bones["pelvis"].head
        sl = arm.matrix_world @ arm.pose.bones["upperarm_l"].head
        sr = arm.matrix_world @ arm.pose.bones["upperarm_r"].head
        mid = (sl + sr) * 0.5
        up = (mid - pel).normalized()
        f = Vector((0.0, FWD, 0.0))
        f = (f - up * f.dot(up)).normalized()
        return mid, up, f, up.cross(f).normalized()

    def solve(reach, elev, lead, yaw):
        """Both fists, and the orientation they share, from the body-relative
        numbers. Returns (lead hand, off hand, quaternion)."""
        mid, up, f, right = frame_axes()
        yq = Quaternion(up, math.radians(yaw))
        f, right = yq @ f, yq @ right
        # ⚠️ ELEVATION IS MEASURED FROM WORLD DOWN, NOT FROM THE TORSO.
        # It used to be an angle about the body's own `up`, which sounds
        # right and is a trap: frame_axes() reads `up` off the POSED
        # skeleton, so a forward flex rotates the frame the arms are
        # measured in. At the hit the spine leans the frame ~50 degrees, so
        # `elev 30` put his fists 20 degrees BEHIND vertical -- he finished
        # the strike hunched with his hands tucked under his chest.
        #
        # I then "fixed" it by adding a 1.12 * spine correction term, which
        # is a fudge factor standing in for a measurement, and it was still
        # wrong. The real fix is to stop coupling them: swing the arm from
        # world DOWN, in the body's own facing direction flattened to the
        # horizontal. Torso flex can no longer move the hands, which is what
        # lets the spine carry the weight without dragging the arms with it.
        #
        #   elev 0 = hanging straight down, 90 = straight out front,
        #   180 = straight overhead. Negative would be behind him, and the
        #   table never writes one.
        fh = Vector((f.x, f.y, 0.0))
        fh = fh.normalized() if fh.length > 1e-6 else Vector((0.0, FWD, 0.0))
        e = math.radians(elev)
        armdir = (Vector((0.0, 0.0, -1.0)) * math.cos(e)) + (fh * math.sin(e))
        armdir.normalize()
        H = mid + armdir * (min(reach, REACH_MAX) * ARM)
        # The invisible haft continues the line of the arm, rotated by `lead`
        # in the sagittal plane only -- so it cannot swing sideways through him
        # however lead is keyed.
        l = math.radians(lead)
        haft = (armdir * math.cos(l)) + (right.cross(armdir) * math.sin(l))
        haft.normalize()
        y = haft.cross(right)
        rot = Matrix((right, y, haft)).transposed().to_3x3().to_quaternion()
        rot = rot @ Quaternion((0, 0, 1), math.radians(_ROLL))
        return H, H - haft * GAP, rot

    # ⚠️ ELEV IS MEASURED AGAINST THE POSED TORSO, NOT THE WORLD, AND THE
    # FIRST VERSION OF THIS TABLE IGNORED THAT. frame_axes() reads `up` from
    # pelvis -> shoulder midpoint on the SKELETON AS POSED, so a forward flex
    # tilts the whole frame the arms are measured in. The spine keys below
    # distribute to pelvis 0.20 + spine_01 0.26 + spine_02 0.36 + spine_03
    # 0.30 = 1.12x, so `spine 47` leans the arm frame 53 degrees forward --
    # and `elev 30` in that frame is 23 degrees BEHIND vertical in the world.
    # He finished the strike with his fists tucked under his chest, hunched
    # like a man winded, which is exactly what it rendered as.
    #
    # So every elevation here is derived, not typed:
    #
    #     elev = (angle wanted in the world) + 1.12 * spine
    #
    # with the world angle measured from straight down: 0 hanging, 90 straight
    # out in front, 180 overhead.
    #
    # elev is now the WORLD angle from straight down (see solve), so these
    # read as the picture: 35 is hands low in front, 170 is overhead.
    #    f  reach elev lead yaw   dz     dy   twist spine head
    B = [(1,  0.60,  38,  -6, 10, -0.060, 0.010,   4,  14,   6),   # ready
         (4,  0.64,  46,  -4, 10, -0.052, 0.006,   4,  11,   8),
         # ── the lift: slow, ten frames. Weight back, spine extends ──────
         (10, 0.80, 112,  16, 14, -0.026,-0.018,  -5,  -6,  13),
         (14, 0.88, 152,  30, 17, -0.014,-0.032, -10, -16,  15),
         # ── the hold: four frames that barely move. This IS the weight. ──
         (18, 0.90, 170,  36, 18, -0.010,-0.038, -12, -20,  14),   # apex
         (20, 0.90, 164,  34, 18, -0.022,-0.028,  -9, -12,  13),
         # ── the strike: 130 degrees in six frames, LINEAR, no ease-in ───
         (23, 0.92,  92,  10, 15, -0.082, 0.012,   2,  12,  16),
         (26, 0.90,  30, -14,  9, -0.170, 0.050,  10,  30,  20),   # THE HIT
         # ── recoil, then a long settle ──────────────────────────────────
         (28, 0.86,  42, -11,  9, -0.142, 0.041,   9,  27,  18),
         (31, 0.74,  52,  -8, 10, -0.104, 0.024,   7,  26,  15),
         (36, 0.65,  44,  -7, 10, -0.072, 0.014,   5,  18,   9),
         (48, 0.60,  38,  -6, 10, -0.060, 0.010,   4,  14,   6)]

    STRIKE = (20, 26)

    def sample(fr):
        for i in range(len(B) - 1):
            f0, f1 = B[i][0], B[i + 1][0]
            if f0 <= fr <= f1:
                u = (fr - f0) / float(f1 - f0) if f1 > f0 else 0.0
                if STRIKE[0] <= f0 < STRIKE[1]:
                    u = u ** 1.55        # accelerate INTO the hit, never ease
                else:
                    u = u * u * (3 - 2 * u)
                return [p0 + (p1 - p0) * u for p0, p1 in zip(B[i][1:], B[i + 1][1:])]
        return list(B[-1][1:])

    SPLIT, LEAD_Y, REAR_Y = 0.17 * LEG, FWD * 0.22 * LEG, 0.24 * LEG
    worst_wrist = {"l": 0.0, "r": 0.0}
    worst_miss = [0.0, 0, ""]
    last_pole = {}
    hand_speed, speed_at = 0.0, 0
    prev_hand = None

    for f in range(1, frames + 1):
        reach, elev, lead, yaw, dz, dy, twist, spine, head = sample(f)
        body(dz, dy, twist, spine, head)
        Hd, Ho, rot = solve(reach, elev, lead, yaw)

        for goal, pos in ((drv_goal, Hd), (off_goal, Ho)):
            goal.location = pos
            goal.keyframe_insert("location", frame=f)

        arm.keyframe_insert("location", frame=f)
        for bn in ("pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "head"):
            if arm.pose.bones.get(bn):
                arm.pose.bones[bn].keyframe_insert("rotation_euler", frame=f)

        for s_, (fx, fy) in ((OFF, (SPLIT, LEAD_Y)), (DRV, (-SPLIT, REAR_Y))):
            tgt, pole = iks[s_]
            tgt.location = (fx, fy, FLOOR + ANKLE_H)
            tgt.keyframe_insert("location", frame=f)
            tgt.rotation_quaternion = FOOT_REST[s_]
            tgt.keyframe_insert("rotation_quaternion", frame=f)
            pole.location = (fx * 1.5, fy + FWD * 0.45 * LEG, FLOOR + LEG * 0.52)
            pole.keyframe_insert("location", frame=f)

        # ── the elbow poles are solved per frame, per arm ────────────────
        # ⚠️ WITH A MEMORY. A per-frame optimum is not a trajectory: without
        # the continuity term two adjacent frames land on opposite sides of
        # the arm and the shoulder snaps through a half turn between them.
        for s_, pole in ((OFF, elbow_pole), (DRV, g["_pick_pole"])):
            sh = arm.matrix_world @ arm.pose.bones["upperarm_%s" % s_].head
            wr = arm.matrix_world @ arm.pose.bones["hand_%s" % s_].head
            ax = (wr - sh)
            if ax.length < 1e-5:
                continue
            ax.normalize()
            u = ax.cross(Vector((0, 0, 1)))
            u = u.normalized() if u.length > 1e-4 else ax.cross(Vector((0, 1, 0))).normalized()
            v = ax.cross(u)
            best, bpos, bbend = 1e9, pole.location.copy(), 0.0
            for k in range(48):
                th = k * (math.pi / 24.0)
                cand = ((sh + wr) * 0.5
                        + (u * math.cos(th) + v * math.sin(th)) * (0.9 * ARM))
                pole.location = cand
                bpy.context.view_layer.update()
                fa = (arm.matrix_world @ arm.pose.bones["lowerarm_%s" % s_].tail) - \
                     (arm.matrix_world @ arm.pose.bones["lowerarm_%s" % s_].head)
                hd = (arm.matrix_world @ arm.pose.bones["hand_%s" % s_].tail) - \
                     (arm.matrix_world @ arm.pose.bones["hand_%s" % s_].head)
                if fa.length < 1e-6 or hd.length < 1e-6:
                    continue
                bend = math.degrees(fa.angle(hd))
                tw = _twist_from_rest(arm.pose.bones["upperarm_%s" % s_])
                hw = _twist_from_rest(arm.pose.bones["hand_%s" % s_])
                prev = last_pole.get(s_)
                jump = 0.0 if prev is None else (cand - prev).length / ARM
                cost = bend + 1.5 * tw + 1.5 * hw + _JUMP * jump
                if cost < best:
                    best, bpos, bbend = cost, cand, bend
            pole.location = bpos
            last_pole[s_] = bpos.copy()
            pole.keyframe_insert("location", frame=f)
            worst_wrist[s_] = max(worst_wrist[s_], bbend)
        bpy.context.view_layer.update()

        # ⚠️ DID THE HANDS ACTUALLY GO WHERE THEY WERE SENT? The goal is an
        # empty parented to the tool control; solve() computes a WORLD point
        # and writes it to a LOCAL location, which is only the same thing
        # while that control sits at the origin. And an IK chain that cannot
        # reach simply stops short, silently. Both failures look identical in
        # a render -- the arms just end up somewhere else -- so this prints
        # the gap rather than leaving me to infer it from a picture.
        for s_, want in ((DRV, Hd), (OFF, Ho)):
            got = arm.matrix_world @ arm.pose.bones["hand_%s" % s_].head
            miss = (got - want).length / ARM
            if miss > worst_miss[0]:
                worst_miss[0], worst_miss[1], worst_miss[2] = miss, f, s_

        # How fast the hands are actually travelling, per frame. The swing is
        # only convincing if this has a sharp peak -- a flat profile is the
        # numeric signature of a weightless swing.
        if prev_hand is not None:
            sp = (Hd - prev_hand).length / LEG
            if sp > hand_speed:
                hand_speed, speed_at = sp, f
        prev_hand = Hd.copy()

    _smooth([arm] + list(G["helpers"]))
    # ⚠️ NOTHING EASES INTO THE HIT. _smooth puts every key back on bezier,
    # which decelerates the hands just before impact and is the single most
    # common way a heavy swing reads as weightless. Put the strike back to
    # linear AFTER the smoothing pass, not before.
    for ob in [arm] + list(G["helpers"]):
        if ob.animation_data and ob.animation_data.action:
            for fc in ob.animation_data.action.fcurves:
                for kp in fc.keyframe_points:
                    if STRIKE[0] <= kp.co[0] <= STRIKE[1]:
                        kp.interpolation = "LINEAR"
    print("SWING hand MISSED its goal by %.3f of an arm (f%d, %s) %s"
          % (worst_miss[0], worst_miss[1], worst_miss[2],
             "" if worst_miss[0] < 0.05 else "  <-- the arms are not following"))
    print("SWING peak hand speed %.3f leg-lengths/frame at f%d" % (hand_speed, speed_at))
    print("SWING worst wrist bend  L %.0f  R %.0f deg" % (worst_wrist["l"], worst_wrist["r"]))
    return frames
