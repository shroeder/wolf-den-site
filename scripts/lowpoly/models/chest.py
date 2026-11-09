import kit

# ═══════════════════════════════════════════════════════════════════════════
# THE CHEST — BUILT CLOSED, AND BUILT TO OPEN
#
# ⚠️ THE LID IS A SEPARATE PART OVER ITS OWN HINGE LINE, even though nothing
#    animates yet. The hinge is the back edge at +y and the lid's geometry
#    is centred over it, so opening this chest later is one rotation about
#    one axis through a line that already exists. Welding it into a single
#    box would mean rebuilding the model the day it has to open, and "split
#    it later" is how a model gets built twice.
#
# ⚠️ BANDS SIT 3 MM PROUD, NOT FLUSH. Flush is z-fighting, and z-fighting on
#    a flat-shaded object does not read as flicker -- it reads as a hole.
# ═══════════════════════════════════════════════════════════════════════════

NAME = "chest"
LABEL = "Chest"
KIND = "prop"
SCALE = "prop"
NOTE = ("Oak and iron, 0.70 m. The lid is its own part over a hinge line at "
        "the back edge, so it can open without being rebuilt.")

W, D = 0.86, 0.54           # outer width and depth, shared by body and lid
HINGE_Y = D / 2.0


def build():
    parts = [
        kit.box("Body", (0, 0, 0.26), (W, D, 0.52), "bark"),
        # The lid overhangs by 2 cm on three sides and is flush at the
        # hinge, which is what a real box does and what makes the shadow
        # line under it read.
        kit.box("Lid", (0, -0.01, 0.63), (W + 0.04, D + 0.02, 0.14),
                "bark_dark"),
        kit.box("Lip", (0, -D / 2 - 0.015, 0.545), (W * 0.92, 0.03, 0.05),
                "iron"),
    ]
    band = kit.box("Band_R", (0.27, 0, 0.36), (0.09, D + 0.006, 0.72), "iron")
    parts += [band, kit.mirror_x(band, "Band_L")]
    # The lock: the only gold in the set, and 12 triangles of it. On a chest
    # the eye goes straight to the catch, so that is where the one bright
    # metal belongs.
    parts.append(kit.box("Lock", (0, -D / 2 - 0.02, 0.52), (0.14, 0.05, 0.16),
                         "gold"))
    return kit.join(parts, "Chest")
