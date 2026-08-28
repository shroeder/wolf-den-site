import { COIN_ICON } from "@/lib/coin-icon";
// EVERY STAT CARRIES ITS OWN DRAWN SPRITE. This panel was ~30 OS emoji in a grid, which renders differently on
// every device, carries none of the game's style, and reads as a settings screen rather than a character
// sheet. `art` is the sprite (scripts/gen-bonus-icons.mjs, one family, one ink weight); `icon` is kept for
// chat and log lines, where the operating system is already doing the drawing.
// Display metadata for badge bonuses — shared by the Badges page hero + the badge cards. Client-safe (pure
// data, no server-only imports). Mirrors the four bonus domains in badges.js (BADGE_BONUSES) and labels each
// stat the way its own system names it.
export const BONUS_DOMAINS = ["combat", "sea", "farm", "forge", "depth"];

export const BONUS_META = {
    combat: {
        // The domain head reuses a representative sprite from the same family — one look, no extra art.
        art: "/images/bonus/might.png",
        label: "Combat", icon: "⚔️", accent: "#ff8a4c", blurb: "buffs your daily boss strike",
        stats: {
            might: { art: "/images/bonus/might.png", icon: "⚔️", label: "Might", suffix: "" },
            crit_chance: { art: "/images/bonus/crit_chance.png", icon: "🎯", label: "Crit Chance", suffix: "%" },
            crit_power: { art: "/images/bonus/crit_power.png", icon: "💥", label: "Crit Power", suffix: "%" },
            // ── FIVE STATS THE PAGE COULD NOT DRAW ───────────────────────────────────────────────────────
            // C() has paid vitality, tenacity, ferocity, fortune and pierce on every badge worth 3 or more
            // since the hard-badge rule was written, and this map knew about three combat stats — so
            // bonusChips silently dropped the rest and the Badges page under-reported every prestige badge
            // it drew. Living Legend showed "+7 Might" and said nothing about the four other columns it
            // moves. Same defect Luke reported on the Enshriner card, one screen over.
            //
            // Drawn into the same family as the other thirty (scripts/gen-bonus-icons.mjs) rather than
            // borrowing might.png: a heart in an iron band, a pauldron, a wolf's head, a pair of sixes, and
            // an arrowhead through a punched plate. Each is a DIFFERENT object from its neighbours, because
            // at 28px the silhouette is the whole of the reading — the first pierce draw was a thin spear
            // and disappeared entirely.
            vitality: { art: "/images/bonus/vitality.png", icon: "❤️", label: "Vitality", suffix: "" },
            tenacity: { art: "/images/bonus/tenacity.png", icon: "🛡️", label: "Tenacity", suffix: "" },
            ferocity: { art: "/images/bonus/ferocity.png", icon: "🔥", label: "Ferocity", suffix: "" },
            fortune: { art: "/images/bonus/fortune.png", icon: "🍀", label: "Fortune", suffix: "" },
            pierce: { art: "/images/bonus/pierce.png", icon: "🗡️", label: "Pierce", suffix: "" },
        },
    },
    sea: {
        // The domain head reuses a representative sprite from the same family — one look, no extra art.
        art: "/images/bonus/broadside.png",
        label: "Sailing", icon: "⚓", accent: "#55d3ff", blurb: "powers raids, digging & voyages",
        stats: {
            broadside: { art: "/images/bonus/broadside.png", icon: "💣", label: "Raid Damage", suffix: "" },
            ironclad: { art: "/images/bonus/ironclad.png", icon: "🛡️", label: "Ship Armor", suffix: "" },
            plunder: { art: "/images/bonus/plunder.png", icon: "🏴‍☠️", label: "Plunder", suffix: "" },
            bounty: { art: "/images/bonus/bounty.png", icon: COIN_ICON, label: "Sea Gold", suffix: "" },
            dredge: { art: "/images/bonus/dredge.png", icon: "⛏️", label: "Dig Luck", suffix: "" },
            trove: { art: "/images/bonus/trove.png", icon: "💎", label: "Fragments", suffix: "" },
            // Labelled by its EFFECT, not its name: "+3 Tailwind" reads as "three tailwinds a day" because a
            // tailwind is also a once-daily action you spend. It's actually −1% voyage time per point (cap −15%),
            // so the point value already IS the percentage — show that instead.
            tailwind: { art: "/images/bonus/tailwind.png", icon: "🌬️", label: "Voyage Speed", suffix: "%" },
            angling: { art: "/images/bonus/angling.png", icon: "🎣", label: "Angling", suffix: "" },
        },
    },
    farm: {
        // The domain head reuses a representative sprite from the same family — one look, no extra art.
        art: "/images/bonus/goldHarvest.png",
        label: "Farming", icon: "🌾", accent: "#7ed57e", blurb: "boosts your farm",
        stats: {
            growSpeed: { art: "/images/bonus/growSpeed.png", icon: "🌱", label: "Grow Speed", suffix: "%" },
            seedLuck: { art: "/images/bonus/seedLuck.png", icon: "🍀", label: "Seed Luck", suffix: "%" },
            harvestLuck: { art: "/images/bonus/harvestLuck.png", icon: "🎁", label: "Harvest Luck", suffix: "%" },
            petXp: { art: "/images/bonus/petXp.png", icon: "🐾", label: "Pet XP", suffix: "%" },
            fertPower: { art: "/images/bonus/fertPower.png", icon: "💧", label: "Fertilizer", suffix: "%" },
            goldHarvest: { art: "/images/bonus/goldHarvest.png", icon: COIN_ICON, label: "Farm Gold", suffix: "%" },
        },
    },
    depth: {
        // The domain head reuses a representative sprite from the same family — one look, no extra art.
        art: "/images/bonus/hew.png",
        label: "The Mine", icon: "⛏️", accent: "#ffb45e", blurb: "powers delving, mining & smelting",
        stats: {
            // Labelled by EFFECT, not by name — the same call sea affinity's tailwind entry made. "+4 Nerve"
            // means nothing at a glance; "Roof Safety" says what the points buy you.
            nerve: { art: "/images/bonus/nerve.png", icon: "🪨", label: "Roof Safety", suffix: "" },
            lodesense: { art: "/images/bonus/lodesense.png", icon: "🧭", label: "Seam Quality", suffix: "" },
            hew: { art: "/images/bonus/hew.png", icon: "⛏️", label: "Ore Yield", suffix: "" },
            prospect: { art: "/images/bonus/prospect.png", icon: "🔦", label: "Find Odds", suffix: "" },
            bellows: { art: "/images/bonus/bellows.png", icon: "🌬️", label: "Extra Parts", suffix: "" },
            crucible: { art: "/images/bonus/crucible.png", icon: "⚗️", label: "Slag Luck", suffix: "" },
        },
    },
    forge: {
        // The domain head reuses a representative sprite from the same family — one look, no extra art.
        art: "/images/bonus/efficient.png",
        label: "Forge", icon: "🔨", accent: "#ffb020", blurb: "improves your smithing odds",
        stats: {
            efficient: { art: "/images/bonus/efficient.png", icon: "🛠️", label: "Salvage", suffix: "%" },
            keen_eye: { art: "/images/bonus/keen_eye.png", icon: "👁️", label: "Bonus Part", suffix: "%" },
            masters_touch: { art: "/images/bonus/masters_touch.png", icon: "✨", label: "Double Forge", suffix: "%" },
            steady_hand: { art: "/images/bonus/steady_hand.png", icon: "🖐️", label: "Combo Save", suffix: "%" },
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
