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
import bpy, math
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

        hand_goal.location = (side * 0.02 * LEG,
                              FWD * (0.32 - 0.13 * k) * LEG,
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
def key_mine(frames=40):
    """A two-handed overhead pickaxe strike into the ground. ONE-SHOT.

    Keyed ON BEATS, not per frame. Everything else in this file writes a
    value for all 24 or 48 frames, because a cycle driven by a sine has a
    value at every frame by construction. A performance does not. Keys go on
    the poses that matter and the curves between them are the animation --
    which is also the only way a single frame's interpolation can be changed
    without fighting a sampled curve.

    The beats, and why each one exists:

      1-6    SETTLE. A small dip DOWN before going up. Anticipation for the
             anticipation: an arm that starts straight up from rest has no
             weight in it.
      6-16   WIND-UP. Up and behind the driving shoulder, hips and torso
             rotating away, spine extending back. Slow out -- this is the
             only slow part of the clip and it is what makes the strike
             read as fast.
      16-18  FLOAT. Two frames of near-stillness at the apex. A heavy tool
             goes weightless at the top of its arc before gravity takes it,
             and skipping that is the difference between a swing and a wave.
      18-23  THE STRIKE. Five frames for about 170 degrees of arc, LINEAR
             into contact. An impact that eases in has no impact -- easing
             is the animator telling the viewer the hit was expected, and
             nothing about a pick meeting rock is expected.
      23-24  HIT-STOP. Contact held for two frames. One frame of nothing
             happening, at the right moment, is the cheapest and strongest
             impact cue there is; it is what every fighting game does on a
             connect.
      24-27  RECOIL. The head bounces off the rock and the body unloads
             upward. Fast, because a rebound is elastic.
      27-40  RECOVER. Back to the ready pose with a small overshoot, easing
             out, ending exactly where frame 1 began so it can hand back.

    Throughout, THE TOOL LAGS THE HANDS: the haft angle is its own curve,
    offset from the hand arc by a beat. Drag is most of what makes a
    weighted object feel carried by a body rather than welded to a bone.
    """
    arm, iks, hand_goal, elbow_pole, LEG, FLOOR, ANKLE_H, HIP0, FWD, FOOT_REST, \
        TUCK, ARMS, TUCKAMT, SA, GRIP, HQ = _ctx()
    g = G
    _fresh_action("Mine")

    # The right arm comes off FK only for this clip; see build-pick.py.
    g["_pick_ik"].influence = 1.0
    g["_pgc"].influence = 1.0

    PH = g["PICK_HAND"]
    R_REST = g["R_REST"]
    PQ = g["PICK_HAND_REST_Q"]
    pick_goal, pick_pole = g["_pick_goal"], g["_pick_pole"]
    pgrip = g["_pgrip"]
    sho = arm.matrix_world @ arm.pose.bones["upperarm_%s" % PH].head
    # ⚠️ THE SWING PIVOTS ON THE SHOULDERS, AND THE SHOULDERS MOVE. First
    # pass fixed the pivot at the REST shoulder height and swung the hands on
    # a circle around it -- so no matter how far round the arc went, the tip
    # could not get within 0.67 of the floor. The arm is 0.61 long; reaching
    # the ground is not something arms do, it is something a BENT BACK does.
    # The pivot is now carried by the hips and the spine fold, which is both
    # correct and the reason the contact pose has to be deep.
    SH_OFF = sho.z - (FLOOR + LEG * 0.985)
    RAD = 0.88 * g["ARM_R"]
    HI = g["PICK_LOCAL"]["hi"]
    LO = g["PICK_LOCAL"]["lo"]
    TIP = g["PICK_TIP"]          # from build-pick; never retyped here

    def pivot_at(dz, dy, spine):
        """Where the shoulders actually are once the hips have dropped and
        the back has folded."""
        th = math.radians(spine)
        return Vector((sho.x * 0.35,
                       dy * LEG + FWD * SH_OFF * math.sin(th),
                       FLOOR + LEG * 0.985 + dz * LEG + SH_OFF * math.cos(th)))

    def hand_at(a_deg, P):
        """Hand position on the swing arc. `a` is degrees from straight up,
        rotating toward the front."""
        a = math.radians(a_deg)
        return Vector((P.x, P.y + FWD * RAD * math.sin(a), P.z + RAD * math.cos(a)))

    def tool_q(phi_deg):
        return Quaternion((1, 0, 0), math.radians(phi_deg)) @ R_REST

    def tool_pt(local, hand, phi_deg):
        return hand + (tool_q(phi_deg) @ (local - HI))

    def solve_contact(hand):
        """⚠️ THE CONTACT POSE IS SOLVED, NOT EYEBALLED. The tip has to be ON
        the floor on the frame of the hit: a pick that stops short reads as
        mime, one that goes through reads as a bug, and both are invisible
        at the speed this plays. Given where the hands are, scan the haft
        angle for the one that puts the tip at ground level."""
        best, bphi = 1e9, -55.0
        for i in range(2401):
            phi = -150.0 + i * 0.0625
            err = abs(tool_pt(TIP, hand, phi).z - FLOOR)
            if err < best:
                best, bphi = err, phi
        return bphi, best

    # ⚠️ THE OFF HAND SLIDES ON THE HAFT, AND IT HAS TO. Measured with the
    # grip fixed at the butt: on the wind-up and again mid-strike the left
    # arm needed 0.643 of reach against the 0.612 it has, so the IK gave up
    # short and the hand tore off the haft for a third of the clip. Pinning
    # both fists to fixed points on a long tool swung overhead is simply not
    # something a pair of arms can do.
    #
    # It is also what a real swing looks like. The hands come TOGETHER near
    # the head to carry the weight up, then the lower one runs down to the
    # butt through the descent, which is where the leverage at impact comes
    # from. The thing that fixes the reach is the thing that sells the
    # swing.
    #     frame   a     phi    hip dz   hip dy  twist  spine  head  grip
    B = [(1,     150, -40.0, -0.100,  0.000,   10,    28,    14,  0.08),
         (6,     158, -28.0, -0.130,  0.010,   14,    32,    16,  0.11),
         (16,    -10, 140.0,  0.055,  0.050,  -19,   -10,    22,  0.30),
         (18,    -13, 145.0,  0.060,  0.055,  -21,   -11,    23,  0.31),
         (23,    160, None,  -0.302, -0.060,    8,    56,    10,  0.08),
         (24,    160, None,  -0.307, -0.062,    8,    57,    11,  0.08),
         (27,    141, -18.0, -0.165, -0.020,    7,    38,    14,  0.09),
         (31,    152, -45.0, -0.115,  0.000,    9,    30,    14,  0.08),
         (36,    151, -41.0, -0.105,  0.000,   10,    29,    14,  0.08),
         (40,    150, -40.0, -0.100,  0.000,   10,    28,    14,  0.08)]

    # ── THE OFF HAND LETS GO AT THE TOP ────────────────────────────────────
    # ⚠️ AND IT HAS TO, THIS IS NOT A STYLE CHOICE. Measured across the whole
    # clip with the grip solved to the nearest reachable point on the haft:
    # nine frames still left the wrist short of the wood, by up to 0.23. The
    # arm spans 0.643 and the tool is 1.05 long -- carrying BOTH fists
    # through an overhead wind-up with the torso twisted away from the tool
    # is not a thing a pair of arms can do, and no amount of sliding the
    # grip fixes a reach that is simply absent.
    #
    # Which is also why nobody does it. The off hand comes off at the top,
    # swings back as a counterweight, and slams back onto the haft on the
    # way down -- and a hand that visibly RE-GRIPS before the hit is worth
    # more to the impact than one that was glued on throughout.
    #
    # The handoff is a constraint-influence ramp rather than a cut, so the
    # IK result and the free FK pose cross-fade into each other.
    HOLD = [(1, 1.0), (11, 1.0), (14, 0.0), (19, 0.0), (22, 1.0), (40, 1.0)]

    def hold_at(f):
        for i in range(len(HOLD) - 1):
            (f0, v0), (f1, v1) = HOLD[i], HOLD[i + 1]
            if f0 <= f <= f1:
                u = (f - f0) / float(f1 - f0) if f1 > f0 else 0.0
                return v0 + (v1 - v0) * (u * u * (3 - 2 * u))
        return HOLD[-1][1]

    ELBOW_L = _elbow_axis("l")
    guard_ik, guard_rot = g["_gc"], g["_grc"]

    # Feet stay planted all clip: lead foot forward, rear foot braced behind.
    # The knees are never keyed -- the hips drop 0.14 of a leg into the hit
    # and the leg IK bends them, which is less work and more correct than
    # authoring a crouch.
    LEAD_Y, REAR_Y = FWD * 0.24 * LEG, 0.28 * LEG
    SPLIT = 0.185 * LEG

    # ⚠️ KEY THE PARAMETERS ON BEATS, BUT SAMPLE THE POSE EVERY FRAME.
    # The first version keyed the IK goals only on the beats and let Blender
    # interpolate between them. For a hand travelling on an ARC that is
    # wrong twice over. The straight line between "up behind the shoulder"
    # and "down in front of the shins" is a chord straight through the
    # ribcage -- so mid-swing the arm passed through the chest instead of
    # going round. And the two hands were keyed as independent world
    # positions, so across 190 degrees of rotation the off hand came away
    # from the haft entirely and floated beside it.
    #
    # Both are the same mistake: interpolating POSITIONS that are derived
    # from a parameter, instead of interpolating the parameter. The beat
    # table is still the performance; it is just evaluated per frame and the
    # arc recomputed, which keeps the path curved and keeps both fists on
    # one rigid object by construction.
    contact_err = None
    solved = {}
    for (f, a, phi, dz, dy, twist, spine, head, grip) in B:
        if phi is None:
            phi, contact_err = solve_contact(hand_at(a, pivot_at(dz, dy, spine)))
            solved[f] = phi
    TAB = [(f, a, solved.get(f, phi), dz, dy, twist, spine, head, grip)
           for (f, a, phi, dz, dy, twist, spine, head, grip) in B]

    def sample(f):
        for i in range(len(TAB) - 1):
            f0, f1 = TAB[i][0], TAB[i + 1][0]
            if f0 <= f <= f1:
                u = (f - f0) / float(f1 - f0) if f1 > f0 else 0.0
                # Linear through the strike and the hold; eased everywhere
                # else. This is the one place the shape of the curve IS the
                # animation, so it is explicit rather than left to handles.
                if not (18 <= f0 < 24):
                    u = u * u * (3 - 2 * u)
                return [p0 + (p1 - p0) * u for p0, p1 in zip(TAB[i][1:], TAB[i + 1][1:])]
        return list(TAB[-1][1:])

    for f in range(1, frames + 1):
        a, phi, dz, dy, twist, spine, head, grip = sample(f)
        P = pivot_at(dz, dy, spine)
        H = hand_at(a, P)

        arm.location = (0.0, dy * LEG, (FLOOR + LEG * 0.985 + dz * LEG) - HIP0)
        arm.keyframe_insert("location", frame=f)

        pb = arm.pose.bones["pelvis"]
        pb.rotation_euler = Euler((math.radians(spine * 0.20), 0,
                                   math.radians(twist * 0.42)), "XYZ")
        pb.keyframe_insert("rotation_euler", frame=f)
        for bn, ks, kt in (("spine_01", 0.26, 0.22), ("spine_02", 0.36, 0.30),
                           ("spine_03", 0.30, 0.26)):
            b = arm.pose.bones.get(bn)
            if b:
                b.rotation_euler = Euler((math.radians(spine * ks), 0,
                                          math.radians(twist * kt)), "XYZ")
                b.keyframe_insert("rotation_euler", frame=f)
        # ── EYES ON THE ROCK ── the head counter-rotates against both the
        # twist and the spine, so the gaze stays on the spot being hit while
        # the body turns away from it. A head that rides the torso reads as
        # someone swinging with their eyes shut.
        for bn, k in (("neck_01", 0.45), ("head", 0.55)):
            b = arm.pose.bones.get(bn)
            if b:
                b.rotation_euler = Euler((math.radians(head * k), 0,
                                          math.radians(-twist * 0.5 * k)), "XYZ")
                b.keyframe_insert("rotation_euler", frame=f)

        for s_, (fx, fy) in (("l", (SPLIT, LEAD_Y)), ("r", (-SPLIT, REAR_Y))):
            tgt, pole = iks[s_]
            tgt.location = (fx, fy, FLOOR + ANKLE_H)
            tgt.keyframe_insert("location", frame=f)
            tgt.rotation_quaternion = FOOT_REST[s_]
            tgt.keyframe_insert("rotation_quaternion", frame=f)
            pole.location = (fx * 1.5, fy + FWD * 0.45 * LEG, FLOOR + LEG * 0.52)
            pole.keyframe_insert("location", frame=f)

        # ── THE DRIVING HAND ──
        pick_goal.location = H
        pick_goal.keyframe_insert("location", frame=f)
        pick_pole.location = (sho.x * 2.0, 0.55 * LEG, FLOOR + LEG * 1.30)
        pick_pole.keyframe_insert("location", frame=f)
        pgrip.rotation_quaternion = Quaternion((1, 0, 0), math.radians(phi)) @ PQ
        pgrip.keyframe_insert("rotation_quaternion", frame=f)

        # ── THE OFF HAND RIDES THE HAFT ── computed, not posed. The tool is
        # rigidly skinned to the driving hand and that hand's world position
        # IS the IK goal, so every point on the haft has a closed form and
        # the second grip can be put on it exactly, on every frame.
        # ⚠️ THE GOAL IS THE WRIST, AND A FIST IS NOT ITS WRIST. Putting the
        # wrist exactly on the haft axis -- which is what "the hand is on the
        # haft" naively means -- pushes the whole fist past the shaft and the
        # fingers close on air behind it. Measured 0.046 of daylight. The
        # goal is pulled back toward the shoulder by half a hand so the palm
        # lands on the wood.
        # ⚠️ AND THE SLIDE IS SOLVED, NOT AUTHORED. Hand-picking where the
        # off hand sits per beat was guesswork in a frame that rotates 190
        # degrees: sliding it up helped at one beat and made the next worse,
        # because "up the haft" points toward the body early in the swing
        # and away from it at the top. The authored value is a PREFERENCE
        # now; if it puts the fist out of reach, the grip runs along the
        # haft to the nearest spot the arm can actually hold, which is also
        # exactly what a hand does on a tool it is not willing to drop.
        _sl = arm.matrix_world @ arm.pose.bones["upperarm_l"].head
        _maxr = g["ARM_FULL"]["l"] * 0.96
        _best, hpt = None, None
        for _i in range(61):
            _t = (_i / 60.0) * g["GRIP_HI"]
            _p = tool_pt(Vector((0, 0, _t * LEG)), H, phi)
            _v = _sl - _p
            if _v.length > 1e-6:
                _p = _p + _v.normalized() * (0.075 * LEG)
            _cost = abs(_t - grip) + max(0.0, (_sl - _p).length - _maxr) * 12.0
            if _best is None or _cost < _best:
                _best, hpt = _cost, _p
        hand_goal.location = hpt
        hand_goal.keyframe_insert("location", frame=f)
        elbow_pole.location = (abs(sho.x) * 1.9, 0.50 * LEG, FLOOR + LEG * 1.10)
        elbow_pole.keyframe_insert("location", frame=f)
        GRIP.rotation_quaternion = Quaternion((1, 0, 0), math.radians(phi)) @ HQ
        GRIP.keyframe_insert("rotation_quaternion", frame=f)

        # ── RELEASE ── influence down, and an FK counterweight underneath it
        # for the ramp to blend into: the free arm sweeps back and out, which
        # is both what balances an overhead wind-up and what keeps the
        # silhouette from going symmetrical at the most important pose in the
        # clip.
        hold = hold_at(f)
        guard_ik.influence = hold
        guard_ik.keyframe_insert("influence", frame=f)
        guard_rot.influence = hold
        guard_rot.keyframe_insert("influence", frame=f)

        rel = 1.0 - hold
        ab = arm.pose.bones["upperarm_l"]
        (ax, sg), _b, _c = TUCK["l"]
        e = [math.radians(-34.0 * rel * ARMS["l"]), 0.0, 0.0]
        e[ax] += math.radians((TUCKAMT + 16 * rel) * sg)
        ab.rotation_euler = Euler(e, "XYZ")
        ab.keyframe_insert("rotation_euler", frame=f)
        lb = arm.pose.bones["lowerarm_l"]
        e2 = [0.0, 0.0, 0.0]
        e2[ELBOW_L[0]] = math.radians(46.0 * rel) * ELBOW_L[1]
        lb.rotation_euler = Euler(e2, "XYZ")
        lb.keyframe_insert("rotation_euler", frame=f)

    # Both fists grip the haft. Nothing keys fingers, so this persists -- and
    # Mine is baked last, which is the only reason it is safe to do here.
    g["close_fist"]("l", 0.80)
    g["close_fist"]("r", 0.90)

    _smooth([arm] + list(G["helpers"]))
    # ⚠️ NO EASE INTO THE HIT, AND NONE OUT OF THE HOLD. Bezier handles across
    # 18-24 would round off exactly the two frames the whole clip exists to
    # deliver: the strike would decelerate into contact and the hit-stop
    # would drift instead of stopping dead.
    for ob in [arm] + list(G["helpers"]):
        if ob.animation_data and ob.animation_data.action:
            for fc in ob.animation_data.action.fcurves:
                for kp in fc.keyframe_points:
                    if 18 <= kp.co[0] <= 24:
                        kp.interpolation = "LINEAR"
    print("MINE keyed on %d beats; contact tip lands %.4f from the floor"
          % (len(B), contact_err if contact_err is not None else -1))
    return frames
