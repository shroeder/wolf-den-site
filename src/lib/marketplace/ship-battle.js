// ── SHIP-TO-SHIP COMBAT ──────────────────────────────────────────────────────────────────────────────────────
// Raiding used to be two captains trading blows: the numbers came off your EQUIPPED GEAR — the same Might and
// Crit Power that fight the weekly boss — and the ship was scenery. So the way to get better at sailing combat
// was to go and do something else, and the boat you had spent weeks building contributed nothing but a picture.
//
// A battle is between SHIPS now. What decides it:
//   GUNS      how many barrels you can bring to bear — the size of a broadside
//   GUNNERY   how well the crew lays them — the chance each gun hits, and the chance one rakes
//   HULL      what you can take — one more plank for every level
//   THE SHIP  your boat level, the five sailing tracks — a bigger hull is a better gun platform, so it lifts
//             everything a little rather than being the whole answer
//   AMMUNITION what you loaded, which is a real choice with a real cost (see AMMO)
//
// Sea affinity still applies: Broadside is damage, Ironclad is damage taken. Those are gear effects that belong
// to the sailing layer and always did.
//
// This file is PURE — no database, no imports with side effects — so the maths can be reasoned about and
// exercised on its own. Everything that touches a row lives in sailing.js.
//
// WHERE a shot is aimed lives next door in ship-zones.js, which is pure in the same way and measured off the
// art. This file decides what happens when it arrives.

import { zoneById } from "@/lib/marketplace/ship-zones.js";

// ── AMMUNITION ───────────────────────────────────────────────────────────────────────────────────────────────
// Round shot is unlocked forever and never runs out, so nobody is ever unable to fight. The others are stock
// you buy with doubloons and spend one of PER GUN — the reason the currency keeps mattering after the gun deck
// is full. Prices are per BALL accordingly: a seven-gun broadside of shells is 42 doubloons, which is meant to
// be a decision rather than a habit. Guns you did not lay individually fire round shot, so the bill is always
// something you chose.
//
// Each type is a real trade, not a strictly-better ladder — and now each one is also a shot you point at a
// particular PART of a ship, so what it is good against matters as much as what it does:
//   round     the honest default — nothing special, nothing wasted
//   chain     tumbles through canvas: the shot for sails, and next to useless in the hold
//   grape     sweeps a deck: the round for dismounting a cannon
//   explosive heavy and inaccurate, and the only round that staves in two planks at once
//
// `sys` is the extra damage the shot does to the SYSTEM it lands on, over the one point every hit does. That is
// where a loaded rack earns its price now: chain does not out-damage round shot, it out-WRECKS it, in the one
// place you chose to put it.
export const AMMO = {
    round: {
        id: "round", name: "Round Shot", basic: true, price: 0,
        icon: "GiCannonBall", blurb: "Solid iron, and you never run out.",
        accuracy: 0, rakeBonus: 0, sys: {}, hull: 0,
    },
    chain: {
        id: "chain", name: "Chain Shot", basic: false, price: 3,
        icon: "GiChainedHeart", blurb: "Shreds canvas — takes a whole suit of sails at once.",
        // Light against timber: it is rigging shot, and putting it into a hull is a wasted round.
        accuracy: 0.05, rakeBonus: 0, sys: { sails: 2 }, hull: 0,
    },
    grape: {
        id: "grape", name: "Grapeshot", basic: false, price: 3,
        icon: "GiCannonShot", blurb: "Sweeps a deck — dismounts cannons twice as fast.",
        accuracy: 0.12, rakeBonus: 0.08, sys: { guns: 1 }, hull: 0,   // counts double on a gun deck
    },
    explosive: {
        id: "explosive", name: "Explosive Shell", basic: false, price: 6,
        icon: "GiBurningEmbers", blurb: "Wild off the muzzle, but it staves in two planks at once.",
        // The only round that staves in TWO planks at once.
        //
        // ITS PRICE WAS -0.14 ACCURACY, WHICH BOUGHT DOUBLE DAMAGE. Simulating the whole fleet ladder four
        // hundred fights a rung showed the four hardest rungs by a wide margin were exactly the four ships
        // that load this shell — Bitterhold (7), the Black Tithe (10), Cannonade (13) and the Sovereign (15)
        // — while rank 14, which loads round shot, was easier than rank 13. Ammunition, not rank, was
        // deciding the difficulty of a designed ladder. At -0.28 the shell is still
        // the only thing that takes two planks, but you pay for it.
        accuracy: -0.28, rakeBonus: 0.05, sys: {}, hull: 1,
    },
};
// `dmg` used to sit on every entry above. It has meant nothing since a hull stopped being a pool of hit points
// and became a count of planks: the resolver works in whole planks (1 + ammo.hull + a rake), and nothing has
// read the field since. Removed rather than left lying there looking like a balance lever.
export const AMMO_LIST = Object.values(AMMO);
export const ammoById = (id) => AMMO[String(id || "round")] || AMMO.round;

