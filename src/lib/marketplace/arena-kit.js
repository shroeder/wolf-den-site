// ── WHAT YOUR GEAR LETS YOU DO IN THE RING ───────────────────────────────────────────────────────────────────
// Pure. No DB, no server-only — the arena screen and the engine read the same kit, so what you are shown is
// exactly what you fight with.
//
// The arena used to be rock-paper-scissors against a printed probability, which is not a decision: you compute
// the best response and repeat. It is gone. A bout is now YOUR EXECUTION against THEIR LOADOUT — you time every
// swing and every block, and what you have to work with comes out of the gear you built.
//
// Nothing here is invented from nothing. The Den already has:
//   · six ELEMENTS on every item, with a paid Forge reforge and rare dual-affinity
//   · a hundred-odd SIGNATURE powers on marquee gear, written so "gear defines a playstyle"
//   · rarity tiers that already mean something everywhere else
// This maps those into moves. Every ability names the item it came from, because an ability you cannot trace
// to a piece of gear is magic, and you cannot build toward magic.

import { itemById } from "@/lib/marketplace/items.js";
import { ELEMENTS, itemElement } from "@/lib/marketplace/boss-weakness.js";

const RANK = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4, ascendant: 5, eternal: 6 };
const rankOf = (id) => RANK[itemById(id)?.rarity] ?? 0;

// ── THE ELEMENT WHEEL ────────────────────────────────────────────────────────────────────────────────────────
// A build-level triangle, NOT the per-round guessing that just got deleted. You can see your opponent's
// affinity before you challenge and re-attune at the Forge to answer it — so it is a decision you make with
// your gold and your loadout, in advance, rather than a coin flip in the moment.
// Exported so the fight screen can SHOW the wheel. "Earth overcomes Light" is a conclusion; without the
// rule in front of you there is no way to know why, or to plan a re-attune around it.
export const BEATS = {
    fire: ["earth", "shadow"],
    water: ["fire", "earth"],
    earth: ["storm", "light"],
    storm: ["water", "shadow"],
    light: ["shadow", "fire"],
    shadow: ["water", "light"],
};
export const ELEMENT_EDGE = 0.25;   // damage swing when your affinity answers theirs

export function elementClash(mine, theirs) {
    if (!mine || !theirs || mine === theirs) return { mult: 1, note: null };
    // "Earth overcomes Light" never said whose Earth or whose Light. Possessives, always.
    if (BEATS[mine]?.includes(theirs)) return { mult: 1 + ELEMENT_EDGE, note: `Your ${ELEMENTS[mine]?.label} overcomes their ${ELEMENTS[theirs]?.label}` };
    if (BEATS[theirs]?.includes(mine)) return { mult: 1 - ELEMENT_EDGE, note: `Their ${ELEMENTS[theirs]?.label} smothers your ${ELEMENTS[mine]?.label}` };
    return { mult: 1, note: null };
}

// ── SIGNATURES → NAMED ABILITIES ─────────────────────────────────────────────────────────────────────────────
// The signature catalog is written for the BOSS (conditional multipliers on a once-a-day strike), so its shapes
// don't transfer literally. What transfers is the identity: the name, the item and the archetype. Each becomes
// an arena move of the matching character.
const ARCHETYPE = {
    firstHitMult: { kind: "strike", cd: 3, power: 2.1, blurb: "A committed opener." },
    eruptChance: { kind: "strike", cd: 3, power: 2.0, blurb: "Erupts on contact." },
    critMult: { kind: "strike", cd: 3, power: 2.2, blurb: "Finds the seam." },
    opportunist: { kind: "execute", cd: 4, power: 2.4, blurb: "Hits far harder on a wounded foe." },
    onslaught: { kind: "strike", cd: 3, power: 2.2, blurb: "Hits hardest while they're fresh." },
    giantSlayer: { kind: "strike", cd: 4, power: 2.5, blurb: "Made for bigger things than you." },
    vanguard: { kind: "surge", cd: 3, power: 1.0, blurb: "Sharpens your next two swings." },
    attuned: { kind: "spell", cd: 4, power: 2.3, blurb: "Channels your affinity." },
    bloodlust: { kind: "surge", cd: 3, power: 1.0, blurb: "Feeds on the fight." },
    packTactics: { kind: "ward", cd: 3, power: 1.0, blurb: "Braces you against the next blow." },
    overcharge: { kind: "spell", cd: 6, power: 3.2, blurb: "Discharges everything at once." },
    highroller: { kind: "gamble", cd: 5, power: 3.0, blurb: "All of it, or none of it." },
    beastbond: { kind: "surge", cd: 3, power: 1.0, blurb: "Your companion piles in." },
    warbanner: { kind: "ward", cd: 4, power: 1.0, blurb: "A banner nobody wants to fight under." },
    xpOnHit: { kind: "strike", cd: 2, power: 1.7, blurb: "Studied, precise." },
    goldOnHit: { kind: "strike", cd: 2, power: 1.7, blurb: "Takes something with it." },
    ticketOnCrit: { kind: "strike", cd: 2, power: 1.8, blurb: "Lucky." },
    // These two carried no arena move at all, which quietly benched fourteen legendary and mythic pieces —
    // six helms and eight belts/boots whose signature is written for the BOSS fight. They read across fine.
    firstHitCrit: { kind: "strike", cd: 3, power: 2.2, blurb: "Opens on a crit." },
    extraStrikes: { kind: "surge", cd: 3, power: 1.0, blurb: "More swings in you than there should be." },
};

