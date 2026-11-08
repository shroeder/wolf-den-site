import bpy, bmesh, math, os, sys
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cage
import hand as hand_mod
import face as face_mod
import foot as foot_mod
import head as head_mod

from cage import ring, shape, tube

# ═══════════════════════════════════════════════════════════════════════════
# THE BODY — a quad cage we own, with loops where the joints are, and muscle
# authored as CROSS-SECTIONS.
#
# ⚠️ MUSCLE IS NOT SCULPTED HERE, AND THAT IS DELIBERATE. The last hand-built
# human died of falloff-bump sculpting: gaussian pushes on a surface get you
# brow, nose and cheeks that still read as a melted lump, and more bumps make
# it lumpier rather than better. The technique has a ceiling and it is low.
#
# A ring whose RADIUS VARIES WITH ANGLE has no such ceiling, because it is
# what a modeller actually draws: the deltoid is the shoulder ring pushed out
# laterally, the biceps is the upper-arm ring pushed out anteriorly, the lats
# are the rib rings flared at the sides and pulled in at the waist. Every
# muscle below is a (where around the ring, how wide, how much) triple, which
# is a number I can read, change, and be wrong about visibly.
#
# Metres, floor at z=0, figure about 1.80 tall. He faces -Y, so his right is
# -X. Torso ring vertex 0 sits at +X: 0 = his left, 4 = behind, 8 = his
# right, 12 = front. Limb rings use an anatomical frame -- see limb().
# ═══════════════════════════════════════════════════════════════════════════

# ⚠️ ANATOMY HAS A RESOLUTION FLOOR AND 16 VERTS IS BELOW IT. A pectoral is
# about 80 mm across on a chest 400 mm around, so it wants roughly a tenth of
# the ring. At N=16 each vertex owns 22.5 degrees, so a pec was 1.25 vertices
# -- a single vertex pushed out, which Catmull-Clark then smooths away
# completely. The chest rendered as a featureless slab and no amount of
# increasing the AMOUNT would have fixed it, because the problem was the
# wavelength, not the height.
#
# 32 verts puts a pec at 2.5 vertices and a sternum groove between two of
# them. The limb sockets follow from it: the arm now bridges a 4x2 hole
# (12 boundary edges) and each leg a 19-vert crotch socket.
N = 32          # verts per torso ring
NA = 12         # verts per arm ring -- matches a 4x2 hole in the torso
NL = 19         # verts per leg ring -- matches a crotch-split hip socket

FRONT, BACK = 24, 8

ARM_COLS = {"l": (30, 31, 0, 1), "r": (14, 15, 16, 17)}
HIP_ORDER = {"l": [24, 25, 26, 27, 28, 29, 30, 31, 0, 1, 2, 3, 4, 5, 6, 7, 8],
             "r": [24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8]}

# Where things sit around a TORSO ring, as a fraction of the way round.
T_LEFT, T_BACK, T_RIGHT, T_FRONT = 0.00, 0.25, 0.50, 0.75
# ...and around a LIMB ring. 0 is anterior by construction in limb().
L_ANT, L_LAT, L_POST, L_MED = 0.00, 0.25, 0.50, 0.75


def limb(bm, path, n):
    """Rings along a polyline, each perpendicular to the local direction.

    ⚠️ THE RING'S FRAME IS ANATOMICAL, NOT ARBITRARY. The first version took
    whatever perpendicular basis fell out of a cross product, so "angle zero"
    pointed somewhere different on every ring and on each side -- useless for
    saying "biceps at the front". Here the first axis is the body's FORWARD
    direction projected perpendicular to the limb, so index 0 is always
    anterior, a quarter turn is lateral, half is posterior. A bicep is then
    the same number on both arms.

    path entries are (centre, radius) or (centre, radius, bumps), and radius
    may be a scalar or (across, through).
    """
    out = []
    for k, item in enumerate(path):
        c, r = item[0], item[1]
        bumps = item[2] if len(item) > 2 else None
        c = Vector(c)
        d = Vector(path[min(k + 1, len(path) - 1)][0]) - Vector(path[max(k - 1, 0)][0])
        d = d.normalized() if d.length > 1e-6 else Vector((0, 0, -1))
        ant = Vector((0.0, -1.0, 0.0))
        ant = ant - d * ant.dot(d)
        if ant.length < 1e-4:
            ant = Vector((0.0, 0.0, -1.0)) - d * Vector((0.0, 0.0, -1.0)).dot(d)
        u = ant.normalized()          # anterior
        v = d.cross(u).normalized()   # lateral-ish, completes the frame
        ru, rv = r if isinstance(r, (tuple, list)) else (r, r)
        mult = shape(n, bumps)
        out.append([bm.verts.new(
            c + u * (ru * mult[i] * math.cos(2 * math.pi * i / n))
            + v * (rv * mult[i] * math.sin(2 * math.pi * i / n)))
            for i in range(n)])
    return out


