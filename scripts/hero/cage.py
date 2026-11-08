import math

import bmesh
from mathutils import Vector

# ═══════════════════════════════════════════════════════════════════════════
# THE CAGE PRIMITIVES — the three functions everything here is built out of.
#
# They live in their own file because the head needs them at a DIFFERENT
# RESOLUTION from the body, and a head that imports the body to borrow its
# ring() while the body imports the head to build it is a circular import.
# Nothing in here knows what a torso or a skull is; it knows what a ring is.
# ═══════════════════════════════════════════════════════════════════════════


def shape(n, bumps):
    """Radial multipliers around a ring. Each bump is (where, width, amount),
    all as fractions of the way round, with a cosine falloff and wraparound.

    ⚠️ BUMPS ARE IN FRACTIONS, NOT VERTEX INDICES, AND THAT IS WHY THE HEAD
    COULD BE DENSIFIED AT ALL. Every muscle, socket and ridge on this body
    is authored as "a quarter of the way round, this wide, this much" -- so
    doubling a ring's vertex count changes the wavelength it can carry and
    changes nothing about what was authored. Had any of it been written as
    "vertex 24", raising the resolution would have meant re-authoring the
    whole figure.
    """
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


def ring(bm, cz, rx, ry, cy=0.0, n=32, bumps=None, dz=None):
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


def step_up(bm, coarse, fine):
    """Join a ring of n verts to a ring of exactly 2n, above it.

    ⚠️ bridge_loops WILL DO THIS AND IT PUTS THE SEAM WHEREVER IT LIKES. On
    a 1:2 ratio the correspondence is not a guess -- fine vertex 2i IS
    coarse vertex i, because both rings are generated from the same angle
    parameterisation. Spelling that out keeps the transition regular all the
    way round, which is the difference between a neck and a neck with a
    pucker in it. Three triangles per coarse edge, no n-gons, manifold.
    """
    n = len(coarse)
    assert len(fine) == 2 * n, "step_up needs exactly double"
    for i in range(n):
        j = (i + 1) % n
        a, b, c = fine[2 * i], fine[(2 * i + 1) % (2 * n)], fine[(2 * i + 2) % (2 * n)]
        bm.faces.new((coarse[i], a, b))
        bm.faces.new((coarse[i], b, coarse[j]))
        bm.faces.new((coarse[j], b, c))


# ── EVERY BRIDGE REPORTS ITSELF ───────────────────────────────────────────
# ⚠️ THE WRIST WAS CRUSHED FROM THE DAY THE HAND WAS BUILT and nothing in
# this project could see it. The mesh was manifold, closed, correctly
# proportioned; the grip test passed; the canon passed. What was wrong was
# invisible to all of them and obvious in one number: the two loops being
# joined were at the SAME POINT, so the bridge had zero span and built a
# collar of zero-area faces.
#
# So no bridge is built silently any more. Each one prints how many edges
# it joined on each side, how far apart the loops were, and the smallest
# face it produced. A span of 0.0 or an area near zero is a collapsed join,
# and it now takes one glance at a build log rather than a close render of
# a part nobody thought to photograph.
BRIDGES = []


def _centroid(edges):
    vs = set()
    for e in edges:
        vs |= set(e.verts)
    c = Vector((0.0, 0.0, 0.0))
    for v in vs:
        c += v.co
    return c / max(len(vs), 1)


def bridge(bm, rim, cuff, label):
    rim, cuff = list(rim), list(cuff)
    span = (_centroid(rim) - _centroid(cuff)).length
    r = bmesh.ops.bridge_loops(bm, edges=rim + cuff)
    faces = r.get("faces", [])
    areas = [f.calc_area() for f in faces] or [0.0]
    BRIDGES.append((label, len(rim), len(cuff), span, len(faces), min(areas)))
    return r


def bridge_report():
    worst = 0.0
    lines = ["   bridge      edges    span    faces   smallest face"]
    for label, a, b, span, n, area in BRIDGES:
        # ⚠️ A SHORT SPAN ON ITS OWN IS NOT A DEFECT. Flagging everything
        # under 1.5 mm lit up all eight finger sockets, which are 8->8 and
        # perfectly healthy -- their loops are offset sideways, so the
        # faces have area even though the loops are close. What killed the
        # wrist was a short span AND mismatched counts: with 12 verts
        # against 26 and nowhere to travel, the quads have nothing to be.
        # The symptom itself -- a face with no area -- is the other flag.
        flag = ""
        if span < 0.0015 and a != b:
            flag = "  <-- COINCIDENT, MISMATCHED"
        elif area < 1.5e-6:
            flag = "  <-- COLLAPSED FACE"
        lines.append("   %-11s %2d->%-2d %6.1fmm %4d %10.3f mm2%s"
                     % (label, a, b, span * 1000, n, area * 1e6, flag))
        worst += 1.0 if flag else 0.0
    return chr(10).join(lines), worst
