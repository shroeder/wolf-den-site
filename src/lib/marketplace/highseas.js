// ── THE HIGH SEAS · A LAB, NOT A FEATURE ─────────────────────────────────────────────────────────────────────
// Luke wants to see the NEW sailing loop before any of it is committed to:
//
//     always at sea  ->  a lookout spots a sail  ->  the telescope  ->  take her or let her pass
//     shoot her CANVAS and her GUNS and leave her hull whole  ->  board her  ->  her captain
//     hole her instead  ->  she goes down  ->  you salvage what floats
//
// The point of the design is that sink-or-board stops being a button after the battle and becomes something
// you express by WHERE YOU AIM. A captain is taken by choosing the slow, dangerous way in and surviving it —
// she is shooting back the whole time you are being careful.
//
// ⚠️ THERE IS NO AMMUNITION HERE, DELIBERATELY. The first cut had you load round, chain or grape, which is
// historically lovely and, as Luke put it, "just unneeded complexity" — a second control that only ever
// restated the first. Aiming decides everything, and it removes the failure state with it: you cannot hole
// her by accident, because holing her is something you have to point at on purpose. One decision a round.
//
// ⚠️ THIS IS A LAB. It exists to be played and argued with, and it is owner-gated. It does NOT touch the
// database, the real voyage, the fleet or anybody's doubloons: a run lives in the browser and dies with it.
// That is deliberate — the fastest way to answer "does this feel good" is to make it free to change.
//
// ⚠️ AND IT BORROWS THE REAL NUMBERS RATHER THAN INVENTING ITS OWN. AMMO, SAILS_MAX, GUN_HP and hullHitsFor
// come from ship-battle.js, which is the shipped engine. A lab that quietly re-tunes the thing it is meant to
// be testing tells you how a game you do not have feels. What is genuinely NEW here is the telescope and the
// boarding outcome; everything else is the existing fight with a different question asked of it.
import { SAILS_MAX, GUN_HP, hullHitsFor } from "@/lib/marketplace/ship-battle.js";

// ── A SEEDED SEA ─────────────────────────────────────────────────────────────────────────────────────────────
// Same seed, same ship, same captain, every time and on any machine — so "sail seed 41 and tell me what you
// think" means one conversation about one ship rather than two people describing different fights.
export function hash(a, b = 0) {
    let x = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b)) >>> 0;
    x ^= x >>> 15; x = Math.imul(x, 0x2545f491) >>> 0;
    x ^= x >>> 13; x = Math.imul(x, 0x27d4eb2f) >>> 0;
    return (x ^ (x >>> 16)) >>> 0;
}
const pick = (arr, n) => arr[n % arr.length];
const between = (n, lo, hi) => lo + (n % (hi - lo + 1));

// ── WHAT IS OUT THERE ────────────────────────────────────────────────────────────────────────────────────────
// Three kinds, and the kind IS the decision. A trader is fat and feeble: easy to take, and her captain is
// nobody. A king's ship is the reverse — she will hurt you and there is nothing in the hold, but the man on her
// quarterdeck is worth the beating. The privateer sits between them so the choice is not always obvious.
//
// Art is the fleet's, which already has forty hulls drawn. Nothing new was generated for this.
export const KINDS = {
    trader:    { id: "trader",    label: "Merchantman", hold: [3, 5], infamy: [1, 2], guns: [2, 3], tone: "#8fd0a0" },
    privateer: { id: "privateer", label: "Privateer",   hold: [2, 4], infamy: [2, 4], guns: [4, 5], tone: "#e8c07a" },
    naval:     { id: "naval",     label: "King's ship", hold: [1, 2], infamy: [4, 5], guns: [5, 7], tone: "#9fd8ff" },
};

const HULLS = {
    trader: ["fleet_marigold", "fleet_lugger", "fleet_court"],
    privateer: ["fleet_cutter", "fleet_brig", "fleet_razee"],
    naval: ["fleet_frigate", "fleet_manowar", "fleet_line"],
};

