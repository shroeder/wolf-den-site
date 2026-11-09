import random

import kit

# ═══════════════════════════════════════════════════════════════════════════
# THE ROCK — A JITTERED PRISM, AND THE SEED IS WRITTEN DOWN
#
# A mining rock: stone body, a cap, and three copper flecks. Nine parts.
#
# ⚠️ THE JITTER IS SEEDED, AND THE SEED IS A CONSTANT IN THIS FILE.
#    An unseeded random() here would mean the model changes every build, so a
#    render could never be compared with the previous one and the gate's
#    measurements would be of a different rock each time it ran. A low-poly
#    rock does want irregularity -- it just has to be the SAME irregularity
#    on every run. Change SEED to get a different rock; do not remove it.
#
# ⚠️ THE FLECKS SIT ON FACES, NOT IN THE BODY. Ore embedded inside a closed
#    mesh is invisible, and a fleck poking out of a face it is not aligned to
#    reads as z-fighting. They are small boxes pushed just proud of the
#    surface at three of the six side normals -- which is why the body's side
#    count is a named constant shared with them.
# ═══════════════════════════════════════════════════════════════════════════

NAME = "rock"
LABEL = "Rock (copper)"
KIND = "prop"
SCALE = "rock"
NOTE = ("A seeded-jitter six-sided boulder with three copper flecks. 0.62 m -- a third of the player, which is a rock you mine rather than a rock you shelter behind.")

SEED = 7
SIDES = 6
JITTER = 0.075          # metres, per axis, uniform
RADIUS = 0.42


def _jitter(ob, rng, amount=JITTER, floor=None):
    """Shove every vertex a little. Vertices at or below `floor` keep their z,
    so a jittered rock still has a flat bottom and does not rock on it."""
    for v in ob.data.vertices:
        v.co.x += rng.uniform(-amount, amount)
        v.co.y += rng.uniform(-amount, amount)
        if floor is None or v.co.z > floor:
            v.co.z += rng.uniform(-amount, amount)
    return ob


def build():
    rng = random.Random(SEED)

    body = kit.prism("Body", (0, 0, 0.21), RADIUS, 0.42, "stone",
                     sides=SIDES, top_radius=RADIUS * 0.82)
    _jitter(body, rng, floor=-0.20)

    # A low, shifted cap. At 0.34 high with a leaning apex it read as a
    # tent rather than a boulder -- the point was the whole silhouette.
    cap = kit.prism("Cap", (0, 0, 0.50), RADIUS * 0.84, 0.18, "stone_dark",
                    sides=SIDES, top_radius=RADIUS * 0.42, twist=30)
    _jitter(cap, rng, amount=JITTER * 0.8, floor=-0.13)

    parts = [body, cap]

    # Three flecks at alternating faces of the hexagon, pushed out along that
    # face's own normal so each one lies flat against the stone.
    import math
    for i, face in enumerate((0, 2, 4)):
        a = 2 * math.pi * face / SIDES
        r = RADIUS * 0.92
        z = 0.15 + 0.09 * i
        parts.append(kit.box(
            "Ore_%d" % i,
            (r * math.cos(a), r * math.sin(a), z),
            (0.13, 0.13, 0.10), "ore_copper",
            rot=(0, 0, math.degrees(a))))

    return kit.join(parts, "Rock")
