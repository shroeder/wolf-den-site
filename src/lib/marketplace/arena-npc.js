// ── THE GAUNTLET: ENDLESS NPC CHALLENGERS ────────────────────────────────────────────────────────────────────
// Pure. No DB, no server-only — the ladder screen and the engine read the same catalog.
//
// WHY THIS EXISTS. The arena only had other members in it, which produces two dead ends. If nobody is above
// you there is nothing to fight (the state Luke hit at #1: "Nobody above you within reach. You are at the top
// of the Den."), and if you would simply rather not fight a person today there is nothing else to do. A store
// ladder is also small — eighty-four people, most of them not playing on any given evening.
//
// So there is a second ladder made of opponents who are always there and never run out.
//
// ENDLESS BY CONSTRUCTION. Tiers are a FORMULA, not a list. Tier 40 exists, and so does tier 400. What is
// finite is the ART: a BAND covers a stretch of tiers and shares one sprite, and inside a band the numbers
// escalate. Ten sprites therefore cover an unbounded ladder — the alternative is commissioning a new sprite
// every time somebody reaches the end, which is not a ladder anyone can maintain.
//
// The last band repeats forever with the numbers still climbing, which is the honest way to say "there is
// always something harder": no fake ceiling, no "coming soon", just a wall that keeps getting taller.

export const BANDS = [
    { key: "straw", name: "Straw Dummy", from: 1, color: "#c39b6a", blurb: "It does not fight back very hard." },
    { key: "scrapper", name: "Pit Scrapper", from: 4, color: "#9fb3c8", blurb: "All elbows and confidence." },
    { key: "regular", name: "Den Regular", from: 9, color: "#7ed57e", blurb: "Knows what they're doing." },
    { key: "veteran", name: "Veteran", from: 16, color: "#6fd0ff", blurb: "Has done this a lot longer than you." },
    { key: "champion", name: "Champion", from: 25, color: "#ffd75e", blurb: "Wears the laurel for a reason." },
    { key: "warlord", name: "Warlord", from: 36, color: "#ff9f1c", blurb: "Fights like the cage is a favour to you." },
    { key: "titan", name: "Titan", from: 50, color: "#b98cff", blurb: "You are hitting geology." },
    { key: "colossus", name: "Colossus", from: 66, color: "#ff6f7d", blurb: "Something built to end fights." },
    { key: "nightmare", name: "Nightmare", from: 85, color: "#b061ff", blurb: "It should not be in here with you." },
    // No `from` ceiling. Everything from here up is Ascendant, numbered, forever.
    { key: "ascendant", name: "Ascendant", from: 110, color: "#fff0a8", blurb: "The wall that keeps getting taller." },
];

export const bandForTier = (tier) => {
    let band = BANDS[0];
    for (const b of BANDS) if (tier >= b.from) band = b;
    return band;
};

// ── HOW HARD IS TIER N ───────────────────────────────────────────────────────────────────────────────────────
// Roughly geometric, so early tiers come quickly and the curve keeps its teeth forever without any single step
// being a wall. Tuned so a mid-level member with decent gear sits somewhere around tier 12-20 — enough of a
// ladder below them to feel earned, and a very long way still above.
const BASE_POWER = 86;
const GROWTH = 1.085;

export function npcPower(tier) {
    return Math.round(BASE_POWER * Math.pow(GROWTH, Math.max(1, tier) - 1));
}

// The stat split mirrors what a member brings, so the same engine can fight either without special cases.
export function npcFor(tier) {
    const t = Math.max(1, Math.round(tier));
    const band = bandForTier(t);
    const power = npcPower(t);
    // Within a band, later tiers are the "II / III / IV" of it — a Veteran IV is plainly a harder Veteran.
    const idx = t - band.from + 1;
    const numeral = ["", " II", " III", " IV", " V", " VI", " VII", " VIII", " IX", " X"][Math.min(9, idx - 1)] || ` ${idx}`;
    return {
        id: `npc:${t}`,
        npc: true,
        tier: t,
        band: band.key,
        name: `${band.name}${idx > 1 ? numeral : ""}`,
        blurb: band.blurb,
        color: band.color,
        sprite: `/images/arena/npc/${band.key}.webp`,
        // Vigour and might land in the same range the member curve produces, so a bout against tier N feels
        // like a bout against a member of comparable power rather than like a different game.
        vigour: Math.round(70 + power * 1.15),
        might: Math.round(9 + power * 0.115),
        gearPower: power,
        // Element cycles so consecutive tiers are not all answerable with one affinity — the wheel stays a
        // reason to re-attune rather than something you solve once.
        element: ["fire", "water", "earth", "storm", "light", "shadow"][t % 6],
        speed: Math.round(10 + power * 0.09),
        fortune: Math.round(power * 0.12),
    };
}

