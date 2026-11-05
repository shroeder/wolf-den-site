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
    """A two-handed pickaxe strike into the ground. One-shot, 40 frames.

    ⚠️ THIS CLIP ANIMATES ONE OBJECT. Both wrist IK targets and both
    hand-rotation targets are children of the tool control (see
    build-pick.py), so moving the control moves the pickaxe and both fists
    together and they cannot come apart. The previous version keyed the
    hands and recomputed the tool from them, which is a hand chasing a
    moving target -- and it lost, every frame, for six attempts.

    What is authored is therefore what an animator would actually say: where
    the POINT is, and which way the haft leans. The hands are a consequence.

    Beats:
      1-6    settle, a dip down before going up
      6-18   wind-up over the driving shoulder, slow out
      16-18  float: two frames of near-stillness at the apex, because a
             heavy tool goes weightless at the top of its arc
      18-23  the strike -- five frames, LINEAR into contact
      23-24  hit-stop, held two frames
      24-30  recoil, fast, because a rebound is elastic
      30-40  recover and settle, ending exactly on frame 1
    """
    arm, iks, hand_goal, elbow_pole, LEG, FLOOR, ANKLE_H, HIP0, FWD, FOOT_REST, \
        TUCK, ARMS, TUCKAMT, SA, GRIP, HQ = _ctx()
    g = G
    _fresh_action("Mine")

    g["_pick_ik"].influence = 1.0
    g["_pgc"].influence = 1.0
    g["_gc"].influence = 1.0
    g["_grc"].influence = 1.0

    TOOL = g["TOOL"]
    TIP = g["PICK_TIP"]
    # Haft straight down, points forward. phi is degrees of forward tilt off
    # that, which is what the table below means by it.
    DOWN = Quaternion((0, 1, 0), math.pi)
    # ⚠️ READ THE SHOULDERS INSIDE THE LOOP. Captured once up here they are
    # the REST shoulders, and the reach report then compares a posed hand
    # against a shoulder that has not moved -- which is the third time this
    # exact mistake has produced a confident number that disagreed with the
    # render. `sho0` is only for placing the static elbow poles.
    sho0 = {s_: (arm.matrix_world @ arm.pose.bones["upperarm_%s" % s_].head).copy()
            for s_ in ("l", "r")}
    MAXR = {s_: g["ARM_FULL"][s_] * 0.97 for s_ in ("l", "r")}

    # ⚠️ AUTHOR THE GRIP, NOT THE POINT. Driving the control by where the TIP
    # goes is the nicer idea and it is unusable: the tip is a metre from the
    # hands, so a tip path that looks right puts the grip somewhere the arms
    # cannot reach -- measured, 1.18 of reach needed against 0.62 available
    # in the ready pose alone. Author where the HANDS are, which is bounded
    # by the body, and let the point fall where the tool points.
    # ⚠️ THE HANDS STAY IN FRONT OF THE SPINE. The wind-up used to carry the
    # grip to y = +0.27 -- a quarter of a leg BEHIND body centre at hip
    # height -- and the reach check passed it, because distance from the
    # shoulder was fine. Distance says nothing about whether a shoulder can
    # rotate there: the arms came out wrenched behind his back. The tool
    # head goes back by TILTING THE HAFT, which is what phi is for; the
    # hands only have to go up.
    #
    # ⚠️ AND IT TILTS THE OTHER WAY ROUND. Taking the haft from "head down
    # in front" to "head up behind" by INCREASING the angle swings it
    # backward through horizontal at waist height -- which is a man
    # holding a pickaxe behind his back, and it is what the whole
    # wind-up looked like. A real overhead lift carries the head up the
    # FRONT and then tips it over the shoulder, so phi runs NEGATIVE,
    # through -125 (head up in front) to -196 (head up and back).
    #      f   grip y  grip z   phi   hip dz  hip dy  twist spine head
    B = [(1,  -0.36,  0.810, -30.0, -0.100,  0.000,  10,   26,  14),
         (6,  -0.30,  0.740, -24.0, -0.140,  0.010,  13,   30,  15),
         (10, -0.30,  0.950, -70.0, -0.060,  0.030,   0,   12,  17),
         (13, -0.26,  1.180, -125.0,  0.010,  0.045, -16,   -2,  20),
         (16, -0.20,  1.360, -185.0,  0.045,  0.050, -24,  -10,  22),
         (18, -0.19,  1.375, -196.0,  0.050,  0.052, -25,  -11,  22),
         (20, -0.24,  1.330, -150.0,  0.000,  0.030, -10,    6,  18),
         (21, -0.30,  1.190, -100.0, -0.090,  0.000,   2,   22,  14),
         (22, -0.42,  0.820, -45.0, -0.205, -0.045,   6,   38,  12),
         (23, -0.50,  0.560,  None, -0.280, -0.075,   8,   46,  10),
         (24, -0.50,  0.554,  None, -0.285, -0.077,   8,   47,  10),
         (27, -0.44,  0.800, -34.0, -0.185, -0.030,   7,   34,  13),
         (30, -0.40,  0.880, -40.0, -0.140, -0.015,   8,   30,  14),
         (34, -0.37,  0.820, -36.0, -0.110,  0.000,   9,   27,  14),
         (40, -0.36,  0.810, -30.0, -0.100,  0.000,  10,   26,  14)]

    GRIP_W = Vector((0, 0, g["GRIP_HI"] * LEG))

    def place(gy, gz, phi):
        rot = Quaternion((1, 0, 0), math.radians(phi)) @ DOWN
        return rot, Vector((0.0, gy * LEG, FLOOR + gz * LEG)) - (rot @ GRIP_W)

    def solve_contact(gy, gz):
        """⚠️ THE CONTACT ANGLE IS SOLVED. The point has to be ON the floor on
        the frame of the hit; short reads as mime, through reads as a bug,
        and at this speed neither is visible by eye."""
        best, bphi = 1e9, -26.0
        for i in range(1601):
            phi = -90.0 + i * 0.0625
            rot, loc = place(gy, gz, phi)
            err = abs((loc + (rot @ TIP)).z - FLOOR)
            if err < best:
                best, bphi = err, phi
        return bphi

    B = [(r[0], r[1], r[2], solve_contact(r[1], r[2]) if r[3] is None else r[3]) + r[4:]
         for r in B]

    def sample(f):
        for i in range(len(B) - 1):
            f0, f1 = B[i][0], B[i + 1][0]
            if f0 <= f <= f1:
                u = (f - f0) / float(f1 - f0) if f1 > f0 else 0.0
                # Linear through the strike and the hold; eased elsewhere.
                # An impact that eases in has no impact.
                if not (18 <= f0 < 24):
                    u = u * u * (3 - 2 * u)
                return [p0 + (p1 - p0) * u for p0, p1 in zip(B[i][1:], B[i + 1][1:])]
        return list(B[-1][1:])

    LEAD_Y, REAR_Y = FWD * 0.26 * LEG, 0.26 * LEG
    SPLIT = 0.185 * LEG
    worst = {"l": (0.0, 0), "r": (0.0, 0)}
    behind = {"l": (-180.0, 0), "r": (-180.0, 0)}
    tip_lo = 1e9

    for f in range(1, frames + 1):
        gy, gz, phi, dz, dy, twist, spine, head = sample(f)

        # ── THE TOOL ── put the driving grip here, lean the haft like this.
        # Everything both hands do follows from this and nothing else.
        rot, loc = place(gy, gz, phi)
        TOOL.rotation_quaternion = rot
        TOOL.location = loc
        TOOL.keyframe_insert("location", frame=f)
        TOOL.keyframe_insert("rotation_quaternion", frame=f)
        # The children ride the control, but their offsets must be RE-STATED
        # before keying: other clips key these same empties in world space,
        # so whatever Impact left on them is still there, and keying without
        # setting would record that stale world value as a local one.
        for ob in g["TOOL_CHILDREN"]:
            loc, q = g["TOOL_LOCALS"][ob.name]
            ob.location = loc
            ob.keyframe_insert("location", frame=f)
            if q is not None:
                ob.rotation_quaternion = q
                ob.keyframe_insert("rotation_quaternion", frame=f)

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
        # Eyes stay on the rock: the head counter-rotates against both the
        # twist and the fold, so the gaze holds the spot while the body turns
        # away from it.
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
        g["_elbow_pole"].location = (abs(sho0["r"].x) * 2.0, 0.45 * LEG,
                                     FLOOR + LEG * 1.05)
        g["_elbow_pole"].keyframe_insert("location", frame=f)
        g["_pick_pole"].location = (sho0["r"].x * 2.1, 0.55 * LEG, FLOOR + LEG * 1.25)
        g["_pick_pole"].keyframe_insert("location", frame=f)

        # ── READINGS ── where the wrists have to be is now a consequence, so
        # the only thing that can go wrong is that an arm cannot get there.
        # An IK chain asked for more reach than it has stops short in silence.
        bpy.context.view_layer.update()
        tip_lo = min(tip_lo, (TOOL.matrix_world @ TIP).z - FLOOR)
        for s_, ob in (("r", g["_pick_goal"]), ("l", hand_goal)):
            now = arm.matrix_world @ arm.pose.bones["upperarm_%s" % s_].head
            d = (ob.matrix_world.translation - now).length - MAXR[s_]
            if d > worst[s_][0]:
                worst[s_] = (d, f)
            # ⚠️ AND HOW FAR BEHIND HIM IT IS. A shoulder extends about 60
            # degrees before the arm is behind the back; past that the pose
            # is anatomically wrong however reachable it was. Measured in
            # the TORSO's frame, so leaning does not count as reaching back.
            hip = arm.matrix_world @ arm.pose.bones["pelvis"].head
            up = (now - hip).normalized()
            back = Vector((0.0, -FWD, 0.0))
            back = (back - up * back.dot(up)).normalized()
            v = (arm.matrix_world @ arm.pose.bones["lowerarm_%s" % s_].head) - now
            ext = math.degrees(math.atan2(v.dot(back), -v.dot(up)))
            if ext > behind[s_][0]:
                behind[s_] = (ext, f)

    g["close_fist"]("l", 0.86)
    g["close_fist"]("r", 0.90)

    _smooth([arm] + list(G["helpers"]))
    # No ease into the hit and none out of the hold: Bezier handles across
    # 18-24 would round off exactly the two frames the clip exists to deliver.
    for ob in [arm] + list(G["helpers"]):
        if ob.animation_data and ob.animation_data.action:
            for fc in ob.animation_data.action.fcurves:
                for kp in fc.keyframe_points:
                    if 18 <= kp.co[0] <= 24:
                        kp.interpolation = "LINEAR"
    print("MINE  point reaches %.4f above the floor at its lowest" % tip_lo)
    print("MINE  reach over: driving %+.4f (f%d), off %+.4f (f%d)   (negative fits)"
          % (worst["r"][0], worst["r"][1], worst["l"][0], worst["l"][1]))
    print("MINE  shoulder extension: driving %.0f deg (f%d), off %.0f deg (f%d)"
          "   (over ~60 is behind the back)"
          % (behind["r"][0], behind["r"][1], behind["l"][0], behind["l"][1]))
    return frames
