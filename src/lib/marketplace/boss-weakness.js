// BOSS ELEMENTS — every weekly boss is marked weak to one ELEMENT. Gear carries an elemental affinity
// (deterministic per item), and equipping pieces whose element matches the boss's weakness deals bonus
// damage. Simple, legible, and it makes the "best" loadout rotate week to week. Pure module (no db); both
// combat and display read it. (Replaces the old playstyle-weakness system; function names kept so callers
// don't churn — `weaknessInfo` returns the element, `pickWeakness` picks one.)

export const ELEMENTS = {
    fire: { key: "fire", label: "Fire", emoji: "🔥", color: "#ff6b3c" },
    water: { key: "water", label: "Water", emoji: "💧", color: "#4aa3ff" },
    earth: { key: "earth", label: "Earth", emoji: "🌿", color: "#6ad07a" },
    storm: { key: "storm", label: "Storm", emoji: "⚡", color: "#ffd75e" },
    light: { key: "light", label: "Light", emoji: "☀️", color: "#fff0a8" },
    shadow: { key: "shadow", label: "Shadow", emoji: "🌑", color: "#b061ff" },
};
export const ELEMENT_KEYS = Object.keys(ELEMENTS);
// Back-compat alias (a couple of callers still import WEAKNESSES).
export const WEAKNESSES = ELEMENTS;

// Per-hit bonus for each matching equipped piece. UNCAPPED — every match counts, all the way up.
//
// It used to stop at +90%, which meant the last four of the ten equip slots were dead weight: once six pieces
// matched, hunting a seventh changed nothing. That punished exactly the behaviour the system exists to
// encourage — rebuilding your loadout around this week's element. The ceiling is now the loadout itself:
// 10 slots × 15% = +150% for a flawless all-matching set, which is genuinely hard to assemble (elements are
// fixed per item, roughly 1 in 5 pieces is neutral, and the boss's element rotates weekly).
export const ELEMENT_PER_PIECE = 0.15; // +15% damage per matching piece

// Stable string hash → non-negative int.
function hashId(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

// Deterministic elemental affinity for an item id: most gear is attuned, ~1 in 5 is neutral (no element).
// Stable across renders/players so an item's element is a real, learnable property.
export function itemElement(itemId) {
    if (!itemId) return null;
    const h = hashId(String(itemId));
    if (h % 5 === 0) return null; // neutral
    return ELEMENT_KEYS[(h >>> 3) % ELEMENT_KEYS.length];
}

export function elementInfo(key) {
    const e = ELEMENTS[key];
    return e ? { key: e.key, label: e.label, emoji: e.emoji, color: e.color, desc: `Weak to ${e.label} ${e.emoji} — gear with a ${e.label} affinity deals bonus damage.` } : null;
}
// Kept name for existing callers.
export const weaknessInfo = elementInfo;

export function pickWeakness(rand = Math.random) {
    return ELEMENT_KEYS[Math.floor(rand() * ELEMENT_KEYS.length)];
}
export const pickElement = pickWeakness;

// How many equipped pieces match the boss's weak element, and the resulting damage multiplier (≥1).
// Accepts the {slot → id} object OR an array of ids. `overrides` (optional) is { itemId: [elements] } from the
// Forge's elemental reforge — a piece matches if ANY of its effective elements is the boss's weakness.
export function elementMult(equippedIds, bossElement, overrides = null) {
    if (!bossElement || !ELEMENTS[bossElement]) return { mult: 1, matches: 0, bonusPct: 0 };
    const ids = Array.isArray(equippedIds) ? equippedIds : Object.values(equippedIds || {});
    let matches = 0;
    for (const id of ids) {
        if (!id) continue;
        const over = overrides && overrides[id];
        const els = over && over.length ? over : (itemElement(id) ? [itemElement(id)] : []);
        if (els.includes(bossElement)) matches += 1;
    }
    const bonus = ELEMENT_PER_PIECE * matches;
    return { mult: 1 + bonus, matches, bonusPct: Math.round(bonus * 100) };
}