// ── THE GUN DECK ─────────────────────────────────────────────────────────────────────────────────────────────
// Tracks are capped low and deliberately cheap-feeling per level: the interesting decision is meant to be what
// you LOAD, not how many times you tapped Upgrade.
export const COMBAT_TRACKS = {
    // FIVE LEVELS on top of the two you start with, so gunsFor still caps at SEVEN barrels. Nine will not fit on
    // the narrower hulls — the placement tool ran out of rail before it ran out of guns. A cap you can
    // actually draw beats a number that only exists in the HUD.
    guns: { key: "guns", col: "gun_level", max: 5, name: "Cannons", icon: "GiCannon",
        desc: "More barrels in the broadside — every gun is another roll to hit." },
    // SAY WHAT A RAKE IS. This card sold "more raking hits" to anyone who had never heard the word — the one
    // screen where the term is bought is the one place it has to be explained.
    gunnery: { key: "gunnery", col: "gunnery_level", max: 8, name: "Gunnery", icon: "GiTargeting",
        desc: "A drilled crew lays the guns truer, and rakes more often — a ball down the length of her deck instead of into her side, for nearly double damage." },
    hull: { key: "hull", col: "hull_level", max: 8, name: "Hull", icon: "GiShipWheel",
        desc: "More oak in her sides — one more plank to shoot away for every level." },
};

// Guns in a broadside. TWO, plus one per level of the Cannons track. Nothing else.
//
// It started at ONE and that was measured unplayable: a single gun cannot sink even the first pirate on the
// ladder inside the round limit, so the opening fight of the feature was arithmetic nobody could win. The cap
// is still SEVEN — the most barrels a hull can be drawn carrying — so the track gave up a level instead.
//
// This started at 3 and also handed out a free gun per six boat levels, which meant a level-37 captain who had
// never touched the Cannons track sailed with SEVEN guns — the headline upgrade of the whole feature was
// decoration on top of something you got for playing other parts of the game. Every rival in the list showed
// "3 guns" for the same reason, and none of them had bought a single one.
//
// The boat still matters, just not here: hull points and accuracy both scale with boat level (below). The boat
// is the platform; the guns are the thing you decided to buy, and now they are the only thing you can point at
// on your own deck and count.
export const gunsFor = (gunLevel = 0) =>
    2 + Math.max(0, Math.min(COMBAT_TRACKS.guns.max, gunLevel));

// Chance a single gun hits, before the part of the ship it is aimed at and before the target's own handling.
// Gunnery is the lever; the boat contributes a little steadiness.
//
// The base sits higher than the old 0.55 because a shot is now laid at a PLACE: the zone's own difficulty and
// the target's evasion both come off this number afterwards (see hitChance), and tuning those in without
// lifting the base would have quietly made every gun in the game worse than it was the day before.
export const accuracyFor = (gunneryLevel = 0, boatLevel = 1) =>
    Math.min(0.96, 0.70 + Math.max(0, gunneryLevel) * 0.035 + Math.max(0, boatLevel - 1) * 0.004);

// A RAKING hit — a ball down the length of the deck. The critical of this system.
export const rakeFor = (gunneryLevel = 0) => Math.min(0.35, 0.06 + Math.max(0, gunneryLevel) * 0.025);

// Hull integrity. Flat base + hull track + the boat you built, so a big trader can survive a gunboat that has
// bought more cannon than it can carry.
// YOUR BOAT IS YOUR HULL. It used to be a flat 120 with boat level worth +4 a level — so the boat you had
// spent weeks levelling was a footnote next to a number everyone got for free, and a level-37 captain sailed
// with 264 hit points against a level-1's 120. Boat level is the BASE now (+9 a level) and the Hull track is
// what you buy on top, which is the shape the two things actually have: the boat is how much ship there is,
// the track is how much more of it there is.
// A HULL IS COUNTED IN HITS, like her canvas and her guns.
//
// It used to be hit points — 90 + 9 a boat level + 26 a hull level, so 419 at level 25 — and the whole fight
// was one bar draining by numbers nobody could hold in their head. Every other part of a ship was already
// counted in HITS: six for a suit of sails, four for a cannon. The hull is planks, and planks stave in one at
// a time, so it is counted the same way.
//
// Ten planks to start and one more per level of the Hull track: 10 at the beginning, 18 fully plated. BOAT
// LEVEL NO LONGER TOUCHES IT — a bigger ship is not a tougher one, it carries more guns. That was the change
// that made hull the only stat that scaled and quietly turned late fights into slugging matches.
/**
 * THE SAVED-BATTLE FORMAT VERSION, in ONE place.
 *
 * It was written out in two: the opener said one number and the resolver said another, hardcoded. So long as
 * both happened to say 3 nothing showed. The moment the hull moved from hit points to planks and the opener
 * went to 4, a fight opened at v4, loaded, fired one volley — and the resolver stamped the write-back v3, so
 * the NEXT load was rejected and the FIRE button silently did nothing from round two onward. Two literals for
 * one fact is the whole bug; there is now one.
 *
 * Bump this only when the shape or the UNITS of the state change, and readBattle in sailing.js will drop
 * anything older rather than render it.
 */
export const BATTLE_STATE_V = 4;

export const HULL_BASE_HITS = 10;
export const hullHitsFor = (hullLevel = 0) => HULL_BASE_HITS + Math.max(0, hullLevel);

// ── HOW HEAVY A SHIP IS, AT A GLANCE ─────────────────────────────────────────────────────────────────────────
// Five grades with their own art, so a ship's hull is something you SEE on the row rather than a number you
// have to hold two of and compare. Thresholds sit on the fleet's own spine — grade 3 is roughly where the
// mid-fleet lives, grade 5 is flagship weight.
// Read off PLANKS now: 10 bare, 18 fully plated, so the bands are two apart rather than a hundred and fifty.
export const HULL_GRADES = [
    { grade: 1, name: "Timber", max: 11, blurb: "Bare planking. It floats." },
    { grade: 2, name: "Reinforced", max: 13, blurb: "Doubled frames and a strake of oak." },
    { grade: 3, name: "Iron-bound", max: 15, blurb: "Iron banding at the waterline." },
    { grade: 4, name: "Plated", max: 17, blurb: "Plate over oak. Shot bounces." },
    { grade: 5, name: "Ironclad", max: Infinity, blurb: "A fortress that happens to float." },
];
export const hullGrade = (hits = 0) => HULL_GRADES.find((g) => hits <= g.max) || HULL_GRADES[HULL_GRADES.length - 1];



