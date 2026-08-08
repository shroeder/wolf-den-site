// ── SHIP-TO-SHIP COMBAT ──────────────────────────────────────────────────────────────────────────────────────
// Raiding used to be two captains trading blows: the numbers came off your EQUIPPED GEAR — the same Might and
// Crit Power that fight the weekly boss — and the ship was scenery. So the way to get better at sailing combat
// was to go and do something else, and the boat you had spent weeks building contributed nothing but a picture.
//
// A battle is between SHIPS now. What decides it:
//   GUNS      how many barrels you can bring to bear — the size of a broadside
//   GUNNERY   how well the crew lays them — the chance each gun hits, and the chance one rakes
//   HULL      what you can take — hit points and the armour that blunts each ball
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
// you buy with doubloons and spend PER SHOT — the reason the currency keeps mattering after the gun deck is
// full. Prices dropped by four when that changed: they were set when a battle spent exactly one round of the
// one type you had loaded, and a seven-gun ship firing shells for twelve rounds would have emptied a purse in
// a single sortie at the old numbers.
//
// Each type is a real trade, not a strictly-better ladder — and now each one is also a shot you point at a
// particular PART of a ship, so what it is good against matters as much as what it does:
//   round     the honest default — nothing special, nothing wasted
//   chain     tumbles through canvas: the shot for sails, and next to useless in the hold
//   grape     sweeps a deck: it dismounts guns and murders a thin hull, and armour stops it dead
//   explosive heavy and inaccurate, it starts fires — and it is what you load if you are aiming at the magazine
//
// `sys` is the extra damage the shot does to the SYSTEM it lands on, over the one point every hit does. That is
// where a loaded rack earns its price now: chain does not out-damage round shot, it out-WRECKS it, in the one
// place you chose to put it.
export const AMMO = {
    round: {
        id: "round", name: "Round Shot", basic: true, price: 0,
        icon: "GiCannonBall", blurb: "Solid iron. No tricks, no waste — and you never run out.",
        dmg: 1, accuracy: 0, armorPierce: 0, rakeBonus: 0, fire: 0, sys: {},
    },
    chain: {
        id: "chain", name: "Chain Shot", basic: false, price: 3,
        icon: "GiChainedHeart", blurb: "Two balls on a chain, tumbling end over end. Aimed at canvas it takes the whole suit of sails.",
        dmg: 0.75, accuracy: 0.05, armorPierce: 0, rakeBonus: 0, fire: 0, sys: { sails: 2, rudder: 1 },
    },
    grape: {
        id: "grape", name: "Grapeshot", basic: false, price: 3,
        icon: "GiCannonShot", blurb: "A bag of small shot that sweeps a gun deck clear. Useless against armour, murder on a crew.",
        dmg: 1.15, accuracy: 0.12, armorPierce: -0.5, rakeBonus: 0.08, fire: 0, sys: { guns: 1 },
    },
    explosive: {
        id: "explosive", name: "Explosive Shell", basic: false, price: 6,
        icon: "GiBurningEmbers", blurb: "A fused shell. Wild off the muzzle — but the one shot you want in their magazine.",
        dmg: 1.45, accuracy: -0.14, armorPierce: 0.35, rakeBonus: 0.05, fire: 0.4, sys: { powder: 1 },
    },
};
export const AMMO_LIST = Object.values(AMMO);
export const ammoById = (id) => AMMO[String(id || "round")] || AMMO.round;

