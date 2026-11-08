import cage

# ══════════════════════════════════════════════════════════════════════════
# THE HEAD — its own cage, at twice the body's resolution.
#
# ⚠️ A FACE AT 32 VERTS IS BELOW THE RESOLUTION FLOOR, AND NO AMOUNT OF
# TUNING LIFTS IT. This is the same wall the chest hit: a pectoral at 16
# verts was 1.25 vertices wide, Catmull-Clark erased it, and the fix was
# never the AMOUNT -- it was the wavelength. A head ring at 32 gives a
# vertex every 17 mm, so an eyelid is well under one of them, a nostril is
# a third of one, and the ear is three. Those features are not subtle at
# that resolution, they are UNREPRESENTABLE, and iterating on them is
# polishing a mannequin.
#
# So the head is 64 and the body stays 32. The join is a 1:2 step in the
# neck, which is the one place on a figure where a transition is hidden
# under the jaw from every angle that matters -- and because every form on
# this body is authored in FRACTIONS of the way round a ring rather than in
# vertex indices, doubling the count re-rendered the same head rather than
# requiring it to be re-authored.
# ══════════════════════════════════════════════════════════════════════════

NH = 64         # verts per head ring: double the torso's

T_FRONT, T_BACK = 0.75, 0.25

# Face landmarks, as fractions of the way round a head ring. They pair about
# the midline at 0.75: his left is the larger number. Named because a brow
# ridge written as 0.840 is a number nobody can check.
#
# ⚠️ EYES SET TOO CLOSE READ AS A DOLL -- and then I overshot by eye in the
# other direction. 0.818 put the centres 24 mm apart against a real 32; 0.840
# put them at 0.55 of head breadth against a canon 0.45. Both were judged
# from a render. The audit measures it.
F_EYE_L, F_EYE_R = 0.824, 0.676
F_CHEEK_L, F_CHEEK_R = 0.855, 0.645
F_TEMPLE_L, F_TEMPLE_R = 0.888, 0.612
F_JAW_L, F_JAW_R = 0.898, 0.602
F_NOSE_L, F_NOSE_R = 0.786, 0.714
F_NOSTRIL_L, F_NOSTRIL_R = 0.776, 0.724
F_LIP_L, F_LIP_R = 0.818, 0.682

