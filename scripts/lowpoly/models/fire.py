import math

import kit

# ═══════════════════════════════════════════════════════════════════════════
# THE CAMPFIRE — THREE CONES, AND THE BRIGHTEST THING IN THE WORLD
#
# ⚠️ THE FLAME IS THE ONLY SATURATED COLOUR IN THE PALETTE, and that is what
#    makes a fire read as a landmark from across a scene instead of as an
#    orange prop. Everything else in style.PALETTE sits between 0.1 and 0.6;
#    flame_hot is 0.93. Do not spend that value anywhere else.
#
# ⚠️ AND THE FLAME CONES ARE NOT CONCENTRIC. Three cones on one axis read as
#    one cone with steps cut in it -- the same trap as the tree's canopy.
#    Each is offset, leaned by its own apex_shift and twisted, so the
#    silhouette is ragged from every azimuth the filmer visits. For a shape
#    with no animation yet, that is the only thing standing in for movement.
# ═══════════════════════════════════════════════════════════════════════════

NAME = "fire"
LABEL = "Campfire"
KIND = "prop"
SCALE = "prop"
NOTE = ("Logs, a stone ring and three leaning flames. 0.77 m, and the only "
        "saturated colour in the set.")

RING_R = 0.46


def build():
    # Ash bed first: without it the flames grow out of bare ground.
    parts = [kit.prism("Ash", (0, 0, 0.025), 0.30, 0.05, "soot", sides=6)]

    # Three logs leaning into the middle. Laid flat means 78 degrees off
    # vertical, not 90 -- a tripod, which is how a fire is actually built.
    for i in range(3):
        a = 120.0 * i + 25.0
        parts.append(kit.frustum(
            "Log_%d" % i,
            (RING_R * 0.46 * math.cos(math.radians(a)),
             RING_R * 0.46 * math.sin(math.radians(a)), 0.16),
            (0.11, 0.11), (0.08, 0.08), 0.52, "bark",
            rot=(78, 0, a + 90)))

    # The stone ring. Five, not six: an odd count never lines up with the
    # hexagonal ash bed under it, so the ring does not read as a wheel.
    for i in range(5):
        a = math.radians(72.0 * i + 14.0)
        parts.append(kit.box(
            "Stone_%d" % i,
            (RING_R * math.cos(a), RING_R * math.sin(a), 0.07),
            (0.19, 0.15, 0.14), "stone",
            rot=(0, 0, math.degrees(a))))

    # Big and dull at the bottom, small and hot at the top.
    parts += [
        kit.cone("Flame_lo", (0.02, -0.01, 0.28), 0.25, 0.42, "ember",
                 sides=6, apex_shift=(-0.07, 0.05)),
        kit.cone("Flame_mid", (-0.04, 0.03, 0.42), 0.19, 0.44, "flame",
                 sides=6, twist=25, apex_shift=(0.08, -0.04)),
        kit.cone("Flame_hi", (0.05, 0.02, 0.58), 0.12, 0.38, "flame_hot",
                 sides=6, twist=48, apex_shift=(-0.04, -0.06)),
    ]
    return kit.join(parts, "Fire")