// ── THE GUN DECK ─────────────────────────────────────────────────────────────────────────────────────────────
// Tracks are capped low and deliberately cheap-feeling per level: the interesting decision is meant to be what
// you LOAD, not how many times you tapped Upgrade.
export const COMBAT_TRACKS = {
    // SIX LEVELS, so gunsFor caps at SEVEN barrels. Eight levels meant nine guns, and nine will not fit on
    // the narrower hulls — the placement tool ran out of rail before it ran out of guns. A cap you can
    // actually draw beats a number that only exists in the HUD.
    guns: { key: "guns", col: "gun_level", max: 6, name: "Cannons", icon: "GiCannon",
        desc: "More barrels in the broadside — every gun is another roll to hit." },
    gunnery: { key: "gunnery", col: "gunnery_level", max: 8, name: "Gunnery", icon: "GiTargeting",
        desc: "A drilled crew lays the guns truer — better accuracy, and more raking hits." },
    hull: { key: "hull", col: "hull_level", max: 8, name: "Hull", icon: "GiShipWheel",
        desc: "Oak and iron plate — more hit points, and every ball that lands hurts less." },
};

// Guns in a broadside. ONE, plus one per level of the Cannons track. Nothing else.
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
    1 + Math.max(0, Math.min(COMBAT_TRACKS.guns.max, gunLevel));

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
// the track is how well it is armoured.
export const hullFor = (hullLevel = 0, boatLevel = 1) =>
    90 + Math.max(1, boatLevel) * 9 + Math.max(0, hullLevel) * 26;

// ── HOW HEAVY A SHIP IS, AT A GLANCE ─────────────────────────────────────────────────────────────────────────
// Five grades with their own art, so a ship's hull is something you SEE on the row rather than a number you
// have to hold two of and compare. Thresholds sit on the fleet's own spine — grade 3 is roughly where the
// mid-fleet lives, grade 5 is flagship weight.
export const HULL_GRADES = [
    { grade: 1, name: "Timber", max: 179, blurb: "Bare planking. It floats." },
    { grade: 2, name: "Reinforced", max: 299, blurb: "Doubled frames and a strake of oak." },
    { grade: 3, name: "Iron-bound", max: 449, blurb: "Iron banding at the waterline." },
    { grade: 4, name: "Plated", max: 649, blurb: "Plate over oak. Shot bounces." },
    { grade: 5, name: "Ironclad", max: Infinity, blurb: "A fortress that happens to float." },
];
export const hullGrade = (hp = 0) => HULL_GRADES.find((g) => hp <= g.max) || HULL_GRADES[HULL_GRADES.length - 1];

// Armour: a flat fraction off every ball that lands, before ammunition's piercing is applied.
export const armorFor = (hullLevel = 0) => Math.min(0.4, Math.max(0, hullLevel) * 0.035);

// Damage one ball does before armour. Guns are the count, not the calibre — calibre is the ammunition.
const SHOT_MIN = 5, SHOT_VAR = 9;
// A fire is lit at FIRE_START and burns down by FIRE_DECAY a round. It is a wound that gets better, not a
// second gun deck that never stops firing.
const FIRE_START = 7, FIRE_DECAY = 2;

// ── THE SYSTEMS A SHIP CAN LOSE ──────────────────────────────────────────────────────────────────────────────
// Hull points are not the only thing a ball can take off a ship. Canvas, steering and the guns themselves each
// have their own small pool, and losing one changes how the rest of the fight goes rather than moving you
// closer to zero — which is what makes aiming somewhere other than the hull ever worth doing.
export const SAILS_MAX = 4;      // suits of canvas. Chain shot takes two at a time.
export const RUDDER_MAX = 3;     // hits to unship a rudder. Small pool: it is a hard target to begin with.
export const GUN_HP = 2;         // hits to dismount one cannon. Grape does both at once.