// WHAT THIS SHOT WOULD DO, on average, before the dice.
//
// The same arithmetic resolveVolley runs, with the roll replaced by its mean — exported so the aiming screen
// predicts with the engine's formula rather than a second copy that can drift. This exists so the read-out
// can put a damage number next to the hit chance: change the ammunition and BOTH move, which is how a player
// discovers what each round is for by watching the numbers move. Nothing has to say so in words.
// ── THE RECKONING ────────────────────────────────────────────────────────────────────────────────────────────
// Every ball of yours that goes wide is counted, and at RECKONING_AT the crew stop taking it. Spending it
// fires one unanswered volley: every gun still on your deck, every ball lands, each one at a part of her ship
// chosen at random — canvas, timber, or a barrel of hers.
//
// It is built out of MISSES on purpose. A run of bad luck is the least interesting thing that can happen in a
// fight; this turns the worst stretch of a battle into the thing that pays for the best moment in it, without
// touching the odds themselves. It cannot be farmed either — the only way to fill it is to be missing, which
// is already costing you the round.
//
// Random targeting is the honest price. It is free damage, so you do not also get to choose where it goes;
// what you get is a broadside that cannot miss, and the chance it takes a gun off her while it is there.
// FOUR, MEASURED. Simulating the ladder, a whole fight accumulates 4.2 misses at the bottom and 5.0 at the
// top across 2.5-3.6 rounds — so the eight it was first written at would have meant a skill nobody ever saw
// fire. At four it lands roughly once a fight, later in the ones you are missing in, which is the point.
export const RECKONING_AT = 4;
export const RECKONING_NAME = "Reckoning";

/** Somewhere on her ship worth a ball: canvas while she has any, a live gun, or timber. */
function reckoningTarget(defSide, rng) {
    const picks = [];
    if (defSide.sails > 0) picks.push({ zone: "sails", target: null });
    defSide.guns.forEach((hp, i) => { if (hp > 0) picks.push({ zone: "guns", target: i }); });
    // Timber three times. Weighted, because with a full battery of hers alive the unweighted draw sent almost
    // every ball into her gun deck and the payoff for eight misses read as a system wipe with no damage on it.
    picks.push({ zone: "hull", target: null }, { zone: "hull", target: null }, { zone: "hull", target: null });
    return picks[Math.floor(rng() * picks.length)] || { zone: "hull", target: null };
}

export function expectedDamage(att, def, zone, ammo) {
    if (!zone || !ammo) return 0;
    // Only timber is counted in planks; a shot into canvas or a gun deck is measured by what it WRECKS, which
    // the marker already shows, so the read-out reports zero hull damage for it rather than a misleading one.
    if (zone.sys) return 0;
    const raw = 1 + (ammo.hull || 0) + (att?.rake || 0);              // rake is a chance, so it averages in
    return Math.max(0, Math.round(raw * (def?.dmgTaken ?? 1) * 10) / 10);
}

// ── THE TWO THINGS THAT ARE NOT HIT POINTS ───────────────────────────────────────────────────────────────────
// Canvas and the guns themselves each have a small pool, and taking one changes how the REST of the fight goes
// rather than only moving a bar — which is the whole reason to aim anywhere other than the hull.
//
// There were briefly two more (a rudder and a powder store) and both are gone: nobody could say in one line
// what a rudder did, and a magazine that ends a fight on one lucky ball is a coin toss wearing a target.
export const SAILS_MAX = 6;      // hits to strip her canvas. Chain takes two at a time, so three volleys of it.
export const GUN_HP = 2;         // hits to dismount one cannon. Grape counts double.
//
// GUN_HP WAS 4, and went back to 2 when cannons became things you upgrade individually. Four was chosen when
// every barrel on every ship was identical and a gun deck was just a number: at two hits, concentrating a
// whole broadside dismounted one or two guns a round, which is a switch rather than a decision. What makes
// two workable now is that it is a FLOOR you build off — a gun you have put hits into is genuinely harder to
// take than the one beside it, so shooting a gun deck is a read of which barrel is worth the balls.

// ── ONE CANNON AT A TIME ─────────────────────────────────────────────────────────────────────────────────────
// Three things you can buy for a single gun, on the gun. The Cannons track buys you MORE barrels; this is how
// one barrel becomes better than the one next to it — and it is what makes "which gun fires at what" a real
// question rather than a formality, because the guns are no longer interchangeable.
//
// Damage is a CHANCE of an extra plank rather than a fraction of one. A hull is counted in whole planks, so
// "+15% damage" would round to nothing on most shots; a one-in-six chance of taking two boards is the same
// expectation and you can actually see it happen.
export const GUN_TRACKS = {
    hp: {
        key: "hp", name: "Iron", max: 4, icon: "GiUpgrade",
        desc: "Bolts and bracing — one more hit before this gun is dismounted.",
        effect: (lvl) => `${GUN_HP + lvl} hits to dismount`,
    },
    dmg: {
        key: "dmg", name: "Bore", max: 4, icon: "GiCannon",
        desc: "A wider bore throws a heavier ball — a chance this gun staves in two planks instead of one.",
        effect: (lvl) => `${Math.round(gunDmgChance(lvl) * 100)}% for a second plank`,
    },
    acc: {
        key: "acc", name: "Lay", max: 4, icon: "GiTargeting",
        desc: "Truer trunnions and a marked quoin — this barrel lays closer than the rest of the battery.",
        effect: (lvl) => `+${Math.round(gunAccBonus(lvl) * 100)}% to hit`,
    },
};
export const gunHpFor = (hpLevel = 0) => GUN_HP + Math.max(0, Math.min(GUN_TRACKS.hp.max, hpLevel));
export const gunDmgChance = (dmgLevel = 0) => Math.max(0, Math.min(GUN_TRACKS.dmg.max, dmgLevel)) * 0.09;
export const gunAccBonus = (accLevel = 0) => Math.max(0, Math.min(GUN_TRACKS.acc.max, accLevel)) * 0.025;