# ── THE TORSO ─────────────────────────────────────────────────────────────
# (name, z, rx, ry, cy, bumps). Named, because the arm hole is found by name:
# inserting a ring for a collarbone must not silently move the shoulder band.
# ⚠️ A SINGLE BUMP ON THE MIDLINE IS NOT A MUSCLE, IT IS A BARREL. The first
# pass put one bump at the FRONT for the pectorals and the chest came out a
# smooth slab -- because what makes a pec read is not depth, it is the STERNUM
# GROOVE between the pair and the hard edge underneath. A midline bump fills
# in exactly the valley that would have made them legible.
#
# So every paired muscle is authored as a PAIR either side of the midline with
# a NEGATIVE bump in the middle: pectorals about the sternum, abdominals about
# the linea alba, erectors about the spine. Negative amounts are the whole
# trick; without them this stays a mannequin however much is added.
#
# Proportions are heroic rather than anatomical: shoulders about 2.7 head
# widths and a waist well under the chest. A realistic figure reads as a shop
# dummy next to the art this has to stand beside.
TORSO = [
    ("crotch", 0.86, 0.150, 0.118, 0.000, None),
    ("hips", 0.96, 0.166, 0.130, 0.000,
     [(T_LEFT, 0.11, 0.08), (T_RIGHT, 0.11, 0.08)]),             # iliac crest
    # ⚠️ A VERTICAL GROOVE ALONE READS AS A BACK. Rings vary radius with
    # ANGLE, so everything they make is vertically continuous -- and a
    # continuous furrow from neck to navel is a spine, which is why the chest
    # looked like a back from the front. What says abdomen is the TRANSVERSE
    # divisions, and what says pectoral is its hard lower border. Those are
    # horizontal, so they are extra RINGS that pull in and push out in
    # alternation, not extra bumps.
    ("ab_low", 1.010, 0.136, 0.106, 0.004,
     [(0.700, 0.050, 0.12), (0.800, 0.050, 0.12),
      (T_FRONT, 0.038, -0.07)]),
    # ⚠️ THE DIVISIONS WERE 45 mm FROM THEIR NEIGHBOURS AND SUBDIVISION ATE
    # THEM. The same arithmetic as the lips, which needed 8 mm to read at
    # all and were mush at 12: on a subdivided cage the sharpness of a
    # crease is set by how CLOSE the loops either side of it are, not by
    # how deep it is. The structure here was right all along -- muscle,
    # band, muscle -- and spread over 45 mm it rendered as a smooth belly
    # with a suggestion of shading. Each band now has a muscle ring 10 mm
    # above and below it.
    ("ab1_top", 1.052, 0.1344, 0.1020, 0.004,
     [(0.700, 0.050, 0.13), (0.800, 0.050, 0.13),
      (T_FRONT, 0.038, -0.07)]),
    ("ab_gap1", 1.062, 0.134, 0.101, 0.004,
     [(T_FRONT, 0.12, -0.075)]),                                 # tendinous band
    ("ab2_bot", 1.072, 0.1368, 0.1031, 0.004,
     [(0.695, 0.055, 0.14), (0.805, 0.055, 0.14),
      (T_FRONT, 0.040, -0.08)]),
    ("waist", 1.105, 0.146, 0.110, 0.004,
     [(0.695, 0.055, 0.16), (0.805, 0.055, 0.16),                # ABDOMINALS
      (T_FRONT, 0.040, -0.08)]),                                 # linea alba
    ("ab2_top", 1.140, 0.1507, 0.1131, 0.004,
     [(0.695, 0.055, 0.15), (0.805, 0.055, 0.15),
      (T_FRONT, 0.040, -0.08)]),
    ("ab_gap2", 1.150, 0.152, 0.114, 0.004,
     [(T_FRONT, 0.12, -0.075)]),
    ("ab3_bot", 1.160, 0.1572, 0.1176, 0.004,
     [(0.690, 0.060, 0.13), (0.810, 0.060, 0.13),
      (T_FRONT, 0.042, -0.07)]),
    ("ribs", 1.20, 0.178, 0.132, 0.004,
     [(T_LEFT, 0.12, 0.17), (T_RIGHT, 0.12, 0.17),               # LATISSIMUS
      (0.690, 0.060, 0.13), (0.810, 0.060, 0.13),                # upper abs
      (T_FRONT, 0.042, -0.06),
      (0.205, 0.060, 0.06), (0.295, 0.060, 0.06),                # erectors
      (T_BACK, 0.045, -0.05)]),                                  # spinal groove
    # the pectoral's lower border: the ring just under the chest pulls IN at
    # the front, so the pec mass above it ends on an edge instead of melting
    # into the ribs.
    ("pec_under", 1.258, 0.186, 0.126, 0.002,
     [(0.676, 0.085, -0.06), (0.824, 0.085, -0.06),
      (T_FRONT, 0.050, -0.05)]),
    # The pectoral's lower edge is the same problem as an ab band: it was a
    # 47 mm fall from the chest ring to the one under it and read as a soft
    # swelling. A rim ring 17 mm below the chest gives it somewhere to stop.
    ("pec_rim", 1.288, 0.2010, 0.1400, 0.0008,
     [(0.676, 0.082, -0.09), (0.824, 0.082, -0.09),
      (T_FRONT, 0.048, -0.06)]),
    ("chest", 1.305, 0.206, 0.144, 0.000,
     [(0.676, 0.078, 0.20), (0.824, 0.078, 0.20),                # PECTORALS
      (T_FRONT, 0.046, -0.11),                                   # sternum
      (T_LEFT, 0.11, 0.11), (T_RIGHT, 0.11, 0.11),               # lats, upper
      (0.196, 0.072, 0.09), (0.304, 0.072, 0.09),                # scapulae
      (T_BACK, 0.050, -0.06)]),
    ("chest_up", 1.38, 0.228, 0.136, -0.004,
     [(0.686, 0.070, 0.13), (0.814, 0.070, 0.13),                # pecs, upper
      (T_FRONT, 0.044, -0.09),
      (0.200, 0.080, 0.09), (0.300, 0.080, 0.09),
      (T_BACK, 0.048, -0.05)]),
    # ⚠️ THE COLLARBONE IS A RIDGE, NOT A WIDTH. It runs from the sternal
    # notch out to the point of the shoulder, so it is a pair of ridges with
    # a PIT between them at the throat. A ring that only widens gives a
    # barrel; the notch is what says collarbone.
    ("clavicle", 1.432, 0.2255, 0.132, -0.006,
     [(0.640, 0.075, 0.11), (0.860, 0.075, 0.11),                # CLAVICLES
      (T_FRONT, 0.050, -0.13)]),                                 # sternal notch
    # ⚠️ AND THE SHOULDER WAS 531 mm, WHICH IS 3.45 HEAD-WIDTHS AGAINST A
    # HEROIC CANON OF 2.85-3.25. It passed the audit for two days because
    # the audit measured 2*rx and ignored the muscle bumps every ring on
    # this body is shaped by -- a width taken off a radius is the width of a
    # cylinder nobody built. From the front he read as a slab with thin arms
    # hanging off it, and the arms were never the problem.
    # ⚠️ TWO RINGS AT THE SHOULDER, not one. The arm bridges into the band
    # BETWEEN them, so the armpit has a real edge loop above and below it. A
    # joint with a single loop through it has nothing to fold along, which is
    # exactly how a deltoid ends up a flat sheet.
    ("shoulder", 1.472, 0.229, 0.128, -0.006,
     [(T_LEFT, 0.13, 0.07), (T_RIGHT, 0.13, 0.07)]),
    # ⚠️ THE HOLE MUST SIT ON A SURFACE THAT IS NOT COLLAPSING. The arm
    # bridges the band clavicle -> shoulder -> trapezius, and with the traps
    # at 0.162 against a shoulder of 0.248 the top of that hole fell away by
    # 86 mm in 44 mm of height. The cuff is a flat ellipse, so the bridge had
    # to twist to reach it and threw a triangular flap at each shoulder.
    # Anatomically the traps are broad anyway -- they slope from the neck out
    # to the point of the shoulder; the pinch belongs at the neck, one ring up.
    ("trapezius", 1.516, 0.206, 0.118, -0.008,
     [(0.205, 0.090, 0.20), (0.295, 0.090, 0.20),                # TRAPEZIUS
      (T_BACK, 0.050, -0.07)]),
    ("neck_base", 1.530, 0.086, 0.078, -0.004,
     [(0.210, 0.100, 0.16), (0.290, 0.100, 0.16),
      (T_BACK, 0.050, -0.05)]),
    ("neck", 1.562, 0.062, 0.066, -0.004,
     [(0.700, 0.070, 0.07), (0.800, 0.070, 0.07)]),              # sternomastoid
]
# ── THE BACK ──────────────────────────────────────────────────────────────
# ⚠️ THE BACK HAD ALMOST NOTHING ON IT AND I HAD NEVER RENDERED IT STRAIGHT
# ON. The spinal furrow and the erectors existed on four rings out of
# seventeen -- the ribs and the chest -- so everything below the ribcage was
# a smooth slab from the armpits to the waist. Three-quarter views had been
# hiding it the same way they hid the shoulders being half a head too wide.
#
# The furrow was also 45-50 thousandths wide, which on a 32-vert ring is
# three vertices of gentle cosine and reads as nothing. It is 28 now, which
# is the same arithmetic as the lips and the ab bands: a crease is sharp
# because the thing either side of it is CLOSE, not because it is deep.
#
# (ring -> erector height, furrow depth). Strongest through the thoracic
# spine and easing off at the lumbar and the neck, which is where a back
# actually carries its mass.
F_ERECTOR_L, F_ERECTOR_R = 0.293, 0.207