// Rarity is the dial: the same signature on an eternal hits harder than on a legendary.
const TIER_SCALE = [1, 1, 1, 1, 1.12, 1.24, 1.36];

// The blurb on an ability is flavour — "A committed opener." That tells you the mood and nothing else, so
// there was no way to know whether a skill was worth its cooldown without using it and watching the log.
//
// This writes the mechanics out from the SAME constants the engine applies, so the description cannot drift
// away from the behaviour. Every number below is read off arena.js's resolution, including the trades: a
// spell really is multiplied by 0.88 in exchange for cutting guard, so that is what it says.
const SPELL_POWER_TAX = 0.88;   // arena.js: power *= 0.88 for the guard cut
const SPELL_PIERCE = 0.40;      // arena.js: guard *= 0.6
const WARD_SOAK = 0.18;         // arena.js: shield += maxHp * 0.18
const SURGE_MULT = 0.35;        // arena.js: surge multiplier is 1.35
const SURGE_SWINGS = 2;         // arena.js: b.surge = 2
const EXECUTE_MULT = 1.5;       // arena.js: power *= 1.5 under the threshold
const EXECUTE_UNDER = 0.35;     // arena.js: foeHp <= foeMaxHp * 0.35

const x = (n) => `\u00d7${(Math.round(n * 100) / 100).toFixed(2).replace(/\.?0+$/, "")}`;

function effectText(kind, power, element) {
    const el = element ? ELEMENTS[element]?.label || element : null;
    switch (kind) {
        case "strike":
            return `${x(power)} a normal swing. Timing counts for half again as much on a strike — nail it and it lands far above anything else you own.`;
        case "spell":
            return `${x(power * SPELL_POWER_TAX)} a normal swing — less raw power, but it cuts ${Math.round(SPELL_PIERCE * 100)}% of their guard`
                + `${el ? ` and answers on its own ${el} rather than your overall affinity` : ""}.`;
        case "execute":
            return `${x(power)} a normal swing, and ${x(power * EXECUTE_MULT)} once they are under ${Math.round(EXECUTE_UNDER * 100)}% vigour. A finisher.`;
        case "gamble":
            return `A coin flip: ${x(power * 2)} a normal swing, or nothing at all.`;
        case "surge":
            return `No damage. Your next ${SURGE_SWINGS} swings hit ${Math.round(SURGE_MULT * 100)}% harder.`;
        case "ward":
            return `No damage. Braces you — soaks ${Math.round(WARD_SOAK * 100)}% of your vigour off what lands next.`;
        default:
            return `${x(power)} a normal swing.`;
    }
}

/**
 * The kit a loadout fights with.
 *
 * @param equippedIds  array of equipped item ids
 * @param sigMap       { itemId: { label, ...flags } } from signatures.js — passed in so this module stays pure
 * @param elementOf    optional { itemId: element } override (the Forge's Attune), else derived from the item
 */
