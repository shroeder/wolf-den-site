import kit

# ═══════════════════════════════════════════════════════════════════════════
# THE FURNACE — A PLACE, NOT A PROP
#
# ⚠️ IT IS SIZED SO THE PLAYER STANDS AT IT, not beside it. 2.02 m overall
#    with the mouth at 0.78 -- the same working height as the anvil's face,
#    because the two get used in the same breath and a smithy where the
#    furnace is chest height and the anvil is knee height reads as two
#    unrelated objects that happen to be near each other.
#
# ⚠️ THE FIRE INSIDE IS THE SAME flame_hot AS models/fire.py, on purpose.
#    One fire colour in the world. A second orange would make the two look
#    like different materials rather than the same element.
# ═══════════════════════════════════════════════════════════════════════════

NAME = "furnace"
LABEL = "Furnace"
KIND = "scenery"
SCALE = "prop"
NOTE = ("Stone, 2.02 m, mouth at 0.78 -- the same working height as the "
        "anvil, because they are used together.")


def build():
    parts = [
        kit.prism("Base", (0, 0, 0.14), 0.86, 0.28, "stone_dark",
                  sides=6, top_radius=0.78),
        kit.prism("Body", (0, 0, 0.78), 0.78, 1.00, "stone",
                  sides=6, top_radius=0.56, twist=8),
        kit.prism("Shoulder", (0, 0, 1.40), 0.58, 0.24, "stone_dark",
                  sides=6, top_radius=0.34),
        kit.prism("Chimney", (0, 0, 1.76), 0.30, 0.52, "stone",
                  sides=6, top_radius=0.26, twist=22),
        kit.prism("Cap", (0, 0, 2.00), 0.33, 0.07, "stone_dark", sides=6),
        # The mouth is a dark recess set into the body, not a panel stuck on
        # it. Without the soot behind it the flame has nothing to read
        # against and looks like a sticker.
        kit.box("Mouth", (0, -0.62, 0.78), (0.52, 0.22, 0.46), "soot"),
        kit.box("Lintel", (0, -0.70, 1.05), (0.60, 0.14, 0.11), "stone_dark"),
        kit.cone("Fire", (0, -0.70, 0.70), 0.19, 0.34, "flame_hot",
                 sides=6, apex_shift=(0.03, 0.0)),
    ]
    return kit.join(parts, "Furnace")
