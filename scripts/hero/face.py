import bmesh, math
from mathutils import Vector

# ═══════════════════════════════════════════════════════════════════════════
# THE FACE'S SEPARATE PIECES — the nose, and the ears.
#
# ⚠️ A RING CANNOT MAKE A NOSE, AND THAT IS NOT A TUNING PROBLEM. Everything
# the head's rings can say runs vertically, because a ring varies its radius
# with ANGLE: they give the brow ridge, the cheekbones, the eye sockets, the
# jaw and the lips, and all of those are broad forms on the skull's own
# surface. A nose is not a form on the surface, it is a thing that LEAVES
# the surface and comes back to it, and no amount of pushing a ring outward
# at the midline produces one -- it produces a muzzle.
#
# ⚠️ AND IT CANNOT BE SCULPTED EITHER. That is the technique that killed the
# last hand-built human: gaussian pushes gave a face with brow, nose and
# cheeks that still read as a melted lump, because smooth additive falloffs
# cannot make the sharp transitions a face needs, and more of them makes it
# lumpier rather than better.
#
# What does work is the thing the arm does to the torso and the thumb does
# to the palm: CUT A SOCKET AND BRIDGE A CUFF INTO IT. A nose is then a
# short tube leaving the face at an angle, which is a shape with a tip, an
# underside and a bridge -- all three of which a ring cannot have.
# ═══════════════════════════════════════════════════════════════════════════

NE = 8          # verts per ear ring
NEY = 12        # verts per eye-socket ring: matches a 4x2 patch's 12 edges


def patch(bm, rings, ri0, n_rings, cols, n):
    """Delete an n_rings x len(cols) patch of a tube and return its boundary.

    ⚠️ THE BOUNDARY IS COMPUTED FROM THE FACES, NOT LOOKED UP BY POSITION.
    The arm's version of this finds its hole by filtering every edge in the
    mesh for one within a z band, which works only because a shoulder is the
    only thing at that height. A nose socket and an eye socket sit at nearly
    the same z, so anything positional would hand one the other's rim.
    """
    faces = []
    for ri in range(ri0, ri0 + n_rings):
        a, b = rings[ri], rings[ri + 1]
        for ci in cols:
            i, j = ci % n, (ci + 1) % n
            for f in a[i].link_faces:
                if set(f.verts) == {a[i], a[j], b[j], b[i]}:
                    faces.append(f)
    inner = set()
    allv = set()
    for f in faces:
        allv |= set(f.edges)
        for g in faces:
            if f is not g:
                inner |= set(f.edges) & set(g.edges)
    rim = [e for e in allv if e not in inner]
    centre = Vector((0, 0, 0))
    for e in rim:
        centre += (e.verts[0].co + e.verts[1].co) * 0.5
    centre /= max(len(rim), 1)
    bmesh.ops.delete(bm, geom=faces, context="FACES")
    bm.edges.ensure_lookup_table()
    return rim, centre


def _tube(bm, path, n, up):
    """Rings along a path, each perpendicular to it, with a stable up."""
    out = []
    for k, (c, (ru, rv)) in enumerate(path):
        nxt = path[min(k + 1, len(path) - 1)][0]
        prv = path[max(k - 1, 0)][0]
        d = (Vector(nxt) - Vector(prv))
        d = d.normalized() if d.length > 1e-6 else Vector((0, -1, 0))
        u = (up - d * up.dot(d))
        u = u.normalized() if u.length > 1e-5 else Vector((0, 0, 1))
        v = d.cross(u).normalized()
        out.append([bm.verts.new(
            Vector(c) + v * (ru * math.cos(2 * math.pi * i / n))
            + u * (rv * math.sin(2 * math.pi * i / n)))
            for i in range(n)])
    return out