// Build the combat profile a ship brings to a battle. `sea` is the sailing affinity block (broadside/ironclad).
// AMMUNITION IS NO LONGER PART OF THE PROFILE. It used to be baked in here — one type for the whole battle, its
// accuracy folded into the ship's — because a broadside was one undifferentiated event. Every gun is laid
// separately now and may carry a different round, so ammunition belongs to the SHOT (see resolveVolley) and the
// `ammo` kept here is only what the racks default to.
export function shipProfile({ name, boatLevel = 1, gunLevel = 0, gunneryLevel = 0, hullLevel = 0,
                              ammo = "round", art = null, sea = null, flavor = null } = {}) {
    return {
        name: name || "Ship",
        art,
        flavor,
        boatLevel,
        guns: gunsFor(gunLevel),
        accuracy: accuracyFor(gunneryLevel, boatLevel),
        rake: rakeFor(gunneryLevel),
        hp: hullFor(hullLevel, boatLevel),
        armor: armorFor(hullLevel),
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
        hp: foe?.hp || 140,
        armor: foe?.armor ?? 0.05,
        ammo: ammoById(foe?.ammo || "round"),
        dmgMult: 1,
        dmgTaken: 1,
    };
}


// ── AIMING: THE PART YOU ACTUALLY PLAY ───────────────────────────────────────────────────────────────────────
// This started as one order a round — broadside, rake, hole her, board — chosen off four cards under the
// ships. It worked, and it was still one decision per round no matter how many guns you had bought, which made
// the Cannons track a number that changed someone else's arithmetic.
//
// Now you lay EVERY GUN yourself. Tap a part of her and the next crew is told to aim there; tap again for the
// next; give a gun a different round out of the rack if it suits the target. Nothing fires until you commit,
// and then the whole volley goes at once. Seven guns is seven decisions, which is what a gun deck should be.
//
// The zones and their odds live in ship-zones.js — this file is what happens when the ball arrives.
//
// A crew can also be sent to YOUR OWN ship instead: to the pumps, to the rigging, to a dismounted gun. That is
// where "man the pumps" went. It is no longer a button that costs you the round — it costs you ONE GUN, which
// is a price you set yourself, and the rest of the broadside still fires.
export const REPAIR = {
    hull: { id: "hull", name: "Man the pumps", verb: "at the pumps" },
    sails: { id: "sails", name: "Bend on new canvas", verb: "in the rigging" },
    rudder: { id: "rudder", name: "Ship a new rudder", verb: "at the tiller" },
    guns: { id: "guns", name: "Remount a gun", verb: "on the gun deck" },
};

// ── WATER, FIRE AND HANDLING ─────────────────────────────────────────────────────────────────────────────────
// A hole below the waterline takes a slice of MAX hull every round it stays open, and they stack — ignoring
// three is how you lose a fight you were winning. Water does NOT burn down on its own the way a fire does: the
// only thing that closes a hole is a crew sent to the pumps, and each hole is rolled on its own at 85%, so
// three holes clear together only about 61% of the time.
export const LEAK_TICK = 0.04;          // per hole, per round, of MAX hull
export const PATCH_PER_HOLE = 0.85;
export const MAX_LEAKS = 4;

// EVASION — how hard this ship is to hit, and the reason to shoot at canvas. A ship under full sail with her
// rudder shipped is genuinely awkward to lay a gun on; one with her sails in rags and no steering is a target.
// This is the payoff for a shot that did almost no damage: it makes every later shot better.
export const BASE_EVADE = 0.03;
export const evasionOf = (sails = SAILS_MAX, rudder = RUDDER_MAX) =>
    BASE_EVADE + 0.16 * (Math.max(0, sails) / SAILS_MAX) + 0.06 * (Math.max(0, rudder) / RUDDER_MAX);

/** One gun's chance to land on one part of one ship. Everything that decides a shot is in this line. */
export function hitChance(att, zone, ammo, evasion) {
    const base = Math.max(0.15, Math.min(0.97, (att?.accuracy || 0.6) + (ammo?.accuracy || 0)));
    return Math.max(0.05, Math.min(0.97, base * (zone?.aim ?? 1) * (1 - evasion)));
}

// THE MAGAZINE GOING UP. A share of MAX hull rather than a flat number, so it is a disaster on a sloop and a
// very bad day on a man-o'-war rather than an instant kill on both. Explosive shell in the hold is worse again,
// which is the one place that round is unambiguously the right pick.
export const POWDER_BLAST = 0.22;