# ⚠️ NOT CALLED "BACK". That name is already the index of the ring vertex
# at the rear (FRONT, BACK = 24, 8) and hip_sockets() indexes a vertex list
# with it -- shadowing it swapped an integer for a dict and the figure
# failed to build at the crotch, which is nowhere near where the edit was.
BACK_FORMS = {
    "hips": (0.06, -0.05), "ab_low": (0.07, -0.06),
    "ab1_top": (0.07, -0.06), "ab_gap1": (0.07, -0.06),
    "ab2_bot": (0.08, -0.07), "waist": (0.09, -0.08),
    "ab2_top": (0.09, -0.08), "ab_gap2": (0.09, -0.08),
    "ab3_bot": (0.09, -0.08), "ribs": (0.10, -0.08),
    "pec_under": (0.10, -0.08), "pec_rim": (0.10, -0.08),
    "chest": (0.11, -0.08), "chest_up": (0.11, -0.07),
    "clavicle": (0.09, -0.06), "shoulder": (0.07, -0.05),
    "trapezius": (0.18, -0.07),
}


def _apply_back():
    """Replace whatever erector and furrow bumps a ring already had."""
    names = [t[0] for t in TORSO]
    for name, (ere, fur) in BACK_FORMS.items():
        i = names.index(name)
        n, z, rx, ry, cy, b = TORSO[i]
        keep = [t for t in (b or ()) if not (0.185 <= t[0] <= 0.315)]
        TORSO[i] = (n, z, rx, ry, cy,
                    keep + [(F_ERECTOR_L, 0.052, ere),
                            (F_ERECTOR_R, 0.052, ere),
                            (T_BACK, 0.028, fur)])


