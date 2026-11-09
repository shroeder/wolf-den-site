import kit

# ═══════════════════════════════════════════════════════════════════════════
# THE PLAYER — SIXTEEN BOXES, AND HE IS THE RULER FOR EVERYTHING ELSE
#
# ⚠️ NO BOUGHT BODY. The previous hero came out of MPFB, and its worst day
#    was a bind mismatch nobody could see: a generated skeleton fitted to the
#    wrong mesh, every joint a hip-height from the flesh it drove. Here the
#    whole figure is sixteen hand-placed primitives in metres, so there is
#    nothing to mismatch and nothing to debug -- if a shoulder is wrong, it
#    is wrong in a number on one of these lines.
#
# The proportions are early-RS and deliberately NOT human: a 5.8-head figure
# with mitten hands and no neck to speak of. Anatomy is what makes a low-poly
# human read as a bad human; a chunky doll reads as a style.
#
# Z is up and metres, and every part states the band it occupies, so a change
# to one is checkable against its neighbours by reading down the file:
#
#     1.85  ─── crown (hair)
#     1.78  ─── top of skull
#     1.46  ─── chin / neck
#     1.42  ─── shoulders
#     1.36  ─── armpit
#     0.88  ─── waist (belt)
#     0.86  ─── hip, bottom of tunic
#     0.11  ─── ankle
#     0.00  ─── floor
# ═══════════════════════════════════════════════════════════════════════════

NAME = "player"
LABEL = "Player"
KIND = "player"
SCALE = "player"
NOTE = ("Sixteen flat-shaded primitives, 1.85 m, six flat colours. "
        "The ruler every other model is sized against.")

# Half the shoulder width -- the arms hang from it and the pauldrons of any
# future armour will too, so it is named once.
SHOULDER_X = 0.26
HIP_X = 0.115


def build():
    parts = []

    # ── LEGS ────────────────────────────────────────────────────────
    # Boot first: it sets the floor, and a figure whose feet are an
    # afterthought floats. Toe box pushed forward in -Y (the model faces -Y,
    # which is the direction Blender's front view looks from).
    boot = kit.box("Boot_R", (HIP_X, -0.035, 0.055), (0.17, 0.30, 0.11), "boot")
    leg = kit.frustum("Leg_R", (HIP_X, 0.0, 0.485), (0.15, 0.18), (0.20, 0.21),
                      0.75, "trouser")
    parts += [boot, leg, kit.mirror_x(boot, "Boot_L"), kit.mirror_x(leg, "Leg_L")]

    # ── TORSO ───────────────────────────────────────────────────────
    # One frustum from hip to shoulder. The taper IS the body: narrow at the
    # waist, wide at the shoulder, and that single line does more for the
    # silhouette than any amount of extra geometry in the chest.
    parts.append(kit.frustum("Torso", (0, 0, 1.14), (0.36, 0.22),
                             (SHOULDER_X * 2, 0.26), 0.56, "tunic"))
    parts.append(kit.box("Belt", (0, 0, 0.90), (0.40, 0.25, 0.07), "tunic_trim"))

    # ── ARMS ────────────────────────────────────────────────────────
    # Upper arm hangs from the shoulder, forearm from the elbow, mitten on the
    # end. Three parts per arm and no wrist: a wrist is a joint you then have
    # to animate, and RuneScape never had one.
    upper = kit.frustum("UpperArm_R", (SHOULDER_X + 0.04, 0.0, 1.18),
                        (0.15, 0.16), (0.13, 0.14), 0.36, "tunic")
    fore = kit.frustum("Forearm_R", (SHOULDER_X + 0.05, 0.0, 0.84),
                       (0.13, 0.14), (0.12, 0.13), 0.32, "skin")
    hand = kit.box("Hand_R", (SHOULDER_X + 0.05, 0.0, 0.62), (0.14, 0.15, 0.14),
                   "skin")
    parts += [upper, fore, hand,
              kit.mirror_x(upper, "UpperArm_L"), kit.mirror_x(fore, "Forearm_L"),
              kit.mirror_x(hand, "Hand_L")]

    # ── HEAD ────────────────────────────────────────────────────────
    # The head is a box and the hair is a cap on top of it plus a slab down
    # the back. That is the entire 2001 haircut, and it is the part most
    # responsible for the model reading as RuneScape rather than as Minecraft
    # -- Minecraft stops at the box.
    parts.append(kit.box("Neck", (0, 0, 1.445), (0.13, 0.13, 0.08), "skin_dark"))
    parts.append(kit.box("Head", (0, 0, 1.62), (0.30, 0.29, 0.32), "skin"))
    parts.append(kit.box("Hair", (0, 0.01, 1.805), (0.32, 0.31, 0.09), "hair"))
    parts.append(kit.box("HairBack", (0, 0.155, 1.70), (0.31, 0.04, 0.26),
                         "hair"))

    return kit.join(parts, "Player")
