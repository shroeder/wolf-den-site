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
# ⚠️ EYES SET TOO CLOSE READ AS A DOLL. The pair at 0.818/0.682 put the
# centres 24 mm either side of the midline when a real one is about 32, and
# nothing else about the face could compensate.
F_EYE_L, F_EYE_R = 0.840, 0.660
F_CHEEK_L, F_CHEEK_R = 0.855, 0.645
F_TEMPLE_L, F_TEMPLE_R = 0.888, 0.612
F_JAW_L, F_JAW_R = 0.898, 0.602
F_NOSE_L, F_NOSE_R = 0.786, 0.714
F_NOSTRIL_L, F_NOSTRIL_R = 0.776, 0.724
F_LIP_L, F_LIP_R = 0.818, 0.682

# The ring the body hands up, and the one this file starts from, are 6 mm
# apart and almost the same size: a step in vertex count shears whatever it
# spans, so it is given as little as possible to shear.
HEAD = [
    ("neck_top", 1.568, 0.0615, 0.0655, -0.004,
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
    ("chin", 1.578, 0.048, 0.066, -0.034,
     [(F_EYE_L, 0.120, -0.08), (F_EYE_R, 0.120, -0.08),
      (T_FRONT, 0.055, 0.20)]),                                  # the chin point
    ("jaw", 1.602, 0.064, 0.080, -0.016,
     [(F_JAW_L, 0.090, 0.09), (F_JAW_R, 0.090, 0.09),            # gonial angles
      (T_FRONT, 0.060, 0.08)]),
    # ⚠️ LIPS ARE THREE RINGS, NOT A BUMP. A mouth is a horizontal feature
    # and rings vary with ANGLE, so anything one ring can say runs vertically.
    # What says mouth is the LINE between the lips, which means a ring that
    # pulls in with one pushing out above it and one below.
    #
    # ⚠️ AND THEY HAVE TO BE CLOSE TOGETHER OR SUBDIVISION EATS THE LINE.
    # Spread 12 mm apart, Catmull-Clark rounded the three rings into one
    # soft swelling and the mouth did not read at all. The sharpness of a
    # crease on a subdivided cage is set by how close the loops either side
    # of it are, not by how deep it is -- pulling it deeper just makes a
    # wider dent. 8 mm apart, it is a mouth.
    ("mouth_low", 1.626, 0.071, 0.089, -0.011,
     [(T_FRONT, 0.062, 0.13)]),                                  # lower lip
    ("mouth", 1.634, 0.072, 0.090, -0.010,
     [(T_FRONT, 0.070, -0.14),                                    # the lip line
      (F_LIP_L, 0.030, -0.06), (F_LIP_R, 0.030, -0.06)]),     # the corners
    ("mouth_up", 1.642, 0.073, 0.091, -0.010,
     [(T_FRONT, 0.056, 0.12)]),                                  # upper lip
    # ⚠️ THE NOSE IS RINGS, AND THE RING UNDER IT IS WHAT MAKES IT A NOSE.
    # Built as a bridged tube it came out a beak, then a straw -- see
    # face.py. What a ring stack cannot do on its own is STOP: push the
    # midline forward over three rings and the ridge runs on down into the
    # lip and the chin, and a ridge that does not stop is a muzzle.
    #
    # So the ring 10 mm under the nose base takes no bump at all. That gap
    # is the same trick the lips use -- on a subdivided cage the sharpness
    # of a feature is set by how close the loops either side of it are --
    # and the step it cuts is the UNDERCUT, which is the whole difference
    # between a nose and a swelling.
    ("subnasal", 1.654, 0.074, 0.088, -0.009,
     [(T_FRONT, 0.044, -0.09)]),                                 # philtrum
    ("nose_base", 1.664, 0.075, 0.090, -0.010,
     [(T_FRONT, 0.052, 0.34),                                    # the nostril base
      (F_NOSE_L, 0.030, 0.13), (F_NOSE_R, 0.030, 0.13),          # the wings
      (F_NOSTRIL_L, 0.013, -0.09), (F_NOSTRIL_R, 0.013, -0.09)]),  # nostrils
    # ⚠️ NO TEMPLE DIP ON THE CHEEK RING. A hollow here is not a temple --
    # the temple is above the cheekbone, not beside it -- and at 64 verts
    # the negative resolved into a hard vertical crease down each cheek
    # where at 32 it had been smoothed into nothing.
    ("cheek", 1.686, 0.077, 0.091, -0.009,
     [(T_FRONT, 0.030, 0.22),                                    # the dorsum
      (F_CHEEK_L, 0.080, 0.11), (F_CHEEK_R, 0.080, 0.11)]),      # CHEEKBONES
    # ⚠️ LIDS ARE RINGS, AND THEY ARE WHY THE HEAD NEEDED 64 VERTS. A lid is
    # a horizontal fold a centimetre tall confined to the width of an eye --
    # at 32 verts it was under one vertex across and simply could not be
    # expressed, which is why the eyes sat in the face as beads however
    # carefully they were placed. Three rings 8 mm apart make the lower rim,
    # the opening the eyeball shows through, and the crease above it; the
    # eyeball itself is the lid's own bulge.
    ("lid_low", 1.699, 0.0772, 0.0908, -0.009,
     [(F_EYE_L, 0.062, -0.07), (F_EYE_R, 0.062, -0.07),
      (T_FRONT, 0.026, 0.07)]),
    ("eye", 1.708, 0.077, 0.091, -0.009,
     [(F_EYE_L, 0.068, -0.11), (F_EYE_R, 0.068, -0.11),          # the SOCKETS
      (T_FRONT, 0.026, 0.085)]),                                 # the root
    ("lid_up", 1.717, 0.0768, 0.0902, -0.010,
     [(F_EYE_L, 0.062, -0.12), (F_EYE_R, 0.062, -0.12),          # the CREASE
      (T_FRONT, 0.026, 0.07)]),
    ("brow", 1.728, 0.076, 0.089, -0.011,
     [(F_EYE_L, 0.074, 0.14), (F_EYE_R, 0.074, 0.14),            # BROW RIDGE
      (T_FRONT, 0.034, -0.05),                                   # glabella
      (F_TEMPLE_L, 0.080, -0.06), (F_TEMPLE_R, 0.080, -0.06)]),  # temples
    ("forehead", 1.750, 0.074, 0.086, -0.009,
     [(F_TEMPLE_L, 0.086, -0.045), (F_TEMPLE_R, 0.086, -0.045)]),
    ("skull", 1.770, 0.068, 0.080, -0.006,
     [(T_BACK, 0.090, 0.07)]),                                   # occiput
    ("skull_up", 1.788, 0.050, 0.059, -0.004, None),
    # ⚠️ A WIDE CAP FACETS. The crown used to close with a 32-gon 120 mm
    # across and the flat of it caught the light as a ring of ridges on top
    # of his head. Taper to something small and the cap stops being visible.
    # ⚠️ AND THE CAP HAS TO BE TINY. At 32 verts a 48 mm disc closing the
    # crown was already catching the light as a ring of ridges; at 64 the
    # n-gon fan is twice as bad. The last two rings run it down to 16 mm.
    ("crown", 1.798, 0.022, 0.027, -0.002, None),
    ("crown_tip", 1.802, 0.008, 0.010, -0.002, None),
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
