import math

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
