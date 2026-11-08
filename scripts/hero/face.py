import bmesh, math
from mathutils import Vector

import cage

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

NE = 10         # verts per ear ring: matches a 3x2 patch's 10 edges
NEY = 12        # verts per eye-socket ring: matches a 4x2 patch's 12 edges
NM = 24         # verts per mouth ring: matches an 8x4 patch's 24 edges


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


def mouth(bm, rings, ri0, cols, n, w=0.0250, h=0.0136, stand=0.0062, slit=0.0014):
    """The lips -- a vermillion border standing proud, closing on a slit.

    ⚠️ THIS IS THE EYELID LESSON A SECOND TIME. A ring varies its radius
    with angle, so everything it makes is a level band round the head, and
    not one feature of a mouth is level: the lip line dips at the centre and
    lifts at the corners, the vermillion border is a closed CURVE, and a
    cupid's bow is a shape in the surface. Two attempts to build lips out of
    rings produced ripples -- three rings gave four of them, nine rings gave
    nine -- which is what a wrong premise looks like as opposed to a wrong
    number.

    So, as with the eye: cut the face open and bridge in loops that go
    AROUND the mouth. The outer ring is the vermillion border and stands
    proud; it closes on a second ring flattened almost to a line and pushed
    slightly in, and the sliver capping that IS the mouth line. The two
    halves of the border either side of the slit become the upper and lower
    lip without being modelled as separate things.
    """
    rim, centre = patch(bm, rings, ri0, 4, cols, n)
    outward = Vector((0.0, -1.0, 0.0))
    up = Vector((0.0, 0.0, 1.0))
    right = Vector((1.0, 0.0, 0.0))

    # ⚠️ A UNIFORM OFFSET MAKES A WALL AT THE CORNERS -- the same mistake
    # the ear made one axis over. Pinching the two rings together in WIDTH
    # is not enough: the border stands 6 mm in front of the slit, so where
    # they meet there is a 6 mm cliff of lip and the mouth renders as a
    # rounded rectangle however pointed its outline is. The offset tapers
    # to nothing at the corners, so the lips close there in depth as well.
    def oval(off, rw, rh, bow=0.0):
        out_v = []
        for i in range(NM):
            t = 2.0 * math.pi * i / NM
            x, y = math.cos(t), math.sin(t)
            c = centre + outward * (off * abs(y))
            # The upper lip peaks either side of the midline -- the bow --
            # and the corners sit a little lower than the middle of either
            # lip, which is what stops a mouth reading as a letterbox.
            lift = bow * math.cos(2.0 * t) if y > 0 else 0.0
            out_v.append(bm.verts.new(c + right * (rw * x)
                                      + up * (rh * y + lift)))
        return out_v

    border = oval(stand, w, h, bow=0.0022)
    # ⚠️ THE SLIT MUST REACH THE CORNERS OR THE MOUTH IS A LETTERBOX. Ending
    # it at 86% of the border left a blunt wall of lip at each end and the
    # whole thing rendered as a rounded rectangle. Both rings finish at the
    # same x, so the two lips meet at a point -- which is what a corner is.
    line = oval(-0.0014, w * 0.995, slit)
    return _bridge(bm, rim, [border, line], NM)


def ear(bm, rings, ri0, cols, n, side, out=0.026,
        rw=0.0125, rh=0.0310, bowl=0.0120):
    """An ear, as a DISH: out to a raised helix, then folded back to a bowl.

    ⚠️ AN EAR IS NOT A BLOB ON THE SIDE OF A HEAD, AND THE OLD ONE WAS. It
    was a flattened tube capped at its outer end -- a smooth almond stuck
    to the skull, which has no helix, no concha and no lobe, and reads as a
    wart from every angle. The silhouette is only half of what makes an ear;
    the other half is that it is CONCAVE. The rim stands proud and the
    middle falls away behind it, and that one shadow is most of the read.

    So it is built the way the eye socket is: a ring standing out from the
    skull, then folded BACK toward it into a smaller ring, capped behind.
    The surface between the two is the helix curling over; the hollow it
    leaves is the concha. Same closed pocket, laid on its side.

    ⚠️ THE CONSTRUCTION NUMBER IS NOT THE PROJECTION. Built to stand 17 mm
    off the skull it measured 9.7 on the rendered surface -- the outward
    direction is angled back so only 92% of it is lateral, and Catmull-Clark
    pulls a ridge carried by ten vertices well inside its cage. 43% lost
    between what was authored and what ships, which is exactly why the
    audit measures the evaluated mesh and not the numbers in this file.

    ⚠️ AND IT IS FATTER AT THE BOTTOM. An ear tapers upward and hangs into a
    lobe; an even oval is the thing that makes it read as a leaf stuck on.
    The helix ring takes a bump low and a pinch high, which is a number
    rather than a shape I have to sculpt.
    """
    rim, centre = patch(bm, rings, ri0, 2, cols, n)
    s_ = 1.0 if side == "l" else -1.0
    outward = Vector((s_ * 1.0, 0.42, 0.0)).normalized()
    up = Vector((0.0, 0.0, 1.0))
    fore = up.cross(outward).normalized()

    # ⚠️ THE PROJECTION HAS TO VARY ROUND THE RIM OR IT IS A FUNNEL. A ring
    # standing uniformly proud of the skull is a napkin ring stuck to his
    # head -- which is precisely what the first corrected version rendered
    # as, and it was worse than the blob it replaced. An ear is ATTACHED at
    # the front, where it meets the face, and flares at the back and top.
    # The offset is therefore per-vertex: full at the back, a third of it
    # at the front.
    #
    # `fore` points backward here (up x outward), so fraction 0 is the back
    # of the ear and 0.5 the front.
    def oval(off, w, h, bumps=None, hug=0.32):
        mult = cage.shape(NE, bumps)
        out_v = []
        for i in range(NE):
            t = 2.0 * math.pi * i / NE
            lean = hug + (1.0 - hug) * (0.5 + 0.5 * math.cos(t))
            c = centre + outward * (off * lean)
            out_v.append(bm.verts.new(c + fore * (w * mult[i] * math.cos(t))
                                      + up * (h * mult[i] * math.sin(t))))
        return out_v

    # 0.25 of the way round is the top of the ear, 0.75 the lobe.
    helix = oval(out, rw, rh, [(0.75, 0.24, 0.22), (0.25, 0.20, -0.08)])
    concha = oval(bowl, rw * 0.50, rh * 0.46)
    return _bridge(bm, rim, [helix, concha], NE)
