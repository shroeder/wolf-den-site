import bpy, bmesh, math, os, sys
from mathutils import Vector, Euler, Matrix

# ═══════════════════════════════════════════════════════════════════════════
# THE DRAGON
#
# ⚠️ THE SKIN MODIFIER IS THE RIGHT TOOL HERE AND WAS THE WRONG TOOL FOR THE
# HUMAN. It inflates a joint graph into continuous organic geometry — useless
# for a human, where the anatomy is fixed and a pre-made rig has to match it,
# and ideal for a creature that IS a branching tube: neck, body, tail, four
# legs, two wings.
#
# And it dodges the failure that cost a day on the hero. MPFB fitted a rig to
# base.obj rather than to the character, so every joint sat a hip-height from
# the flesh it drove. Here the mesh and the skeleton are GENERATED FROM THE
# SAME JOINT GRAPH — skin_armature_create emits one bone per edge — so they
# cannot disagree. A bind mismatch is not expressible.
#
# Facing matches the hero: -Y is forward, +Z up.
# ═══════════════════════════════════════════════════════════════════════════
OUT = os.environ.get("OUT_DIR", ".")

bpy.ops.wm.read_homefile(use_empty=True)
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)

J, E, R, NAME = [], [], [], []
def joint(p, rx, ry=None, name=None):
    J.append(Vector(p)); R.append((rx, rx if ry is None else ry)); NAME.append(name)
    return len(J) - 1
def bone(a, b):
    E.append((a, b))
def chain(pts, start=None, tag=None):
    """Entries are (point, radius) or (point, radius_x, radius_y).

    ⚠️ PASS `start` TO CONTINUE FROM AN EXISTING JOINT. Beginning a new chain
    at the same coordinates as the previous one's end and then joining them
    makes a ZERO-LENGTH EDGE, and the Skin modifier cannot bridge that -- it
    emits two separate shells. That is why the head floated in front of the
    neck as its own disconnected lump."""
    idx = [] if start is None else [start]
    for n, row in enumerate(pts):
        pos, rx = row[0], row[1]
        ry = row[2] if len(row) > 2 else None
        idx.append(joint(pos, rx, ry,
                         None if tag is None else "%s_%02d" % (tag, n + 1)))
    for a, b in zip(idx, idx[1:]):
        bone(a, b)
    # ⚠️ RETURNS THE NEW JOINTS ONLY, NOT THE ONE IT CONTINUED FROM. It used
    # to prepend `start`, which silently shifted every index by one: horns
    # anchored to the throat instead of the skull, hind legs to the base of
    # the tail instead of the hips, and the bone everything calls spine_01
    # did not exist. All of that still RENDERED, because the joints involved
    # are a few centimetres apart -- it only surfaced when the animation
    # asked for a bone by name.
    return idx if start is None else idx[1:]

# ── SPINE ── tail tip to snout. The whole animal is one line; everything else
# hangs off it.
#
# ⚠️ THE TORSO HAS TO RIDE HIGH ENOUGH FOR THE LEGS TO EXIST. The first pass
# put the body centre at z=1.0 with a radius of 0.48, which puts the belly at
# 0.58 and leaves a hind leg half a unit of headroom to make a forward knee
# and a backward hock in. The Skin modifier does not fail on that -- it
# inflates the joints anyway and they merge into each other. The leg came out
# as a pretzel. Every segment now spans ~0.45 in z against a radius of ~0.2,
# so no two non-adjacent joints are within reach of one another.
TAIL = chain([
    ((0, 3.30, 0.30), 0.035),
    ((0, 2.90, 0.37), 0.065),
    ((0, 2.50, 0.46), 0.100),
    ((0, 2.10, 0.59), 0.145),
    ((0, 1.70, 0.77), 0.195),
    ((0, 1.32, 1.01), 0.260),
    ((0, 0.95, 1.26), 0.335),
], tag="tail")
BODY = chain([
    ((0, 0.55, 1.45), 0.430, 0.390),   # hips
    ((0, 0.12, 1.50), 0.470, 0.470),   # belly, the waist
    ((0, -0.34, 1.58), 0.540, 0.620),  # chest, the deepest point
    ((0, -0.76, 1.62), 0.450, 0.470),  # shoulders
], start=TAIL[-1], tag="spine")
NECK = chain([
    ((0, -1.08, 1.72), 0.300),
    ((0, -1.32, 1.94), 0.250),
    ((0, -1.50, 2.16), 0.215),
    ((0, -1.62, 2.34), 0.195),         # throat
], start=BODY[-1], tag="neck")
HEAD = chain([
    ((0, -1.92, 2.46), 0.360, 0.330),  # skull
    ((0, -2.26, 2.42), 0.295, 0.255),  # brow
    ((0, -2.62, 2.34), 0.205, 0.175),  # muzzle
    ((0, -2.94, 2.28), 0.120, 0.105),  # snout
], start=NECK[-1], tag="head")
# ── JAW ── hangs under the muzzle and merges into the head as one mass, which
# is the point: without it the head is a smooth tube and the profile reads as
# a bird's bill.
chain(start=HEAD[0], tag="jaw", pts=[
    ((0, -2.30, 2.18), 0.175),
    ((0, -2.78, 2.16), 0.115),
])