const side = (st, who) => (who === "me" ? st.me : st.foe);
const other = (who) => (who === "me" ? "foe" : "me");
const hpPair = (st) => ({ me: st.me.hp, foe: st.foe.hp });
const gunsReady = (s) => s.guns.reduce((n, hp) => n + (hp > 0 ? 1 : 0), 0);

// The opening state of a fight. Kept JSON-safe: it is stored on the sailing row between rounds.
export function initBattleState(me, foe, { rng = Math.random } = {}) {
    const fresh = (p) => ({
        hp: p.hp, max: p.hp, fire: 0, leaks: 0,
        sails: SAILS_MAX, rudder: RUDDER_MAX,
        guns: Array.from({ length: Math.max(1, p.guns) }, () => GUN_HP),
    });
    // The weather gauge — who fires first — leans to the lighter, handier ship.
    const myOdds = 0.5 + Math.max(-0.18, Math.min(0.18, (foe.guns - me.guns) * 0.02));
    return { v: 2, round: 0, gauge: rng() < myOdds ? "me" : "foe", me: fresh(me), foe: fresh(foe) };
}

// ── WHAT THE CLIENT IS ALLOWED TO HAVE ASKED FOR ─────────────────────────────────────────────────────────────
// The scene sends a list of assignments and the server re-derives every one of them: a gun that does not exist,
// a gun that is dismounted, two crews on one barrel, a zone this hull does not have, ammunition that is not in
// the racks. None of that is a rejection — it is a correction, because a fight refusing to resolve because one
// entry was stale is a worse outcome than that entry quietly becoming an honest round shot at the hull.
export function sanitizeAssignments(st, who, list, { zonesAllowed = null, ammoAvailable = null } = {}) {
    const s = side(st, who);
    const seen = new Set();
    const out = [];
    for (const raw of Array.isArray(list) ? list : []) {
        const gun = Number(raw?.gun);
        if (!Number.isInteger(gun) || gun < 0 || gun >= s.guns.length) continue;
        if (s.guns[gun] <= 0 || seen.has(gun)) continue;
        seen.add(gun);
        const at = raw?.at === "self" ? "self" : "them";
        let zone = String(raw?.zone || "hull");
        if (at === "self") {
            if (!REPAIR[zone]) zone = "hull";
        } else {
            if (zonesAllowed && !zonesAllowed.includes(zone)) zone = "hull";
            if (!["hull", "sails", "rudder", "guns", "powder"].includes(zone)) zone = "hull";
        }
        let ammo = String(raw?.ammo || "round");
        if (at === "self") ammo = "round";
        else if (ammoAvailable && !ammoAvailable(ammo)) ammo = "round";
        const target = Number.isInteger(Number(raw?.target)) ? Number(raw.target) : null;
        out.push({ gun, at, zone, ammo, target });
    }
    return out;
}

