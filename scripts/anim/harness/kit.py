import bpy

# ═══════════════════════════════════════════════════════════════════════════
# KIT — WHAT EACH CLIP IS HOLDING
#
# ⚠️ ONE HOME, IMPORTED, NEVER COPIED. This table was living inside qa.py, so
# anything else that photographed a clip -- _hfilm, the filmer -- rendered
# every prop in the scene regardless of clip. Impact came out wearing its
# shield AND the pickaxe, and the pickaxe is skinned to a hand that in Impact
# is doing something else entirely: a tool flying across his shoulders in a
# frame I was about to judge the animation by.
#
# ⚠️ AND IT HAS TO AGREE WITH ModelLab'S OWN KIT. The lab is what Luke looks
# at; a harness that disagrees with it is evidence about a character that
# does not ship. If a clip gains a prop, it changes HERE and in the lab.
# ═══════════════════════════════════════════════════════════════════════════

CLIP_PROPS = {
    "Idle":   ("Pickaxe",),
    "Walk":   ("Pickaxe",),
    "Run":    ("Pickaxe",),
    "Brace":  ("Shield", "ShieldBoss", "ShieldFace"),
    "Impact": ("Shield", "ShieldBoss", "ShieldFace"),
    # ⚠️ Swing carries NOTHING. He is swinging an imaginary haft --
    # the fists are closed because build-pick solved the fingers, not
    # because a tool is in them. Listing a prop here would put the
    # pickaxe back in a clip that was made precisely to go without it.
    "Swing":  (),
    "Raise":  (),
}
ALL_PROPS = ("Shield", "ShieldBoss", "ShieldFace", "Pickaxe")

# ── THE BARE MODEL ──────────────────────────────────────
# Armour is not a prop. The plates are cut from the hero's own surface and
# skinned to the same bones, so they are always in the scene and hiding
# them is a separate switch. A clip listed in BARE renders on the base
# body: no steel, nothing in his hands.
# Luke, on the swing: "take all the armor off and get rid of the pickaxe.
# We just want the base model."
PLATES = ("Cuirass", "Pauldron_L", "Pauldron_R", "Greave_L", "Greave_R")
BARE = {"Swing", "Raise"}


def set_kit(clip):
    """Hide every prop this clip is not holding. Returns what stayed."""
    keep = set(CLIP_PROPS.get(clip, ()))
    bare = clip in BARE
    for n in PLATES:
        ob = bpy.data.objects.get(n)
        if ob:
            ob.hide_render = bare
    shown = []
    for n in ALL_PROPS:
        ob = bpy.data.objects.get(n)
        if ob is None:
            continue
        ob.hide_render = n not in keep
        if n in keep:
            shown.append(n)
    return shown
