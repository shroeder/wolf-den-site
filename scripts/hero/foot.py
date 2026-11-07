import bmesh, math
from mathutils import Vector

# ═══════════════════════════════════════════════════════════════════════════
# THE FOOT — a heel, an arch, a toe box, and five toes.
#
# ⚠️ THE OLD ONE HAD NO HEEL AT ALL, AND THAT IS WHY IT READ AS A FLIPPER.
# It was the leg's own tube continued: rings marching down the shin, turning
# forward at the ankle and tapering to a nub. A tube cannot have a heel,
# because a heel is mass BEHIND the joint -- the ankle sits about a quarter
# of the way along a foot, not at its back end -- and nothing a ring does
# can put geometry behind the path that generated it.
#
# So the leg stops at the ankle and this bridges on, exactly as the hand
# bridges onto the wrist. Same construction as the hand, too: a lattice
# whose distal lid carries one socket per digit, with a column of webbing
# between each pair so the five holes stay five holes.
#
# Forward is -Y (he faces -Y). The sole sits at z = 0 and the figure's
# height is measured from it, so these numbers are absolute, not relative.
# ═══════════════════════════════════════════════════════════════════════════

ROWS = 3        # vertex rows through the foot's height -> 2 quad rows
COLS = 10       # vertex columns across -> 9 quad columns, 5 of them toes
NT = 6          # verts per toe ring: matches a 1x2 socket's 6 edges

# (name, centre across, half-width, length, setback). Across is in half-width
# units with the BIG TOE at the positive end, which is the medial side -- so
# the sign of "across" flips per foot and the table does not.
#
# ⚠️ THE TOES ARE NOT A SCALED HAND. A big toe is nearly twice the width of
# a little one and the ends fall away in a line that is almost straight from
# big to little; copying the fingers' gentle arc gives a foot that reads as
# a second hand, which is the single most unsettling thing a humanoid model
# can do.
#
# ⚠️ AND THEY ARE SHORT. Given the fingers' proportions they came out as
# five claws -- toes are about a fifth of a foot's length, not a third, and
# the tip of a toe barely tapers at all. Exactly the mistake the first hand
# made, made again from the other direction.
TOES = [
    ("big",    0.715, 0.230, 1.00, 0.00),
    ("second", 0.285, 0.160, 0.96, 0.03),
    ("third", -0.065, 0.150, 0.88, 0.07),
    ("fourth", -0.395, 0.140, 0.76, 0.12),
    ("little", -0.705, 0.130, 0.60, 0.18),
]

# (fraction along the toe, radius multiplier). Two joints is plenty: a toe
# is short, and the third knuckle is not visible on anything but a bare foot
# held up to the camera.
SEGMENTS = [(0.00, 1.00), (0.52, 0.96), (1.00, 0.86)]
CURL = 0.22     # radians the tip drops toward the floor

# (y, half-width, sole z, instep z). The arch is the pair of stations whose
# SOLE lifts off the floor -- without it the foot prints as a plank and the
# silhouette from the side is a wedge.
STATIONS = [
    (0.068, 0.026, 0.014, 0.052),       # back of the heel
    (0.040, 0.033, 0.000, 0.076),       # the heel, on the floor
    (-0.010, 0.037, 0.013, 0.073),      # the arch, lifted
    (-0.090, 0.047, 0.000, 0.047),      # the ball, on the floor
    (-0.150, 0.047, 0.000, 0.029),      # the toe box
]
TOE_LEN = 0.048     # the big toe's own length, beyond the toe box


class Foot:
    def __init__(self):
        self.joints = {}
        self.ring_verts = []
        self.instep = []


def _columns():
    cols = []
    for _n, c, w, _l, _b in TOES:
        cols += [c + w, c - w]
    return cols


def plan(side, ankle):
    """Joint centres with no mesh built, for the rig to read."""
    s = 1.0 if side == "l" else -1.0
    origin = Vector(ankle)
    across = Vector((-s, 0.0, 0.0))     # +across is MEDIAL, so the big toe
    fwd = Vector((0.0, -1.0, 0.0))
    up = Vector((0.0, 0.0, 1.0))

    def P(y, x, z):
        return Vector((origin.x, 0.0, 0.0)) + fwd * -y + across * x + up * z

    pl = {"P": P, "across": across, "fwd": fwd, "up": up, "digits": {},
          "ball": P(STATIONS[-2][0], 0.0, 0.0), "toe": P(-0.185, 0.0, 0.0)}
    base_y, base_hw = STATIONS[-1][0], STATIONS[-1][1]
    for name, c, w, lf, back in TOES:
        length = TOE_LEN * lf
        base = P(base_y + TOE_LEN * back, base_hw * c, STATIONS[-1][3] * 0.42)
        segs = []
        for t, rm in SEGMENTS:
            ang = CURL * t * t
            d = (fwd * math.cos(ang) + up * -math.sin(ang)).normalized()
            segs.append((base + d * (length * t),
                         (base_hw * w * 0.94 * rm, base_hw * w * 0.86 * rm)))
        pl["digits"][name] = segs
    pl["folds"] = {n: -up for n in pl["digits"]}
    return pl


