import "server-only";

import { itemElement } from "@/lib/marketplace/boss-weakness.js";

// ── RAID WEAPON SKILLS ──────────────────────────────────────────────────────────────────────────────────────
// When you tap a raid enemy there's a chance your equipped WEAPON procs a signature skill — a big bonus hit with
// a snazzy callout. The skill is chosen from the weapon's elemental affinity (the same deterministic itemElement
// the boss-weakness system already uses), so the effect always "makes sense" for the weapon you're holding.
// Maintain new skills here — one per element, plus a neutral fallback for un-attuned / empty weapons.
export const WEAPON_SKILLS = {
    fire: { name: "Flame Slash", emoji: "🔥", color: "#ff6b3c", flavor: "erupts in flame", mult: 1.9 },
    water: { name: "Tidal Crash", emoji: "💧", color: "#4aa3ff", flavor: "crashes down like a wave", mult: 1.75 },
    earth: { name: "Stoneshatter", emoji: "🌿", color: "#6ad07a", flavor: "quakes the earth", mult: 1.8 },
    storm: { name: "Chain Lightning", emoji: "⚡", color: "#ffd75e", flavor: "arcs with lightning", mult: 2.0 },
    light: { name: "Radiant Smite", emoji: "☀️", color: "#fff0a8", flavor: "smites with holy light", mult: 1.85 },
    shadow: { name: "Umbral Reap", emoji: "🌑", color: "#b061ff", flavor: "reaps from the shadows", mult: 2.1 },
    neutral: { name: "Crushing Blow", emoji: "💥", color: "#ffb347", flavor: "lands a crushing blow", mult: 1.6 },
};

// How often a tap procs the weapon skill.
export const SKILL_PROC_CHANCE = 0.2;

// The skill a given weapon id would proc (by its element; neutral fallback). Pure — safe to call per hit.
export function weaponSkill(weaponId) {
    const el = (weaponId && itemElement(weaponId)) || "neutral";
    return WEAPON_SKILLS[el] || WEAPON_SKILLS.neutral;
}

// Roll a tap: does the weapon skill proc? Returns the skill (with a stable id for client animation) or null.
export function rollWeaponSkill(weaponId, rand = Math.random) {
    if (rand() >= SKILL_PROC_CHANCE) return null;
    const s = weaponSkill(weaponId);
    return { name: s.name, emoji: s.emoji, color: s.color, flavor: s.flavor, mult: s.mult };
}