for s in (1, -1):
    SIDE = "l" if s > 0 else "r"
    # ── HORNS ── swept back off the skull. Pure silhouette: they are most of
    # what makes a head read as a dragon rather than a lizard.
    chain(start=HEAD[0], tag="horn_%s" % SIDE, pts=[
        ((s * 0.17, -1.90, 2.72), 0.090),
        ((s * 0.22, -1.46, 2.96), 0.062),
        ((s * 0.27, -0.96, 2.92), 0.020),
    ])
    # ── BROW SPIKE ── a short one over the eye, raked with the horn.
    chain(start=HEAD[1], tag="browspike_%s" % SIDE, pts=[
        ((s * 0.26, -2.30, 2.56), 0.045),
        ((s * 0.33, -2.18, 2.70), 0.014),
    ])

    # ── FORELIMBS ── smaller than the rear; a dragon's weight sits back.
    FORE = chain(start=BODY[-1], tag="fore_%s" % SIDE, pts=[
        ((s * 0.34, -0.72, 1.48), 0.200),
        ((s * 0.44, -0.50, 1.04), 0.155),   # elbow, BACK
        ((s * 0.40, -0.82, 0.54), 0.115),   # wrist, FORWARD
        ((s * 0.38, -0.94, 0.07), 0.105),   # foot
    ])
    for t in (-1, 0, 1):                     # three toes
        chain(start=FORE[-1], tag="foretoe%d_%s" % (t + 2, SIDE),
              pts=[((s * (0.38 + t * 0.11), -1.14, 0.05), 0.045)])

    # ── HINDLIMBS ── heavy, with a digitigrade kink: the knee goes forward,
    # the hock back. That zigzag is what makes it read as an animal and not a
    # person on all fours.
    HIND = chain(start=BODY[0], tag="hind_%s" % SIDE, pts=[
        ((s * 0.40, 0.55, 1.42), 0.290),
        ((s * 0.52, 0.18, 0.95), 0.230),    # knee, FORWARD
        ((s * 0.48, 0.62, 0.46), 0.150),    # hock, BACK
        ((s * 0.48, 0.34, 0.07), 0.125),    # foot
    ])
    for t in (-1, 0, 1):
        chain(start=HIND[-1], tag="hindtoe%d_%s" % (t + 2, SIDE),
              pts=[((s * (0.48 + t * 0.12), 0.08, 0.05), 0.050)])

    # ── WING ── arm, forearm, then four long finger spars. The membrane is a
    # separate surface stretched across them, built below.
    w = chain(start=BODY[-1], tag="wing_%s" % SIDE, pts=[
        ((s * 0.34, -0.60, 1.92), 0.175),
        ((s * 1.00, 0.04, 2.92), 0.120),    # elbow, carried HIGH
        ((s * 1.80, -0.42, 3.26), 0.088),   # wrist, the high point
    ])
    globals()["WING_%s" % ("L" if s > 0 else "R")] = w
    # The fingers fan DOWN and BACK off the raised wrist, so the membrane
    # hangs rather than lying flat.
    tips = [(s * 2.80, -1.28, 2.84), (s * 2.95, -0.32, 2.46),
            (s * 2.74, 0.66, 1.98), (s * 2.20, 1.42, 1.56)]
    wrist = J[w[-1]]  # chain() returns the start joint first; -1 is the tip
    spars = []
    for k, tip in enumerate(tips):
        tv = Vector(tip)
        spars.append(chain(start=w[-1], tag="spar%d_%s" % (k + 1, SIDE), pts=[
            (tuple(wrist + (tv - wrist) * 0.46), 0.052),
            (tip, 0.030 - 0.002 * k),
        ]))
    globals()["SPARS_%s" % ("L" if s > 0 else "R")] = spars
    globals()["TIPS_%s" % ("L" if s > 0 else "R")] = tips