_apply_back()

SHOULDER_BAND = [t[0] for t in TORSO].index("clavicle")

# THE HAND'S SIZE, as one set of numbers. A hand is about the height of a
# face: for a 1.80 m figure that is ~190 mm wrist to fingertip, of which the
# palm is a little under half.
# ⚠️ THE PALM IS THE LONGER HALF. Giving the fingers the bigger share makes
# every one of them read long however wide it is: on a real hand the palm is
# about 55% of wrist-to-fingertip. And a palm is not a sheet -- at 14 mm of
# half-thickness the whole hand photographs as a plank.
PALM_LEN = 0.102        # wrist to knuckle line
PALM_HALF_W = 0.047     # half the knuckle-line width
PALM_HALF_T = 0.0165    # half the palm's thickness


def foot_plan(side):
    """The foot's own landmarks, with no mesh built -- same contract as
    hand_plan(): one function, two readers, so a joint cannot end up outside
    the flesh it drives."""
    return foot_mod.plan(side, leg_path(side)[LEG_AT["ankle"]][0])


def hand_plan(side):
    """The hand's own joint centres, with no mesh built.

    ⚠️ THE RIG MUST NOT RE-DERIVE THESE. rig.py reads arm_path() for the
    elbow for exactly this reason -- a joint computed twice is a joint that
    can disagree with itself, and a skeleton sitting outside its flesh is
    the defect that cost this pipeline its worst day. One function, two
    readers.
    """
    p = arm_path(side)
    return hand_mod.plan(side, p[ARM_AT["wrist"]][0], p[ARM_AT["end"]][0],
                         PALM_LEN, PALM_HALF_W, PALM_HALF_T)


def hand_centre(side="l"):
    """Where to point a camera to photograph the hand."""
    p = arm_path(side)
    a, b = Vector(p[ARM_AT["wrist"]][0]), Vector(p[ARM_AT["end"]][0])
    return tuple((a + b) * 0.5)


# ⚠️ THE BIND POSE IS AN A-POSE, AND THAT IS NOT A STYLE CHOICE.
# Built with the arms hanging straight down, the hands sit right beside the
# hips -- and an outer-hip vertex then measures 0.082 m to the HAND bone
# against 0.096 m to its own thigh. Distance-based weights hand the hip to
# the arm, so raising the arm dragged a blade of flank up with it, from hip
# to ear. Measured, not guessed: thigh flesh rose 0.51 m when an ARM moved.
# Every base mesh is modelled in an A- or T-pose for this reason.
ARM_DROP = math.radians(40.0)
# Where the arm leaves the body. Shared with rig.py so the shoulder JOINT
# and the shoulder MESH cannot drift apart.
SHOULDER_X = 0.196

# Landmark RING INDICES, so the rig can find a joint by name. Adding a ring
# for a bicep must not silently move the elbow.
# ⚠️ THESE WERE HAND-COUNTED INDICES AND THE FILE'S OWN COMMENT WARNED THAT
# "adding a ring for a bicep must not silently move the elbow". Adding two
# rings at each joint moved every landmark past it, which would have put the
# wrist bone in the middle of a forearm with nothing erroring. Name the
# rings and derive the indices; the assert in build() catches any drift
# between the names and the path that is supposed to match them.
ARM_RINGS = ["cuff", "deltoid", "delt_low", "bicep", "bicep_low",
             "elbow_up", "elbow", "elbow_low", "flexor", "forearm_mid",
             "forearm_low", "wrist", "palm", "knuckles", "end"]
LEG_RINGS = ["hip", "thigh", "thigh_low", "quad_low", "knee_up", "knee",
             "knee_low", "calf_up", "calf", "calf_low", "shin", "achilles",
             "shin_low", "ankle_up", "malleolus", "ankle",
             "heel", "ball", "toe"]
ARM_AT = {n: i for i, n in enumerate(ARM_RINGS)}
LEG_AT = {n: i for i, n in enumerate(LEG_RINGS)}