/** A gun's upgrade levels, defaulted — an unbought gun has no row and reads as all zeroes. */
export const gunStat = (stats, i) => (Array.isArray(stats) ? stats[i] : null) || { hp: 0, dmg: 0, acc: 0 };

// What one more level on one gun costs. Deliberately cheaper than a whole-ship track: you are buying it for
// ONE barrel, and you will want several.
export const gunUpgradeCost = (level = 0) => Math.round(18 * Math.pow(1.85, Math.max(0, level)));

// ── A GUN YOU HAVE BUILT LOOKS BUILT ─────────────────────────────────────────────────────────────────────────
// Twelve levels of iron, bore and lay used to leave a barrel looking exactly like the one beside it that had
// none, which makes the whole point of per-gun upgrades invisible everywhere except a number. One new sprite
// every four levels spent across its three tracks: plain iron, then banded, then heavy brass, then a
// masterwork with a wolf's head at the muzzle. Four stages over a twelve-level ceiling.
export const GUN_ART_STAGES = 4;
export const gunStage = (lv) => {
    const spent = Math.max(0, (lv?.hp || 0) + (lv?.dmg || 0) + (lv?.acc || 0));
    return Math.min(GUN_ART_STAGES, 1 + Math.floor(spent / 4));
};
export const gunArt = (lv) => `/images/sailing/gun/cannon-${gunStage(lv)}.png`;

// Build the combat profile a ship brings to a battle. `sea` is the sailing affinity block (broadside/ironclad).
// AMMUNITION IS NO LONGER PART OF THE PROFILE. It used to be baked in here — one type for the whole battle, its
// accuracy folded into the ship's — because a broadside was one undifferentiated event. Every gun is laid
// separately now and may carry a different round, so ammunition belongs to the SHOT (see resolveVolley) and the
// `ammo` kept here is only what the racks default to.
export function shipProfile({ name, boatLevel = 1, gunLevel = 0, gunneryLevel = 0, hullLevel = 0,
                              ammo = "round", art = null, sea = null, flavor = null, gunStats = null } = {}) {
    return {
        name: name || "Ship",
        art,
        flavor,
        boatLevel,
        guns: gunsFor(gunLevel),
        // Per-barrel upgrade levels, indexed by the gun's place in the broadside. Null everywhere else — a
        // fleet ship's guns are all the same, which is part of what makes yours worth building.
        gunStats: Array.isArray(gunStats) ? gunStats : null,
        accuracy: accuracyFor(gunneryLevel, boatLevel),
        rake: rakeFor(gunneryLevel),
        hp: hullHitsFor(hullLevel),
        ammo: ammoById(ammo),
        // Broadside adds damage, Ironclad takes it off what lands. Both are sea affinity, unchanged.
        dmgMult: 1 + (Number(sea?.broadside) || 0) / 100,
        dmgTaken: Math.max(0.5, 1 - (Number(sea?.ironclad) || 0) / 100),
    };
}

// An enemy from the fleet catalog → the same profile shape, built from designed numbers rather than tracks.
export function foeProfile(foe) {
    return {
        name: foe?.name || "Pirate ship",
        art: foe?.art || null,
        flavor: foe?.flavor || null,
        boatLevel: foe?.rank || 1,
        guns: foe?.guns || 4,
        accuracy: Math.min(0.96, (foe?.accuracy ?? 0.6) + 0.1),
        rake: foe?.rake ?? 0.08,
        // PLANKS, NOT HIT POINTS. The fleet catalogue still carries designed hp values (78 at rank 1 up past
        // 600) from when a hull was a bar; a ship is counted in planks now, so the ladder is derived from its
        // RANK instead — 6 at the bottom, 20 at the top, against a player who runs 10 bare and 18 plated.
        // A rival captain arrives with `hits` already worked out from their own Hull track.
        hp: foe?.hits ?? (foe?.rank ? Math.max(5, Math.min(22, 5 + Number(foe.rank))) : 10),
        ammo: ammoById(foe?.ammo || "round"),
        dmgMult: 1,
        dmgTaken: 1,
    };
}


// ── AIMING: THE PART YOU ACTUALLY PLAY ───────────────────────────────────────────────────────────────────────
// This started as one order a round — broadside, rake, hole her, board — chosen off four cards under the ships.
// It worked, and it was still one decision per round no matter what you had bought.
//
// Now you pick a PLACE. Tap her sails, her hull, or one particular cannon; load something other than round shot
// if it suits; fire. The whole broadside goes where you pointed it. Three targets, one tap, and the trade
// between them is legible from the hit percentage on each marker (see ship-zones.js for what each one does).
//
// It briefly went further than this — a target per GUN, plus crews you could send below to pump and repair —
// and that was too much: your cannons are on YOUR ship, so laying each one individually is bookkeeping, not
// aiming. One volley, one place.

