import kit

# ═══════════════════════════════════════════════════════════════════════════
# THE ANVIL — AND THE STUMP IS PART OF THE MODEL
#
# ⚠️ AN ANVIL ON THE GROUND IS AN ANVIL NOBODY CAN USE. It is a waist-height
#    object in every game that has one, and modelling it as the iron alone
#    means whoever places it has to find a stump from somewhere -- the same
#    class of mistake as shipping a screen with no door. The stump ships
#    with it, and the scale class is measured over both.
#
# The horn is the whole silhouette. A box on a stump is a block; a box with
# a point off one end is an anvil, and the point costs 8 triangles.
# ═══════════════════════════════════════════════════════════════════════════

NAME = "anvil"
LABEL = "Anvil"
KIND = "prop"
SCALE = "prop"
NOTE = ("Iron on an oak stump, 0.79 m to the face -- waist height on the "
        "player, which is the height it has to be to be usable.")


def build():
    parts = [
        kit.prism("Stump", (0, 0, 0.23), 0.27, 0.46, "bark",
                  sides=6, top_radius=0.25),
        # The iron: base, pinched waist, body. Three parts that give the
        # classic hourglass from the side for 36 triangles together.
        kit.box("Base", (0, 0, 0.50), (0.34, 0.26, 0.08), "iron"),
        kit.frustum("Waist", (0, 0, 0.585), (0.26, 0.20), (0.34, 0.24),
                    0.09, "iron"),
        kit.box("Body", (0, 0, 0.695), (0.44, 0.24, 0.13), "iron"),
        # A lighter steel on the top face only. On flat-shaded geometry a
        # worn working surface cannot be a texture, so it has to be a part.
        kit.box("Face", (0, 0, 0.775), (0.42, 0.22, 0.03), "steel"),
        # The horn, and the heel at the other end.
        kit.wedge("Horn", (0.33, 0, 0.70), (0.26, 0.17, 0.11), "iron",
                  rot=(0, 90, 0)),
        kit.box("Heel", (-0.27, 0, 0.70), (0.12, 0.20, 0.11), "iron"),
    ]
    return kit.join(parts, "Anvil")
