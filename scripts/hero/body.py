import bpy, bmesh, math, os, sys
from mathutils import Vector

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


def shape(n, bumps):
    """Radial multipliers around a ring. Each bump is (where, width, amount),
    all as fractions of the way round, with a cosine falloff and wraparound."""
    out = []
    for i in range(n):
        f = i / float(n)
        m = 1.0
        for c, w, a in bumps or ():
            d = abs(((f - c + 0.5) % 1.0) - 0.5)
            if d < w:
                m += a * (0.5 + 0.5 * math.cos(math.pi * d / w))
        out.append(m)
    return out


def ring(bm, cz, rx, ry, cy=0.0, n=N, bumps=None, dz=None):
    """One elliptical cross-section, optionally shaped by muscle bumps.
    `dz` lifts individual verts (the trapezius rises, it does not just
    widen)."""
    mult = shape(n, bumps)
    lift = shape(n, dz) if dz else [1.0] * n
    vs = []
    for i in range(n):
        a = 2.0 * math.pi * i / n
        vs.append(bm.verts.new((rx * mult[i] * math.cos(a),
                                cy + ry * mult[i] * math.sin(a),
                                cz + (lift[i] - 1.0))))
    return vs


def tube(bm, rings):
    for a, b in zip(rings, rings[1:]):
        n = len(a)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))


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
    ("hips", 0.96, 0.172, 0.130, 0.000,
     [(T_LEFT, 0.11, 0.08), (T_RIGHT, 0.11, 0.08)]),             # iliac crest
    # ⚠️ A VERTICAL GROOVE ALONE READS AS A BACK. Rings vary radius with
    # ANGLE, so everything they make is vertically continuous -- and a
    # continuous furrow from neck to navel is a spine, which is why the chest
    # looked like a back from the front. What says abdomen is the TRANSVERSE
    # divisions, and what says pectoral is its hard lower border. Those are
    # horizontal, so they are extra RINGS that pull in and push out in
    # alternation, not extra bumps.
    ("ab_low", 1.010, 0.136, 0.106, 0.004,
     [(0.700, 0.050, 0.09), (0.800, 0.050, 0.09),
      (T_FRONT, 0.038, -0.07)]),
    ("ab_gap1", 1.062, 0.134, 0.101, 0.004,
     [(T_FRONT, 0.14, -0.05)]),                                  # tendinous band
    ("waist", 1.105, 0.142, 0.110, 0.004,
     [(0.695, 0.055, 0.12), (0.805, 0.055, 0.12),                # ABDOMINALS
      (T_FRONT, 0.040, -0.08)]),                                 # linea alba
    ("ab_gap2", 1.150, 0.152, 0.114, 0.004,
     [(T_FRONT, 0.14, -0.05)]),
    ("ribs", 1.20, 0.178, 0.132, 0.004,
     [(T_LEFT, 0.12, 0.17), (T_RIGHT, 0.12, 0.17),               # LATISSIMUS
      (0.690, 0.060, 0.09), (0.810, 0.060, 0.09),                # upper abs
      (T_FRONT, 0.042, -0.06),
      (0.205, 0.060, 0.06), (0.295, 0.060, 0.06),                # erectors
      (T_BACK, 0.045, -0.05)]),                                  # spinal groove
    # the pectoral's lower border: the ring just under the chest pulls IN at
    # the front, so the pec mass above it ends on an edge instead of melting
    # into the ribs.
    ("pec_under", 1.258, 0.186, 0.126, 0.002,
     [(0.676, 0.085, -0.06), (0.824, 0.085, -0.06),
      (T_FRONT, 0.050, -0.05)]),
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
    ("clavicle", 1.432, 0.244, 0.132, -0.006,
     [(0.640, 0.075, 0.11), (0.860, 0.075, 0.11),                # CLAVICLES
      (T_FRONT, 0.050, -0.13)]),                                 # sternal notch
    # ⚠️ TWO RINGS AT THE SHOULDER, not one. The arm bridges into the band
    # BETWEEN them, so the armpit has a real edge loop above and below it. A
    # joint with a single loop through it has nothing to fold along, which is
    # exactly how a deltoid ends up a flat sheet.
    ("shoulder", 1.472, 0.248, 0.128, -0.006,
     [(T_LEFT, 0.13, 0.07), (T_RIGHT, 0.13, 0.07)]),
    # ⚠️ THE HOLE MUST SIT ON A SURFACE THAT IS NOT COLLAPSING. The arm
    # bridges the band clavicle -> shoulder -> trapezius, and with the traps
    # at 0.162 against a shoulder of 0.248 the top of that hole fell away by
    # 86 mm in 44 mm of height. The cuff is a flat ellipse, so the bridge had
    # to twist to reach it and threw a triangular flap at each shoulder.
    # Anatomically the traps are broad anyway -- they slope from the neck out
    # to the point of the shoulder; the pinch belongs at the neck, one ring up.
    ("trapezius", 1.516, 0.216, 0.118, -0.008,
     [(0.205, 0.090, 0.20), (0.295, 0.090, 0.20),                # TRAPEZIUS
      (T_BACK, 0.050, -0.07)]),
    ("neck_base", 1.560, 0.088, 0.078, -0.004,
     [(0.210, 0.100, 0.16), (0.290, 0.100, 0.16),
      (T_BACK, 0.050, -0.05)]),
    ("neck", 1.612, 0.064, 0.062, 0.000,
     [(0.700, 0.070, 0.07), (0.800, 0.070, 0.07)]),              # sternomastoid
    ("jaw", 1.655, 0.080, 0.090, -0.004, None),
    ("cheek", 1.705, 0.094, 0.105, -0.004, None),
    ("skull", 1.755, 0.092, 0.100, 0.000, None),
    ("crown", 1.800, 0.060, 0.064, 0.004, None),
]
SHOULDER_BAND = [t[0] for t in TORSO].index("clavicle")


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
ARM_AT = {"elbow": 5, "wrist": 9, "end": 12}
LEG_AT = {"knee": 4, "ankle": 10, "ball": 12, "toe": 13}


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
        (at(0.335), 0.041, [(L_POST, 0.20, 0.10)]),              # elbow (5)
        # FOREARM — the flexor mass sits just below the elbow, then tapers
        # hard to a wrist that is mostly bone.
        (at(0.398), 0.045, [(L_ANT, 0.26, 0.22), (L_MED, 0.20, 0.12)]),
        (at(0.470), 0.041, [(L_ANT, 0.24, 0.12)]),
        (at(0.540), 0.034, None),
        (at(0.592), (0.030, 0.024), None),                       # wrist (9)
        (at(0.648, -0.008), (0.045, 0.024), None),               # palm
        (at(0.694, -0.013), (0.043, 0.023), None),               # knuckles
        (at(0.748, -0.015), (0.030, 0.017), None),               # end (12)
    ]


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
        (at(0.470), 0.056, None),                                 # knee (4)
        # CALF — gastrocnemius, high and posterior, tapering to a thin ankle.
        # The two heads give it width as well as depth.
        (at(0.410), 0.062, [(L_POST, 0.26, 0.26)]),
        (at(0.350), 0.066, [(L_POST, 0.28, 0.34), (L_LAT, 0.16, 0.06)]),
        (at(0.290), 0.058, [(L_POST, 0.26, 0.24)]),
        (at(0.220), 0.048, [(L_POST, 0.24, 0.12)]),
        (at(0.150), 0.040, None),
        (at(0.090), (0.038, 0.044), None),                        # ankle (10)
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
    bm = bmesh.new()

    rings = [ring(bm, z, rx, ry, cy, bumps=b) for _n, z, rx, ry, cy, b in TORSO]
    tube(bm, rings)
    bm.faces.new(rings[-1])
    for t in (bm.verts, bm.edges, bm.faces):
        t.ensure_lookup_table()

    log = []
    for side, cols in (("l", ARM_COLS["l"]), ("r", ARM_COLS["r"])):
        bm.edges.ensure_lookup_table()
        hole = cut_arm_hole(bm, rings, SHOULDER_BAND, cols)
        a = limb(bm, arm_path(side), NA)
        tube(bm, a)
        bm.faces.new(a[-1])
        bm.edges.ensure_lookup_table()
        cuff = [e for e in bm.edges if len(e.link_faces) == 1 and set(e.verts) <= set(a[0])]
        r = bmesh.ops.bridge_loops(bm, edges=hole + cuff)
        log.append("arm_%s  hole %2d  cuff %2d  -> %2d faces"
                   % (side, len(hole), len(cuff), len(r.get("faces", []))))

    sockets = hip_sockets(bm, rings[0])
    for side in ("l", "r"):
        lg = limb(bm, leg_path(side), NL)
        tube(bm, lg)
        bm.faces.new(lg[-1])
        bm.edges.ensure_lookup_table()
        cuff = [e for e in bm.edges if len(e.link_faces) == 1 and set(e.verts) <= set(lg[0])]
        r = bmesh.ops.bridge_loops(bm, edges=sockets[side] + cuff)
        log.append("leg_%s  socket %2d  cuff %2d  -> %2d faces"
                   % (side, len(sockets[side]), len(cuff), len(r.get("faces", []))))

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
    print("HERO cage %d verts %d faces | boundary edges %d | non-manifold %d"
          % (len(me.vertices), len(me.polygons), len(loose), len(bad)))
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
    look.sheet(out, "body", (0, 0, 0.92), 2.05)
    look.sheet(out, "torso", (0, 0, 1.24), 0.85, res=(900, 900))
    look.sheet(out, "arm", (0.30, 0, 1.25), 0.60, res=(900, 900))
    look.sheet(out, "calf", (0.10, 0, 0.33), 0.45, res=(900, 900))
    print("LOOK_OK %s" % out)
