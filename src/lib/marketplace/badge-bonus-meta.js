// Display metadata for badge bonuses — shared by the Badges page hero + the badge cards. Client-safe (pure
// data, no server-only imports). Mirrors the four bonus domains in badges.js (BADGE_BONUSES) and labels each
// stat the way its own system names it.
export const BONUS_DOMAINS = ["combat", "sea", "farm", "forge"];

export const BONUS_META = {
    combat: {
        label: "Combat", icon: "⚔️", accent: "#ff8a4c", blurb: "buffs your daily boss strike",
        stats: {
            might: { icon: "⚔️", label: "Might", suffix: "" },
            crit_chance: { icon: "🎯", label: "Crit Chance", suffix: "%" },
            crit_power: { icon: "💥", label: "Crit Power", suffix: "%" },
        },
    },
    sea: {
        label: "Sailing", icon: "⚓", accent: "#55d3ff", blurb: "powers raids, digging & voyages",
        stats: {
            broadside: { icon: "💣", label: "Raid Damage", suffix: "" },
            ironclad: { icon: "🛡️", label: "Ship Armor", suffix: "" },
            plunder: { icon: "🏴‍☠️", label: "Plunder", suffix: "" },
            bounty: { icon: "🪙", label: "Sea Gold", suffix: "" },
            dredge: { icon: "⛏️", label: "Dig Luck", suffix: "" },
            trove: { icon: "💎", label: "Fragments", suffix: "" },
            // Labelled by its EFFECT, not its name: "+3 Tailwind" reads as "three tailwinds a day" because a
            // tailwind is also a once-daily action you spend. It's actually −1% voyage time per point (cap −15%),
            // so the point value already IS the percentage — show that instead.
            tailwind: { icon: "🌬️", label: "Voyage Speed", suffix: "%" },
        },
    },
    farm: {
        label: "Farming", icon: "🌾", accent: "#7ed57e", blurb: "boosts your farm",
        stats: {
            growSpeed: { icon: "🌱", label: "Grow Speed", suffix: "%" },
            seedLuck: { icon: "🍀", label: "Seed Luck", suffix: "%" },
            harvestLuck: { icon: "🎁", label: "Harvest Luck", suffix: "%" },
            petXp: { icon: "🐾", label: "Pet XP", suffix: "%" },
            fertPower: { icon: "💧", label: "Fertilizer", suffix: "%" },
            goldHarvest: { icon: "🪙", label: "Farm Gold", suffix: "%" },
        },
    },
    forge: {
        label: "Forge", icon: "🔨", accent: "#ffb020", blurb: "improves your smithing odds",
        stats: {
            efficient: { icon: "🛠️", label: "Salvage", suffix: "%" },
            keen_eye: { icon: "👁️", label: "Bonus Part", suffix: "%" },
            masters_touch: { icon: "✨", label: "Double Forge", suffix: "%" },
            steady_hand: { icon: "🖐️", label: "Combo Save", suffix: "%" },
        },
    },
};

// A badge's bonus object → flat list of chips [{ domain, icon, label, text }]. Empty when the badge has none.
export function bonusChips(bonus) {
    const out = [];
    if (!bonus) return out;
    for (const dom of BONUS_DOMAINS) {
        const block = bonus[dom];
        if (!block) continue;
        const meta = BONUS_META[dom];
        for (const [k, v] of Object.entries(block)) {
            const sm = meta.stats[k];
            if (!sm || !v) continue;
            out.push({ domain: dom, icon: sm.icon, label: sm.label, text: `+${v}${sm.suffix} ${sm.label}` });
        }
    }
    return out;
}

// Domain totals { combat, sea, farm, forge } → only the domains that actually have any nonzero stat.
export function activeDomains(totals) {
    if (!totals) return [];
    return BONUS_DOMAINS
        .map((dom) => {
            const block = totals[dom] || {};
            const stats = Object.entries(block).filter(([, v]) => v).map(([k, v]) => ({ key: k, value: v, ...BONUS_META[dom].stats[k] }));
            return stats.length ? { domain: dom, ...BONUS_META[dom], stats } : null;
        })
        .filter(Boolean);
}