def _bridge(bm, rim, tube_rings, n):
    for a, b in zip(tube_rings, tube_rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(tube_rings[-1])
    bm.edges.ensure_lookup_table()
    cuff = [e for e in bm.edges
            if len(e.link_faces) == 1 and set(e.verts) <= set(tube_rings[0])]
    r = bmesh.ops.bridge_loops(bm, edges=list(rim) + cuff)
    bm.edges.ensure_lookup_table()
    return len(rim), len(cuff), len(r.get("faces", []))


def eyeball(bm, at, outward, r=0.0118, stand=0.0040, n=3):
    """A sphere set into the socket, as its own closed shell.

    ⚠️ THE SOCKET CANNOT BE THE EYE. A hollow in the skull is a hollow; it
    reads as a skull with hollows, which is what the head looked like with
    the brow and cheekbones in and nothing between them. An eye is a hard
    convex thing inside a soft concave one, and that contrast is the entire
    read -- it is the first feature that makes a head look back at you.

    ⚠️ BUT SINK IT AGAINST THE CAGE AND IT VANISHES. The socket vertex this
    is placed from is a CONTROL point, and Catmull-Clark does not pass
    through its control points -- in a hollow the limit surface sits well
    OUTSIDE the cage, so a ball sunk 9 mm behind a cage vertex ended up
    entirely inside the head and the face rendered with two empty sockets.
    Measured on the evaluated mesh: at the eye's x the brow's limit surface
    is 5 mm in front of the socket's. `sink` is negative for that reason.

    ⚠️ AND IT IS A SUBDIVIDED CUBE, NOT A UV SPHERE. A UV sphere's poles are
    triangle fans -- two eyes put 56 triangles into a cage that is otherwise
    quads, which is most of what held the quad fraction under the 90% a
    subdivision cage is supposed to hit. A cube projected onto a sphere is
    all quads and rounds identically once subdivided.
    """
    # Centred so the cornea stands `stand` proud of the lid margin. An eye
    # is not flush with the lids -- the bulge is most of why one reads as
    # wet rather than painted on.
    c = at - outward * (r - stand)

    made = {}

    def V(a, b, k):
        key = (round(a, 5), round(b, 5), round(k, 5))
        if key not in made:
            v = Vector((a, b, k))
            v.normalize()
            made[key] = bm.verts.new(c + v * r)
        return made[key]

    axes = [(0, 1, 2), (1, 2, 0), (2, 0, 1)]
    for ax, bx, cx in axes:
        for sign in (1.0, -1.0):
            for i in range(n):
                for j in range(n):
                    quad = []
                    for du, dv in ((0, 0), (1, 0), (1, 1), (0, 1)):
                        u = -1.0 + 2.0 * (i + du) / n
                        w = -1.0 + 2.0 * (j + dv) / n
                        p = [0.0, 0.0, 0.0]
                        p[ax], p[bx], p[cx] = u, w, sign
                        quad.append(V(*p))
                    if sign < 0:
                        quad.reverse()
                    bm.faces.new(quad)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    return c


def eye_socket(bm, rings, ri0, cols, n, w=0.0166, h=0.0082, depth=0.0135):
    """The eye OPENING -- a lid margin, folded back into a closed pocket.

    ⚠️ A RING CANNOT MAKE AN EYELID AND NO RESOLUTION FIXES IT. This is the
    one defect that survived everything: the head went to 64 verts, lid
    rings went in above and below, amounts were tuned over and over, and the
    eyes still read as two beads pressed into a face. The reason is
    structural. A ring varies its radius with ANGLE, so every form it can
    make is a vertical stripe; stack three and you get a soft dimple. A lid
    is the opposite shape -- it WRAPS the eyeball, a surface at roughly
    constant distance from the eye's centre, curving in two axes at once and
    ending in a hard margin. No stripe approximates that.

    So the eye gets loops of its own, which is what every hand-modelled head
    has and what a ring stack structurally cannot: cut the face open and
    bridge in a lattice whose rings go AROUND the opening rather than around
    the head. The same socket-and-bridge move as the arm, the thumb, the
    fingers, the ear and the foot -- and the first one where the direction
    the loops run is the entire point.

    ⚠️ AND IT FOLDS INWARD INSTEAD OF STOPPING. An opening with a free rim
    is a HOLE: the surface stops being closed and the audit's boundary-edge
    check fails it, correctly. A real lid does not stop at its margin
    either, it turns and runs back behind the eyeball. So the margin
    continues into a smaller ring inside the skull and caps there, which
    makes a pocket for the eyeball to sit in and keeps him watertight.
    """
    rim, centre = patch(bm, rings, ri0, 2, cols, n)
    outward = Vector((centre.x, centre.y, 0.0))
    outward = outward.normalized() if outward.length > 1e-6 else Vector((0, -1, 0))
    up = Vector((0.0, 0.0, 1.0))
    right = up.cross(outward).normalized()

    def oval(off, rw, rh):
        c = centre + outward * off
        return [bm.verts.new(c + right * (rw * math.cos(2 * math.pi * i / NEY))
                             + up * (rh * math.sin(2 * math.pi * i / NEY)))
                for i in range(NEY)]

    margin = oval(0.0016, w, h)                     # the lid edge
    inner = oval(-depth, w * 0.54, h * 0.60)        # behind the eyeball
    _bridge(bm, rim, [margin, inner], NEY)
    return centre, outward


def ear(bm, rings, ri0, cols, n, side, out=0.018):
    """An ear, as a flattened tube off the side of the skull.

    ⚠️ AN EAR STICKS OUT SIDEWAYS AND BACK, AND IT IS A DISC, NOT A LUMP.
    Its cross-section is tall and thin -- that is the whole silhouette, and
    a round tube there reads as a handle. The taper is also the wrong way
    round from a finger's: an ear is WIDEST at its outer rim, not at the
    root, which is why one modelled like a thumb looks like a wart.
    """
    rim, centre = patch(bm, rings, ri0, 2, cols, n)
    s = 1.0 if side == "l" else -1.0
    d = Vector((s * 1.0, 0.42, 0.0)).normalized()
    base = centre + d * -0.004
    # The same cuff-bigger-than-its-socket mistake the nose made: 52 mm of
    # ring into a 44 mm hole pierced the skull behind the ear.
    path = [(base, (0.008, 0.019)),
            (base + d * (out * 0.55), (0.009, 0.024)),
            (base + d * out, (0.006, 0.021))]
    return _bridge(bm, rim, _tube(bm, path, NE, Vector((0, 0, 1))), NE)