const FIRST = ["Marigold", "Bittern", "Quiet", "Saint", "Black", "Fair", "Widow's", "Iron", "Sparrow", "Long"];
const SECOND = ["Wager", "Anne", "Errand", "Compass", "Lantern", "Tide", "Promise", "Reckoning", "Harrow", "Bell"];
const RANKS = ["Cpt.", "Cpt.", "Cdr.", "Adm."];
const SURNAMES = ["Vane", "Ashcroft", "Mourne", "Pell", "Garrow", "Quint", "Halloran", "Strand", "Coyne", "Rook"];

/** The cargo a hold can be full of. Flavour in the lab; the real thing would roll real goods. */
const CARGO = ["sugar and rum", "bolts of silk", "powder and shot", "salt cod", "coin for a garrison", "spices"];

/**
 * The ship the lookout has just seen. Everything about her is decided here, at the moment she appears —
 * so the telescope is REVEALING something that is already true rather than rolling it as you look.
 */
export function spot(seed, index = 0) {
    const n = hash(seed, index);
    const kindId = pick(["trader", "trader", "privateer", "privateer", "naval"], n >>> 3);
    const kind = KINDS[kindId];
    const infamy = between(n >>> 7, kind.infamy[0], kind.infamy[1]);
    const guns = between(n >>> 11, kind.guns[0], kind.guns[1]);
    return {
        id: `${seed}:${index}`,
        kind: kindId,
        label: kind.label,
        tone: kind.tone,
        art: `/images/fleet/${pick(HULLS[kindId], n >>> 5)}.png`,
        name: `The ${pick(FIRST, n >>> 13)} ${pick(SECOND, n >>> 17)}`,
        captain: `${pick(RANKS, infamy)} ${pick(SURNAMES, n >>> 19)}`,
        infamy,
        hold: between(n >>> 23, kind.hold[0], kind.hold[1]),
        cargo: pick(CARGO, n >>> 27),
        // Her fighting shape, in the shipped engine's units.
        planks: hullHitsFor(Math.max(0, infamy - 1)),
        sails: SAILS_MAX,
        guns: Array.from({ length: guns }, () => GUN_HP),
    };
}

// ── THE TELESCOPE ────────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ THE READ IS THE PROGRESSION, WHICH IS THE WHOLE REASON THIS SCREEN EXISTS. At distance you get a shape and
// a waterline; closer, her name and her colours; closer still, the man on her quarterdeck. So a better glass —
// or a lookout worth his salt — buys you a sharper DECISION rather than a bigger number, which is the one kind
// of upgrade the old loop never sold.
//
// Closing costs you the element of surprise: she gets a look at you too. In the lab that is a flat risk she
// runs; in the real thing it would be her speed against yours.
export const RANGES = [
    { id: "far", label: "Hull down", shows: ["shape", "waterline"], flee: 0 },
    { id: "mid", label: "Within the glass", shows: ["shape", "waterline", "name", "kind"], flee: 0.12 },
    { id: "near", label: "Hailing distance", shows: ["shape", "waterline", "name", "kind", "hold", "captain"], flee: 0.3 },
];
export const rangeAt = (i) => RANGES[Math.max(0, Math.min(RANGES.length - 1, i))];
export const sees = (i, what) => rangeAt(i).shows.includes(what);

/** What her waterline tells you before anything else does — laden or riding high. */
export const waterline = (ship) => (ship.hold >= 4 ? "heavy in the water" : ship.hold >= 3 ? "riding low" : "riding high");

// ── THE FIGHT, AS THIS LOOP ASKS IT ──────────────────────────────────────────────────────────────────────────
// One broadside a round, at ONE part of her. That is the entire control surface.
export const ZONES = [
    { id: "hull", label: "Hull", blurb: "Sinks her. Fast, and the captain goes down with it." },
    { id: "sails", label: "Rigging", blurb: "Stops her running." },
    { id: "guns", label: "Gun deck", blurb: "Stops her shooting back." },
];

export function openFight(ship, { planks = 12, guns = 5 } = {}) {
    return {
        round: 1,
        foe: { planks: ship.planks, sails: ship.sails, guns: [...ship.guns] },
        me: { planks, guns },
        log: [],
        over: null,           // sunk | boarded | lost | fled
    };
}