// ── WHAT THE ENEMY DOES ──────────────────────────────────────────────────────────────────────────────────────
// Deliberately readable rather than clever: they bail when they are filling up, re-rig when they cannot dodge,
// break up your gun deck when you have more barrels than they do, and otherwise put iron into the hull. A foe
// whose every shot has a visible reason is one you can plan against, which is the whole point of showing their
// aim on your ship before it lands.
export function foeAssignments(me, foe, st, { rng = Math.random } = {}) {
    const s = st.foe, enemy = st.me;
    const crews = [];
    for (let i = 0; i < s.guns.length; i += 1) if (s.guns[i] > 0) crews.push(i);
    const out = [];
    const ammo = foe.ammo?.id || "round";

    // REPAIRS FIRST, and never with the whole deck. Two crews at the pumps while you shoot at them is how a
    // fleet ship loses a fight it was winning, so they spend at most a third of their guns on damage control.
    const spare = Math.max(0, Math.floor(crews.length / 3));
    let spent = 0;
    if (s.leaks >= 2 && spent < spare) { out.push({ gun: crews[spent], at: "self", zone: "hull", ammo: "round", target: null }); spent += 1; }
    else if (s.leaks === 1 && s.hp < s.max * 0.5 && spent < spare) { out.push({ gun: crews[spent], at: "self", zone: "hull", ammo: "round", target: null }); spent += 1; }
    if (s.sails === 0 && spent < spare && rng() < 0.6) { out.push({ gun: crews[spent], at: "self", zone: "sails", ammo: "round", target: null }); spent += 1; }

    // Then the guns that are left, laid at you. MOSTLY AT THE HULL, and this is a balance decision as much as a
    // characterisation one: a fleet ship firing a third of its broadside into your gun deck strips a SEVEN-gun
    // player far faster than the same tactic strips an eleven-gun enemy, so an AI that snipes as eagerly as a
    // player should is not "smart", it is a ship with more barrels than you exploiting the fact.
    //
    // Measured: at a third, a mid build's deck was empty by round six and rank 5 fell from a fair fight to 27%.
    // They still go for the guns — they just do it like an opponent rather than like an optimiser, and they only
    // bother when they have the broadside to spare.
    const myGunsUp = gunsReady(enemy);
    const canBully = crews.length >= 6 && myGunsUp >= 4;
    for (let i = spent; i < crews.length; i += 1) {
        const r = rng();
        let zone = "hull";
        let target = null;
        if (enemy.sails > 0 && r < 0.14) zone = "sails";
        else if (canBully && r < 0.26) {
            zone = "guns";
            // Always at a gun that is still up — a broadside aimed at wreckage is the sort of thing that makes
            // an opponent look broken rather than beaten.
            const up = enemy.guns.map((hp, k) => (hp > 0 ? k : -1)).filter((k) => k >= 0);
            target = up[Math.floor(rng() * up.length)] ?? null;
        } else if (enemy.rudder > 0 && r < 0.32) zone = "rudder";
        else if (r < 0.35 && s.hp < s.max * 0.35) zone = "powder";  // cornered ships take the long shot
        out.push({ gun: crews[i], at: "them", zone, ammo, target });
    }
    return out;
}