# ── DORSAL RIDGE ── spikes down the spine, raked back. Cheap geometry, and it
# is most of what separates a dragon's silhouette from a big lizard's.
#
# ⚠️ A SPIKE LEAVES ALONG THE SPINE'S NORMAL, NOT ALONG +Z. The first pass
# used a fixed (y+0.10, z+radius+0.26) offset. That is near enough on the
# body, where the spine runs flat -- but the neck climbs at 45 degrees, so the
# same offset threw those spikes FORWARD over the shoulder and the run read as
# a mane flopping across the face. Rotate the local tangent instead.
SPINE_RUN = TAIL[2:] + BODY + NECK
_RIDGE = set(TAIL[2:] + BODY + NECK)
_RIDGE.discard(NECK[-1])        # nothing right under the jaw
for _n, _j in enumerate(SPINE_RUN):
    if _j not in _RIDGE:
        continue
    _h = R[_j][1] * 0.80 + 0.06
    _prev = SPINE_RUN[max(0, _n - 1)]
    _next = SPINE_RUN[min(len(SPINE_RUN) - 1, _n + 1)]
    _t = (J[_next] - J[_prev])
    _t.x = 0.0
    _t.normalize()
    _up = Vector((0.0, -_t.z, _t.y))      # tangent rotated 90 degrees in YZ
    if _up.z < 0:
        _up = -_up
    _base = J[_j] + _up * R[_j][1] * 0.72
    # Raked BACK along the spine as it rises -- a spike square to the body
    # reads as a fin, a swept one reads as armour.
    _rake = -_t * 0.22
    chain(start=_j, tag="ridge%02d" % _n,
          pts=[(tuple(_base + _up * _h * 0.55 + _rake * 0.5), 0.052),
               (tuple(_base + _up * _h + _rake), 0.010)])


me = bpy.data.meshes.new("DragonBody")
me.from_pydata([tuple(v) for v in J], E, [])
drg = bpy.data.objects.new("Dragon", me)
bpy.context.collection.objects.link(drg)

sk = drg.modifiers.new("Skin", "SKIN")
sk.use_smooth_shade = True
sk.branch_smoothing = 0.42
layer = me.skin_vertices[0].data
for i, (rx, ry) in enumerate(R):
    layer[i].radius = (rx, ry)
layer[BODY[2]].use_root = True
sub = drg.modifiers.new("Sub", "SUBSURF")
sub.levels = sub.render_levels = 2


# ═══════════════════════════════════════════════════════════════════════════
# THE MEMBRANE
#
# Spars alone are sticks -- the first render read as a deer carrying a TV
# aerial. The wing IS the membrane; the bones only hold it open.
#
# ⚠️ DO NOT FILL AN OUTLINE. The first attempt walked the silhouette (root ->
# elbow -> wrist -> each tip -> flank) and handed that loop to
# contextual_create. The loop spans a unit of height, so the n-gon is wildly
# non-planar, its triangulation is arbitrary, and subdividing it afterwards
# only refines the arbitrary choice. It rendered as folded sheet metal with
# holes in it.
#
# Instead every panel is parameterised and evaluated. Three HAND panels fan
# from the wrist between consecutive fingers; one ARM panel is a Coons patch
# between the arm bones and the flank. The surface is a function of (u, v), so
# it cannot crease and cannot have a hole.
# ═══════════════════════════════════════════════════════════════════════════
MEMBRANES = []
NU, NV = 9, 7     # grid resolution per panel
SAG = 0.26        # how deep the slack bellies between its taut edges
SCALLOP = 0.20    # how far the trailing edge cuts back toward the wrist


