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

// ── AMMUNITION ───────────────────────────────────────────────────────────────────────────────────────────────
// Round shot is unlocked forever and never runs out, so nobody is ever unable to fight. The others are stock
// you buy with doubloons and spend a round of per battle — the reason the currency keeps mattering after the
// gun deck is full.
//
// Each type is a real trade, not a strictly-better ladder:
//   round     the honest default — nothing special, nothing wasted
//   chain     shreds rigging: fewer enemy guns answer, at the cost of your own damage
//   grape     anti-crew: poor against armour, brutal against a thin hull
//   explosive heavy damage and it sets fires, but it is inaccurate — a gamble on a big ship
export const AMMO = {
    round: {
        id: "round", name: "Round Shot", basic: true, price: 0,
        icon: "GiCannonBall", blurb: "Solid iron. No tricks, no waste — and you never run out.",
        dmg: 1, accuracy: 0, armorPierce: 0, rakeBonus: 0, rigging: 0, fire: 0,
    },
    chain: {
        id: "chain", name: "Chain Shot", basic: false, price: 12,
        icon: "GiChainedHeart", blurb: "Two balls on a chain, tumbling through the rigging. Their next broadside comes up short.",
        dmg: 0.75, accuracy: 0.05, armorPierce: 0, rakeBonus: 0, rigging: 0.28, fire: 0,
    },
    grape: {
        id: "grape", name: "Grapeshot", basic: false, price: 14,
        icon: "GiCannonShot", blurb: "A bag of small shot that sweeps a deck. Murder on a light hull, useless against armour.",
        dmg: 1.15, accuracy: 0.12, armorPierce: -0.5, rakeBonus: 0.08, rigging: 0, fire: 0,
    },
    explosive: {
        id: "explosive", name: "Explosive Shell", basic: false, price: 22,
        icon: "GiBurningEmbers", blurb: "A fused shell. Wild off the muzzle, but what lands starts a fire that keeps burning.",
        dmg: 1.45, accuracy: -0.14, armorPierce: 0.35, rakeBonus: 0.05, rigging: 0, fire: 0.4,
    },
};
export const AMMO_LIST = Object.values(AMMO);
export const ammoById = (id) => AMMO[String(id || "round")] || AMMO.round;

