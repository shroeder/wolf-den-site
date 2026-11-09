import kit

# ═══════════════════════════════════════════════════════════════════════════
# THE TREE — A TUBE AND THREE CONES
#
# The single most repeated object in a RuneScape scene, so it is also the one
# that has to be cheapest. Six parts, 86 triangles.
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
        "in three greens. 4.0 m, a shade over twice the player.")


def build():
    parts = [
        # Root flare. A trunk that meets the ground at its full width looks
        # pushed into the dirt; 12 extra triangles fix it.
        kit.prism("Flare", (0, 0, 0.14), 0.30, 0.28, "bark_dark",
                  sides=6, top_radius=0.21),
        kit.prism("Trunk", (0, 0, 1.30), 0.21, 2.35, "bark",
                  sides=6, top_radius=0.15, twist=12),
        # Canopy, bottom to top. Each cone's base sits inside the one below
        # it so no gap can open up at an angle the filmer does not visit.
        kit.cone("Canopy_lo", (0, 0, 2.62), 1.22, 0.95, "leaf_dark",
                 sides=6, apex_shift=(0.06, -0.04)),
        kit.cone("Canopy_mid", (0, 0, 3.08), 0.98, 0.90, "leaf",
                 sides=6, twist=20, apex_shift=(-0.05, 0.05)),
        kit.cone("Canopy_hi", (0, 0, 3.52), 0.66, 0.84, "leaf_light",
                 sides=6, twist=40, apex_shift=(0.03, 0.03)),
    ]
    return kit.join(parts, "Tree")