def arm_path(side):
    s = 1.0 if side == "l" else -1.0
    ox, oz = s * SHOULDER_X, 1.452
    dx, dz = math.sin(ARM_DROP) * s, -math.cos(ARM_DROP)

    def at(t, y=0.0):
        return (ox + dx * t, y, oz + dz * t)

    # ⚠️ THE FIRST RING MUST FIT THE HOLE IT BRIDGES INTO, AND IT DID NOT.
    # The torso hole is a 2x2 patch -- about 160 mm around the ring by 84 mm
    # tall -- and the arm arrived as a 58 mm CIRCLE sitting inboard of the
    # torso surface. The bridge had to flare out to meet it, and then a 42%
    # deltoid bulge landed immediately outboard of that, so the shoulder read
    # as a ball hanging off the body with a notch behind it. The cuff is
    # elliptical now, matching the hole's proportions, and the deltoid grows
    # OUT of it instead of starting beyond it.
    return [
        # ⚠️ THE CUFF IS SIZED FROM THE HOLE, NOT FROM THE ARM. The torso
        # hole is a 4x2 patch -- about 190 mm around the ring by 84 mm tall --
        # so a cuff that is taller than it is wide leaves the bridge to span
        # a step, and that step is the hard notch visible at both shoulders.
        # Seated slightly INSIDE the torso so the bridge is short: any
        # residual mismatch between the hole's corners and the cuff's then
        # has almost no span to shear across.
        (at(-0.020), (0.104, 0.050), [(L_LAT, 0.24, 0.04)]),
        # DELTOID — the cap. Mostly lateral, wrapping a little front and back.
        (at(0.095), (0.070, 0.054), [(L_LAT, 0.28, 0.20), (L_ANT, 0.20, 0.12),
                                     (L_POST, 0.20, 0.12)]),
        (at(0.165), 0.056, [(L_LAT, 0.26, 0.14), (L_ANT, 0.18, 0.08)]),
        # BICEPS anterior, TRICEPS posterior. The triceps is the longer mass
        # and sits lower; the biceps peaks higher.
        (at(0.230), 0.050, [(L_ANT, 0.20, 0.26), (L_POST, 0.22, 0.22)]),
        (at(0.288), 0.046, [(L_ANT, 0.19, 0.16), (L_POST, 0.21, 0.20)]),
        # ── THE ELBOW ─────────────────────────────────────────────────────
        # ⚠️ ONE LOOP THROUGH A JOINT HAS NOTHING TO FOLD ALONG. This is the
        # same defect the shoulder had and the same fix: the joint gets a
        # ring either side of it, close in, so the surface has an edge to
        # crease on instead of a long smooth span that collapses when the
        # limb bends. It is also why the arm read as a tube -- a joint with
        # no structure is not a joint, it is a diameter.
        #
        # The olecranon is the POINT of the elbow and it is posterior; the
        # joint is narrower across than the muscle above and below it, which
        # is what makes the taper read.
        #
        # ⚠️ AND THE BUMP IS MEASURED AGAINST ITS NEIGHBOURS, NOT ITS OWN
        # RING. The first pass put a 20% bump on a joint ring that is itself
        # 5 mm narrower than the limb above it, so the "point" of the elbow
        # came out a millimetre BEHIND the triceps and the knee's patella
        # sat behind the thigh. Both joints rendered as a faint crease. A
        # bump is a fraction of its own radius; what the eye reads is how
        # far it stands out from what is either side of it.
        (at(0.318), 0.0425, [(L_POST, 0.20, 0.09)]),
        (at(0.335), 0.0395, [(L_POST, 0.17, 0.42),               # olecranon
                             (L_LAT, 0.16, -0.05), (L_MED, 0.16, -0.05)]),
        (at(0.354), 0.0425, [(L_POST, 0.19, 0.10), (L_ANT, 0.18, 0.07)]),
        # FOREARM — the flexor mass sits just below the elbow, then tapers
        # hard to a wrist that is mostly bone.
        (at(0.398), 0.045, [(L_ANT, 0.26, 0.22), (L_MED, 0.20, 0.12)]),
        (at(0.470), 0.041, [(L_ANT, 0.24, 0.12)]),
        (at(0.540), 0.034, None),
        (at(0.592), (0.030, 0.024), None),                       # wrist (9)
        # ⚠️ PAST HERE IS REFERENCE, NOT GEOMETRY. The arm tube is meshed up
        # to the wrist only; hand.py builds the palm and bridges into this
        # ring. These three entries stay because rig.py reads ARM_AT["end"]
        # for the hand bone and the hand is placed from them -- deleting them
        # would move a joint silently.
        (at(0.648, -0.008), (0.045, 0.024), None),               # palm
        (at(0.694, -0.013), (0.043, 0.023), None),               # knuckles
        (at(0.782, -0.018), (0.030, 0.017), None),               # end (12)
    ]


# The arm is meshed to this ring and no further.
ARM_MESH_TO = ARM_AT["wrist"]