// ── THE GUN DECK ─────────────────────────────────────────────────────────────────────────────────────────────
// Tracks are capped low and deliberately cheap-feeling per level: the interesting decision is meant to be what
// you LOAD, not how many times you tapped Upgrade.
export const COMBAT_TRACKS = {
    guns: { key: "guns", col: "gun_level", max: 8, name: "Cannons", icon: "GiCannon",
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

// Chance a single gun hits. Gunnery is the lever; the boat contributes a little steadiness.
export const accuracyFor = (gunneryLevel = 0, boatLevel = 1) =>
    Math.min(0.94, 0.55 + Math.max(0, gunneryLevel) * 0.035 + Math.max(0, boatLevel - 1) * 0.004);

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

// Build the combat profile a ship brings to a battle. `sea` is the sailing affinity block (broadside/ironclad).
export function shipProfile({ name, boatLevel = 1, gunLevel = 0, gunneryLevel = 0, hullLevel = 0,
                              ammo = "round", art = null, sea = null, flavor = null } = {}) {
    const a = ammoById(ammo);
    return {
        name: name || "Ship",
        art,
        flavor,
        boatLevel,
        guns: gunsFor(gunLevel),
        accuracy: Math.min(0.95, Math.max(0.15, accuracyFor(gunneryLevel, boatLevel) + a.accuracy)),
        rake: rakeFor(gunneryLevel) + a.rakeBonus,
        hp: hullFor(hullLevel, boatLevel),
        armor: armorFor(hullLevel),
        ammo: a,
        // Broadside adds damage, Ironclad takes it off what lands. Both are sea affinity, unchanged.
        dmgMult: 1 + (Number(sea?.broadside) || 0) / 100,
        dmgTaken: Math.max(0.5, 1 - (Number(sea?.ironclad) || 0) / 100),
    };
}

// An enemy from the fleet catalog → the same profile shape, built from designed numbers rather than tracks.
export function foeProfile(foe) {
    const a = ammoById(foe?.ammo || "round");
    return {
        name: foe?.name || "Pirate ship",
        art: foe?.art || null,
        flavor: foe?.flavor || null,
        boatLevel: foe?.rank || 1,
        guns: foe?.guns || 4,
        accuracy: Math.min(0.95, Math.max(0.15, (foe?.accuracy ?? 0.6) + a.accuracy)),
        rake: (foe?.rake ?? 0.08) + a.rakeBonus,
        hp: foe?.hp || 140,
        armor: foe?.armor ?? 0.05,
        ammo: a,
        dmgMult: 1,
        dmgTaken: 1,
    };
}


// ── ORDERS: THE PART YOU ACTUALLY PLAY ───────────────────────────────────────────────────────────────────────
// The first cut resolved the whole battle in one call and played it back. It looked fine and felt like
// nothing — you pressed Engage and watched a replay of a fight you had no part in. A battle is fought a round
// at a time now, and each round you give an order.
//
// Four orders, each a real trade rather than a strictly-better button:
//   BROADSIDE  everything you have. The honest default.
//   RAKE       aim high. Two thirds damage, but it shreds rigging — their next broadside comes up short.
//   BRACE      no volley at all this round. Half damage taken, and the crew reloads: your next broadside is
//              truer and hits harder. Buys a round when you are losing one.
//   BOARD      close and take her. Huge damage, but you eat a full broadside doing it — and if their hull is
//              healthier than yours it goes very badly. The finisher, or the mistake.
export const ORDERS = {
    broadside: { id: "broadside", name: "Broadside", icon: "GiCannon",
        desc: "Fire everything that bears." },
    rake: { id: "rake", name: "Rake the rigging", icon: "GiSailboat",
        desc: "Aim high — less damage, but their next broadside comes up short." },
    // BRACE IS GONE. Measured strictly dominated: 99.9% on pure broadside against a frigate fell to 75.5% for
    // anyone who braced when hurt, because skipping an attack in a race to zero costs more than half a volley
    // saves. Propping it up with a held broadside was patching a bad idea rather than replacing it.
    hole: { id: "hole", name: "Hole her below the line", icon: "GiHole",
        desc: "A third less damage — but far likelier to hole them." },
    board: { id: "board", name: "Close and board", icon: "GiCrossedSwords",
        desc: "All or nothing. Devastating if they are hurt, suicide if they are not." },
    // Offered ONLY while taking on water (see ordersFor). A leak is not a stun — you may keep fighting and
    // bleed instead. Losing a turn to something you never got to weigh in on is the thing that made Brace feel
    // bad; choosing to lose one is a decision.
    patch: { id: "patch", name: "Man the pumps", icon: "GiWaterRecycling",
        desc: "Fight the water, not the ship. Each hole may close — no promises." },
};
export const ORDER_LIST = Object.values(ORDERS).filter((o) => o.id !== "patch");
export const orderById = (id) => ORDERS[String(id || "broadside")] || ORDERS.broadside;

// ── LEAKS ────────────────────────────────────────────────────────────────────────────────────────────────────
// Any hit can open one; aiming for the waterline makes it six times likelier at a third less damage. A leak
// takes a slice of MAX hull every round it stays open and they stack, so ignoring three is how you lose a
// fight you were winning. Pumping clears each hole independently at 85% — a hole surviving the pumps is what
// keeps the panic in it, and clearing all three at once is only about a 61% shot.
export const LEAK_CHANCE = 0.05;        // any hit
export const LEAK_CHANCE_AIMED = 0.30;  // the `hole` order
export const HOLE_DAMAGE_MULT = 0.70;   // −30% for aiming low
export const LEAK_TICK = 0.04;          // per leak, per round, of MAX hull
export const PATCH_PER_HOLE = 0.85;
export const MAX_LEAKS = 4;

/** The orders available right now — `patch` only exists while that side is actually taking on water. */
export const ordersFor = (leaks = 0) => (leaks > 0 ? Object.values(ORDERS) : ORDER_LIST);

// The opening state of a fight. Kept small and JSON-safe: it is stored on the sailing row between rounds.
export function initBattleState(me, foe, { rng = Math.random } = {}) {
    const myOdds = 0.5 + Math.max(-0.18, Math.min(0.18, (foe.guns - me.guns) * 0.02));
    return {
        myHp: me.hp, foeHp: foe.hp, myMax: me.hp, foeMax: foe.hp,
        round: 0, myRig: 0, foeRig: 0, myFire: 0, foeFire: 0,
        // Open holes below the waterline, per side. They tick every round until pumped out.
        myLeaks: 0, foeLeaks: 0,
        gauge: rng() < myOdds ? "me" : "foe",
    };
}

// What the enemy does this round. Deliberately simple and readable rather than clever: they board when you are
// hurt and they are not, pump when they are taking water, go for the waterline when cornered, rake when
// they are carrying chain, and otherwise fire. A foe with a visible reason for every order is playable.
export function foeOrder(me, foe, st, { rng = Math.random } = {}) {
    const theirs = st.foeHp / Math.max(1, st.foeMax), mine = st.myHp / Math.max(1, st.myMax);
    // THE ENEMY PUMPS, or leaks would simply be a guaranteed win against every ship on the ladder. They bail
    // when the water is costing them more than a broadside would earn — the same call you are making.
    if (st.foeLeaks > 0) {
        const bleeding = st.foeLeaks * LEAK_TICK * st.foeMax;
        if (st.foeLeaks >= 2 || (bleeding > st.foeHp * 0.12 && rng() < 0.7)) return "patch";
    }
    if (theirs > 0.5 && mine < 0.35 && rng() < 0.6) return "board";
    // Was `brace` when nearly dead — a deleted order, which would have left the fleet doing nothing at low HP.
    // Cornered ships go for the waterline instead: it is the move that can still turn a fight they are losing.
    if (theirs < 0.22 && rng() < 0.5) return "hole";
    if (foe.ammo?.rigging && rng() < 0.35) return "rake";
    return "broadside";
}

// One exchange: fires burn, both ships act in weather-gauge order, and the state comes back updated. Pure —
// the caller persists whatever it gets.
export function resolveRound(me, foe, state, order, { rng = Math.random } = {}) {
    const st = { ...state };
    const events = [];
    const myOrder = orderById(order).id;
    const theirOrder = foeOrder(me, foe, st, { rng });
    st.round += 1;

    // Fires first — a shell landed last round is still working.
    if (st.foeFire > 0) {
        st.foeHp = Math.max(0, st.foeHp - st.foeFire);
        events.push({ type: "fire", side: "me", dmg: st.foeFire, my: st.myHp, foe: st.foeHp });
        st.foeFire = Math.max(0, st.foeFire - FIRE_DECAY);
    }
    if (st.myFire > 0 && st.foeHp > 0) {
        st.myHp = Math.max(0, st.myHp - st.myFire);
        events.push({ type: "fire", side: "foe", dmg: st.myFire, my: st.myHp, foe: st.foeHp });
        st.myFire = Math.max(0, st.myFire - FIRE_DECAY);
    }

    // WATER, before anyone fires. A leak takes its slice whether or not you get to act, which is what makes
    // pumping urgent rather than optional — and unlike a fire it does NOT burn down on its own.
    if (st.foeLeaks > 0 && st.foeHp > 0) {
        const dmg = Math.max(1, Math.round(st.foeLeaks * LEAK_TICK * st.foeMax));
        st.foeHp = Math.max(0, st.foeHp - dmg);
        events.push({ type: "leak", side: "me", dmg, holes: st.foeLeaks, my: st.myHp, foe: st.foeHp });
    }
    if (st.myLeaks > 0 && st.myHp > 0 && st.foeHp > 0) {
        const dmg = Math.max(1, Math.round(st.myLeaks * LEAK_TICK * st.myMax));
        st.myHp = Math.max(0, st.myHp - dmg);
        events.push({ type: "leak", side: "foe", dmg, holes: st.myLeaks, my: st.myHp, foe: st.foeHp });
    }

    const act = (who) => {
        const mineTurn = who === "me";
        const att = mineTurn ? me : foe;
        const def = mineTurn ? foe : me;
        const ord = mineTurn ? myOrder : theirOrder;
        const rigged = mineTurn ? st.myRig : st.foeRig;
        const defHp = mineTurn ? st.foeHp : st.myHp;
        const attHp = mineTurn ? st.myHp : st.foeHp;
        if (defHp <= 0 || attHp <= 0) return;

        // MAN THE PUMPS. Each hole is rolled on its own at 85%, so three holes clear together only about 61%
        // of the time — a turn spent pumping that leaves you still taking water is the whole tension of the
        // mechanic, and a guaranteed reset would make leaks a nuisance instead of a threat.
        if (ord === "patch") {
            const before = mineTurn ? st.myLeaks : st.foeLeaks;
            let left = 0;
            for (let h = 0; h < before; h += 1) if (rng() > PATCH_PER_HOLE) left += 1;
            if (mineTurn) st.myLeaks = left; else st.foeLeaks = left;
            events.push({ type: "order", side: who, order: "patch", sealed: before - left, holes: left,
                my: st.myHp, foe: st.foeHp });
            return;
        }

        // Damage shape by order.
        const boarding = ord === "board";
        const raking = ord === "rake";
        const holing = ord === "hole";
        const powerMult = boarding ? 2.1 : raking ? 0.66 : holing ? HOLE_DAMAGE_MULT : 1;
        const accBonus = boarding ? 0.1 : 0;
        // Alongside and grappled: whoever boarded last round eats the answer at close range. This is the cost
        // that makes BOARD a decision rather than a button you always press.
        const exposedMult = mineTurn ? (st.foeExposed ? 1.6 : 1) : (st.exposed ? 1.6 : 1);

        const guns = Math.max(1, att.guns - rigged);
        const shots = [];
        let total = 0;
        for (let g = 0; g < guns; g += 1) {
            if (rng() > Math.min(0.97, att.accuracy + accBonus)) { shots.push({ hit: false }); continue; }
            const rake = rng() < att.rake;
            let dmg = (SHOT_MIN + rng() * SHOT_VAR) * att.ammo.dmg * att.dmgMult * powerMult;
            if (rake) dmg *= 1.8;
            const armor = Math.max(0, def.armor * (1 - att.ammo.armorPierce));
            dmg = dmg * (1 - armor) * def.dmgTaken * exposedMult;
            const rounded = Math.max(1, Math.round(dmg));
            total += rounded;
            shots.push({ hit: true, dmg: rounded, rake });
        }

        // A HOLE BELOW THE WATERLINE. A FLAT roll per attack — 5% normally, 30% aiming low. Not per gun, and
        // NOT conditional on the volley landing: gating it on a hit would quietly make the chance scale with
        // accuracy, so a well-drilled crew would spring more leaks than the spec says and a poor one fewer.
        // Pure chance means pure chance.
        const chance = holing ? LEAK_CHANCE_AIMED : LEAK_CHANCE;
        if (rng() < chance) {
            if (mineTurn) st.foeLeaks = Math.min(MAX_LEAKS, st.foeLeaks + 1);
            else st.myLeaks = Math.min(MAX_LEAKS, st.myLeaks + 1);
            events.push({ type: "leaksprung", side: who, holes: mineTurn ? st.foeLeaks : st.myLeaks,
                my: st.myHp, foe: st.foeHp });
        }

        if (mineTurn) { st.foeHp = Math.max(0, st.foeHp - total); st.foeRig = 0; st.foeExposed = false; }
        else { st.myHp = Math.max(0, st.myHp - total); st.myRig = 0; st.exposed = false; }

        // Raking shreds rigging; a boarding action leaves you exposed for their answer.
        const riggingCut = (raking ? 0.34 : 0) + (att.ammo.rigging || 0);
        if (riggingCut && total > 0) {
            const knocked = Math.max(1, Math.round(def.guns * riggingCut));
            if (mineTurn) st.foeRig = knocked; else st.myRig = knocked;
        }
        if (att.ammo.fire && shots.some((sh) => sh.hit) && rng() < att.ammo.fire) {
            if (mineTurn) st.foeFire = Math.min(FIRE_START, st.foeFire + FIRE_START);
            else st.myFire = Math.min(FIRE_START, st.myFire + FIRE_START);
        }
        // Boarding cuts both ways: you are alongside, so their answer lands harder.
        if (boarding) { if (mineTurn) st.exposed = true; else st.foeExposed = true; }

        events.push({
            type: "volley", side: who, order: ord, shots, dmg: total, guns,
            rigged: mineTurn ? st.foeRig : st.myRig,
            my: st.myHp, foe: st.foeHp,
        });
    };

    if (st.gauge === "me") { act("me"); act("foe"); } else { act("foe"); act("me"); }

    const sunk = st.foeHp <= 0 ? "foe" : st.myHp <= 0 ? "me" : null;
    const outOfRounds = st.round >= MAX_ROUNDS;
    const over = Boolean(sunk) || outOfRounds;
    const win = sunk === "foe" || (!sunk && outOfRounds && st.myHp / st.myMax >= st.foeHp / st.foeMax);
    return { events, state: st, over, win, sunk, myOrder, theirOrder };
}

export const MAX_ROUNDS = 14;

// ── THE BATTLE ───────────────────────────────────────────────────────────────────────────────────────────────
// Broadsides alternate. Each gun rolls to hit on its own, so a wide deck is a steadier stream of damage rather
// than one big swing — which is what makes Gunnery worth buying and what gives the scene something to draw:
// a volley of individual balls, some splashing short.
//
// `rng` is injectable so a battle can be replayed deterministically in a test or a lab.
export function simulateShipBattle(me, foe, { rng = Math.random, maxRounds = 24 } = {}) {
    const events = [];
    let myHp = me.hp, foeHp = foe.hp;
    let myRig = 0, foeRig = 0;   // rigging damage: guns knocked out of the NEXT broadside (chain shot)
    let myFire = 0, foeFire = 0; // burning: damage at the top of the round (explosive shell)

    const broadside = (att, def, defRigged) => {
        const guns = Math.max(1, att.guns - defRigged);
        const shots = [];
        let total = 0;
        for (let g = 0; g < guns; g += 1) {
            if (rng() > att.accuracy) { shots.push({ hit: false }); continue; }
            const rake = rng() < att.rake;
            let dmg = (SHOT_MIN + rng() * SHOT_VAR) * att.ammo.dmg * att.dmgMult;
            if (rake) dmg *= 1.8;
            // Armour, minus whatever this ammunition punches through.
            const armor = Math.max(0, def.armor * (1 - att.ammo.armorPierce));
            dmg = dmg * (1 - armor) * def.dmgTaken;
            const rounded = Math.max(1, Math.round(dmg));
            total += rounded;
            shots.push({ hit: true, dmg: rounded, rake });
        }
        return { shots, total, guns };
    };

    // Who takes the weather gauge, and so the first broadside. Slightly weighted by the lighter, handier ship:
    // fewer guns is a smaller, faster hull.
    const myOdds = 0.5 + Math.max(-0.18, Math.min(0.18, (foe.guns - me.guns) * 0.02));
    const meFirst = rng() < myOdds;
    events.push({ type: "gauge", side: meFirst ? "me" : "foe", my: myHp, foe: foeHp });

    for (let round = 0; round < maxRounds && myHp > 0 && foeHp > 0; round += 1) {
        // Fires burn first — the shell you landed last round is still working.
        if (foeFire > 0) {
            foeHp = Math.max(0, foeHp - foeFire);
            events.push({ type: "fire", side: "me", dmg: foeFire, my: myHp, foe: foeHp });
            foeFire = Math.max(0, foeFire - FIRE_DECAY);
            if (foeHp <= 0) break;
        }
        if (myFire > 0) {
            myHp = Math.max(0, myHp - myFire);
            events.push({ type: "fire", side: "foe", dmg: myFire, my: myHp, foe: foeHp });
            myFire = Math.max(0, myFire - FIRE_DECAY);
            if (myHp <= 0) break;
        }

        const fireMine = () => {
            const mine = broadside(me, foe, foeRig);
            foeHp = Math.max(0, foeHp - mine.total);
            foeRig = 0;
            if (me.ammo.rigging && mine.total > 0) foeRig = Math.max(1, Math.round(foe.guns * me.ammo.rigging));
            if (me.ammo.fire && mine.shots.some((sh) => sh.hit) && rng() < me.ammo.fire) foeFire = Math.min(FIRE_START, foeFire + FIRE_START);
            events.push({ type: "volley", side: "me", shots: mine.shots, dmg: mine.total, guns: mine.guns,
                rigged: foeRig, lit: foeFire > 0, my: myHp, foe: foeHp });
        };
        const fireTheirs = () => {
            const theirs = broadside(foe, me, myRig);
            myHp = Math.max(0, myHp - theirs.total);
            myRig = 0;
            if (foe.ammo.rigging && theirs.total > 0) myRig = Math.max(1, Math.round(me.guns * foe.ammo.rigging));
            if (foe.ammo.fire && theirs.shots.some((sh) => sh.hit) && rng() < foe.ammo.fire) myFire = Math.min(FIRE_START, myFire + FIRE_START);
            events.push({ type: "volley", side: "foe", shots: theirs.shots, dmg: theirs.total, guns: theirs.guns,
                rigged: myRig, lit: myFire > 0, my: myHp, foe: foeHp });
        };

        if (meFirst) {
            fireMine();
            if (foeHp <= 0) break;
            fireTheirs();
        } else {
            fireTheirs();
            if (myHp <= 0) break;
            fireMine();
        }
    }

    // A sinking is decisive. Running out of rounds is a running fight that neither ship won outright — the
    // healthier hull carries it, by SHARE of its own hull rather than raw points, so a big slow ship doesn't
    // win a draw for free.
    const sunk = foeHp <= 0 ? "foe" : myHp <= 0 ? "me" : null;
    const win = sunk === "foe" || (!sunk && myHp / me.hp >= foeHp / foe.hp);
    return {
        win, sunk, events,
        myHp, foeHp,
        myMax: me.hp, foeMax: foe.hp,
        rounds: events.filter((e) => e.type === "volley" && e.side === "me").length,
    };
}

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