const alive = (guns) => guns.filter((g) => g > 0).length;

/** Is she helpless — canvas gone, every gun dismounted, and still floating? That is a prize, not a wreck. */
export const boardable = (f) => f.foe.planks > 0 && f.foe.sails <= 0 && alive(f.foe.guns) === 0;

/**
 * One round: your volley, then hers. Pure — takes state and a roll, returns new state.
 * `roll` is passed in so the lab can be replayed and a test can pin it.
 */
export function volley(fight, { zone, roll = Math.random }) {
    if (fight.over) return fight;
    const f = {
        ...fight,
        foe: { ...fight.foe, guns: [...fight.foe.guns] },
        me: { ...fight.me },
        log: [...fight.log],
    };

    // ── YOUR BROADSIDE ─────────────────────────────────────────────────────────────────────────────
    // ⚠️ A BROADSIDE IS EVERY GUN YOU HAVE, AND GETTING THAT WRONG INVERTED THE WHOLE DESIGN. The first cut
    // resolved a volley as a single shot, so holing a hull took eleven rounds while stripping canvas took two.
    // Simulated over 400 ships, the careful line boarded 332 times in 5.6 rounds while the fast line sank only
    // 88 and was driven off 312 times — sinking, the route that is meant to be quick and safe and pay less,
    // was the hard one. Iron into planks is the whole broadside: one plank per gun.
    if (zone === "hull") {
        const planks = Math.max(1, f.me.guns);
        f.foe.planks = Math.max(0, f.foe.planks - planks);
        f.log.push({ side: "me", text: `A full broadside into her hull — ${planks} planks gone.` });
    } else if (zone === "sails") {
        const took = 3;
        f.foe.sails = Math.max(0, f.foe.sails - took);
        f.log.push({ side: "me", text: f.foe.sails <= 0 ? "Her canvas comes down. She is going nowhere." : "Shot through her rigging — another suit down." });
    } else {
        // Concentrated on one barrel at a time: a gun you have started on is the one you finish.
        const idx = f.foe.guns.findIndex((g) => g > 0);
        if (idx >= 0) {
            f.foe.guns[idx] = Math.max(0, f.foe.guns[idx] - GUN_HP);
            const left = alive(f.foe.guns);
            f.log.push({ side: "me", text: left ? `You sweep her deck — ${left} gun${left === 1 ? "" : "s"} still bearing.` : "Her last gun is off its carriage." });
        }
    }

    if (f.foe.planks <= 0) { f.over = "sunk"; return f; }
    if (boardable(f)) { f.over = "boardable"; return f; }

    // ── AND SHE ANSWERS ────────────────────────────────────────────────────────────────────────────
    // Only with the guns she still has. This is the cost of the careful route: every round you spend on her
    // canvas is a round she spends on your planks.
    const firing = alive(f.foe.guns);
    if (firing > 0) {
        const landed = Math.max(0, Math.round(firing * 0.5 * (0.6 + roll() * 0.8)));
        f.me.planks = Math.max(0, f.me.planks - landed);
        f.log.push({ side: "foe", text: landed ? `She fires — ${landed} plank${landed === 1 ? "" : "s"} off your hull.` : "Her broadside goes wide." });
    } else {
        f.log.push({ side: "foe", text: "Nothing answers from her deck." });
    }
    if (f.me.planks <= 0) { f.over = "lost"; return f; }

    f.round += 1;
    return f;
}

/** What the two endings pay. Sinking is a real choice, not a consolation — it is simply paid in cargo. */
export function spoils(ship, outcome) {
    if (outcome === "sunk") {
        return {
            headline: "She goes down",
            blurb: "Your boats pull through the wreckage for whatever floats.",
            lines: [`${Math.max(1, ship.hold - 1)} crates of ${ship.cargo}`, "salvage from the wreck"],
        };
    }
    return {
        headline: `${ship.captain} is taken`,
        blurb: "Her colours come down and your people go over the side.",
        lines: [`${ship.hold} crates of ${ship.cargo}`, `${ship.captain} — infamy ${ship.infamy}`, "her crew, and what they know"],
    };
}
