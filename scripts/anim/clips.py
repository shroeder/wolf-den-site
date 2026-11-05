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
            pole.location = (sx * 0.18 * LEG, FWD * 0.40 * LEG, FLOOR + LEG * 0.52)
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
            pole.location = (fx * 1.1, fy + FWD * 0.40 * LEG, FLOOR + LEG * 0.50)
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