def _poly_at(pts, t):
    """Point a fraction t along a polyline, by arc length."""
    segs = [(pts[k + 1] - pts[k]).length for k in range(len(pts) - 1)]
    total = sum(segs)
    d = t * total
    for k, L in enumerate(segs):
        if d <= L or k == len(segs) - 1:
            return pts[k] + (pts[k + 1] - pts[k]) * (d / L if L else 0.0)
    return pts[-1].copy()


def _grid(bm, fn):
    """Evaluate fn(u, v) over the unit square and bridge it into quads."""
    rows = []
    for iu in range(NU):
        u = iu / (NU - 1.0)
        rows.append([bm.verts.new(tuple(fn(u, iv / (NV - 1.0)))) for iv in range(NV)])
    for a in range(NU - 1):
        for b in range(NV - 1):
            try:
                bm.faces.new((rows[a][b], rows[a + 1][b], rows[a + 1][b + 1], rows[a][b + 1]))
            except ValueError:
                pass      # a degenerate cell at the fan apex; the neighbours cover it
    return rows


for s in (1, -1):
    tag = "L" if s > 0 else "R"
    w = globals()["WING_%s" % tag]
    tips = [Vector(t) for t in globals()["TIPS_%s" % tag]]
    # w[0] is the body joint the chain was CONTINUED from, not part of the wing.
    root, elbow, wrist = (J[i].copy() for i in w[-3:])
    anchor = Vector((s * 0.34, 0.62, 1.42))      # where the wing meets the flank

    bm = bmesh.new()

    # ── HAND PANELS ── between finger k and finger k+1, both rooted at the
    # wrist. u runs out from the wrist, v across. At u=1 the edge is pulled in
    # toward the wrist, deepest mid-panel: that is the scallop.
    for k in range(len(tips) - 1):
        A, B = tips[k], tips[k + 1]

        def fn(u, v, A=A, B=B):
            far = A.lerp(B, v)
            cut = 1.0 - SCALLOP * math.sin(math.pi * v)
            p = wrist + (far - wrist) * (u * cut)
            p.z -= SAG * math.sin(math.pi * u) * math.sin(math.pi * v) * (far - wrist).length
            return p
        _grid(bm, fn)

    # ── ARM PANEL ── the big inboard sheet. A Coons patch between the arm
    # bones (shoulder -> elbow -> wrist) and the body edge (flank -> last
    # fingertip). Those two curves share their ends with the rest of the wing,
    # so the panels meet without a seam.
    armline = [root, elbow, wrist]
    bodyline = [anchor, anchor.lerp(tips[-1], 0.5), tips[-1]]

    def fn_arm(u, v):
        p = _poly_at(armline, u).lerp(_poly_at(bodyline, u), v)
        p.z -= SAG * 0.8 * math.sin(math.pi * v) * (wrist - root).length * (0.25 + 0.75 * u)
        return p
    _grid(bm, fn_arm)

    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.012)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))

    mm = bpy.data.meshes.new("Membrane_%s" % tag)
    bm.to_mesh(mm)
    bm.free()
    mo = bpy.data.objects.new("Membrane_%s" % tag, mm)
    bpy.context.collection.objects.link(mo)
    sm = mo.modifiers.new("Smooth", "SMOOTH")
    sm.factor = 0.5
    sm.iterations = 3
    sol = mo.modifiers.new("Sol", "SOLIDIFY")
    sol.thickness = 0.030
    sol.offset = 0.0
    sub2 = mo.modifiers.new("Sub", "SUBSURF")
    sub2.levels = sub2.render_levels = 1
    for pl in mm.polygons:
        pl.use_smooth = True
    MEMBRANES.append(mo)

print("DRAGON graph: %d joints, %d bones, %d membranes" % (len(J), len(E), len(MEMBRANES)))
