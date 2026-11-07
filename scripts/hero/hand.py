import bmesh, math
from mathutils import Vector

# ═══════════════════════════════════════════════════════════════════════════
# THE HAND — a palm slab with four finger sockets cut into its lid and a
# thumb socket cut into its side.
#
# ⚠️ FINGERS NEED GAPS BETWEEN THEM, AND THAT IS WHAT SETS THE RESOLUTION.
# Four fingers side by side on a four-column lid is ONE hole, not four: the
# deleted patches share edges and merge. There has to be a column of webbing
# between each pair, so the lid is 7 quad columns -- finger, gap, finger,
# gap, finger, gap, finger -- which is 8 vertex columns and an 18-vertex
# perimeter. The forearm arrives with 12. That mismatch is real and it is
# bridged, not designed away; the wrist is the one place on a hand where a
# few triangles cost nothing.
#
# ⚠️ THE COLUMNS ARE NOT EVENLY SPACED. Eight even columns across a 90 mm
# palm make every finger 13 mm wide and every gap 13 mm, so he gets four
# webbed sausages. The column positions are DERIVED from where the fingers
# actually are: each finger owns the pair of columns at its own centre plus
# and minus its own half-width, and the webbing is whatever is left between.
# A finger's width is then a number I can read and be wrong about visibly.
#
# Everything else is the technique the arm already uses on the torso: cut a
# patch, bridge a cuff into the hole.
# ═══════════════════════════════════════════════════════════════════════════

ROWS = 3        # vertex rows through the palm's thickness -> 2 quad rows
COLS = 8        # vertex columns across -> 7 quad columns, 4 of them fingers
NF = 6          # verts per finger ring: matches a 1x2 socket's 6 edges

# (name, centre across the palm, half-width, length, how far the knuckle sits
# back from the middle one). Fractions of the palm half-width and of the
# middle finger's length, so the hand scales as one thing.
#
# ⚠️ THE KNUCKLE LINE IS AN ARC, NOT A LINE. Index and little knuckles sit
# back from the middle one; squaring them off is the single clearest tell of
# a hand that was built rather than observed.
#
# ⚠️ AND THE FINGERS MUST VERY NEARLY TOUCH. The first pass picked widths and
# centres independently and left a gap as wide as each finger: four thin rods
# on a paddle, which renders as a talon, not a hand. The span is fixed -- it
# is the palm -- so the four widths plus three webs must FILL it. These add
# to 1.915 of the available 2.0, the rest being the margin at each edge.
FINGERS = [
    ("index",  0.7225, 0.235, 0.92, 0.035),
    ("middle", 0.1975, 0.245, 1.00, 0.000),
    ("ring",  -0.3175, 0.225, 0.94, 0.028),
    ("little", -0.7725, 0.185, 0.78, 0.090),
]

# Each finger is three bones' worth of tube: knuckle, middle, tip, with a
# little curl so the bind pose is a relaxed hand and not a flat paddle.
# (fraction of the finger's length, radius multiplier)
# ⚠️ A FINGER BARELY TAPERS. Running it to 0.62 of its base radius turns the
# last joint into a cone and the whole hand into a claw -- the taper was
# doing more damage than the width. A real finger is close to parallel and
# the tip is ROUNDED, which the cap and the subdivision do for free.
SEGMENTS = [(0.00, 1.00), (0.40, 0.98), (0.72, 0.93), (1.00, 0.82)]
CURL = 0.34     # radians the fingertip falls toward the palm


def _frame(wrist, tip, side):
    """Hand axes from the arm's own path: d along the fingers, u across the
    palm, v the palm's normal.

    ⚠️ THE PALM FACES INWARD AND THE THUMB LEADS. With the arm down, the
    palm faces the thigh, so its normal is the LATERAL axis and the fingers
    are laid out front to back: index anterior, little posterior. Getting
    this pair the wrong way round builds a hand with the thumb at the back,
    which reads as a broken wrist from every angle and as nothing at all in
    a mesh statistic.
    """
    d = (Vector(tip) - Vector(wrist)).normalized()
    ant = Vector((0.0, -1.0, 0.0))
    u = (ant - d * ant.dot(d)).normalized()     # across the palm, +u anterior
    v = d.cross(u).normalized()                 # palm normal
    s = 1.0 if side == "l" else -1.0
    return d, u, v * s


