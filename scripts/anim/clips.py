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
def _twist_from_rest(pb):
    """Signed roll of a bone about its own length, minus the same at rest.

    ⚠️ THE POLE SWEEP BELOW USED TO SCORE WRIST BEND ALONE, and an optimiser
    graded on one joint will happily destroy another to win. It rolled the
    humerus 165 degrees at the apex of Mine -- the arm ends up across his face
    -- because that bought a degree or two at the wrist. qa.py caught it as
    upperarm-TWIST; Luke caught it as "arms completely twisted and mangled".

    Rest roll is subtracted so the large constant offset between a bone and
    its parent cancels, leaving only what the animation did. Same derivation
    as qa.py's twist_deg; two earlier versions of that calculation were wrong
    in ways that passed review, so keep the two in step.
    """
    if pb.parent is None:
        return 0.0
    def roll(axis, up, ref):
        axis = axis.normalized()
        u = up - axis * up.dot(axis)
        r = ref - axis * ref.dot(axis)
        # ⚠️ SAME DEGENERACY GUARD AS qa.py. When a joint is strongly bent the
        # parent's up-vector lies along the child's axis, the projection
        # collapses, and the angle between two near-null vectors lands on 180
        # as often as not. Feeding that into an optimiser makes it chase noise.
        if u.length < 0.45 or r.length < 0.45:
            return None
        u.normalize(); r.normalize()
        return math.degrees(math.atan2(u.cross(r).dot(axis), u.dot(r)))
    ax = pb.tail - pb.head
    if ax.length < 1e-6:
        return 0.0
    now = roll(ax, pb.matrix.to_3x3() @ Vector((0, 0, 1)),
               pb.parent.matrix.to_3x3() @ Vector((0, 0, 1)))
    rb, rp = pb.bone, pb.parent.bone
    rest = roll(rb.tail_local - rb.head_local,
                rb.matrix_local.to_3x3() @ Vector((0, 0, 1)),
                rp.matrix_local.to_3x3() @ Vector((0, 0, 1)))
    if now is None or rest is None:
        return 0.0      # unmeasurable here; do not let noise steer the sweep
    return abs((now - rest + 180.0) % 360.0 - 180.0)


