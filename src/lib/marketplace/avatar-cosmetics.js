// Equippable avatar cosmetics — the first "flair you unlock." They layer ON TOP of the base DiceBear
// portrait (aura behind, headwear above, pet beside, effect over) via CSS in globals.css. Slot-based
// like gear: one equipped cosmetic per slot. Unlocked by level on the reward track (role/purchase gates
// can be added later). Pure module so the picker, AvatarStack, and mappings can all import it. Keep ids
// STABLE (stored in mkt_buyer.avatar_cosmetics).
export const COSMETIC_SLOTS = ["aura", "headwear", "effect", "pet"];

export const AVATAR_COSMETICS = [
    // Aura — a colored glow behind the portrait (CSS).
    { id: "aura_gold", slot: "aura", label: "Golden Aura", icon: "🟡", level: 6, animated: false, hint: "A warm gold glow" },
    { id: "aura_aqua", slot: "aura", label: "Aqua Aura", icon: "🔵", level: 12, animated: false, hint: "A cool cyan glow" },
    { id: "aura_violet", slot: "aura", label: "Violet Aura", icon: "🟣", level: 22, animated: true, hint: "A pulsing purple glow" },
    { id: "aura_rainbow", slot: "aura", label: "Rainbow Aura", icon: "🌈", level: 40, animated: true, hint: "A shifting rainbow glow" },
    // Headwear — sits on top of the head (emoji glyph).
    { id: "cap", slot: "headwear", label: "Ball Cap", icon: "🧢", glyph: "🧢", level: 5, animated: false, hint: "A casual cap" },
    { id: "gradcap", slot: "headwear", label: "Grad Cap", icon: "🎓", glyph: "🎓", level: 9, animated: false, hint: "Top of the class" },
    { id: "crown", slot: "headwear", label: "Crown", icon: "👑", glyph: "👑", level: 16, animated: false, hint: "Wear your status" },
    { id: "tophat", slot: "headwear", label: "Top Hat", icon: "🎩", glyph: "🎩", level: 24, animated: false, hint: "Dapper" },
    // Effect — an ambient accent over the portrait (emoji, animated).
    { id: "sparkles", slot: "effect", label: "Sparkles", icon: "✨", glyph: "✨", level: 18, animated: true, hint: "Twinkling sparkles" },
    { id: "embers", slot: "effect", label: "Embers", icon: "🔥", glyph: "🔥", level: 30, animated: true, hint: "Rising embers" },
    { id: "frost", slot: "effect", label: "Frost", icon: "❄️", glyph: "❄️", level: 36, animated: true, hint: "A cold shimmer" },
    // Pet — a little companion beside them (emoji).
    { id: "pet_cat", slot: "pet", label: "Cat", icon: "🐱", glyph: "🐱", level: 14, animated: false, hint: "A loyal cat" },
    { id: "pet_wolf", slot: "pet", label: "Wolf Pup", icon: "🐺", glyph: "🐺", level: 20, animated: false, hint: "A wolf companion" },
    { id: "pet_dragon", slot: "pet", label: "Dragon", icon: "🐉", glyph: "🐉", level: 45, animated: true, hint: "A tiny dragon" },
];

export function cosmeticById(id) {
    return AVATAR_COSMETICS.find((c) => c.id === id) || null;
}

export function cosmeticsForSlot(slot) {
    return AVATAR_COSMETICS.filter((c) => c.slot === slot);
}

export function isCosmeticUnlocked(cosmetic, level, { badges = [], unlockAll = false } = {}) {
    if (!cosmetic) return false;
    if (cosmetic.requiresBadges) return cosmetic.requiresBadges.some((s) => badges.includes(s));
    return unlockAll || Math.max(1, Math.floor(Number(level) || 1)) >= cosmetic.level;
}

export function cosmeticsForSlotWithLock(slot, level, { badges = [], unlockAll = false } = {}) {
    return cosmeticsForSlot(slot).map((c) => ({ ...c, unlocked: isCosmeticUnlocked(c, level, { badges, unlockAll }) }));
}

// Keep only valid slot->id pairs; anything unknown becomes null (unequipped).
export function sanitizeCosmetics(obj) {
    const src = obj && typeof obj === "object" ? obj : {};
    const out = {};
    for (const slot of COSMETIC_SLOTS) {
        const c = cosmeticById(src[slot]);
        out[slot] = c && c.slot === slot ? c.id : null;
    }
    return out;
}

// slot -> cosmetic def (or null), for rendering.
export function resolveCosmetics(obj) {
    const clean = sanitizeCosmetics(obj);
    const out = {};
    for (const slot of COSMETIC_SLOTS) out[slot] = clean[slot] ? cosmeticById(clean[slot]) : null;
    return out;
}
