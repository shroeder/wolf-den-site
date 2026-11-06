import bpy, bmesh, math, os, sys
from mathutils import Vector

# ═══════════════════════════════════════════════════════════════════════════
# THE BODY — a quad cage we own, with loops where the joints are.
#
# Luke, 2026-11-06: "I don't like the fact that we went out to get this model.
# Let's start over."
#
# The kernel of that: with a bought mesh we control neither the TOPOLOGY nor
# the WEIGHTS, and the shoulder collapse lives in both. So this is a low-poly
# cage -- the way a base mesh is actually modelled -- and subdivided. Every
# ring is placed on purpose, and the rings around a joint are the whole reason
# a joint can bend without flattening.
#
# ⚠️ WHAT KILLED THE LAST HAND-BUILT HUMAN, so it is not repeated:
#   lofted BOXES read constructed -- right for props, wrong for a body. These
#     are elliptical rings: a torso cross-section really is an ellipse.
#   the Skin modifier inflates a branch off a torso into a VISIBLE TUBE, so an
#     arm came out a lump with a shard at the armpit. Limbs are BRIDGED into
#     holes cut in the torso, so every junction is real quads continuous with
#     both sides.
#   falloff-bump sculpting plateaus at playdough. Nothing is sculpted; shape
#     is the ring radii, numbers I can read and change.
#
# Metres, floor at z=0, figure about 1.80 tall. He faces -Y, so his right
# is -X. Ring vertex 0 sits at +X and numbering runs anticlockwise seen from
# above: 0 = his left, 4 = behind, 8 = his right, 12 = front.
# ═══════════════════════════════════════════════════════════════════════════

N = 16          # verts per torso ring
NA = 8          # verts per arm ring -- matches a 2x2 hole in the torso
NL = 11         # verts per leg ring -- matches a crotch-split hip socket

FRONT, BACK = 12, 4


def ring(bm, cz, rx, ry, cy=0.0, n=N):
    vs = []
    for i in range(n):
        a = 2.0 * math.pi * i / n
        vs.append(bm.verts.new((rx * math.cos(a), cy + ry * math.sin(a), cz)))
    return vs


def tube(bm, rings):
    for a, b in zip(rings, rings[1:]):
        n = len(a)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))


def limb(bm, path, n):
    """Rings along a polyline, each perpendicular to the local direction.
    path entries are (centre, radius) or (centre, (across, through))."""
    out = []
    for k, (c, r) in enumerate(path):
        c = Vector(c)
        d = Vector(path[min(k + 1, len(path) - 1)][0]) - Vector(path[max(k - 1, 0)][0])
        d = d.normalized() if d.length > 1e-6 else Vector((0, 0, -1))
        up = Vector((0, 1, 0)) if abs(d.dot(Vector((0, 1, 0)))) < 0.95 else Vector((1, 0, 0))
        u = d.cross(up).normalized()
        v = d.cross(u).normalized()
        ru, rv = r if isinstance(r, (tuple, list)) else (r, r)
        out.append([bm.verts.new(c + u * (ru * math.cos(2 * math.pi * i / n))
                                 + v * (rv * math.sin(2 * math.pi * i / n)))
                    for i in range(n)])
    return out


# ── THE TORSO ─────────────────────────────────────────────────────────────
TORSO = [
    (0.86, 0.150, 0.118, 0.000),   # crotch / pelvis floor
    (0.96, 0.170, 0.130, 0.000),   # hips
    (1.05, 0.152, 0.118, 0.004),   # waist
    (1.17, 0.170, 0.128, 0.004),   # lower ribs
    (1.29, 0.190, 0.134, 0.000),   # chest
    (1.38, 0.200, 0.128, -0.004),  # upper chest
    # ⚠️ TWO RINGS AT THE SHOULDER, not one. The arm bridges into the band
    # BETWEEN them, so the armpit has a real edge loop above and below it. A
    # joint with a single loop through it has nothing to fold along, which is
    # exactly how a deltoid ends up a flat sheet.
    (1.44, 0.206, 0.120, -0.006),  # shoulder, lower
    (1.50, 0.150, 0.102, -0.008),  # shoulder, upper / trapezius
    (1.55, 0.070, 0.066, -0.004),  # neck base
    (1.61, 0.064, 0.062, 0.000),   # neck
    # ── the head rides on the same stack ────────────────────────────────
    (1.655, 0.080, 0.090, -0.004),  # jaw
    (1.705, 0.094, 0.105, -0.004),  # cheek / widest
    (1.755, 0.092, 0.100, 0.000),   # skull
    (1.800, 0.060, 0.064, 0.004),   # crown
]
SHOULDER_BAND = 6


