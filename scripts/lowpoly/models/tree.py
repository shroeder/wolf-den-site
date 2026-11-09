import kit

# ═══════════════════════════════════════════════════════════════════════════
# THE TREE — A SHORT FORKED TRUNK UNDER A CLUSTER OF FOUR LEAF BLOBS
#
# Eight parts, 136 triangles. Three attempts to get here and each failure
# was a different wrong idea about what a tree is, so all three are written
# down -- the shape is the hardest thing in the set to get right because it
# is the one everybody already knows by heart.
#
# ⚠️ 1. IT IS NOT A CONIFER. Three stacked cones is a fir, and a fir carries
#    branches most of the way to the ground. On a 3.5 m bare trunk that is a
#    Christmas tree on a stick: a shape that exists nowhere, wrong from
#    every angle without being obviously broken in any one of them.
#
# ⚠️ 2. THE CANOPY IS A CLUSTER, NOT A STACK. Blobs spread up an axis read
#    as separate gems threaded on a string -- the same failure as the cones,
#    in a different shape. Four blobs, side by side as much as stacked,
#    overlapping by more than half their radius, read as one lumpy mass.
#
# ⚠️ 3. AND THE TRUNK IS SHORT. The second attempt had 2.95 m of trunk at
#    0.24 radius: 12:1, a telephone pole, and the crown looked balanced on
#    top of it rather than grown out of it. A broadleaf is roughly HALF
#    crown by height. Here the trunk is 2.6 m of 0.30 -- still taller than
#    the 1.85 m player, so you walk under the canopy, which was the whole
#    reason for a long trunk in the first place.
#
# ⚠️ THE BLOBS ARE 8-SIDED, NOT 6. Six reads as a cut gem: you see three
#    facets and they are big enough to count. Eight is 4 more triangles per
#    blob and it is the difference between faceted and angular.
#
# ⚠️ THE FORK DIES INSIDE THE CANOPY, AND THE ROTATION SIGN IS POSITIVE.
#    A branch that stops in open air shows its flat cut end, and two of
#    those read as broken-off stumps. Three versions of this tree shipped
#    exactly that, and the cause was not the length or the placement I kept
#    adjusting -- it was one sign. A frustum's axis is +Z, and rotating by
#    +t about Y swings +Z toward +X. At -27 the branch is UPSIDE DOWN: its
#    thin tip points back at the trunk and its thick cut end hangs out in
#    the air, which is precisely the artefact. (models/goblin.py has the
#    same note about its ears. Same sign, same lesson, one day apart.)
#
#    With the sign right, the end lands at x=0.75, z=3.10, and the underside
#    of Crown_a at radius r sits at 2.30 + (r / 1.25) * 0.95 = 2.87 -- so it
#    is 23 cm inside the leaves.
#
# ⚠️ THE THREE GREENS ARE NOT SHADING. A flat-shaded scene gets no gradient
#    from the light, so depth in the canopy is PAINTED: dark underneath,
#    light on top, which is where the sky is.
# ═══════════════════════════════════════════════════════════════════════════

NAME = "tree"
LABEL = "Tree"
KIND = "scenery"
SCALE = "tree"
NOTE = ("A short forked trunk under four overlapping leaf blobs. 5.4 m, "
        "just under three times the player, and the canopy is a little "
        "over half of it. You walk under the branches at 2.1 m.")


def build():
    parts = [
        # Root flare. A trunk that meets the ground at its full width looks
        # pushed into the dirt.
        kit.prism("Flare", (0, 0, 0.17), 0.42, 0.34, "bark_dark",
                  sides=6, top_radius=0.30),
        kit.prism("Trunk", (0, 0, 1.30), 0.30, 2.60, "bark",
                  sides=6, top_radius=0.21, twist=12),
    ]

    # The fork: out and up, ending under the canopy's shoulder.
    branch = kit.frustum("Branch_R", (0.50, 0.05, 2.60), (0.19, 0.19),
                         (0.12, 0.12), 1.12, "bark", rot=(0, 27, 0))
    parts += [branch, kit.mirror_x(branch, "Branch_L")]

    # The crown. Two wide blobs low and to either side, one small and high:
    # the asymmetry in x and y is what keeps it from reading as a dome.
    parts += [
        kit.bipyramid("Crown_a", (0.00, 0.00, 3.25), 1.25, 1.90, "leaf_dark",
                      sides=8),
        kit.bipyramid("Crown_b", (-0.85, 0.35, 3.85), 1.05, 1.70, "leaf",
                      sides=8, twist=22),
        kit.bipyramid("Crown_c", (0.80, -0.40, 3.95), 1.00, 1.60, "leaf",
                      sides=8, twist=14),
        kit.bipyramid("Crown_d", (0.05, 0.25, 4.55), 0.95, 1.75, "leaf_light",
                      sides=8, twist=37),
    ]
    return kit.join(parts, "Tree")