def build(bm, side, ankle):
    pl = plan(side, ankle)
    P, across, fwd, up = pl["P"], pl["across"], pl["fwd"], pl["up"]
    cols = _columns()
    out = Foot()
    # ⚠️ THE WHOLE TOP FACE, NOT A PATCH OF IT. Cut across six of the nine
    # columns the hole was 34 mm wide against a 76 mm ankle, so the bridge
    # had to pinch the leg in by half and it wrinkled all the way round like
    # a sock. An ankle is nearly as wide as the foot it stands on. Spanning
    # every column makes the rim 20 edges against the leg ring's 19, which
    # is as close to a seamless join as a mismatched pair can be.
    ANKLE_COLS = (0, COLS - 1)

    def grid(k):
        y, hw, z0, z1 = STATIONS[k]
        return [[P(y, hw * c, z0 + (z1 - z0) * (r / float(ROWS - 1)))
                 for r in range(ROWS)] for c in cols]

    cyc = [(c, 0) for c in range(COLS)]
    cyc += [(COLS - 1, r) for r in (1, 2)]
    cyc += [(c, ROWS - 1) for c in range(COLS - 2, -1, -1)]
    cyc += [(0, 1)]

    lattices = [grid(k) for k in range(len(STATIONS))]
    rings = [[bm.verts.new(g[c][r]) for c, r in cyc] for g in lattices]
    for a, b in zip(rings, rings[1:]):
        for i in range(len(a)):
            j = (i + 1) % len(a)
            bm.faces.new((a[i], a[j], b[j], b[i]))
    out.ring_verts = rings[0]
    # The heel's back is a cap, not an opening: the ankle bridges in at the
    # TOP of the foot, not at its rear.
    bm.faces.new(rings[0])

    top = lattices[-1]
    at = {}
    for i, (c, r) in enumerate(cyc):
        at[(c, r)] = rings[-1][i]
    for c in range(1, COLS - 1):
        for r in range(1, ROWS - 1):
            at[(c, r)] = bm.verts.new(top[c][r])
    lid = {}
    for c in range(COLS - 1):
        for r in range(ROWS - 1):
            lid[(c, r)] = bm.faces.new((at[(c, r)], at[(c + 1, r)],
                                        at[(c + 1, r + 1)], at[(c, r + 1)]))
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()

    holes = {}
    for ti in range(len(TOES)):
        faces = [lid[(ti * 2, r)] for r in range(ROWS - 1)]
        allv, inner = set(), set()
        for f in faces:
            allv |= set(f.edges)
            for g in faces:
                if f is not g:
                    inner |= set(f.edges) & set(g.edges)
        holes[ti] = [e for e in allv if e not in inner]
        bmesh.ops.delete(bm, geom=faces, context="FACES")
    bm.edges.ensure_lookup_table()

    # ── THE INSTEP SOCKET ─────────────────────────────────────────────────
    # The leg comes DOWN onto the foot, so the hole is in the top face, not
    # the back: an ankle sits about a quarter of the way along a foot, with
    # the heel behind it. Cutting it anywhere else is what produced a flipper
    # growing out of the end of a shin.
    faces = []
    a, b = rings[1], rings[2]
    for c in range(ANKLE_COLS[0], ANKLE_COLS[1]):
        i, j = cyc.index((c, ROWS - 1)), cyc.index((c + 1, ROWS - 1))
        for f in a[i].link_faces:
            if set(f.verts) == {a[i], a[j], b[j], b[i]}:
                faces.append(f)
    allv, inner = set(), set()
    for f in faces:
        allv |= set(f.edges)
        for g in faces:
            if f is not g:
                inner |= set(f.edges) & set(g.edges)
    out.instep = [e for e in allv if e not in inner]
    bmesh.ops.delete(bm, geom=faces, context="FACES")
    bm.edges.ensure_lookup_table()

    for ti, (name, _c, _w, _l, _b) in enumerate(TOES):
        segs = pl["digits"][name]
        tube = []
        for k, (ctr, (ru, rv)) in enumerate(segs):
            nxt = segs[min(k + 1, len(segs) - 1)][0]
            prv = segs[max(k - 1, 0)][0]
            ax = (nxt - prv)
            ax = ax.normalized() if ax.length > 1e-6 else fwd
            uu = (across - ax * across.dot(ax)).normalized()
            vv = ax.cross(uu).normalized()
            tube.append([bm.verts.new(
                ctr + uu * (ru * math.cos(2 * math.pi * i / NT))
                + vv * (rv * math.sin(2 * math.pi * i / NT)))
                for i in range(NT)])
        for a, b in zip(tube, tube[1:]):
            for i in range(NT):
                j = (i + 1) % NT
                bm.faces.new((a[i], a[j], b[j], b[i]))
        bm.faces.new(tube[-1])
        bm.edges.ensure_lookup_table()
        cuff = [e for e in bm.edges
                if len(e.link_faces) == 1 and set(e.verts) <= set(tube[0])]
        bmesh.ops.bridge_loops(bm, edges=holes[ti] + cuff)
        bm.edges.ensure_lookup_table()
        for k in range(len(segs)):
            out.joints["%s_%d" % (name, k)] = segs[k][0]

    return out