def leg_path(side):
    s = 1.0 if side == "l" else -1.0

    def at(z, x=0.098, y=0.0):
        return (s * x, y, z)

    return [
        (at(0.860, 0.082), 0.102, [(L_POST, 0.22, 0.14), (L_LAT, 0.16, 0.06)]),
        # QUADRICEPS anterior, HAMSTRINGS posterior, and the outer sweep of
        # the vastus lateralis.
        (at(0.760, 0.090), 0.094, [(L_ANT, 0.22, 0.16), (L_POST, 0.22, 0.14),
                                   (L_LAT, 0.18, 0.08)]),
        (at(0.620, 0.095), 0.078, [(L_ANT, 0.22, 0.18), (L_POST, 0.22, 0.12),
                                   (L_LAT, 0.18, 0.09)]),
        (at(0.530), 0.064, [(L_ANT, 0.20, 0.10)]),
        # ── THE KNEE ──────────────────────────────────────────────────────
        # Same three-ring treatment as the elbow, and the same reason. The
        # shapes are a patella standing proud at the front, the joint pulled
        # IN at the sides so the kneecap reads against something, and the
        # tibial tuberosity just below it -- the bump you kneel on.
        (at(0.500), 0.0595, [(L_ANT, 0.22, 0.11)]),
        (at(0.470), 0.0545, [(L_ANT, 0.20, 0.38),                 # patella
                             (L_LAT, 0.17, -0.07), (L_MED, 0.17, -0.07)]),
        (at(0.444), 0.0565, [(L_ANT, 0.18, 0.18)]),               # tuberosity
        # CALF — gastrocnemius, high and posterior, tapering to a thin ankle.
        # The two heads give it width as well as depth.
        (at(0.410), 0.062, [(L_POST, 0.26, 0.26)]),
        (at(0.350), 0.066, [(L_POST, 0.28, 0.34), (L_LAT, 0.16, 0.06)]),
        (at(0.290), 0.058, [(L_POST, 0.26, 0.24)]),
        # ── THE ACHILLES AND THE ANKLE ────────────────────────────────────
        # The tendon is the one thing on this figure a ring is perfectly
        # suited to: a narrow ridge running straight down the back of the
        # leg. It is made by the bump getting NARROWER as it descends while
        # the leg itself thins -- a wide posterior bump is a calf, the same
        # bump at half the width is a tendon.
        #
        # The malleoli are the opposite shape: a short pair either side at
        # one height, which makes the ankle a local WIDENING between the
        # thin shin and the foot. Without them the leg tapers smoothly into
        # the instep and the join reads as a sock.
        # ⚠️ AND THE WHOLE LOWER LEG WAS TOO THICK FOR AN ANKLE. At 77 mm
        # just above the joint it was already wider than a real bimalleolar
        # 70, so there was no room for the bones to stand proud of anything
        # -- and widening them to make them read is what pushed the ring
        # past the instep in the first place.
        (at(0.220), 0.048, [(L_POST, 0.20, 0.10)]),
        (at(0.185), 0.0425, [(L_POST, 0.13, 0.13)]),              # Achilles
        (at(0.150), 0.0360, [(L_POST, 0.11, 0.15)]),
        (at(0.125), 0.0325, [(L_POST, 0.10, 0.16)]),
        # The malleoli get a ring of their OWN, above the one that bridges
        # into the instep -- so the ankle bone can be the widest thing on
        # the leg without the join having to swallow it.
        (at(0.104), 0.0315, [(L_POST, 0.10, 0.10),
                             (L_LAT, 0.115, 0.16), (L_MED, 0.115, 0.13)]),
        # ⚠️ AND THIS RING MUST FIT INSIDE THE INSTEP IT BRIDGES INTO. At
        # 76 mm against a 66 mm instep the leg overhung the foot and the
        # bridge gathered it in like a cuff -- a band of fine vertical
        # pleats right at the join, which has been there since the foot was
        # built and which the malleoli made worse before anything caught
        # it. Exactly the cuff-bigger-than-its-socket mistake the nose and
        # the ear each made, a third time.
        # ⚠️ SEAT THE CUFF INSIDE THE SURFACE -- the lesson the shoulder, the
        # thumb and the nose each taught, and the one I did not apply here.
        # At z 0.090 against an instep at 0.076 the bridge had 14 mm of
        # height to span a 50 mm-long rim with a 65 mm ring, so every quad
        # in it was long and skewed and the band pleated. Width and shape
        # both mattered and neither was the main thing: a bridge shears in
        # proportion to how far it has to travel. Dropped INSIDE the foot,
        # there is almost no span left to shear across.
        (at(0.072), (0.0310, 0.040), [(L_POST, 0.10, 0.10)]),
        (at(0.042, 0.098, -0.040), (0.040, 0.044), None),
        (at(0.028, 0.098, -0.120), (0.042, 0.028), None),         # ball (12)
        (at(0.020, 0.098, -0.175), (0.032, 0.020), None),         # toe (13)
    ]


def _face_between(a, b, i, j):
    for f in a[i].link_faces:
        if set(f.verts) == {a[i], a[j], b[j], b[i]}:
            return f
    return None


def cut_arm_hole(bm, rings, band, cols):
    """Delete a 4x2 patch of torso faces; return its 12 boundary edges."""
    faces = []
    for ri in (band, band + 1):
        a, b = rings[ri], rings[ri + 1]
        for ci in cols:
            f = _face_between(a, b, ci % N, (ci + 1) % N)
            if f:
                faces.append(f)
    bmesh.ops.delete(bm, geom=faces, context="FACES")
    bm.edges.ensure_lookup_table()
    zs = [rings[band][0].co.z, rings[band + 2][0].co.z]
    return [e for e in bm.edges if len(e.link_faces) == 1
            and min(zs) - 0.03 <= sum(v.co.z for v in e.verts) / 2 <= max(zs) + 0.03]


def hip_sockets(bm, bottom):
    """Split the open bottom of the pelvis into two leg sockets.

    ⚠️ THE CROTCH IS THE HARD JUNCTION ON ANY HUMANOID. Two tubes poking into
    a capped cylinder is not a body -- the surfaces merely intersect, share no
    edge, and nothing deforms across the hip. One shared midline vertex is
    worse: it pinches, two separate face fans meeting at a point. The fix is a
    midline EDGE, so the two 11-vert sockets share it, it carries two faces,
    and the mesh stays manifold.
    """
    z = bottom[0].co.z
    ry = max(abs(v.co.y) for v in bottom)
    f = bm.verts.new((0.0, -ry * 0.52, z - 0.045))
    b = bm.verts.new((0.0, ry * 0.58, z - 0.030))
    seam = bm.edges.new((f, b))
    e_bf = bm.edges.new((bottom[BACK], b))
    e_ff = bm.edges.new((f, bottom[FRONT]))

    def side_edges(order):
        es = []
        for i, j in zip(order, order[1:]):
            e = bm.edges.get((bottom[i], bottom[j]))
            if e:
                es.append(e)
        return es + [e_bf, seam, e_ff]

    return {k: side_edges(v) for k, v in HIP_ORDER.items()}