def arm_path(side):
    s = 1.0 if side == "l" else -1.0
    return [((s * 0.205, -0.004, 1.470), 0.058),
            ((s * 0.240, -0.004, 1.395), 0.057),   # deltoid, the widest point
            ((s * 0.252, -0.002, 1.255), 0.047),
            ((s * 0.256, 0.000, 1.150), 0.042),    # elbow
            ((s * 0.258, 0.000, 1.045), 0.041),
            ((s * 0.260, 0.000, 0.935), 0.033),
            ((s * 0.262, 0.000, 0.880), (0.030, 0.024)),   # wrist
            ((s * 0.264, -0.010, 0.820), (0.042, 0.022)),  # palm
            ((s * 0.264, -0.016, 0.760), (0.040, 0.021)),  # knuckles
            ((s * 0.262, -0.018, 0.715), (0.028, 0.016))]  # fingertips


def leg_path(side):
    s = 1.0 if side == "l" else -1.0
    return [((s * 0.082, 0.000, 0.860), 0.102),
            ((s * 0.090, 0.000, 0.760), 0.094),
            ((s * 0.095, 0.004, 0.610), 0.077),
            ((s * 0.098, 0.004, 0.470), 0.058),    # knee
            ((s * 0.098, 0.008, 0.360), 0.065),    # calf
            ((s * 0.098, 0.002, 0.190), 0.044),
            ((s * 0.098, 0.000, 0.090), (0.038, 0.044)),   # ankle
            ((s * 0.098, -0.040, 0.042), (0.040, 0.044)),  # instep
            ((s * 0.098, -0.120, 0.028), (0.042, 0.028)),  # ball
            ((s * 0.098, -0.175, 0.020), (0.032, 0.020))]  # toes


def _face_between(a, b, i, j):
    for f in a[i].link_faces:
        if set(f.verts) == {a[i], a[j], b[j], b[i]}:
            return f
    return None


def cut_arm_hole(bm, rings, band, cols):
    """Delete a 2x2 patch of torso faces; return its 8 boundary edges."""
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
            and min(zs) - 0.02 <= sum(v.co.z for v in e.verts) / 2 <= max(zs) + 0.02]


def hip_sockets(bm, bottom):
    """Split the open bottom of the pelvis into two leg sockets.

    ⚠️ THE CROTCH IS THE HARD JUNCTION ON ANY HUMANOID and it is where a
    naive cage goes non-manifold. Two tubes poking into a capped cylinder is
    not a body -- the surfaces merely intersect, there is no shared edge, and
    nothing can deform across the hip. One shared midline vertex is worse: it
    pinches, because two otherwise separate face fans meet at a single point.
    The fix is a midline EDGE. Front and back crotch verts, joined, split the
    16-gon opening into two 11-vert loops that SHARE that edge -- so the edge
    carries two faces, the mesh stays manifold, and each leg is continuous
    with the pelvis.
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

    left = [12, 13, 14, 15, 0, 1, 2, 3, 4]
    right = [12, 11, 10, 9, 8, 7, 6, 5, 4]
    return {"l": side_edges(left), "r": side_edges(right)}


def build():
    me = bpy.data.meshes.new("Hero")
    ob = bpy.data.objects.new("Hero", me)
    bpy.context.collection.objects.link(ob)
    bm = bmesh.new()

    rings = [ring(bm, z, rx, ry, cy) for z, rx, ry, cy in TORSO]
    tube(bm, rings)
    bm.faces.new(rings[-1])                      # crown
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()

    log = []
    for side, cols in (("l", (15, 0)), ("r", (7, 8))):
        bm.edges.ensure_lookup_table()
        hole = cut_arm_hole(bm, rings, SHOULDER_BAND, cols)
        arm = limb(bm, arm_path(side), NA)
        tube(bm, arm)
        bm.faces.new(arm[-1])
        bm.edges.ensure_lookup_table()
        cuff = [e for e in bm.edges if len(e.link_faces) == 1 and set(e.verts) <= set(arm[0])]
        r = bmesh.ops.bridge_loops(bm, edges=hole + cuff)
        log.append("arm_%s  hole %2d  cuff %2d  -> %2d faces"
                   % (side, len(hole), len(cuff), len(r.get("faces", []))))

    sockets = hip_sockets(bm, rings[0])
    for side in ("l", "r"):
        leg = limb(bm, leg_path(side), NL)
        tube(bm, leg)
        bm.faces.new(leg[-1])
        bm.edges.ensure_lookup_table()
        cuff = [e for e in bm.edges if len(e.link_faces) == 1 and set(e.verts) <= set(leg[0])]
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
    # ⚠️ A HOLE AND A PINCH BOTH RENDER AS "FINE" FROM MOST ANGLES. Count
    # them instead: a closed body has no boundary edge and no edge with more
    # than two faces.
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
    look.sheet(out, "hip", (0.0, 0, 0.84), 0.60, res=(900, 900))
    look.sheet(out, "shoulder", (0.18, 0, 1.42), 0.60, res=(900, 900))
    print("LOOK_OK %s" % out)