// ── HOW HARD SHE IS TO HIT ───────────────────────────────────────────────────────────────────────────────────
// Evasion is the reason to shoot at canvas. A ship under full sail is genuinely awkward to lay a gun on; one
// with her sails in rags is a target sitting still. This is the payoff for a shot that did almost no damage —
// it makes every shot after it better, which is the only "setup" move in the fight and the whole reason the
// three targets are a decision rather than a menu.
//
// NOTHING TICKS. Leaks, fires and the crews that fought them are gone: damage over time meant the number on
// the bar moved for reasons you did not do and could not watch, and repairing meant spending a gun on
// undoing rather than on doing. A hit hurts when it lands, and that is all.
export const BASE_EVADE = 0.04;
export const evasionOf = (sails = SAILS_MAX) =>
    BASE_EVADE + 0.2 * (Math.max(0, sails) / SAILS_MAX);

/** One gun's chance to land on one part of one ship. Everything that decides a shot is in this line, and the
 *  scene shows the result of it on every target marker — that percentage IS the explanation of the trade. */
export function hitChance(att, zone, ammo, evasion, gunIndex = null) {
    // A barrel with Lay on it is truer than the battery average, so the odds on the marker have to know
    // WHICH gun is about to fire — otherwise the number you are shown is not the number you are rolling.
    const lay = gunIndex == null ? 0 : gunAccBonus(gunStat(att?.gunStats, gunIndex).acc);
    const base = Math.max(0.15, Math.min(0.97, (att?.accuracy || 0.6) + (ammo?.accuracy || 0) + lay));
    return Math.max(0.05, Math.min(0.97, base * (zone?.aim ?? 1) * (1 - evasion)));
}

const gunsReady = (s) => s.guns.reduce((n, hp) => n + (hp > 0 ? 1 : 0), 0);
const hpPair = (st) => ({ me: st.me.hp, foe: st.foe.hp });

// The opening state of a fight. Kept JSON-safe: it is stored on the sailing row between rounds.
export function initBattleState(me, foe) {
    const fresh = (p) => {
        const n = Math.max(1, p.guns);
        const guns = Array.from({ length: n }, (_, i) => gunHpFor(gunStat(p.gunStats, i).hp));
        return {
            hp: p.hp, max: p.hp, sails: SAILS_MAX,
            guns,
            // Each gun's own ceiling, so the scene can draw "1 of 3" on a gun you have put iron into and
            // "1 of 2" on the one beside it. Without this every gun's bar would be read against GUN_HP.
            gunMax: [...guns],
            // MISSES REMEMBERED. Every ball of yours that goes wide winds this up; at RECKONING_AT it is spent
            // as one free, unanswered volley. See resolveVolley.
            reck: 0,
        };
    };
    // YOU ALWAYS FIRE FIRST. This used to be a coin weighted by who carried fewer guns, and roughly half of
    // all battles therefore answered the FIRE button by playing HER broadside — you pressed fire and watched
    // the enemy shoot. Worse, the recap lists YOU above THEM whatever happened, so those fights showed you an
    // order that contradicted the one you had just watched, which is exactly what "they shot twice in a row"
    // looks like from the outside.
    //
    // `gauge` is kept on the state rather than deleted: it is a saved shape, the view sends it, and the
    // resolver still branches on it, so a battle saved before this keeps resolving in the order it started
    // with instead of being thrown away.
    //
    // v4: `hp` counts PLANKS now, not hit points. A v3 state carries 419 in that field and would be read as
    // four hundred planks, so those battles are dropped rather than migrated.
    return { v: BATTLE_STATE_V, round: 0, gauge: "me", me: fresh(me), foe: fresh(foe) };
}