// ── ONE ROUND ────────────────────────────────────────────────────────────────────────────────────────────────
// Fires burn, water comes in, then both sides work their assignments in weather-gauge order. Pure — the caller
// persists whatever comes back — and `rng` is injectable so a fight can be replayed exactly in the lab.
export function resolveVolley(me, foe, state, assignments, { rng = Math.random } = {}) {
    const st = { v: 2, round: state.round, gauge: state.gauge, me: { ...state.me, guns: [...state.me.guns] }, foe: { ...state.foe, guns: [...state.foe.guns] } };
    const events = [];
    st.round += 1;

    const mine = sanitizeAssignments(st, "me", assignments);
    const theirs = foeAssignments(me, foe, st, { rng });

    // Fires first — a shell landed last round is still working.
    for (const who of ["foe", "me"]) {
        const s = side(st, who);
        if (s.fire > 0 && s.hp > 0 && side(st, other(who)).hp > 0) {
            s.hp = Math.max(0, s.hp - s.fire);
            events.push({ type: "burn", victim: who, dmg: s.fire, hp: hpPair(st) });
            s.fire = Math.max(0, s.fire - FIRE_DECAY);
        }
    }
    // Then the water, before anyone fires. A hole takes its slice whether or not you get to act, which is what
    // makes a crew at the pumps urgent rather than optional.
    for (const who of ["foe", "me"]) {
        const s = side(st, who);
        if (s.leaks > 0 && s.hp > 0 && side(st, other(who)).hp > 0) {
            const dmg = Math.max(1, Math.round(s.leaks * LEAK_TICK * s.max));
            s.hp = Math.max(0, s.hp - dmg);
            events.push({ type: "flood", victim: who, dmg, holes: s.leaks, hp: hpPair(st) });
        }
    }

    const work = (who, list) => {
        const att = who === "me" ? me : foe;
        const def = who === "me" ? foe : me;
        const mySide = side(st, who), theirSide = side(st, other(who));
        if (mySide.hp <= 0 || theirSide.hp <= 0) return;

        // DAMAGE CONTROL. A crew at the pumps is a gun that does not fire — the cost is paid in broadside, not
        // in a round you were never asked about.
        for (const a of list.filter((x) => x.at === "self")) {
            if (a.zone === "hull") {
                const before = mySide.leaks;
                let left = 0;
                for (let h = 0; h < before; h += 1) if (rng() > PATCH_PER_HOLE) left += 1;
                mySide.leaks = left;
                events.push({ type: "repair", side: who, sys: "hull", sealed: before - left, left, hp: hpPair(st) });
            } else if (a.zone === "sails") {
                const before = mySide.sails;
                mySide.sails = Math.min(SAILS_MAX, mySide.sails + 2);
                events.push({ type: "repair", side: who, sys: "sails", gained: mySide.sails - before, hp: hpPair(st) });
            } else if (a.zone === "rudder") {
                const before = mySide.rudder;
                mySide.rudder = Math.min(RUDDER_MAX, mySide.rudder + 1);
                events.push({ type: "repair", side: who, sys: "rudder", gained: mySide.rudder - before, hp: hpPair(st) });
            } else if (a.zone === "guns") {
                const down = mySide.guns.findIndex((hp) => hp <= 0);
                if (down >= 0) mySide.guns[down] = 1;
                events.push({ type: "repair", side: who, sys: "guns", gained: down >= 0 ? 1 : 0, index: down, hp: hpPair(st) });
            }
        }

        const shooting = list.filter((x) => x.at === "them");
        if (!shooting.length) return;

        const evasion = evasionOf(theirSide.sails, theirSide.rudder);
        const shots = [];
        let total = 0;
        const after = [];   // things that happen once the volley has landed, in the order they happened

        for (const a of shooting) {
            const zone = zoneById(a.zone);
            const ammo = ammoById(a.ammo);
            if (rng() > hitChance(att, zone, ammo, evasion)) { shots.push({ gun: a.gun, zone: a.zone, ammo: ammo.id, hit: false }); continue; }

            const rake = rng() < (att.rake + (ammo.rakeBonus || 0));
            let dmg = (SHOT_MIN + rng() * SHOT_VAR) * ammo.dmg * att.dmgMult * zone.dmg;
            if (rake) dmg *= 1.8;
            const armor = Math.max(0, def.armor * (1 - ammo.armorPierce));
            dmg = Math.max(1, Math.round(dmg * (1 - armor) * def.dmgTaken));
            total += dmg;
            theirSide.hp = Math.max(0, theirSide.hp - dmg);

            const shot = { gun: a.gun, zone: a.zone, ammo: ammo.id, hit: true, dmg, rake };

            // WHAT THE SHOT BROKE, over and above the hole it made. One point of system damage for landing,
            // plus whatever this round is especially good at — that is where chain and grape earn their price.
            const bonus = (ammo.sys && ammo.sys[zone.sys]) || 0;
            const wreck = 1 + bonus;
            if (zone.sys === "sails" && theirSide.sails > 0) {
                theirSide.sails = Math.max(0, theirSide.sails - wreck);
                shot.wrecked = "sails";
                if (theirSide.sails === 0) after.push({ type: "wreck", victim: other(who), sys: "sails" });
            } else if (zone.sys === "rudder" && theirSide.rudder > 0) {
                theirSide.rudder = Math.max(0, theirSide.rudder - wreck);
                shot.wrecked = "rudder";
                if (theirSide.rudder === 0) {
                    // NO STEERING, NO GAUGE. A ship that cannot answer her helm cannot hold the weather gauge —
                    // so the rudder is the shot that buys you the first broadside for the rest of the fight.
                    st.gauge = who;
                    after.push({ type: "wreck", victim: other(who), sys: "rudder" });
                }
            } else if (zone.sys === "guns") {
                const up = theirSide.guns.map((hp, k) => (hp > 0 ? k : -1)).filter((k) => k >= 0);
                const pick = up.includes(a.target) ? a.target : up[Math.floor(rng() * up.length)];
                if (pick != null) {
                    theirSide.guns[pick] = Math.max(0, theirSide.guns[pick] - wreck);
                    shot.wrecked = "guns"; shot.target = pick;
                    if (theirSide.guns[pick] === 0) after.push({ type: "wreck", victim: other(who), sys: "guns", index: pick });
                }
            } else if (zone.sys === "powder") {
                // THE MAGAZINE. Almost nobody hits it — and when somebody does, the fight changes shape.
                const blast = Math.max(1, Math.round(theirSide.max * POWDER_BLAST * (ammo.id === "explosive" ? 1.6 : 1)));
                theirSide.hp = Math.max(0, theirSide.hp - blast);
                theirSide.fire = FIRE_START;
                const up = theirSide.guns.map((hp, k) => (hp > 0 ? k : -1)).filter((k) => k >= 0);
                if (up.length) theirSide.guns[up[Math.floor(rng() * up.length)]] = 0;
                theirSide.leaks = Math.min(MAX_LEAKS, theirSide.leaks + 1);
                shot.blast = blast;
                total += blast;
                after.push({ type: "blast", victim: other(who), dmg: blast, hp: hpPair(st) });
            }

            // A hole below the waterline. Rolled per landed shot now rather than once per volley: a ball in the
            // hull is what opens a ship up, so the chance belongs to the ball.
            if (zone.leak && rng() < zone.leak && theirSide.leaks < MAX_LEAKS) {
                theirSide.leaks += 1;
                shot.leak = true;
                after.push({ type: "leaksprung", victim: other(who), holes: theirSide.leaks, hp: hpPair(st) });
            }
            if (ammo.fire && rng() < ammo.fire) theirSide.fire = Math.min(FIRE_START, theirSide.fire + FIRE_START);
            shots.push(shot);
        }

        events.push({ type: "volley", side: who, shots, dmg: total, guns: shooting.length, hp: hpPair(st) });
        for (const ev of after) events.push({ ...ev, hp: hpPair(st) });
    };

    if (st.gauge === "me") { work("me", mine); work("foe", theirs); }
    else { work("foe", theirs); work("me", mine); }

    const sunk = st.foe.hp <= 0 ? "foe" : st.me.hp <= 0 ? "me" : null;
    const outOfRounds = st.round >= MAX_ROUNDS;
    const over = Boolean(sunk) || outOfRounds;
    const win = sunk === "foe" || (!sunk && outOfRounds && st.me.hp / st.me.max >= st.foe.hp / st.foe.max);
    return { events, state: st, over, win, sunk, mine, theirs };
}

export const MAX_ROUNDS = 14;

// ── ONE DIFFICULTY SCALE FOR BOTH HALVES ─────────────────────────────────────────────────────────────────────
// The fleet and member rivals were two lists you could not compare: the fleet had a designed rank and no odds,
// rivals had odds and a "pays like rank N" note, and nothing told you whether rank 6 of the fleet was a harder
// night than the member sitting above it. They are one list now, so they need one number.
//
// This is the read the raid picker was already doing inline — their broadside and hull against yours, gun
// weighted heavier than hull because a gun deck decides an exchange faster than timber absorbs one. Lifted out
// of sailing.js so the server and the row on screen cannot drift apart.
export function matchupOdds({ myGuns = 4, myHull = 140, guns = 4, hull = 140 } = {}) {
    const gunEdge = myGuns / Math.max(1, guns);
    const hullEdge = myHull / Math.max(1, hull);
    return Math.max(0.05, Math.min(0.95, 0.5 * gunEdge ** 1.4 * hullEdge ** 0.7));
}
