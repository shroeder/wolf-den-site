import kit

# ═══════════════════════════════════════════════════════════════════════════
# THE TREE — A TUBE AND THREE CONES
#
# The single most repeated object in a RuneScape scene, so it is also the one
# that has to be cheapest. Six parts, 86 triangles.
#
# ⚠️ THE TRUNK IS 3.5 m OF NOTHING, AND THAT IS THE POINT. At 4.0 m total with the
#    canopy starting at 2.2 the tree read as a shrub the moment the camera dropped to a
#    30-degree view: you saw it side-on, at your own height, and nothing about it said
#    TREE. A tree is the thing you walk UNDERNEATH. Three times the player, canopy
#    starting above head height, and the silhouette does the work from any angle.
#
# ⚠️ THE CONES ARE STACKED AND TWISTED, NOT SCALED COPIES. Three hexagonal
#    cones sharing an axis and a rotation read as one cone with steps cut in
#    it. Rotating each by a third of a face (20 degrees) is what makes the
#    silhouette irregular, and it costs nothing -- it is an argument, not
#    geometry. Same trick for the lean on the apex.
#
# ⚠️ AND THE THREE GREENS ARE NOT SHADING. A flat-shaded scene gets no
#    gradient from the light, so depth in the canopy has to be PAINTED: dark
#    at the bottom, light at the top, which is where the sky is. This is the
#    same rule as the game's 2.5D sprites and it is the reason an overlay
#    cannot do the job -- the colour belongs to the part.
# ═══════════════════════════════════════════════════════════════════════════

NAME = "tree"
LABEL = "Tree"
KIND = "scenery"
SCALE = "tree"
NOTE = ("Six parts: a flared six-sided trunk and three twisted canopy cones "
        "in three greens. 5.5 m -- three times the player, with 3.5 m of bare "
        "trunk so you walk UNDER it rather than past it.")


def build():
    parts = [
        # Root flare. A trunk that meets the ground at its full width looks
        # pushed into the dirt; 12 extra triangles fix it.
        kit.prism("Flare", (0, 0, 0.16), 0.34, 0.32, "bark_dark",
                  sides=6, top_radius=0.24),
        kit.prism("Trunk", (0, 0, 1.95), 0.24, 3.30, "bark",
                  sides=6, top_radius=0.17, twist=12),
        # Canopy, bottom to top. Each cone's base sits inside the one below
        # it so no gap can open up at an angle the filmer does not visit.
        kit.cone("Canopy_lo", (0, 0, 3.90), 1.34, 1.15, "leaf_dark",
                 sides=6, apex_shift=(0.07, -0.05)),
        kit.cone("Canopy_mid", (0, 0, 4.48), 1.06, 1.08, "leaf",
                 sides=6, twist=20, apex_shift=(-0.06, 0.06)),
        kit.cone("Canopy_hi", (0, 0, 5.02), 0.72, 0.96, "leaf_light",
                 sides=6, twist=40, apex_shift=(0.04, 0.04)),
    ]
    return kit.join(parts, "Tree")