# The ring the body hands up, and the one this file starts from, are 6 mm
# apart and almost the same size: a step in vertex count shears whatever it
# spans, so it is given as little as possible to shear.
# ⚠️ EVERY z IN THIS TABLE IS SET BY THE CANON, NOT BY EYE. The first
# version had the eye line 42% of the way down the head instead of halfway,
# and the lower face 40% too long -- brow-to-nose against nose-to-chin came
# out 0.74 when the two thirds of a face are equal. Both are things an
# audience reads instantly as "wrong" without being able to name, both were
# invisible to me across a dozen renders, and both fell out of audit.py in
# one pass. Chin to crown is 212 mm, which puts him at 8.5 heads.
HEAD = [
    ("neck_top", 1.568, 0.0590, 0.0640, -0.0060,
     [(0.700, 0.070, 0.07), (0.800, 0.070, 0.07)]),             # sternomastoid
    # ── THE HEAD ──────────────────────────────────────────────────────────
    # ⚠️ MEASURE THE PROFILE, DO NOT JUDGE IT. The first head read as having
    # a huge hooked nose, and the nose was a perfectly ordinary 26 mm. What
    # was wrong was everything ELSE: at the midline the jaw stood at -0.110
    # and the lips at -0.104 while the brow was at -0.092 and the forehead
    # at -0.088, so the upper face was set 15 mm BEHIND the lower one. That
    # is an ape's profile, and the eye blames whichever feature is sticking
    # out rather than the two that are sunk. Printing the front-most y at
    # each landmark found it in one pass after three rounds of adjusting a
    # nose that was never the problem.
    #
    # Each ring's cy is its forward offset; they now step forward from the
    # crown down to the brow and back again toward the jaw, which is what a
    # profile is.
    # ⚠️ IT WAS A BALL ON ITS SIDE. Four rings carried the whole head and it
    # came out 160 mm tall against 184 mm wide -- a head is the other way
    # round, and at that height the figure stood ELEVEN heads tall when
    # heroic is eight and a half. No amount of face would have fixed it:
    # every feature would have been laid on a skull that was the wrong shape.
    # Chin to crown is 222 mm now, across thirteen rings instead of four.
    #
    # ⚠️ AND A FACE IS PAIRS WITH NEGATIVES BETWEEN THEM, exactly as the
    # chest was. A single bump at the midline for the brow is a forehead
    # boss; what makes a brow read is the pair and the GLABELLA dip between
    # them. Same for the eye sockets either side of the nose bridge, the
    # cheekbones either side of the muzzle, and the lips either side of the
    # lip line. The negatives are the whole trick here too.
    #
    # Landmarks around a head ring, as fractions: 0.75 is the face's
    # midline, and everything pairs about it.
    # ⚠️ THE CHIN HAS TO COME FORWARD OR THE PROFILE IS A BEAK. With the
    # chin 13 mm behind the base of the nose the whole lower face fell away,
    # and the nose -- which is a perfectly ordinary 26 mm -- read as an
    # enormous hooked one. Nothing was wrong with the nose. A profile is the
    # RELATIONSHIP between brow, nose base and chin, and the eye reads the
    # one that is out of line as the one that is wrong.
    # ── THE JAW ───────────────────────────────────────────────────────────
    # ⚠️ HE HAD NO JAW AND NO CHIN, ONLY A JOWL. Measured down the midline,
    # the surface below the chin did recede -- but the WIDTH grew the whole
    # way, 106 mm at the chin to 125 mm eight millimetres lower, so the
    # lower face was a wedge running straight into the neck with no
    # mandible anywhere in it.
    #
    # What makes a jaw is an EDGE and then an undercut: a ring at the
    # mandible's lower border that is wide and forward, and the ring below
    # it sharply back and no wider. Same trick as the nose's undercut --
    # the step between two close rings is the feature, not the rings.
    ("sub_chin", 1.574, 0.0540, 0.0585, -0.0105, None),
    ("under_jaw", 1.582, 0.0480, 0.0540, -0.0160,
     [(T_FRONT, 0.070, 0.06)]),
    ("chin", 1.590, 0.0465, 0.0645, -0.0345,
     [(F_EYE_L, 0.120, -0.08), (F_EYE_R, 0.120, -0.08),
      (T_FRONT, 0.055, 0.22)]),                                  # the chin point
    ("jaw_line", 1.598, 0.0570, 0.0720, -0.0265,
     [(T_FRONT, 0.075, 0.12),
      (F_JAW_L, 0.085, 0.10), (F_JAW_R, 0.085, 0.10)]),       # mandible edge
    ("jaw", 1.606, 0.064, 0.080, -0.016,
     [(F_JAW_L, 0.090, 0.09), (F_JAW_R, 0.090, 0.09),            # gonial angles
      (T_FRONT, 0.060, 0.08)]),
    # ── THE MOUTH ─────────────────────────────────────────────────────────
    # ⚠️ RINGS CANNOT MAKE LIPS, AND IT TOOK TWO FAILURES TO ACCEPT IT.
    # Three rings going out-in-out at 6 mm is a sine wave and rendered as
    # four parallel ripples; nine rings shaped as two bulges and a notch
    # rendered as NINE ripples. Adding depth deepened the ripples and
    # adding rings added ripples, which is the signature of a premise
    # being wrong rather than a number.
    #
    # The reason is the one the eyelid had. A ring is a LEVEL BAND round
    # the head, and the things that make a mouth are none of them level: a
    # lip line dips at the centre and lifts at the corners, the vermillion
    # border is a closed curve, and a cupid's bow is a shape in the surface.
    # So the mouth gets loops of its own -- see face.mouth() -- and these
    # rings go back to carrying nothing but the sulcus below it and the
    # philtrum above.
    ("sulcus", 1.617, 0.0675, 0.0833, -0.0141,
     [(T_FRONT, 0.062, -0.030)]),
    ("mouth_lo", 1.625, 0.0697, 0.0853, -0.0130, None),
    ("mouth", 1.6305, 0.0709, 0.0863, -0.0122, None),
    ("mouth_up", 1.637, 0.0729, 0.0881, -0.0111, None),
    ("subnasal", 1.6425, 0.0743, 0.0894, -0.0104,
     [(T_FRONT, 0.044, -0.030)]),                                # philtrum
    ("nose_base", 1.645, 0.075, 0.090, -0.010,
     [(T_FRONT, 0.052, 0.34),                                    # the nostril base
      (F_NOSE_L, 0.030, 0.09), (F_NOSE_R, 0.030, 0.09),          # the wings
      (F_NOSTRIL_L, 0.013, -0.09), (F_NOSTRIL_R, 0.013, -0.09)]),  # nostrils
    # ⚠️ NO TEMPLE DIP ON THE CHEEK RING. A hollow here is not a temple --
    # the temple is above the cheekbone, not beside it -- and at 64 verts
    # the negative resolved into a hard vertical crease down each cheek
    # where at 32 it had been smoothed into nothing.
    ("cheek", 1.664, 0.077, 0.091, -0.009,
     [(T_FRONT, 0.030, 0.22),                                    # the dorsum
      (F_CHEEK_L, 0.080, 0.11), (F_CHEEK_R, 0.080, 0.11)]),      # CHEEKBONES
    # ⚠️ LIDS ARE RINGS, AND THEY ARE WHY THE HEAD NEEDED 64 VERTS. A lid is
    # a horizontal fold a centimetre tall confined to the width of an eye --
    # at 32 verts it was under one vertex across and simply could not be
    # expressed, which is why the eyes sat in the face as beads however
    # carefully they were placed. Three rings 8 mm apart make the lower rim,
    # the opening the eyeball shows through, and the crease above it; the
    # eyeball itself is the lid's own bulge.
    ("lid_low", 1.679, 0.0772, 0.0908, -0.009,
     [(F_EYE_L, 0.062, -0.07), (F_EYE_R, 0.062, -0.07),
      (T_FRONT, 0.026, 0.07)]),
    ("eye", 1.688, 0.077, 0.091, -0.009,
     [(F_EYE_L, 0.068, -0.11), (F_EYE_R, 0.068, -0.11),          # the SOCKETS
      (T_FRONT, 0.026, 0.085)]),                                 # the root
    ("lid_up", 1.696, 0.0768, 0.0902, -0.010,
     [(F_EYE_L, 0.062, -0.12), (F_EYE_R, 0.062, -0.12),          # the CREASE
      (T_FRONT, 0.026, 0.07)]),
    ("brow", 1.704, 0.076, 0.089, -0.011,
     [(F_EYE_L, 0.074, 0.14), (F_EYE_R, 0.074, 0.14),            # BROW RIDGE
      (T_FRONT, 0.034, -0.05),                                   # glabella
      (F_TEMPLE_L, 0.080, -0.06), (F_TEMPLE_R, 0.080, -0.06)]),  # temples
    ("forehead", 1.728, 0.0755, 0.0875, -0.009,
     [(F_TEMPLE_L, 0.086, -0.045), (F_TEMPLE_R, 0.086, -0.045)]),
    # ⚠️ A CRANIUM TAPERS LATE. Running it in from the brow upward gives an
    # egg -- a real skull is widest just above the ears and stays nearly
    # full to the top before rounding off, so the upper rings hold their
    # width and only the last one closes.
    ("skull", 1.756, 0.0725, 0.0845, -0.006,
     [(T_BACK, 0.090, 0.07)]),                                   # occiput
    ("skull_up", 1.782, 0.0595, 0.0675, -0.004, None),
    # ⚠️ A WIDE CAP FACETS. The crown used to close with a 32-gon 120 mm
    # across and the flat of it caught the light as a ring of ridges on top
    # of his head. Taper to something small and the cap stops being visible.
    # ⚠️ AND THE CAP HAS TO BE TINY. At 32 verts a 48 mm disc closing the
    # crown was already catching the light as a ring of ridges; at 64 the
    # n-gon fan is twice as bad. The last two rings run it down to 16 mm.
    ("crown", 1.796, 0.0325, 0.0375, -0.002, None),
    # ⚠️ AN 8 mm CAP RING AT 64 VERTS IS 0.8 mm AN EDGE. Fine enough to
    # count as collapsed, and a dense pole on top of his head buys nothing
    # -- at this vertex count a wider cap does not facet.
    ("crown_tip", 1.802, 0.0165, 0.0195, -0.002, None),
]

NAMES = [h[0] for h in HEAD]


def at(name):
    return NAMES.index(name)


def build(bm, neck):
    """Build the head and step it up off the body's neck ring."""
    rings = [cage.ring(bm, z, rx, ry, cy, n=NH, bumps=b)
             for _n, z, rx, ry, cy, b in HEAD]
    cage.tube(bm, rings)
    bm.faces.new(rings[-1])
    cage.step_up(bm, neck, rings[0])
    return rings
