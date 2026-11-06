import bpy, bmesh, math, os, sys
from mathutils import Vector

# ═══════════════════════════════════════════════════════════════════════════
# THE BODY — a quad cage we own, with loops where the joints are.
#
# Luke, 2026-11-06: "I don't like the fact that we went out to get this model.
# Let's start over. There's probably thousands of lines of baggage already."
#
# The kernel of that: with a bought mesh we control neither the TOPOLOGY nor
# the WEIGHTS, and the shoulder collapse lives in both. So this is built as a
# low-poly cage -- the way a base mesh is actually modelled -- and subdivided.
# Every ring is placed on purpose, and the rings around a joint are the whole
# reason a joint can bend without flattening.
#
# ⚠️ WHAT KILLED THE LAST ATTEMPT AT A HAND-BUILT HUMAN, so it is not repeated:
#   lofted BOXES read constructed -- right for props, wrong for a body. These
#     are elliptical rings, which is a different thing: the cross-section of a
#     torso really is an ellipse, and subdivision turns rings into a surface.
#   the Skin modifier inflates a branch off a torso into a VISIBLE TUBE, so an
#     arm sprouting from a chest came out as a lump with a shard at the
#     armpit. Here the arm is BRIDGED into a hole cut in the torso, so the
#     armpit is real quads continuous with both.
#   falloff-bump sculpting plateaus at playdough. Nothing here is sculpted;
#     shape comes from the ring radii, which are numbers I can read and change.
#
# Metres, floor at z=0, figure about 1.80 tall. He faces -Y.
# ═══════════════════════════════════════════════════════════════════════════

N = 16          # verts per torso ring
NA = 8          # verts per limb ring -- matches a 2x2 hole in the torso


def ring(bm, cz, rx, ry, cy=0.0, n=N, phase=0.0):
    """One closed elliptical cross-section, returned in column order."""
    vs = []
    for i in range(n):
        a = phase + 2.0 * math.pi * i / n
        vs.append(bm.verts.new((rx * math.cos(a), cy + ry * math.sin(a), cz)))
    return vs


def tube(bm, rings):
    """Quad-bridge a stack of equal-length rings."""
    for a, b in zip(rings, rings[1:]):
        n = len(a)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))


def limb(bm, path, n=NA):
    """Rings along a polyline, each perpendicular to the local direction.
    `path` is [(centre, radius), ...]."""
    out = []
    for k, (c, r) in enumerate(path):
        c = Vector(c)
        nxt = Vector(path[min(k + 1, len(path) - 1)][0])
        prv = Vector(path[max(k - 1, 0)][0])
        d = (nxt - prv)
        d = d.normalized() if d.length > 1e-6 else Vector((0, 0, -1))
        # a stable frame perpendicular to the limb
        up = Vector((0, 1, 0))
        if abs(d.dot(up)) > 0.95:
            up = Vector((1, 0, 0))
        u = d.cross(up).normalized()
        v = d.cross(u).normalized()
        vs = []
        for i in range(n):
            a = 2.0 * math.pi * i / n
            vs.append(bm.verts.new(c + u * (r * math.cos(a)) + v * (r * math.sin(a))))
        out.append(vs)
    return out


# ── THE TORSO ─────────────────────────────────────────────────────────────
# (z, rx, ry, y-offset). Read as a figure: hips wider than waist, chest
# wider again, shoulders widest, then the trapezius pulls in to the neck.
TORSO = [
    (0.84, 0.150, 0.115, 0.000),   # crotch
    (0.95, 0.168, 0.128, 0.000),   # hips
    (1.04, 0.152, 0.118, 0.004),   # waist
    (1.16, 0.168, 0.126, 0.004),   # lower ribs
    (1.28, 0.188, 0.132, 0.000),   # chest
    (1.37, 0.196, 0.126, -0.004),  # upper chest
    # ⚠️ TWO RINGS AT THE SHOULDER, not one. The arm is bridged into the band
    # BETWEEN them, so the armpit has a real edge loop above and below it.
    # A joint with a single loop through it has nothing to fold along, which
    # is exactly how a deltoid ends up as a flat sheet.
    (1.43, 0.200, 0.118, -0.006),  # shoulder, lower
    (1.49, 0.150, 0.102, -0.008),  # shoulder, upper / trapezius
    (1.53, 0.072, 0.068, -0.004),  # neck base
    (1.62, 0.066, 0.064, 0.000),   # neck
]