export function buildKit(equippedIds = [], sigMap = {}, elementOf = {}) {
    const ids = equippedIds.filter(Boolean);

    // ── AFFINITY ── the element you carry most of. Ties break toward the rarer piece, so your best item speaks.
    const tally = {};
    for (const id of ids) {
        const el = elementOf[id] || itemElement(id);
        if (!el) continue;
        tally[el] = (tally[el] || 0) + 1 + rankOf(id) * 0.1;
    }
    const element = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0] || null;

    // ── ABILITIES ── one per signature piece you're wearing, best first, capped so the bar stays readable.
    const abilities = [];
    for (const id of ids) {
        const sig = sigMap[id];
        if (!sig) continue;
        const key = Object.keys(ARCHETYPE).find((k) => sig[k]);
        if (!key) continue;
        const a = ARCHETYPE[key];
        const item = itemById(id);
        const scale = TIER_SCALE[rankOf(id)] || 1;
        abilities.push({
            id: `${id}:${key}`,
            itemId: id,                      // so the screen can show the actual piece of gear's sprite
            name: sig.label || item?.name || "Signature",
            from: item?.name || id,          // ALWAYS shown — an ability must be traceable to a piece of gear
            kind: a.kind,
            cooldown: a.cd,
            effect: effectText(a.kind, Math.round(a.power * scale * 100) / 100, elementOf[id] || itemElement(id) || element),
            power: Math.round(a.power * scale * 100) / 100,
            blurb: a.blurb,
            element: elementOf[id] || itemElement(id) || element,
            rarity: item?.rarity || "rare",
            rank: rankOf(id),
        });
    }
    abilities.sort((a, b) => b.rank - a.rank || b.power - a.power);
    const kit = abilities.slice(0, 4);

    // Nobody fights empty-handed. A loadout with no signature gear still gets one honest move.
    if (!kit.length) {
        kit.push({
            id: "basic:focus", itemId: null, name: "Focused Blow", from: "your own hands", kind: "strike",
            cooldown: 0, power: 1.9, blurb: "No magic in it. Still hurts.", element, rarity: "common", rank: 0,
            effect: effectText("strike", 1.9, element),
        });
    }
    return { element, abilities: kit };
}

// ── THE RING ─────────────────────────────────────────────────────────────────────────────────────────────────
// One closing ring, one window. Their GEAR decides how hard yours is — that is how a defender who is not
// present still puts up a fight, and why better gear is genuinely more dangerous to face.
export const RING_BASE_MS = 1150;   // a fresh, unequipped opponent
export const RING_FLOOR_MS = 520;   // the very best gear in the Den
export function ringMsFor(foeGearPower = 0) {
    const t = Math.max(0, Math.min(1, foeGearPower / 320));
    return Math.round(RING_BASE_MS - (RING_BASE_MS - RING_FLOOR_MS) * t);
}

// How close to the line you landed → what it was worth. The window is generous at the edges and rewarding in
// the middle, because a timing game that only pays on a 40ms window is a reflex test, not a decision.
// `def` is how much of an incoming blow you turn aside. A PERFECT block deliberately does NOT null the hit —
// at def 1.0 a good player is simply immortal and gear stops mattering at all, which is the mirror image of the
// problem this design was meant to solve.
// The windows are FRACTIONS of the ring, so speeding the ring up shrinks every one of them in real time.
// Cutting the ring from 1700ms to 1150 without touching these took an ok player from 98% to 83% in an even
// fight and a good one from 67% to 40% against strong gear. Widened to hold the intended curve at the new
// speed — a window measured in tens of milliseconds is a reflex test, not a decision.
// FLAWLESS is CARVED OUT of the old PERFECT band rather than stacked on top of it. Bolting a strictly better
// tier above perfect and nudging the boundaries out was worth measuring: it took an expert from 70% to 99%
// against the top of the Den, which flattens the one part of the ladder that is supposed to be hard. So the
// outer edge of perfect is unchanged at 0.10 and its payout drops to make room — the .10 band as a whole is
// worth what it always was, and the top slice is a callout you have to actually nail.
export const GRADES = [
    { key: "flawless", within: 0.05, atk: 1.75, def: 0.82, label: "FLAWLESS" },
    { key: "perfect", within: 0.10, atk: 1.45, def: 0.70, label: "Perfect" },
    { key: "great", within: 0.21, atk: 1.30, def: 0.50, label: "Great" },
    { key: "good", within: 0.40, atk: 1.00, def: 0.28, label: "Good" },
    { key: "miss", within: Infinity, atk: 0.45, def: 0.0, label: "Missed" },
];