def key_mine(frames=40):
    """A two-handed pickaxe strike into the ground. One-shot, 40 frames.

    ⚠️ AUTHORED IN THE SHOULDERS' FRAME, NOT THE WORLD'S. This is the whole
    reason the earlier versions could not be fixed by adjusting them.

    A character swinging a tool at the ground is FOUR constraints that fight
    each other: the point must reach the floor, the haft must not pass
    through the body, both fists must stay on one shaft, and the arms have
    a hard reach and a shoulder that only rotates so far. Authoring world
    positions means hand-solving that system one number at a time -- and
    every single fix satisfied the constraint being looked at while
    breaking one that was not. Put the tip on the floor and the haft stands
    upright through his stomach; angle the haft and the tip leaves the
    floor; reach the haft with both hands and the arms go behind the back;
    lift it overhead and it swings backward through horizontal on the way.
    All four happened, in that order.

    In the shoulders' frame three of the four cannot be expressed:

      REACH is a fraction of arm length, so an unreachable pose is not
            writable. Capped at 0.95.
      ELEV  is the angle of the hands around the shoulder in the body's own
            sagittal plane, so "behind his back" is a bounded number rather
            than an emergent surprise. Capped at -20.
      LEAD  is the haft's angle relative to the ARM, so the tool cannot
            windmill independently into his torso; it always continues the
            line of the arm, give or take.

    That leaves exactly one thing to solve against the world -- the point
    touching the floor on the frame of the hit -- and one unknown to solve
    it with: how far he bends. One equation, one unknown, instead of four
    coupled ones.
    """
    arm, iks, hand_goal, elbow_pole, LEG, FLOOR, ANKLE_H, HIP0, FWD, FOOT_REST, \
        TUCK, ARMS, TUCKAMT, SA, GRIP, HQ = _ctx()
    g = G
    _fresh_action("Mine")
    # ⚠️ THE GRIP IS COMPLIANT, NOT WELDED, AND THAT IS THE WHOLE TRADE.
    # At influence 1.0 the hand must match the tool's grip frame EXACTLY, so
    # every degree the arm chain cannot supply lands in the wrist -- 73 of
    # twist in a joint that anatomically has no twist axis. The pole sweep now
    # scores wrist twist and gets that to about 60, but 60 is a floor: the
    # pole rolls the ARM, and the remainder is the gap between what the arm
    # can deliver and what the grip demands.
    #
    # Backing the rotation copies off lets the hand sit a few degrees out of
    # perfect alignment with the haft. A slightly imperfect grip is a thing
    # you have to look for; an impossible wrist is what Luke saw from across
    # a room. The IK stays at 1.0 -- the hand still goes exactly where the
    # tool is, it just does not have to point exactly how the tool points.
    g["_pick_ik"].influence = 1.0
    g["_gc"].influence = 1.0
    g["_pgc"].influence = 0.75
    g["_grc"].influence = 0.75

    # ⚠️ THE ROLL OF THE SHAFT ABOUT ITS OWN AXIS IS NOT FREE -- IT IS THE
    # BIGGEST SINGLE INFLUENCE ON THE WRISTS. A shaft rolled about itself
    # looks identical; the HANDS holding it do not, because the grip is
    # welded to the tool and every degree of roll is a degree of forearm
    # twist the wrist has to find. Luke spotted it by eye -- "it looks like
    # you've overspun the pickaxe and it's causing his hands to twist" --
    # and _roll.py confirms it, sweeping the roll and measuring:
    #
    #     roll     0 deg  ->  wrists  47 / 83     (what shipped)
    #     roll   240 deg  ->  wrists 101 / 46
    #     roll   310 deg  ->  wrists  52 / 62     both inside human range
    #
    # 83 and 101 degrees are not poses, they are breaks. It was overspun by
    # about 50 degrees and I had been treating the roll as cosmetic.
    # ⚠️ RE-SWEEPABLE, BECAUSE THE COST FUNCTION IT WAS TUNED AGAINST CHANGED.
    # 310 was chosen by _roll.py when the pole sweep scored WRIST BEND ALONE.
    # The sweep now also scores shoulder twist, so the optimum moved and the
    # old constant is stale. ROLL_TEST=<deg> re-sweeps without editing code.
    globals()['_ROLL'] = float(os.environ.get("ROLL_TEST") or globals().get('ROLL_TEST', 310.0))
    TOOL, TIP = g["TOOL"], g["PICK_TIP"]
    WRIST = g["WRIST_IN_TOOL"]
    REACH_MAX = 0.95
    ARM = 0.5 * (g["ARM_FULL"]["l"] + g["ARM_FULL"]["r"])

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
        """The body's own up / forward / right, and the point the arms swing
        about -- read from the POSED skeleton, so leaning is already in it."""
        pel = arm.matrix_world @ arm.pose.bones["pelvis"].head
        sl = arm.matrix_world @ arm.pose.bones["upperarm_l"].head
        sr = arm.matrix_world @ arm.pose.bones["upperarm_r"].head
        mid = (sl + sr) * 0.5
        up = (mid - pel).normalized()
        f = Vector((0.0, FWD, 0.0))
        f = (f - up * f.dot(up)).normalized()
        return mid, up, f, up.cross(f).normalized()

    def solve(reach, elev, lead, yaw=0.0):
        """Hand position and the tool's full transform, from the three
        body-relative numbers. Returns (wrist, tool_rotation)."""
        mid, up, f, right = frame_axes()
        # ⚠️ THE SWING IS NOT IN THE MIDLINE. Keeping it in the sagittal
        # plane is what stops the tool windmilling into his torso, but it
        # also walks the shaft straight across his FACE at the apex. A real
        # over-the-shoulder lift goes up one SIDE of the head. Yawing the
        # whole plane out toward the driving shoulder keeps the first
        # property and fixes the second.
        yq = Quaternion(up, math.radians(yaw))
        f = yq @ f
        right = yq @ right
        e = math.radians(elev)
        armdir = (-up * math.cos(e)) + (f * math.sin(e))
        H = mid + armdir * (min(reach, REACH_MAX) * ARM)
        # The haft continues the line of the arm, rotated by `lead` in the
        # body's own sagittal plane -- never out of it, so it cannot swing
        # sideways through him.
        l = math.radians(lead)
        # Rodrigues about the body's right axis: the haft stays in the
        # sagittal plane by construction, so it cannot swing sideways
        # through him however `lead` is keyed.
        haft = (armdir * math.cos(l)) + (right.cross(armdir) * math.sin(l))
        haft.normalize()
        y = haft.cross(right)
        rot = Matrix((right, y, haft)).transposed().to_3x3().to_quaternion()
        # A shaft rolled about its own axis looks the same; the HANDS do
        # not. _roll.py sweeps this and measures the wrists.
        rot = rot @ Quaternion((0, 0, 1), math.radians(globals().get('_ROLL', 0.0)))
        return H, rot

    # ⚠️ THE APEX REACH WAS CHANGED AND CHANGED BACK. I pushed frames 13-20
    # from 0.70-0.73 out to 0.82-0.87 to clear a hand-in-torso failure, and it
    # cost 4 degrees of wrist. The failure was not real: qa.py was reading the
    # normal of an OPEN BOUNDARY on its torso proxy, and the hand it called
    # 0.085 deep in his chest was 0.46 away, overhead and to the side. Reverted
    # once the harness was fixed. Do not re-tune these against a number without
    # checking what the number is actually touching.
    #     f  reach  elev  lead  yaw  hip dz  hip dy twist spine head
    B = [(1,  0.86,  38, -14,  10,  -0.100,  0.000,  10,   26,  14),
         (6,  0.84,  30, -10,  12,  -0.140,  0.010,  13,   30,  15),
         (10, 0.72,  62,  10,  20,  -0.070,  0.025,   2,   16,  17),
         (13, 0.70, 104,  40,  28,   0.000,  0.040, -12,    2,  20),
         (16, 0.72, 142,  64,  34,   0.040,  0.048, -22,  -10,  22),
         (18, 0.73, 147,  68,  35,   0.045,  0.050, -24,  -11,  22),
         (20, 0.72, 118,  50,  30,   0.000,  0.030, -10,    6,  18),
         (21, 0.80,  86,  28,  24,  -0.080,  0.000,   2,   20,  14),
         (22, 0.86,  48,  -4,  16,  -0.180, -0.030,   6,   34,  12),
         (23, 0.93,  28, -16,  10,   None,  -0.055,   8,   46,  10),
         (24, 0.93,  27, -16,  10,   None,  -0.057,   8,   47,  10),
         (27, 0.88,  40, -18,  12,  -0.185, -0.025,   7,   34,  13),
         (30, 0.86,  46, -20,  12,  -0.145, -0.012,   8,   30,  14),
         (34, 0.86,  40, -16,  11,  -0.112,  0.000,   9,   27,  14),
         (40, 0.86,  38, -14,  10,  -0.100,  0.000,  10,   26,  14)]

    def tip_z(reach, elev, lead, yaw, dz, dy, twist, spine, head):
        body(dz, dy, twist, spine, head)
        H, rot = solve(reach, elev, lead, yaw)
        return ((H - (rot @ WRIST)) + (rot @ TIP)).z - FLOOR

    # ── THE ONE SOLVE ── how deep does he have to get for the point to
    # touch? Bisection on hip height; everything else is already safe.
    rows = []
    for r in B:
        if r[5] is None:
            lo, hi = -0.55, 0.0
            for _ in range(28):
                mid_ = (lo + hi) * 0.5
                if tip_z(r[1], r[2], r[3], r[4], mid_, r[6], r[7], r[8], r[9]) > 0:
                    hi = mid_
                else:
                    lo = mid_
            r = r[:5] + ((lo + hi) * 0.5,) + r[6:]
        rows.append(r)
    B = rows

    def sample(f):
        for i in range(len(B) - 1):
            f0, f1 = B[i][0], B[i + 1][0]
            if f0 <= f <= f1:
                u = (f - f0) / float(f1 - f0) if f1 > f0 else 0.0
                if not (18 <= f0 < 24):
                    u = u * u * (3 - 2 * u)
                return [p0 + (p1 - p0) * u for p0, p1 in zip(B[i][1:], B[i + 1][1:])]
        return list(B[-1][1:])

    LEAD_Y, REAR_Y = FWD * 0.26 * LEG, 0.26 * LEG
    SPLIT = 0.185 * LEG
    worst_reach, worst_elev, tip_lo = 0.0, 999.0, 1e9
    worst_wrist = {"l": 0.0, "r": 0.0}
    head_clear = 1e9

    for f in range(1, frames + 1):
        reach, elev, lead, yaw, dz, dy, twist, spine, head = sample(f)
        body(dz, dy, twist, spine, head)
        H, rot = solve(reach, elev, lead, yaw)

        TOOL.rotation_quaternion = rot
        TOOL.location = H - (rot @ WRIST)
        TOOL.keyframe_insert("location", frame=f)
        TOOL.keyframe_insert("rotation_quaternion", frame=f)
        for ob in g["TOOL_CHILDREN"]:
            loc, q = g["TOOL_LOCALS"][ob.name]
            ob.location = loc
            ob.keyframe_insert("location", frame=f)
            if q is not None:
                ob.rotation_quaternion = q
                ob.keyframe_insert("rotation_quaternion", frame=f)

        arm.keyframe_insert("location", frame=f)
        for bn in ("pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "head"):
            if arm.pose.bones.get(bn):
                arm.pose.bones[bn].keyframe_insert("rotation_euler", frame=f)

        for s_, (fx, fy) in (("l", (SPLIT, LEAD_Y)), ("r", (-SPLIT, REAR_Y))):
            tgt, pole = iks[s_]
            tgt.location = (fx, fy, FLOOR + ANKLE_H)
            tgt.keyframe_insert("location", frame=f)
            tgt.rotation_quaternion = FOOT_REST[s_]
            tgt.keyframe_insert("rotation_quaternion", frame=f)
            pole.location = (fx * 1.5, fy + FWD * 0.45 * LEG, FLOOR + LEG * 0.52)
            pole.keyframe_insert("location", frame=f)
        # ── THE ELBOW POLES ARE SOLVED, PER FRAME, PER ARM ──────────────
        # ⚠️ A FORCED HAND ORIENTATION HAS TO GO SOMEWHERE. IK sets where
        # the wrist IS and a Copy Rotation sets which way the hand POINTS;
        # the wrist joint silently absorbs the entire difference, and
        # nothing in the rig says no. Measured on the first version: 123
        # degrees of wrist bend where a human manages about 70. That is the
        # "every joint torqued the wrong way" -- not a posing taste
        # question, a broken arm.
        #
        # A real forearm ROLLS to meet the grip, and on an IK chain the
        # thing that rolls it is the pole. So the pole angle is no longer a
        # placed guess: it is swept around the shoulder-to-wrist axis and
        # the position that leaves the LEAST wrist bend wins. The arm
        # arrives already oriented, so the wrist has almost nothing to
        # absorb.
        for s_, pole in (("l", elbow_pole), ("r", g["_pick_pole"])):
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
            # 48 steps, not 24: the cost surface has three terms competing
            # now and a 15-degree sweep walks past the minimum between samples.
            for k in range(48):
                th = k * (math.pi / 24.0)
                cand = ((sh + wr) * 0.5
                        + (u * math.cos(th) + v * math.sin(th)) * (0.9 * ARM))
                pole.location = cand
                bpy.context.view_layer.update()
                fa = (arm.matrix_world @ arm.pose.bones["lowerarm_%s" % s_].tail) -                      (arm.matrix_world @ arm.pose.bones["lowerarm_%s" % s_].head)
                hd = (arm.matrix_world @ arm.pose.bones["hand_%s" % s_].tail) -                      (arm.matrix_world @ arm.pose.bones["hand_%s" % s_].head)
                if fa.length < 1e-6 or hd.length < 1e-6:
                    continue
                bend = math.degrees(fa.angle(hd))
                # ⚠️ SCORE BOTH JOINTS, OR THE SWEEP TRADES ONE FOR THE OTHER.
                # Shoulder roll is weighted above wrist bend because a wrist a
                # few degrees past comfortable reads as a stiff grip, while a
                # humerus rolled past 90 reads as a broken man.
                # ⚠️ SCORE THE WRIST'S TWIST TOO, NOT JUST ITS BEND. This
                # sweep exists because "a real forearm ROLLS to meet the grip,
                # and on an IK chain the thing that rolls it is the pole" --
                # but it only ever measured BEND, so it rolled the arm to
                # straighten the wrist while leaving 73 degrees of twist in a
                # joint that anatomically has no twist axis at all. Palm
                # rotation belongs to the forearm; putting hand twist in the
                # cost is what actually sends it there, kinematically, rather
                # than hiding it in deformation.
                tw = _twist_from_rest(arm.pose.bones["upperarm_%s" % s_])
                hw = _twist_from_rest(arm.pose.bones["hand_%s" % s_])
                cost = bend + 1.5 * tw + 1.5 * hw
                if cost < best:
                    best, bpos, bbend = cost, cand, bend
            pole.location = bpos
            pole.keyframe_insert("location", frame=f)
            worst_wrist[s_] = max(worst_wrist[s_], bbend)
        bpy.context.view_layer.update()

        hd = arm.matrix_world @ arm.pose.bones["head"].head
        ht = arm.matrix_world @ arm.pose.bones["head"].tail
        ha = TOOL.matrix_world @ Vector((0, 0, 0))
        hb = TOOL.matrix_world @ Vector((0, 0, g["HAFT_LEN"] * LEG))
        d_ = hb - ha
        t_ = max(0.0, min(1.0, ((hd + ht) * 0.5 - ha).dot(d_) / max(d_.dot(d_), 1e-9)))
        head_clear = min(head_clear, (((hd + ht) * 0.5) - (ha + d_ * t_)).length)
        worst_reach = max(worst_reach, reach)
        worst_elev = min(worst_elev, elev)
        tip_lo = min(tip_lo, ((H - (rot @ WRIST)) + (rot @ TIP)).z - FLOOR)

    # ⚠️ DO NOT RE-CLOSE THE FISTS HERE. build-pick solves each finger
    # against the shaft radius; a global close_fist stamps over that
    # and puts them back to cupping it.
    _smooth([arm] + list(G["helpers"]))
    for ob in [arm] + list(G["helpers"]):
        if ob.animation_data and ob.animation_data.action:
            for fc in ob.animation_data.action.fcurves:
                for kp in fc.keyframe_points:
                    if 18 <= kp.co[0] <= 24:
                        kp.interpolation = "LINEAR"
    print("MINE  point lowest %.4f above the floor" % tip_lo)
    print("MINE  max reach %.2f of arm (cap %.2f) | min elevation %.0f deg "
          "(negative is behind him)" % (worst_reach, REACH_MAX, worst_elev))
    print("MINE  worst wrist bend  L %.0f  R %.0f deg   (a wrist does about 70)"
          % (worst_wrist["l"], worst_wrist["r"]))
    print("MINE  closest the shaft comes to his head: %.3f  (his head is ~0.09 wide)"
          % head_clear)
    return frames