SHOULDER_BAND = 6      # the ring index the arm hole starts at

# ── THE ARMS ──────────────────────────────────────────────────────────────
# Hanging at the sides. He faces -Y, so his right is -X.
def arm_path(side):
    s = 1.0 if side == "l" else -1.0
    return [((s * 0.200, -0.004, 1.455), 0.056),   # into the deltoid
            ((s * 0.232, -0.004, 1.380), 0.054),   # deltoid
            ((s * 0.247, -0.002, 1.250), 0.046),   # mid upper arm
            ((s * 0.252, 0.000, 1.145), 0.042),    # elbow
            ((s * 0.254, 0.000, 1.040), 0.041),    # forearm
            ((s * 0.256, 0.000, 0.930), 0.034),    # lower forearm
            ((s * 0.258, 0.000, 0.862), 0.028)]    # wrist


def leg_path(side):
    s = 1.0 if side == "l" else -1.0
    return [((s * 0.088, 0.000, 0.900), 0.098),    # into the hip
            ((s * 0.095, 0.000, 0.780), 0.092),    # upper thigh
            ((s * 0.098, 0.004, 0.620), 0.076),    # thigh
            ((s * 0.100, 0.004, 0.470), 0.058),    # knee
            ((s * 0.100, 0.006, 0.330), 0.062),    # calf
            ((s * 0.100, 0.002, 0.170), 0.042),    # lower shin
            ((s * 0.100, 0.000, 0.085), 0.036)]    # ankle


def cut_hole(bm, rings, band, cols):
    """Delete a 2x2 patch of torso faces and return its boundary loop edges."""
    faces = []
    for ri in (band, band + 1):
        a, b = rings[ri], rings[ri + 1]
        for ci in cols:
            i, j = ci % N, (ci + 1) % N
            f = None
            for cand in a[i].link_faces:
                if set(cand.verts) == {a[i], a[j], b[j], b[i]}:
                    f = cand
                    break
            if f:
                faces.append(f)
    bmesh.ops.delete(bm, geom=faces, context="FACES")
    bm.verts.ensure_lookup_table()
    # the hole's boundary: edges now touching exactly one face
    loop = [e for e in bm.edges if len(e.link_faces) == 1
            and all(abs(v.co.z - rings[band][0].co.z) < 0.25 for v in e.verts)]
    return loop


def build():
    me = bpy.data.meshes.new("Hero")
    ob = bpy.data.objects.new("Hero", me)
    bpy.context.collection.objects.link(ob)
    bm = bmesh.new()

    rings = [ring(bm, z, rx, ry, cy) for z, rx, ry, cy in TORSO]
    tube(bm, rings)
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()

    # cap the crotch and the neck for now; the head and the pelvis floor
    # arrive once the shoulder is proven.
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])

    report = []
    for side, cols in (("l", (15, 0)), ("r", (7, 8))):
        bm.edges.ensure_lookup_table()
        loop = cut_hole(bm, rings, SHOULDER_BAND, cols)
        arm = limb(bm, arm_path(side))
        tube(bm, arm)
        bm.faces.new(arm[-1])            # cap the wrist
        bm.edges.ensure_lookup_table()
        inner = [e for e in bm.edges
                 if len(e.link_faces) == 1 and set(e.verts) <= set(arm[0])]
        res = bmesh.ops.bridge_loops(bm, edges=loop + inner)
        report.append("arm_%s: hole %d edges, ring %d edges, bridged %d faces"
                      % (side, len(loop), len(inner), len(res.get("faces", []))))

    for side in ("l", "r"):
        leg = limb(bm, leg_path(side))
        tube(bm, leg)
        bm.faces.new(leg[-1])
        bm.faces.new(list(reversed(leg[0])))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()

    for p in me.polygons:
        p.use_smooth = True
    sub = ob.modifiers.new("Subsurf", "SUBSURF")
    sub.levels = sub.render_levels = 2
    for line in report:
        print("   " + line)
    print("HERO cage %d verts, %d faces (before subdivision)"
          % (len(me.vertices), len(me.polygons)))
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
    look.sheet(out, "body", (0, 0, 0.90), 2.1)
    look.sheet(out, "shoulder", (0.17, 0, 1.40), 0.60, res=(900, 900))
    print("LOOK_OK %s" % out)