def build():
    me = bpy.data.meshes.new("Hero")
    ob = bpy.data.objects.new("Hero", me)
    bpy.context.collection.objects.link(ob)
    cage.BRIDGES.clear()
    bm = bmesh.new()

    rings = [ring(bm, z, rx, ry, cy, n=N, bumps=b) for _n, z, rx, ry, cy, b in TORSO]
    tube(bm, rings)
    # The head is a cage of its own at twice this resolution; it steps up off
    # the torso's last ring rather than continuing it. See head.py for why.
    hrings = head_mod.build(bm, rings[-1])
    for t in (bm.verts, bm.edges, bm.faces):
        t.ensure_lookup_table()

    assert len(ARM_RINGS) == len(arm_path("l")), "ARM_RINGS is out of step with arm_path"
    assert len(LEG_RINGS) == len(leg_path("l")), "LEG_RINGS is out of step with leg_path"

    log = []
    hands = {}
    feet = {}
    for side, cols in (("l", ARM_COLS["l"]), ("r", ARM_COLS["r"])):
        bm.edges.ensure_lookup_table()
        hole = cut_arm_hole(bm, rings, SHOULDER_BAND, cols)
        path = arm_path(side)
        a = limb(bm, path[:ARM_MESH_TO + 1], NA)
        tube(bm, a)
        bm.edges.ensure_lookup_table()
        cuff = [e for e in bm.edges if len(e.link_faces) == 1 and set(e.verts) <= set(a[0])]
        r = cage.bridge(bm, hole, cuff, "arm_%s" % side)
        log.append("arm_%s  hole %2d  cuff %2d  -> %2d faces"
                   % (side, len(hole), len(cuff), len(r.get("faces", []))))

        # THE HAND. The forearm's last ring is 12 verts and the palm's is 18
        # -- see hand.py for why the palm cannot be narrower. bridge_loops
        # spans the difference; the triangles land on the inside of the wrist.
        wrist = path[ARM_AT["wrist"]][0]
        tip = path[ARM_AT["end"]][0]
        h = hand_mod.build(bm, side, wrist, tip,
                           palm_len=PALM_LEN, half_w=PALM_HALF_W,
                           half_t=PALM_HALF_T)
        hands[side] = h
        bm.edges.ensure_lookup_table()
        wcuff = [e for e in bm.edges
                 if len(e.link_faces) == 1 and set(e.verts) <= set(a[-1])]
        hcuff = [e for e in bm.edges
                 if len(e.link_faces) == 1 and set(e.verts) <= set(h.ring_verts)]
        r = cage.bridge(bm, wcuff, hcuff, "wrist_%s" % side)
        log.append("hand_%s wrist %2d  palm %2d  -> %2d faces"
                   % (side, len(wcuff), len(hcuff), len(r.get("faces", []))))

    # ── THE FACE'S SEPARATE PIECES ────────────────────────────────────────
    # ⚠️ MIRRORING A RING INDEX IS 0.5 - f, NOT f + 0.5. A ring runs left ->
    # back -> right -> front, so the reflection of a vertex across the body's
    # midline is the one with the SAME y and the opposite x -- which is
    # (N/2 - i), not (i + N/2). Getting it the obvious way round put his
    # right ear on his cheek, pointing forwards, and it rendered as a slab
    # stuck to the middle of his face.
    #
    # ⚠️ AN EAR BELONGS OVER THE JAW HINGE, which is barely past the middle
    # of the skull. A quarter of the way round put it 47 mm behind centre --
    # most of the way to the back of his head.
    NH = head_mod.NH
    bm.edges.ensure_lookup_table()
    for side, c0 in (("l", 1), ("r", NH // 2 - 3)):
        bm.edges.ensure_lookup_table()
        log.append("ear_%s  rim %2d  cuff %2d  -> %2d faces"
                   % ((side,) + face_mod.ear(bm, hrings, head_mod.at("nose_base"),
                                             (c0, c0 + 1, c0 + 2), NH, side)))

    # ── THE NOSTRILS ──────────────────────────────────────────────────────
    # One quad each on the nose's underside, either side of the midline
    # column. The mirror of a ring index is (N/2 - i), so 46 and 49 are a
    # pair about the face's midline at 48.
    bm.edges.ensure_lookup_table()
    for col in (int(round(0.75 * NH)) - 2, int(round(0.75 * NH)) + 1):
        bm.edges.ensure_lookup_table()
        face_mod.nostril(bm, hrings, head_mod.at("subnasal"), col, NH)
    log.append("nostrils on the subnasal step")

    # ── THE MOUTH ─────────────────────────────────────────────────────────
    # Eight columns centred on the face's midline, four ring gaps tall: a
    # 24-edge rim for a 24-vert lattice.
    bm.edges.ensure_lookup_table()
    mc0 = int(round(0.75 * NH)) - 4
    log.append("mouth  rim %2d  cuff %2d  -> %2d faces"
               % face_mod.mouth(bm, hrings, head_mod.at("sulcus"),
                                tuple(range(mc0, mc0 + 8)), NH))

    # ── THE EYES ──────────────────────────────────────────────────────────
    # Four columns centred on the eye's own fraction, two ring gaps tall:
    # a 12-edge rim for a 12-vert socket. The right eye's columns are the
    # left's mirrored, and the mirror of a ring index is (N/2 - i).
    eye_ri = head_mod.at("lid_low")
    c0 = int(round(head_mod.F_EYE_L * NH)) - 2
    cl = (c0, c0 + 1, c0 + 2, c0 + 3)
    cr = tuple(sorted((NH // 2 - (c + 1)) % NH for c in cl))
    eyes = []
    for cols in (cl, cr):
        bm.edges.ensure_lookup_table()
        eyes.append(face_mod.eye_socket(bm, hrings, eye_ri, cols, NH))
    log.append("eyes   cols %s and %s" % (cl, cr))
    for centre, outward in eyes:
        face_mod.eyeball(bm, centre, outward)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()

    sockets = hip_sockets(bm, rings[0])
    for side in ("l", "r"):
        path = leg_path(side)
        lg = limb(bm, path[:LEG_AT["ankle"] + 1], NL)
        tube(bm, lg)
        bm.edges.ensure_lookup_table()
        cuff = [e for e in bm.edges if len(e.link_faces) == 1 and set(e.verts) <= set(lg[0])]
        r = cage.bridge(bm, sockets[side], cuff, "hip_%s" % side)
        log.append("leg_%s  socket %2d  cuff %2d  -> %2d faces"
                   % (side, len(sockets[side]), len(cuff), len(r.get("faces", []))))

        # THE FOOT. The leg is meshed to the ankle and no further -- a tube
        # cannot have a heel, because a heel is mass BEHIND the path that
        # generated it. See foot.py.
        ft = foot_mod.build(bm, side, path[LEG_AT["ankle"]][0])
        feet[side] = ft
        bm.edges.ensure_lookup_table()
        acuff = [e for e in bm.edges
                 if len(e.link_faces) == 1 and set(e.verts) <= set(lg[-1])]
        r = cage.bridge(bm, acuff, ft.instep, "ankle_%s" % side)
        log.append("foot_%s ankle %2d  instep %2d  -> %2d faces"
                   % (side, len(acuff), len(ft.instep), len(r.get("faces", []))))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    loose = [e for e in bm.edges if len(e.link_faces) == 1]
    bad = [e for e in bm.edges if len(e.link_faces) > 2]
    bm.to_mesh(me)
    bm.free()

    for p in me.polygons:
        p.use_smooth = True
    sub = ob.modifiers.new("Subsurf", "SUBSURF")
    sub.levels = sub.render_levels = 2
    for line in log:
        print("   " + line)
    # ⚠️ A HOLE AND A PINCH BOTH RENDER AS "FINE" FROM MOST ANGLES.
    rep, bad_bridge = cage.bridge_report()
    print(rep)
    print("HERO cage %d verts %d faces | boundary edges %d | non-manifold %d"
          % (len(me.vertices), len(me.polygons), len(loose), len(bad)))
    ob["hand_joints"] = {s: h.joints for s, h in hands.items()}
    return ob


if __name__ == "__main__":
    HERE = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, HERE)
    import look

    bpy.ops.wm.read_homefile(use_empty=True)
    ob = build()
    look.clay(ob)
    look.stage(floor_z=0.0)
    out = os.path.join(HERE, "_look")
    HAND_CENTRE = hand_centre("l")
    KNEE_CENTRE = tuple(leg_path("l")[LEG_AT["knee"]][0])
    ELBOW_CENTRE = tuple(arm_path("l")[ARM_AT["elbow"]][0])
    _m = head_mod.HEAD[head_mod.at("mouth")]
    MOUTH_CENTRE = (0.0, _m[4] - _m[3] * 0.6, _m[1])
    look.sheet(out, "body", (0, 0, 0.92), 2.05)
    # Straight on and in profile, for the same reason the head sheet is:
    # three-quarter views hide what a form gets wrong.
    look.sheet(out, "torso", (0, 0, 1.22), 0.62, angles=(0, 35, 90, 180),
               res=(900, 900))
    look.sheet(out, "arm", (0.30, 0, 1.25), 0.60, res=(900, 900))
    # A hand is a hand-sized picture or it is four pink pixels.
    look.sheet(out, "hand", HAND_CENTRE, 0.30, res=(900, 900))
    # ⚠️ A FACE NEEDS A FRONT AND A PROFILE, which the standard four angles
    # never give: they are all three-quarter views, and a three-quarter view
    # hides exactly the two things a face goes wrong in. Three rounds went
    # on a nose that "looked like a beak" in a 34-degree view; the straight
    # profile showed in one picture that the nose was ordinary and the BROW
    # was 15 mm too far back.
    look.sheet(out, "head", (0, 0, 1.70), 0.30, angles=(0, 35, 90, 180),
               res=(900, 900))
    look.sheet(out, "calf", (0.10, 0, 0.33), 0.45, res=(900, 900))
    # ⚠️ THE HARNESS MUST PHOTOGRAPH THE THING BEING WORKED ON. Two rings
    # went into each of the elbow and the knee before anyone noticed that
    # neither joint appeared in any sheet -- the knee sat just off the top
    # of the calf shot. A region with no picture is a region worked on blind.
    look.sheet(out, "knee", KNEE_CENTRE, 0.24, res=(900, 900))
    look.sheet(out, "elbow", ELBOW_CENTRE, 0.22, res=(900, 900))
    look.sheet(out, "mouth", MOUTH_CENTRE, 0.105, angles=(0, 35, 90),
               res=(900, 900))
    look.sheet(out, "foot", (0.10, -0.06, 0.06), 0.32, angles=(0, 35, 90, 180),
               res=(900, 900))
    print("LOOK_OK %s" % out)
