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

// Guns in a broadside. Everyone fires at least a pair, and the boat itself is a platform: a bigger hull carries
// more guns even before you buy any, which is what "your overall ship level counts" means in practice.
export const gunsFor = (gunLevel = 0, boatLevel = 1) =>
    3 + Math.max(0, Math.min(COMBAT_TRACKS.guns.max, gunLevel)) + Math.floor(Math.max(0, boatLevel - 1) / 6);

// Chance a single gun hits. Gunnery is the lever; the boat contributes a little steadiness.
export const accuracyFor = (gunneryLevel = 0, boatLevel = 1) =>
    Math.min(0.94, 0.55 + Math.max(0, gunneryLevel) * 0.035 + Math.max(0, boatLevel - 1) * 0.004);

// A RAKING hit — a ball down the length of the deck. The critical of this system.
export const rakeFor = (gunneryLevel = 0) => Math.min(0.35, 0.06 + Math.max(0, gunneryLevel) * 0.025);

// Hull integrity. Flat base + hull track + the boat you built, so a big trader can survive a gunboat that has
// bought more cannon than it can carry.
export const hullFor = (hullLevel = 0, boatLevel = 1) =>
    120 + Math.max(0, hullLevel) * 26 + Math.max(0, boatLevel - 1) * 4;

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
        guns: gunsFor(gunLevel, boatLevel),
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