// ── WHAT AN NPC FIGHTS WITH ──────────────────────────────────────────────────────────────────────────────────
// Real named moves out of the same eleven kinds members use, not a bare swing. Two things matter here:
//
//   DETERMINISTIC BY TIER — a given tier always brings the same two moves, so losing to it teaches you
//   something and the rematch is a plan rather than another dice roll. This is the one advantage the Gauntlet
//   has over fighting a member, and throwing it away for variety would be a bad trade.
//
//   HARDER TIERS GET NASTIER KINDS — the early bands swing and bleed, the late ones drain and execute.
const NPC_KIT = [
    { kind: "strike", name: "Heavy Blow", sprite: "/images/arena/skill-firstHitMult.webp", power: 2.0, cd: 3 },
    { kind: "rend", name: "Ragged Cut", sprite: "/images/arena/skill-eruptChance.webp", power: 1.4, cd: 3 },
    { kind: "flurry", name: "Rain of Blows", sprite: "/images/arena/skill-onslaught.webp", power: 0.85, cd: 3, hits: 3 },
    { kind: "sunder", name: "Armour Break", sprite: "/images/arena/skill-giantSlayer.webp", power: 1.5, cd: 4 },
    { kind: "spell", name: "Elemental Lash", sprite: "/images/arena/skill-attuned.webp", power: 2.1, cd: 4 },
    { kind: "drain", name: "Life Tithe", sprite: "/images/arena/skill-bloodlust.webp", power: 1.8, cd: 3 },
    { kind: "execute", name: "Finisher", sprite: "/images/arena/skill-opportunist.webp", power: 2.3, cd: 4 },
];

export function npcAbilities(tier) {
    const t = Math.max(1, Math.round(tier));
    const n = npcFor(t);
    // How deep into the kit this tier may reach. A Straw Dummy gets the first move; an Ascendant gets any.
    const depth = Math.min(NPC_KIT.length, 1 + Math.floor(t / 9));
    const pick = (offset) => NPC_KIT[(t * 3 + offset) % depth];
    const chosen = depth === 1 ? [NPC_KIT[0]] : [pick(0), pick(1)].filter((v, i, a) => a.indexOf(v) === i);
    // Tier scales what the moves are worth, gently — the big lever is already their might and vigour.
    const scale = 1 + Math.min(0.6, t * 0.006);
    return chosen.map((k, i) => ({
        id: `npc${t}:${k.kind}:${i}`,
        itemId: null,
        name: k.name,
        from: n.name,
        kind: k.kind,
        cooldown: k.cd,
        hits: k.hits || 1,
        power: Math.round(k.power * scale * 100) / 100,
        element: n.element,
        rarity: "epic",
        rank: 2,
        defensive: false,
        blurb: k.name,
        sprite: k.sprite,
        effect: { head: `×${Math.round(k.power * scale * 100) / 100}`, sub: "damage", line: k.name, tags: [] },
    }));
}

/**
 * Which tiers a member may take on. You can always re-fight anything you have already beaten (so there is
 * never nothing to do), plus a REACH above your best — but the reach is generous rather than one-at-a-time,
 * because being told to grind tier 7 before you may look at tier 9 is the treadmill this is meant to replace.
 */
export const NPC_REACH = 3;
export function npcOffer(bestTier = 0, count = 6) {
    const top = Math.max(1, bestTier + NPC_REACH);
    const out = [];
    // Show the frontier first — the ones you have not beaten — then a couple you have, to warm up on.
    for (let t = top; t >= 1 && out.length < count; t -= 1) out.push(npcFor(t));
    return out;
}