// ── SPENDING THE RECKONING ───────────────────────────────────────────────────────────────────────────────────
// One volley, every gun still standing, every ball lands, each at a part of her ship picked at random. She
// does not answer it — that is what makes it worth eight misses — and the round counter does not move, so it
// is genuinely extra rather than a turn you spent.
//
// Same event shape as a normal volley so the scene animates it with the machinery it already has; the volley
// event is flagged `reckoning` so the presentation can make an occasion of it.
export function resolveReckoning(me, foe, state, { rng = Math.random } = {}) {
    const st = {
        v: BATTLE_STATE_V, round: state.round, gauge: state.gauge,
        me: { ...state.me, guns: [...state.me.guns], gunMax: [...(state.me.gunMax || state.me.guns)] },
        foe: { ...state.foe, guns: [...state.foe.guns], gunMax: [...(state.foe.gunMax || state.foe.guns)] },
    };
    if ((st.me.reck || 0) < RECKONING_AT) return { ok: false, error: "not_ready", state: st, events: [] };
    st.me.reck = 0;

    const events = [];
    const after = [];
    const shots = [];
    let total = 0;
    const live = st.me.guns.map((hp, i) => (hp > 0 ? i : -1)).filter((i) => i >= 0);

    for (const gun of live) {
        if (st.foe.hp <= 0) break;
        const aim = reckoningTarget(st.foe, rng);
        const zone = zoneById(aim.zone);
        const shot = { gun, zone: aim.zone, target: aim.target, ammo: "round", hit: true, chance: 1, evasion: 0, rake: false, reckoning: true };

        if (aim.zone === "hull") {
            const bore = rng() < gunDmgChance(gunStat(me?.gunStats, gun).dmg);
            const hits = 1 + (bore ? 1 : 0);
            const landed = (st.foe.dmgTaken < 1 && rng() > st.foe.dmgTaken) ? Math.max(0, hits - 1) : hits;
            st.foe.hp = Math.max(0, st.foe.hp - landed);
            shot.dmg = landed; shot.hits = landed; shot.bore = bore;
            total += landed;
        } else if (aim.zone === "sails") {
            shot.dmg = 0; shot.hits = 0;
            if (st.foe.sails > 0) {
                st.foe.sails = Math.max(0, st.foe.sails - 1);
                shot.wrecked = "sails";
                if (st.foe.sails === 0) after.push({ type: "wreck", victim: "foe", sys: "sails" });
            }
        } else {
            shot.dmg = 0; shot.hits = 0;
            const pick = aim.target;
            if (pick != null && st.foe.guns[pick] > 0) {
                st.foe.guns[pick] = Math.max(0, st.foe.guns[pick] - 1);
                shot.wrecked = "guns"; shot.target = pick;
                if (st.foe.guns[pick] === 0) after.push({ type: "wreck", victim: "foe", sys: "guns", index: pick });
            }
        }
        shots.push(shot);
    }

    events.push({ type: "volley", side: "me", shots, dmg: total, guns: shots.length, hp: hpPair(st), reckoning: true });
    for (const ev of after) events.push({ ...ev, hp: hpPair(st) });

    const sunk = st.foe.hp <= 0 ? "foe" : null;
    const over = Boolean(sunk);
    return { ok: true, events, state: st, over, win: over, sunk, stalemate: false, mine: [], theirs: [] };
}

// ── WHAT THE CLIENT IS ALLOWED TO HAVE ASKED FOR ─────────────────────────────────────────────────────────────
// One aim per volley: a part, optionally a particular cannon, and what is loaded. The server re-derives every
// field — a zone this hull does not have, a cannon that is already wreckage, ammunition that is not in the
// racks. None of that is a rejection, it is a correction: a fight that refuses to resolve because one field was
// stale is a worse outcome than a volley that went somewhere ordinary.
function oneAim(st, who, raw, { zonesAllowed = null, ammoAvailable = null } = {}) {
    const them = who === "me" ? st.foe : st.me;
    let zone = String(raw?.zone || "hull");
    if (!["sails", "hull", "guns"].includes(zone)) zone = "hull";
    if (zonesAllowed && !zonesAllowed.includes(zone)) zone = "hull";
    // Canvas already in rags is not a target — it would be a shot spent on nothing at all.
    if (zone === "sails" && them.sails <= 0) zone = "hull";
    let target = null;
    if (zone === "guns") {
        const up = them.guns.map((hp, k) => (hp > 0 ? k : -1)).filter((k) => k >= 0);
        if (!up.length) zone = "hull";
        else target = up.includes(Number(raw?.target)) ? Number(raw.target) : up[0];
    }
    let ammo = String(raw?.ammo || "round");
    if (ammoAvailable && !ammoAvailable(ammo)) ammo = "round";
    return { zone, target, ammo };
}

/**
 * EVERY GUN GETS ITS OWN ORDER. Nothing is assigned for you.
 *
 * There was briefly a "followers" rule — guns you had not laid tagged along with the first target you picked,
 * so pointing the whole broadside somewhere stayed a single tap. It was the wrong trade: it meant a tap did
 * something to five other guns, and the deck kept committing itself to one place, which is the exact thing
 * splitting the broadside exists to stop. A gun fires where you sent it or it does not fire.
 *
 * Ammunition is per gun, so an order carries its own round too.
 */
export function sanitizeAims(st, who, list, opts = {}) {
    const s = who === "me" ? st.me : st.foe;
    const live = s.guns.map((hp, i) => (hp > 0 ? i : -1)).filter((i) => i >= 0);
    if (!live.length) return [];

    // ONE ORDER, NOT A LIST, is what an older client sends — and for a week it was the only shape there was.
    // Dropping it on the floor made a volley where NOTHING fired: no balls, no damage, no reason on screen.
    // A client that has not been reloaded still gets the fight it asked for, aimed the way it asked for it.
    const orders = Array.isArray(list) ? list
        : (list && typeof list === "object") ? live.map((gun) => ({ ...list, gun }))
        : [];

    const byGun = new Map();
    for (const raw of orders) {
        const gun = Number(raw?.gun);
        if (!live.includes(gun) || byGun.has(gun)) continue;
        byGun.set(gun, { gun, ...oneAim(st, who, raw, opts) });
    }

    // A BROADSIDE THAT FIRES NOTHING IS ALWAYS A BUG, never an outcome. Whatever arrived — a stale shape, gun
    // numbers from a fight that has moved on, an empty array — a ship with guns loosed off SOMETHING. Round
    // shot at the hull is the honest default: it costs nothing, so a fallback can never spend a rack.
    if (!byGun.size) return live.map((gun) => ({ gun, ...oneAim(st, who, {}, {}) }));

    // Kept in gun order rather than tap order so the volley reads down the deck as it plays.
    return live.filter((g) => byGun.has(g)).map((g) => byGun.get(g));
}

