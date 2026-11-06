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
    "Mine":   ("Pickaxe",),
}
ALL_PROPS = ("Shield", "ShieldBoss", "ShieldFace", "Pickaxe")


def set_kit(clip):
    """Hide every prop this clip is not holding. Returns what stayed."""
    keep = set(CLIP_PROPS.get(clip, ()))
    shown = []
    for n in ALL_PROPS:
        ob = bpy.data.objects.get(n)
        if ob is None:
            continue
        ob.hide_render = n not in keep
        if n in keep:
            shown.append(n)
    return shown
