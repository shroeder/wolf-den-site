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

NN = 6          # verts per nose ring: matches a 2x1 socket's 6 edges
NE = 8          # and per ear ring


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


def nose(bm, rings, ri0, cols, n, width=0.016, out=0.026, down=0.040):
    """The protruding part of the nose, as a short tube off a SMALL socket.

    ⚠️ THE BRIDGE IS SKULL AND MUST NOT TRAVEL WITH THE TIP. The first
    version cut a socket from the nose base all the way up to eye level and
    bridged one tube into the whole thing -- so the root between the eyes
    moved forward exactly as far as the tip did, and that is the definition
    of a beak. Angling the tube down helps and does not fix it: a tube is
    uniform, and anything the tip does the root does too.
    #
    What actually divides here is not top-from-bottom, it is SKULL from
    CARTILAGE. The bridge is a form on the skull's own surface and the head
    rings already make it, with a bump at the midline between the sockets.
    Only the lower nose leaves the surface, so only the lower nose is a
    separate piece -- one ring gap of socket, six edges, and the face above
    it is left alone.

    ⚠️ AND THE PATH IS AUTHORED, NOT A STRAIGHT AXIS. Along one direction
    the second ring is already a third of the way out, so the nose is proud
    the moment it leaves the face. Forward and down are separate numbers per
    ring, which is what lets the dorsum ease out and the tip drop.
    """
    rim, centre = patch(bm, rings, ri0, 1, cols, n)
    #            forward, down,  half-width, half-height
    PROFILE = [(-0.003, 0.000, 0.80, 0.013),
               (0.009, 0.014, 0.95, 0.012),
               (0.020, 0.029, 1.00, 0.011),
               (out, down, 0.78, 0.008)]
    path = [(centre + Vector((0.0, -f, -dz)), (width * w, h))
            for f, dz, w, h in PROFILE]
    return _bridge(bm, rim, _tube(bm, path, NN, Vector((0, 0, 1))), NN)


def eyeball(bm, at, cy, r=0.0118, sink=-0.0030, segs=14, rings_=10):
    """A sphere set into the socket, as its own closed shell.

    ⚠️ THE SOCKET CANNOT BE THE EYE. A hollow in the skull is a hollow; it
    reads as a skull with hollows, which is what the head looked like with
    the brow and cheekbones in and nothing between them. An eye is a hard
    convex thing inside a soft concave one, and that contrast is the entire
    read -- it is the first feature that makes a head look back at you.
    #
    ⚠️ AND IT MUST BE SUNK, NOT STUCK ON. A sphere whose centre is at the
    socket surface is a googly eye: half a ball hanging off the face. Sunk
    part of its radius, only a cap stands proud, the brow above it casts the
    shadow that reads as a lid, and the rest is implied.

    ⚠️ BUT SINK IT AGAINST THE CAGE AND IT VANISHES. The socket vertex this
    is placed from is a CONTROL point, and Catmull-Clark does not pass
    through its control points -- in a hollow the limit surface sits well
    OUTSIDE the cage, so a ball sunk 9 mm behind a cage vertex ended up
    entirely inside the head and the face rendered with two empty sockets
    and no indication anything had been added. Anything positioned against
    a subdivided surface has to be positioned against the LIMIT, not the
    cage, or be pushed out far enough that the difference cannot bury it.
    Measured on the evaluated mesh: at the eye's x the brow's limit surface
    is 5 mm in front of the socket's, so an eye sunk BEHIND the socket was
    never going to appear. `sink` is negative for that reason -- the ball
    sits proud of the cage vertex and roughly flush with the brow plane,
    which is where an eyeball actually sits on a skull.
    """
    into = Vector((-at.x, cy - at.y, 0.0))
    into = into.normalized() if into.length > 1e-6 else Vector((0, 1, 0))
    c = at + into * sink
    grid = []
    for j in range(1, rings_):
        t = math.pi * j / rings_
        grid.append([bm.verts.new((c.x + r * math.sin(t) * math.cos(2 * math.pi * i / segs),
                                   c.y + r * math.sin(t) * math.sin(2 * math.pi * i / segs),
                                   c.z + r * math.cos(t)))
                     for i in range(segs)])
    top = bm.verts.new((c.x, c.y, c.z + r))
    bot = bm.verts.new((c.x, c.y, c.z - r))
    for a, b in zip(grid, grid[1:]):
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((a[i], a[j], b[j], b[i]))
    for i in range(segs):
        j = (i + 1) % segs
        bm.faces.new((top, grid[0][j], grid[0][i]))
        bm.faces.new((bot, grid[-1][i], grid[-1][j]))
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    return c


def ear(bm, rings, ri0, cols, n, side, out=0.022):
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