// ── WHAT THE ENEMY DOES ──────────────────────────────────────────────────────────────────────────────────────
// Deliberately readable rather than clever: cut your canvas early while it is worth cutting, break up a gun
// deck that outnumbers theirs, and otherwise put iron into the hull. A foe whose shots have a visible reason is
// one you can plan against.
export function foeAims(me, foe, st, { rng = Math.random } = {}) {
    const mine = st.me, theirs = st.foe;
    const ammo = foe.ammo?.id || "round";
    const live = theirs.guns.map((hp, i) => (hp > 0 ? i : -1)).filter((i) => i >= 0);
    const myGunsUp = gunsReady(mine);

    // THEY SPLIT THEIR BROADSIDE TOO, or the player would be the only captain on the water who can. Most of it
    // goes into the hull; a couple of guns peel off for canvas while there is plenty of it, and a big deck
    // spares one or two to break up a bigger one. Rolled per gun, so their volley reads differently each round
    // without ever being incoherent — you can see what they went for on your own ship afterwards.
    let sailsTaken = 0, gunsTaken = 0;
    return live.map((gun) => {
        const r = rng();
        if (mine.sails > SAILS_MAX / 2 && sailsTaken < 2 && r < 0.3) {
            sailsTaken += 1;
            return { gun, zone: "sails", target: null, ammo };
        }
        if (myGunsUp >= 4 && myGunsUp >= live.length && gunsTaken < 2 && r < 0.5) {
            gunsTaken += 1;
            const up = mine.guns.map((hp, k) => (hp > 0 ? k : -1)).filter((k) => k >= 0);
            return { gun, zone: "guns", target: up[Math.floor(rng() * up.length)] ?? null, ammo };
        }
        return { gun, zone: "hull", target: null, ammo };
    });
}