def _columns():
    """The 8 across-the-palm positions, in half-width units, derived from the
    fingers themselves. Ordered so quad columns 0, 2, 4, 6 are the fingers."""
    cols = []
    for _n, c, w, _l, _b in FINGERS:
        cols += [c + w, c - w]
    return cols


class Hand:
    """Everything the rig needs to find a knuckle without guessing."""

    def __init__(self):
        self.joints = {}        # name -> world position
        self.ring_verts = []    # the proximal 18, for the wrist bridge


def build(bm, side, wrist, tip, palm_len, half_w, half_t):
    """Palm, four fingers and a thumb. Returns (Hand, cuff edge list)."""
    d, u, v = _frame(wrist, tip, side)
    origin = Vector(wrist)
    finger_len = (Vector(tip) - origin).length - palm_len
    cols = _columns()
    out = Hand()

    def P(along, across, through):
        return origin + d * along + u * across + v * through

    # ── THE PALM ──────────────────────────────────────────────────────────
    # Four stations wrist -> knuckles. The thumb needs its socket on the
    # second span, so the palm cannot be a single quad tall.
    # (fraction along the palm, width multiplier, thickness multiplier)
    #
    # ⚠️ STATION 0 IS THE FOREARM'S WRIST RING, NOT A CHOICE. The palm began
    # 10% wider and a third THINNER than the arm ring it bridges to, and 18
    # verts meeting 12 across that step made a hard shelf all the way round:
    # the hand photographed as a shirt cuff. A wrist is DEEP and narrow and
    # the palm flattens as it runs distally, so the thickness multiplier
    # starts above 1 and falls -- it does not start at 1 because the palm
    # happens to be 1.
    STATIONS = [(0.00, 0.64, 1.45), (0.34, 0.86, 1.14),
                (0.68, 0.97, 1.02), (1.00, 1.00, 0.92)]

    # ⚠️ THE KNUCKLE END IS AN ARC, NOT A CLIFF. With every column ending at
    # the same distance the fingers grow out of a flat wall, and the squared
    # corner at the little-finger side is the loudest wrong note on the hand.
    # Each column is pulled back by its own finger's setback.
    setback = []
    for _n, _c, _w, _l, back in FINGERS:
        setback += [finger_len * back, finger_len * back]

    # Per column (thumb side first) and per station along the palm.
    PAD = [0.95, 0.78, 0.30, 0.12, 0.12, 0.26, 0.50, 0.58]
    PAD_ALONG = [0.18, 0.95, 1.00, 0.45]

    def grid(k):
        """p[c][r] for one station: the full 8x3 lattice."""
        f, wm, tm = STATIONS[k]
        arc = f * f        # straight at the wrist, full arc at the knuckles
        # The two outer columns lose a little width away from mid-thickness,
        # so the palm has an edge rather than a corner. Without it the slab
        # reads as a mitten however good the fingers are.
        def across(i, r):
            edge = 1.0 if 0 < i < COLS - 1 or r == 1 else 0.94
            return half_w * wm * cols[i] * edge

        # ⚠️ A PALM IS NOT FLAT ON THE PALM SIDE, AND WITHOUT THE PADS THE
        # THUMB IS GRAFTED ON. The thenar -- the mound at the base of the
        # thumb -- is most of what makes a thumb look like it grew there
        # rather than being pushed into a hole; the hypothenar does the same
        # job, smaller, along the little-finger edge. Both are on the PALM
        # face only, which is r = 0: the back of a hand is nearly flat and
        # padding it reads as a swollen paw.
        def through(i, r):
            t = half_t * tm * (r - 1.0)
            if r == 0:
                t -= half_t * PAD[i] * PAD_ALONG[k] * 0.62
            return t

        return [[P(palm_len * f - setback[i] * arc, across(i, r), through(i, r))
                 for r in range(ROWS)] for i, c in enumerate(cols)]

    def perimeter(g):
        """The lattice's outline as one cycle of 18, so it can be a ring in a
        tube. Order matters only in being consistent between stations."""
        cyc = [(c, 0) for c in range(COLS)]
        cyc += [(COLS - 1, r) for r in (1, 2)]
        cyc += [(c, ROWS - 1) for c in range(COLS - 2, -1, -1)]
        cyc += [(0, 1)]
        return cyc

    lattices = [grid(k) for k in range(len(STATIONS))]
    cyc = perimeter(lattices[0])
    rings = [[bm.verts.new(g[c][r]) for c, r in cyc] for g in lattices]
    for a, b in zip(rings, rings[1:]):
        for i in range(len(a)):
            j = (i + 1) % len(a)
            bm.faces.new((a[i], a[j], b[j], b[i]))
    out.ring_verts = rings[0]

    # ── THE LID, AND THE FOUR HOLES IN IT ─────────────────────────────────
    # The knuckle end is not capped with an n-gon: it is a real 8x3 lattice,
    # because the finger sockets are patches OF it. Six interior verts are
    # new; the rest are the ring that is already there.
    top = lattices[-1]
    at = {}
    for i, (c, r) in enumerate(cyc):
        at[(c, r)] = rings[-1][i]
    for c in range(1, COLS - 1):
        for r in range(1, ROWS - 1):
            at[(c, r)] = bm.verts.new(top[c][r])

    finger_cols = {0: 0, 1: 2, 2: 4, 3: 6}      # finger index -> quad column
    lid = {}
    for c in range(COLS - 1):
        for r in range(ROWS - 1):
            f = bm.faces.new((at[(c, r)], at[(c + 1, r)],
                              at[(c + 1, r + 1)], at[(c, r + 1)]))
            lid[(c, r)] = f

    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()

    holes = {}
    for fi, qc in finger_cols.items():
        faces = [lid[(qc, r)] for r in range(ROWS - 1)]
        edges = set()
        for f in faces:
            edges |= set(f.edges)
        shared = set()
        for f in faces:
            for g in faces:
                if f is not g:
                    shared |= set(f.edges) & set(g.edges)
        holes[fi] = [e for e in edges if e not in shared]
        bmesh.ops.delete(bm, geom=faces, context="FACES")
    bm.edges.ensure_lookup_table()

    # ── THE FINGERS ───────────────────────────────────────────────────────
    for fi, (name, c, w, lf, back) in enumerate(FINGERS):
        base = P(palm_len - finger_len * back, half_w * c, 0.0)
        length = finger_len * lf
        segs = []
        for t, rm in SEGMENTS:
            # The curl is a rotation of the finger's own axis about the
            # across-the-palm vector, growing with distance from the knuckle.
            ang = CURL * t * t
            dir_ = (d * math.cos(ang) + v * -math.sin(ang)).normalized()
            segs.append((base + dir_ * (length * t),
                         (half_w * w * 0.90 * rm, half_w * w * 0.76 * rm)))
        tube_rings = []
        for k, (ctr, (ru, rv)) in enumerate(segs):
            nxt = segs[min(k + 1, len(segs) - 1)][0]
            prv = segs[max(k - 1, 0)][0]
            ax = (Vector(nxt) - Vector(prv))
            ax = ax.normalized() if ax.length > 1e-6 else d
            uu = (u - ax * u.dot(ax)).normalized()
            vv = ax.cross(uu).normalized()
            tube_rings.append([bm.verts.new(
                ctr + uu * (ru * math.cos(2 * math.pi * i / NF))
                + vv * (rv * math.sin(2 * math.pi * i / NF)))
                for i in range(NF)])
        for a, b in zip(tube_rings, tube_rings[1:]):
            for i in range(NF):
                j = (i + 1) % NF
                bm.faces.new((a[i], a[j], b[j], b[i]))
        bm.faces.new(tube_rings[-1])
        bm.edges.ensure_lookup_table()
        cuff = [e for e in bm.edges
                if len(e.link_faces) == 1 and set(e.verts) <= set(tube_rings[0])]
        bmesh.ops.bridge_loops(bm, edges=holes[fi] + cuff)
        bm.edges.ensure_lookup_table()
        out.joints["%s_%d" % (name, 0)] = segs[0][0]
        for k in range(1, len(segs)):
            out.joints["%s_%d" % (name, k)] = segs[k][0]

    # ── THE THUMB ─────────────────────────────────────────────────────────
    # Cut from the SIDE of the palm, one span up from the wrist, exactly the
    # way the arm is cut from the torso. A thumb pushed on as a separate tube
    # shares no edge with the palm and nothing deforms across the joint.
    side_faces = []
    for r in range(ROWS - 1):
        a, b = rings[1], rings[2]
        ia, ib = cyc.index((0, r)), cyc.index((0, r + 1))
        for f in a[ia].link_faces:
            if set(f.verts) == {a[ia], a[ib], b[ib], b[ia]}:
                side_faces.append(f)
    edges = set()
    for f in side_faces:
        edges |= set(f.edges)
    shared = set()
    for f in side_faces:
        for g in side_faces:
            if f is not g:
                shared |= set(f.edges) & set(g.edges)
    thumb_hole = [e for e in edges if e not in shared]
    bmesh.ops.delete(bm, geom=side_faces, context="FACES")
    bm.edges.ensure_lookup_table()

    # Out along the palm's edge, forward across it, and a little toward the
    # fingers: an opposable thumb points at the fingertips, not away.
    # ⚠️ A THUMB THAT POINTS SIDEWAYS IS A SPUR. The first one took 0.62 of
    # its direction laterally and read as a cockerel's toe sticking off the
    # wrist. What makes a thumb a thumb is that it points at the FINGERTIPS
    # and lies across the palm -- the lateral part is the smallest of the
    # three, and it is the only digit that can touch the others.
    t_dir = (u * 0.38 + v * -0.52 + d * 0.76).normalized()
    # ⚠️ SEAT THE CUFF INSIDE THE SURFACE, exactly as the arm is seated
    # inside the torso. A base ring sitting PROUD of the palm leaves the
    # bridge to span the gap, and a short span across a step is a cliff --
    # the same triangular flap that cost two passes at the shoulder.
    t_base = P(palm_len * 0.34, half_w * 0.76, -half_t * 0.30)
    t_len = finger_len * 0.98
    T_SEG = [(0.00, 1.55), (0.44, 1.02), (0.78, 0.95), (1.00, 0.82)]
    t_rings = []
    t_pts = []
    for t, rm in T_SEG:
        ang = 0.34 * t * t
        dd = (t_dir * math.cos(ang) + v * -math.sin(ang)).normalized()
        t_pts.append(t_base + dd * (t_len * t))
    for k, ctr in enumerate(t_pts):
        rm = T_SEG[k][1]
        nxt, prv = t_pts[min(k + 1, len(t_pts) - 1)], t_pts[max(k - 1, 0)]
        ax = (nxt - prv)
        ax = ax.normalized() if ax.length > 1e-6 else t_dir
        uu = (d - ax * d.dot(ax)).normalized()
        vv = ax.cross(uu).normalized()
        ru = half_w * 0.250 * rm
        t_rings.append([bm.verts.new(
            ctr + uu * (ru * math.cos(2 * math.pi * i / NF))
            + vv * (ru * 0.86 * math.sin(2 * math.pi * i / NF)))
            for i in range(NF)])
    for a, b in zip(t_rings, t_rings[1:]):
        for i in range(NF):
            j = (i + 1) % NF
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(t_rings[-1])
    bm.edges.ensure_lookup_table()
    cuff = [e for e in bm.edges
            if len(e.link_faces) == 1 and set(e.verts) <= set(t_rings[0])]
    bmesh.ops.bridge_loops(bm, edges=thumb_hole + cuff)
    bm.edges.ensure_lookup_table()
    for k, p in enumerate(t_pts):
        out.joints["thumb_%d" % k] = p

    return out
