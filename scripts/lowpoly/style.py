
# ═══════════════════════════════════════════════════════════════════════════
# THE STYLE — ONE HOME, IMPORTED, NEVER COPIED
#
# Luke, 2026-11-09: "I want to go to ground. Reset it all. I want to build
# some runescape type models. Like, very simple."
#
# "Very simple" is not an adjective here. It is this file, and every number
# in it is CHECKED by harness/gate.py, because the old pipeline proved that a
# style written as prose is a style that drifts within the hour.
#
#   RuneScape, 2001-2004, is four countable properties:
#     1. FLAT SHADING. Not one smooth normal anywhere. This is most of the
#        look -- faceted silhouettes reading as solid blocks of colour.
#     2. FEW FACES. A tree is a tube and three cones. A limb is one tapered
#        box. The budgets below are hard ceilings, not targets.
#     3. FLAT COLOUR. No textures, no gradients, no maps. One material per
#        colour, and every colour comes out of PALETTE.
#     4. CHUNKY PROPORTIONS. A head is a quarter of the body. Hands are
#        mittens. Nothing tapers to a point that needs more than 4 sides.
#
# ⚠️ THE GATE READS THIS MODULE. Changing a budget here changes what passes.
#    That is deliberate -- it is the only place the look is defined, so a
#    model cannot quietly become detailed without this file saying it may.
# ═══════════════════════════════════════════════════════════════════════════

# ── THE PALETTE ──────────────────────────────────────────────────────────
# Early-RS colour is low-saturation and mid-value: nothing is pure, nothing
# glows. These are linear-ish sRGB triples in 0-1, which is what Blender's
# Base Color wants.
#
# ⚠️ A COLOUR NOT IN HERE FAILS THE GATE. Models ask for colours BY NAME, so
#    the whole set can be re-graded from one place and every model moves with
#    it. That is the thing a texture atlas makes impossible.
PALETTE = {
    # skin + hair
    "skin":       (0.76, 0.55, 0.38),
    "skin_dark":  (0.56, 0.38, 0.25),
    "hair":       (0.27, 0.16, 0.08),
    # cloth + leather
    "tunic":      (0.36, 0.24, 0.13),
    "tunic_trim": (0.50, 0.36, 0.18),
    "trouser":    (0.23, 0.25, 0.32),
    "boot":       (0.16, 0.11, 0.08),
    "cloak":      (0.38, 0.12, 0.12),
    # wood + leaf
    "bark":       (0.28, 0.19, 0.11),
    "bark_dark":  (0.19, 0.13, 0.08),
    "leaf":       (0.17, 0.36, 0.14),
    "leaf_dark":  (0.10, 0.25, 0.10),
    "leaf_light": (0.26, 0.47, 0.18),
    # goblin — green, and NOT a tint of the player's skin. A monster that
    # shares a hue with the player reads as a recolour; this one is the only
    # green in the set that is not a leaf.
    "goblin":     (0.34, 0.44, 0.24),
    "goblin_dark": (0.25, 0.33, 0.17),
    "goblin_deep": (0.16, 0.22, 0.11),
    # fire. ⚠️ THESE ARE THE ONLY BRIGHT COLOURS IN THE PALETTE and they are
    # deliberately the only ones: in a set where everything else sits between
    # 0.1 and 0.6, a 0.93 flame is the thing your eye goes to across a scene.
    # Spend that somewhere else and the fire stops being the landmark.
    "flame":      (0.85, 0.40, 0.09),
    "flame_hot":  (0.93, 0.72, 0.20),
    "ember":      (0.48, 0.13, 0.05),
    "soot":       (0.12, 0.11, 0.10),
    # stone + metal + ore
    "stone":      (0.38, 0.38, 0.41),
    "stone_dark": (0.27, 0.27, 0.30),
    "iron":       (0.46, 0.48, 0.52),
    "steel":      (0.62, 0.65, 0.70),
    "ore_copper": (0.62, 0.33, 0.14),
    "ore_coal":   (0.10, 0.10, 0.12),
    "gold":       (0.74, 0.58, 0.16),
}

# ── THE BUDGETS ──────────────────────────────────────────────────────────
# Per KIND, because a tree genuinely needs fewer faces than a man and a
# shared ceiling would license detail on the tree. Triangles, after the
# whole model is joined into one mesh.
#
# For scale: a box is 12 triangles. A 6-sided prism is 20. So "player: 400"
# is about thirty boxes, and the player built in models/player.py uses
# sixteen. There is deliberate headroom -- the ceiling is there to stop a
# tenfold drift, not to make every part a negotiation.
TRI_BUDGET = {
    "player":  400,
    "npc":     400,
    "monster": 600,
    "prop":    200,
    "scenery": 250,
    "tool":    120,
}

# No model may carry more materials than this. Flat colour is the look; a
# model wanting twelve shades is a model trying to be a texture.
MAX_MATERIALS = 8

# ── THE WORLD SCALE ──────────────────────────────────────────────────────
# 1 Blender unit = 1 metre, and the player is the ruler. Every other model is
# sized against him, which is the only way a set reads as one world.
#
# ⚠️ MEASURE THE PLAYER FIRST, ALWAYS. A small character means a huge world:
#    getting this backwards is how a "big" tree ends up ankle height next to
#    a man, in a render where both look fine on their own.
PLAYER_HEIGHT = 1.85

# What a thing should measure, as a multiple of the player. The gate checks
# it, so a tree cannot ship at waist height.
SCALE_OF = {
    "player":  (1.00, 1.00),
    "npc":      (0.80, 1.20),
    # Anything meant to read as SMALLER than the player on sight. A goblin
    # at 0.95 of the player is not a short goblin, it is a green man.
    "small_npc": (0.50, 0.85),
    # ⚠️ A tree under twice the player is a shrub. Raised from (1.60, 3.00) on
    # 2026-11-09 when the walk lab put the camera at 30 degrees and the 4 m tree
    # stopped reading as a tree at all.
    "tree":     (2.40, 3.40),
    "rock":     (0.22, 0.70),
    "prop":     (0.20, 1.60),
}

# Everything stands ON the floor. Not near it.
FLOOR_Z = 0.0
FLOOR_TOLERANCE = 0.001


def colour(name):
    """RGBA for a palette name. KeyError is the point -- no ad-hoc colours."""
    if name not in PALETTE:
        raise KeyError(
            "%r is not in the palette. Add it to style.PALETTE (and mean it) "
            "rather than passing a loose RGB -- the gate rejects off-palette "
            "colour, because that is how a flat-colour style dies." % (name,))
    r, g, b = PALETTE[name]
    return (r, g, b, 1.0)


def budget(kind):
    if kind not in TRI_BUDGET:
        raise KeyError("no triangle budget for kind %r: %s"
                       % (kind, sorted(TRI_BUDGET)))
    return TRI_BUDGET[kind]