// ── THE TUNING, AND WHERE IT CAME FROM ───────────────────────────────────────────────────────────────────────
// Simulated 4,000 bouts a cell. The first cut had a swing at full Might and no mitigation on the defender's
// side at all: bouts ended in TWO beats and every level of play won 100% of the time, which is not a game.
//
// SWING scales both sides down so a bout runs ~10 beats. PUNCH is the defender's extra bite, because you get
// abilities and blocking and they get neither. And the defender's gear now BLOCKS — without that the attacker
// always lands full and wins regardless.
//
// What matters is that a human's timing error is roughly constant in MILLISECONDS, while the ring gets faster
// with the defender's gear. So the same hand is sloppier against better kit, all on its own:
//
// Measured at exactly the constants below — 4,000 bouts a cell, timing error in ms, win rate / bout length:
//
//   hand                even        +30% gear      +65% gear     top of the Den
//   expert  (±60ms)   100%  8.9b   100%  10.5b   100%   9.8b     73%  9.5b
//   good   (±110ms)   100%  9.6b    95%  11.4b    75%  10.5b     11%  8.2b
//   ok     (±170ms)    98% 10.2b    67%  11.6b    29%  10.0b      0%  6.6b
//   sloppy (±260ms)    67% 10.9b    11%  10.4b     2%   8.4b      0%  5.4b
//
// An even fight is decided by your hands. A gear gap is decided by both. The top of the Den is a coin flip
// for someone genuinely excellent and out of reach for everyone else — which is what a first place should be.
export const SWING = 0.30;
export const PUNCH = 2.3;

// ── THE UNDERDOG CLAUSE ──────────────────────────────────────────────────────────────────────────────────────
// Without this, a big enough gear gap is a WALL: simulated at the top of the ladder, a player with flawless
// timing still won 0 bouts out of 4,000, because vigour scales with gear about five times faster than might
// does. A ladder whose first place cannot be taken by anyone is not a ladder.
//
// So the further above you they are, the harder you swing. It never makes you the favourite — it makes the
// climb possible for someone who plays extremely well, which is the whole point of putting timing in the game.
// The deadband matters as much as the slope. Helping from the first point of difference wiped out moderate
// gear gaps entirely (a +30% opponent went from a real fight to a 99% win), which would have made gear
// pointless in exactly the matchups people actually pick. Nothing happens until they are a third above you.
export const UNDERDOG_MAX = 0.9;
export const UNDERDOG_DEADBAND = 0.35;
export function underdogEdge(myGearPower = 0, foeGearPower = 0) {
    const gap = (foeGearPower - myGearPower) / Math.max(40, myGearPower) - UNDERDOG_DEADBAND;
    if (gap <= 0) return 1;
    return 1 + Math.min(UNDERDOG_MAX, gap * 0.75);
}
/** `off` is |how far from the line|, as a fraction of the ring's duration. */
export const gradeFor = (off) => GRADES.find((g) => Math.abs(off) <= g.within) || GRADES[GRADES.length - 1];

// ── COOLDOWNS, NOT FOCUS ─────────────────────────────────────────────────────────────────────────────────────
// Focus was a pool you filled by timing well and spent on skills. It made every skill interchangeable — a
// number you saved up — and a bad round of timing locked you out of your own gear entirely. Skills now go on
// cooldown for a few of your turns after use, so each one has its own rhythm and nothing can lock you out.
//
// The cooldowns ARE the old Focus costs, one for one, which keeps the rate of skill use about where the
// balance pass assumed: an ability with cooldown C is usable once every C+1 turns, so a four-piece kit at
// C=3 has something ready on 1 - (3/4)^4 = 68% of turns. The tuning assumed skills on ~70% of beats.
export const GUARD_COOL = 1;        // guarding also shaves a turn off everything cooling

// ── THE FIELD KIT ────────────────────────────────────────────────────────────────────────────────────────────
// Both fighters get the same small kit every bout. It is deliberately NOT the consumable economy: these cost
// nothing, they refresh each fight, and they vanish when it ends. That keeps the Items command from ever being
// an empty menu, and it avoids the trap where the correct play is burning a 6,500-gold potion on a ladder
// scrap. Using one spends your turn, which is the whole decision — drink, or swing.
export const BATTLE_ITEMS = [
    { id: "poultice", name: "Field Poultice", count: 2, sprite: "/images/arena/item-poultice.webp",
        blurb: "Binds a wound. Restores a quarter of your vigour.", kind: "heal", amount: 0.25 },
    { id: "draught", name: "Quickening Draught", count: 1, sprite: "/images/arena/item-draught.webp",
        blurb: "Every skill you own comes off cooldown at once.", kind: "refresh" },
];

// GUARD — no ring, no roll. You give up your swing and take a braced stance: it soaks a slice of the next blow
// outright and settles you enough to gain Focus. It is the honest answer to a bout going badly, and the reason
// the command menu is a decision rather than four ways to press attack.
export const GUARD_SOAK = 0.30;     // of your max vigour, absorbed from what comes next
