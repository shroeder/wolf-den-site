import { COIN_ICON } from "@/lib/coin-icon";
// Custom profile backgrounds — cosmetic scenes behind the profile hero, unlocked by level and equipped
// by the member. Pure (no server-only) so the picker + hero + public profile can import it. The visual
// for each id lives in globals.css as `.bg-<id>`. Keep ids STABLE (stored in mkt_buyer.equipped_background).
export const BACKGROUNDS = [
    { id: "none", label: "None", level: 1, icon: "⬛", hint: "No scene", animated: false },
    { id: "midnight", label: "Midnight", level: 3, icon: "🌑", hint: "Deep blue dusk", animated: false },
    { id: "ember", label: "Ember", level: 6, icon: "🔥", hint: "Warm campfire glow", animated: false },
    { id: "forest", label: "Forest", level: 12, icon: "🌲", hint: "Mossy green depths", animated: false },
    { id: "ocean", label: "Ocean", level: 18, icon: "🌊", hint: "Cool tidal blues", animated: false },
    { id: "sunset", label: "Sunset", level: 24, icon: "🌇", hint: "Dusk over the den", animated: false },
    { id: "nebula", label: "Nebula", level: 30, icon: "🔮", hint: "Drifting cosmic clouds", animated: true },
    { id: "aurora", label: "Aurora", level: 38, icon: "🌌", hint: "Shifting northern lights", animated: true },
    { id: "galaxy", label: "Galaxy", level: 45, icon: "✨", hint: "A slow-turning starfield", animated: true },
    { id: "prismatic", label: "Prismatic", level: 50, icon: "🌈", hint: "A living rainbow mesh", animated: true },
    { id: "voidstorm", label: "Voidstorm", level: 66, icon: "🌀", hint: "A churning dark tempest", animated: true },
    { id: "empyrean", label: "Empyrean", level: 88, icon: "🌟", hint: "Golden heavens", animated: true },
    { id: "singularity", label: "Singularity", level: 100, icon: "🌌", hint: "The end of everything", animated: true },
    // --- Activity-earned (achievement-gated) — NOT level-gated and NOT for sale. Granted into
    // mkt_cosmetic_unlock at the digging completion site; unlocked purely by the `owned` grant (no `level`).
    { id: "hoard", label: "Buried Hoard", icon: COIN_ICON, hint: "A cavern of unearthed gold", animated: true, achievement: true, rarity: "epic", earn: "Forge 10 treasure chests" },
];

export function backgroundById(id) {
    return BACKGROUNDS.find((b) => b.id === id) || BACKGROUNDS[0];
}

export function isBackgroundUnlocked(id, level, { unlockAll = false, owned = null } = {}) {
    const b = backgroundById(id);
    // Activity-earned backgrounds are unlocked ONLY by the grant (no level, no staff bypass).
    if (b.achievement) return Boolean(owned && owned.has(b.id));
    return (owned && owned.has(id)) || unlockAll || Math.max(1, Math.floor(Number(level) || 1)) >= b.level;
}

// The class(es) to hang on the hero container so it renders the scene. Empty for the default/none.
export function backgroundClass(id) {
    return id && id !== "none" ? `bg-scene bg-${id}` : "";
}

export function backgroundsForLevel(level, { unlockAll = false, owned = null } = {}) {
    return BACKGROUNDS.map((b) => ({ ...b, unlocked: isBackgroundUnlocked(b.id, level, { unlockAll, owned }) }));
}