// ── ONE ROUND ────────────────────────────────────────────────────────────────────────────────────────────────
// Both broadsides go off in weather-gauge order, each at the one part its captain chose. Pure — the caller
// persists whatever comes back — and `rng` is injectable so a fight can be replayed exactly in the lab.
export function resolveVolley(me, foe, state, aims, { rng = Math.random, foeOrders = null } = {}) {
    const st = {
        v: BATTLE_STATE_V, round: state.round, gauge: state.gauge,
        me: { ...state.me, guns: [...state.me.guns], gunMax: [...(state.me.gunMax || state.me.guns)] },
        foe: { ...state.foe, guns: [...state.foe.guns], gunMax: [...(state.foe.gunMax || state.foe.guns)] },
    };
    const events = [];
    st.round += 1;

    const mine = sanitizeAims(st, "me", aims);
    // HER ORDERS MAY ALREADY BE WRITTEN. She now lays her guns when the round OPENS rather than when it
    // resolves, so the player can see what she is training on before committing their own broadside — that is
    // the whole decision the fight was missing. Rolling here is the fallback for a battle saved before this
    // existed, and for any caller that does not plan ahead; the arithmetic is identical either way.
    const theirs = Array.isArray(foeOrders) && foeOrders.length
        ? sanitizeAims(st, "foe", foeOrders)
        : foeAims(me, foe, st, { rng });

    const fire = (who, orders) => {
        const att = who === "me" ? me : foe;
        const def = who === "me" ? foe : me;
        const mySide = who === "me" ? st.me : st.foe;
        const theirSide = who === "me" ? st.foe : st.me;
        if (mySide.hp <= 0 || theirSide.hp <= 0) return;

        // Evasion is read ONCE for the volley, not per gun: every ball in a broadside leaves while she is
        // still under the sail she had when it started. Shredding her canvas pays off from the NEXT round.
        const evasion = evasionOf(theirSide.sails);

        const shots = [];
        let total = 0;
        const after = [];
        for (const order of orders) {
            const gun = order.gun;
            const zone = zoneById(order.zone);
            const ammo = ammoById(order.ammo);
            // EVERY SHOT CARRIES ITS OWN ODDS, hit or miss. Without this a miss is just a miss, and the
            // player cannot tell a 90% shot they got unlucky on from a 35% shot they should never have taken
            // — which is the difference between bad luck and a bad decision, and the whole of learning to
            // play. The number is already computed to roll against; it just used to be thrown away.
            const chance = hitChance(att, zone, ammo, evasion, gun);
            if (rng() > chance) {
                // A BALL THAT GOES WIDE IS NOT NOTHING. It winds the Reckoning — see RECKONING_AT.
                mySide.reck = Math.min(RECKONING_AT, (mySide.reck || 0) + 1);
                shots.push({ gun, zone: order.zone, target: order.target, ammo: ammo.id, hit: false, chance, evasion });
                continue;
            }
            const rake = rng() < (att.rake + (ammo.rakeBonus || 0));

            // HOW MANY PLANKS THIS BALL STAVES IN.
            //
            // One, because it landed. One more if the round is built for timber (explosive). One more again
            // for a rake — a ball down the length of her deck instead of into her side, which used to be a
            // 1.8x on a damage number and is now the extra plank it always meant.
            //
            // NO ARMOUR. Every ball that lands, lands. Plate used to sit here as a per-hit glance roll — a
            // shot could be turned aside and count for nothing — which meant a hit you had already earned
            // could silently do nothing, on a stat that was a percentage on a card. A hit is a plank.
            // ...and one more again if this particular barrel is bored wide enough to throw a heavier ball.
            const bore = rng() < gunDmgChance(gunStat(att?.gunStats, gun).dmg);
            const hits = 1 + (ammo.hull || 0) + (rake ? 1 : 0) + (bore ? 1 : 0);
            const turned = 0;
            // Sea affinity's Ironclad is left alone: it is a gear effect you go and earn, not a stat every
            // hull carries for free, and it is the one thing still able to shrug a ball.
            const shrugged = def.dmgTaken < 1 && rng() > def.dmgTaken;
            const rolled = shrugged ? Math.max(0, hits - 1) : hits;

            // TIMBER ONLY. This used to run for EVERY zone: a ball aimed at a cannon dismounted the cannon AND
            // staved in planks, and a ball into her canvas did the same. So the two "system" shots were doing
            // their own job plus the hull's, which made aiming at a gun strictly better than aiming at the
            // hull — while the read-out beside the marker said "~0 dmg", because expectedDamage has always
            // (correctly) reported zero for a system zone. The engine and the number on screen disagreed, and
            // the engine was the wrong one.
            const landed = zone.sys ? 0 : rolled;

            const dmg = landed;   // the event log and the recap both count in planks now
            total += dmg;
            if (landed) theirSide.hp = Math.max(0, theirSide.hp - landed);
            const shot = { gun, zone: order.zone, target: order.target, ammo: ammo.id, hit: true, dmg, hits: landed, glanced: false, rake, bore, chance, evasion };

            // WHAT THE SHOT BROKE, on top of the hole it made. One point for landing, plus whatever this round
            // is especially good at — which is where chain and grape earn their price. Round shot is never
            // wasted, it just does not specialise.
            const bonus = (ammo.sys && ammo.sys[zone.sys]) || 0;
            if (zone.sys === "sails" && theirSide.sails > 0) {
                theirSide.sails = Math.max(0, theirSide.sails - (1 + bonus));
                shot.wrecked = "sails";
                if (theirSide.sails === 0) after.push({ type: "wreck", victim: who === "me" ? "foe" : "me", sys: "sails" });
            } else if (zone.sys === "guns") {
                // ONE CANNON, THE ONE YOU PICKED. Shots used to roll onto the next gun still standing once
                // the target was wreckage, so a single volley could walk down a whole battery — the overflow
                // was worth more than the shot. A ball into a dismounted gun is a ball wasted, which is what
                // makes committing the broadside a real risk.
                const pick = order.target;
                if (pick != null && theirSide.guns[pick] > 0) {
                    theirSide.guns[pick] = Math.max(0, theirSide.guns[pick] - (1 + bonus));
                    shot.wrecked = "guns"; shot.target = pick;
                    if (theirSide.guns[pick] === 0) after.push({ type: "wreck", victim: who === "me" ? "foe" : "me", sys: "guns", index: pick });
                }
            }
            shots.push(shot);
        }

        events.push({
            type: "volley", side: who, shots, dmg: total, guns: orders.length, hp: hpPair(st),
        });
        for (const ev of after) events.push({ ...ev, hp: hpPair(st) });
    };

    // YOU FIRE FIRST. FULL STOP. Setting the gauge to "me" at the opening was not enough: a fight already in
    // progress kept the order it was saved with, so anyone mid-battle when that shipped still watched the
    // enemy answer their own FIRE button. There is no case left where she goes first, so there is no reason
    // to branch on a stored field — `gauge` stays on the state only because it is a saved shape.
    fire("me", mine);
    fire("foe", theirs);

    // IT ENDS WHEN A SHIP GOES DOWN. There used to be a fourteen-round limit and a winner decided on which
    // hull had the greater share of itself left, which is how a fight both captains were still fighting got
    // called a draw and handed to somebody — "broke off and ran after 14 rounds" while both decks still had
    // guns. Two ships in range of each other resolve it.
    //
    // The ONE exception is a fight that cannot resolve: if neither deck has a gun left standing, nothing can
    // happen for the rest of time, so it is called there on the healthier hull. That is a stalemate, not a
    // clock — nobody can die, which is the only case the rule has to cover.
    const sunk = st.foe.hp <= 0 ? "foe" : st.me.hp <= 0 ? "me" : null;
    const gunless = gunsReady(st.me) === 0 && gunsReady(st.foe) === 0;
    const over = Boolean(sunk) || gunless;
    const win = sunk === "foe" || (!sunk && gunless && st.me.hp / st.me.max >= st.foe.hp / st.foe.max);
    return { events, state: st, over, win, sunk, stalemate: !sunk && gunless, mine, theirs };
}

// Kept only so a screen can say how long a fight has run; nothing ends on it any more.
export const MAX_ROUNDS = null;

// ── HOW A MATCHUP WILL ACTUALLY GO ───────────────────────────────────────────────────────────────────────────
// Matchmaking needs one number for "is this a fair fight", and the first version of this was a ratio of guns
// and hull with a couple of exponents on it. It was measured badly wrong at the top: a maxed captain served
// ships this said were a 58% proposition won 93% of them, because the two things that scale hardest with
// investment — GUNNERY and ARMOUR — were not in it at all.
//
// This is the same arithmetic the battle runs, collapsed: how many rounds each side needs to sink the other,
// which is a thing you can reason about. Equal ships give 0.5, and the number means what it says.
export function matchupOdds({ myGuns = 4, myHull = 140, myAcc = 0.7,
                              guns = 4, hull = 140, acc = 0.7 } = {}) {
    // Now in planks a round rather than damage a round — same arithmetic, honest units.
    const myDps = Math.max(0.1, myGuns * myAcc);
    const theirDps = Math.max(0.1, guns * acc);
    const roundsIneed = hull / myDps;
    const roundsTheyNeed = myHull / theirDps;
    return Math.max(0.05, Math.min(0.95, roundsTheyNeed / (roundsIneed + roundsTheyNeed)));
}
