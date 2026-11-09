import kit

# ═══════════════════════════════════════════════════════════════════════════
# THE GOBLIN — THE PLAYER'S SHAPE, DELIBERATELY WRONG IN FOUR PLACES
#
# ⚠️ A MONSTER BUILT FROM THE SAME PROPORTIONS IN A DIFFERENT COLOUR IS A
#    RECOLOUR, NOT A MONSTER. The whole read has to come from the
#    silhouette, because at the scale anyone actually sees this thing the
#    colour is three pixels wide. So every difference from models/player.py
#    is on purpose and listed here:
#
#      1. SHORT. 1.20 m against the player's 1.85 -- two thirds, which is
#         the gap that reads instantly in a line-up. The gate enforces it
#         through the "small_npc" scale class.
#      2. BIG HEAD. 0.34 against the player's 0.30, on a body two thirds the
#         size. That ratio is the strongest "not human" signal available in
#         a model of sixteen boxes.
#      3. LONG ARMS. The hands hang below the knee. The player's stop at
#         mid-thigh.
#      4. HUNCHED. The torso leans 11 degrees forward and the head sits
#         forward of the hips, so he never stands up straight.
#
# ⚠️ AND HE IS THREE GREENS, NOT ONE. The first build used two that were 0.09
#    apart in value and he came back a green blob: head, arms, legs and
#    torso all the same slab of colour at any distance. Flat shading gives
#    no gradient to separate parts, so VALUE has to do the job that lighting
#    does on a smooth model -- torso light, limbs mid, extremities deep.
#
# ⚠️ EARS: `rot=(0, 90, 0)` AND NOT -90. A wedge's point travels along +z;
#    rotating +90 about y swings that to +x, which is outward for the right
#    ear. At -90 the point goes inward through the skull and what sticks out
#    is the blunt back of the wedge -- which is exactly what the first build
#    looked like, two rectangular handles on the back corners of the head.
# ═══════════════════════════════════════════════════════════════════════════

NAME = "goblin"
LABEL = "Goblin"
KIND = "npc"
SCALE = "small_npc"
NOTE = ("Sixteen parts, 1.20 m -- two thirds of the player, with a bigger "
        "head, longer arms, pointed ears and an 11-degree hunch.")

LEAN = 11.0
HEAD_X = 0.17           # half the head's width; the ears hang off it


def build():
    parts = []

    # ── LEGS ────────────────────────────────────────────────────────
    # Short and bowed: the feet sit wider apart than the hips.
    foot = kit.box("Foot_R", (0.115, -0.03, 0.045), (0.16, 0.25, 0.09),
                   "goblin_deep")
    leg = kit.frustum("Leg_R", (0.10, 0.0, 0.26), (0.13, 0.14), (0.16, 0.16),
                      0.44, "goblin_dark", rot=(0, -4, 0))
    parts += [foot, leg, kit.mirror_x(foot, "Foot_L"),
              kit.mirror_x(leg, "Leg_L")]

    # ── BODY ────────────────────────────────────────────────────────
    # A pot belly: WIDER at the waist than at the shoulder, the exact
    # inverse of the player's taper and the second thing you notice after
    # the height.
    parts.append(kit.frustum("Torso", (0, -0.045, 0.70), (0.36, 0.28),
                             (0.29, 0.21), 0.48, "goblin", rot=(LEAN, 0, 0)))
    # A proper loincloth, not a belt. The first one was 14 cm deep and read
    # as a strap.
    parts.append(kit.box("Rag", (0, -0.03, 0.47), (0.35, 0.29, 0.22),
                         "tunic"))

    # ── ARMS ────────────────────────────────────────────────────────
    # Two parts, reaching past the knee. Pulled in to x=0.185 so the inner
    # face overlaps the torso -- at 0.21 there was a centimetre of daylight
    # at the shoulder and the arms read as floating.
    arm = kit.frustum("Arm_R", (0.185, -0.05, 0.57), (0.13, 0.14),
                      (0.11, 0.12), 0.50, "goblin_dark", rot=(0, -6, 0))
    hand = kit.box("Hand_R", (0.155, -0.05, 0.27), (0.14, 0.15, 0.14),
                   "goblin_deep")
    parts += [arm, hand, kit.mirror_x(arm, "Arm_L"),
              kit.mirror_x(hand, "Hand_L")]

    # ── HEAD ────────────────────────────────────────────────────────
    # Forward of the hips, not above them, and no neck at all -- a neck
    # would let him stand up, and he does not.
    parts.append(kit.box("Head", (0, -0.085, 1.02), (HEAD_X * 2, 0.32, 0.30),
                         "goblin"))
    parts.append(kit.box("Brow", (0, -0.238, 1.10), (0.35, 0.05, 0.08),
                         "goblin_deep"))
    parts.append(kit.box("Nose", (0, -0.235, 0.98), (0.09, 0.09, 0.10),
                         "goblin_dark"))

    ear = kit.wedge("Ear_R", (HEAD_X + 0.07, -0.06, 1.05),
                    (0.17, 0.07, 0.20), "goblin_dark", rot=(0, 90, 0))
    parts += [ear, kit.mirror_x(ear, "Ear_L")]

    return kit.join(parts, "Goblin")
