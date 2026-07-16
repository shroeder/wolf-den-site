// Equippable avatar cosmetics. Two honest kinds (no slapped-on emoji):
//   • NATIVE — drawn INTO the avatar by DiceBear itself (e.g. real hats via the `top` option), so they
//     match the art exactly. These merge into the render options (see avatarImageUrl).
//   • OVERLAY — a tasteful CSS treatment layered by AvatarStack (auras = a soft glow behind the portrait).
// Slot-based like gear: one per slot, unlocked by level on the reward track. Pure module. Keep ids STABLE.
import { avatarUrlFor, sanitizeAvatarConfig } from "@/lib/marketplace/avatar-options.js";

export const COSMETIC_SLOTS = ["headwear", "aura"];

export const AVATAR_COSMETICS = [
    // Headwear — REAL DiceBear hats (native art, drawn on the head; a hat replaces the hairstyle slot).
    { id: "beanie", slot: "headwear", kind: "native", opts: { top: "winterHat1" }, label: "Bobble Beanie", icon: "🧶", level: 5, animated: false, hint: "A cozy bobble beanie" },
    { id: "winter_hat", slot: "headwear", kind: "native", opts: { top: "winterHat03" }, label: "Winter Hat", icon: "🎿", level: 10, animated: false, hint: "A warm winter hat" },
    { id: "snow_cap", slot: "headwear", kind: "native", opts: { top: "winterHat04" }, label: "Snow Cap", icon: "⛄", level: 16, animated: false, hint: "A snowy cap" },
    { id: "classic_hat", slot: "headwear", kind: "native", opts: { top: "hat" }, label: "Classic Hat", icon: "🎩", level: 24, animated: false, hint: "A classic hat" },
    // Custom vector art (our own SVG) rendered as an overlay — a test of how "worn" flair reads.
    {
        id: "crown", slot: "headwear", kind: "svg", place: "crown", label: "Golden Crown", icon: "👑", level: 20, animated: false, hint: "A regal gold crown",
        svg: '<svg viewBox="0 0 100 66" xmlns="http://www.w3.org/2000/svg"><path d="M6 56 L13 18 L32 42 L50 10 L68 42 L87 18 L94 56 Z" fill="#f5c542" stroke="#a9760f" stroke-width="3" stroke-linejoin="round"/><rect x="6" y="52" width="88" height="12" rx="3" fill="#e0a92e" stroke="#a9760f" stroke-width="3"/><circle cx="50" cy="24" r="4.5" fill="#ff5a6a"/><circle cx="21" cy="34" r="3.5" fill="#5a9bff"/><circle cx="79" cy="34" r="3.5" fill="#5affaf"/></svg>',
    },
    {
        id: "halo", slot: "headwear", kind: "svg", place: "halo", label: "Halo", icon: "💫", level: 28, animated: true, hint: "An angelic glowing halo",
        svg: '<svg viewBox="0 0 100 44" xmlns="http://www.w3.org/2000/svg"><ellipse cx="50" cy="22" rx="44" ry="13" fill="none" stroke="#ffe27a" stroke-width="7"/></svg>',
    },
    // Aura — a soft glow behind the portrait (CSS).
    { id: "aura_gold", slot: "aura", kind: "overlay", label: "Golden Aura", icon: "🟡", level: 6, animated: false, hint: "A warm gold glow" },
    { id: "aura_aqua", slot: "aura", kind: "overlay", label: "Aqua Aura", icon: "🔵", level: 12, animated: false, hint: "A cool cyan glow" },
    { id: "aura_violet", slot: "aura", kind: "overlay", label: "Violet Aura", icon: "🟣", level: 22, animated: true, hint: "A pulsing purple glow" },
    { id: "aura_rainbow", slot: "aura", kind: "overlay", label: "Rainbow Aura", icon: "🌈", level: 40, animated: true, hint: "A shifting rainbow glow" },
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

// slot -> cosmetic def (or null). AvatarStack renders only the OVERLAY ones (native ones are in the image).
export function resolveCosmetics(obj) {
    const clean = sanitizeCosmetics(obj);
    const out = {};
    for (const slot of COSMETIC_SLOTS) out[slot] = clean[slot] ? cosmeticById(clean[slot]) : null;
    return out;
}

// The avatar image URL with NATIVE cosmetics (hats) baked into the drawing. Overlay cosmetics (auras)
// are NOT in the image — AvatarStack adds those. Returns null when the member has no built avatar.
export function avatarImageUrl(config, cosmetics) {
    if (!config || typeof config !== "object" || !Object.keys(config).length) return null;
    const merged = { ...sanitizeAvatarConfig(config) };
    const clean = sanitizeCosmetics(cosmetics);
    for (const slot of COSMETIC_SLOTS) {
        const c = clean[slot] ? cosmeticById(clean[slot]) : null;
        if (c && c.kind === "native" && c.opts) Object.assign(merged, c.opts);
    }
    return avatarUrlFor(merged);
}
