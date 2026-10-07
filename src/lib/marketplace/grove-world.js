// ── THE ZONE, AS A PLACE ─────────────────────────────────────────────────────────────────────────────────────
// Pure geometry and simulation for one zone: the platforms, who is standing on what, where everything is
// going. No DOM, no React, no db — the scene component owns pixels and this owns the world.
//
// ⚠️ EVERYTHING IS IN WORLD UNITS, NOT PIXELS. A zone is 100 units wide per screen of width and the renderer
// scales. Pixels belong to the camera; if the simulation knew about them the whole thing would behave
// differently on a phone than on a desktop, which is the bug that makes a platformer feel broken rather than
// merely different.
//
// ── WHY PLATFORMS ARE DATA AND NOT ART ───────────────────────────────────────────────────────────────────────
// Luke: "even hop up and down from platforms. Giving us a way to also make these zones vertical as well as
// horizontal." The backdrop is a painting; it has no idea where the ground is. So each zone carries a ladder
// of platforms and the painting sits behind them.

export const UNITS_PER_SCREEN = 100;

// ── ⚠️ THESE ARE PER-FRAME AT 60fps, AND THE FIRST SET WAS WRONG BY TWO ORDERS OF MAGNITUDE ──────────────────
// WALK was 0.019, which is 1.1 units a second — ninety seconds to cross ONE screen of a zone that is three to
// seven screens wide. HOP was 0.072 against GRAVITY 0.0042, which clears 0.6 units when the lowest platform
// is at 26. The scene looked right and was unplayable: enemies spawned, the hero took a step, and nothing
// could ever be reached.
//
// Set from the feel wanted instead. WALK crosses a screen in about six and a half seconds. HOP against
// GRAVITY clears 36 units — comfortably over the 26-unit first tier with room to misjudge — and reaches the
// top in about 0.6s, which is a hop rather than a float.
export const GRAVITY = 0.055;
export const WALK = 0.26;
export const HOP = 2.0;

// A zone is this many screens wide. Zone 1 is small and they open out.
export const zoneWidth = (n) => 3 + Math.min(4, Math.floor((n - 1) / 3));

/**
 * The platform ladder for a zone. Deterministic from the zone number, so the server and the client agree
 * about the shape of the place and a player cannot claim to have stood somewhere there is no floor.
 *
 * Ground is always y=0 and always continuous — you can never be stranded. Everything above it is optional
 * and is what makes the zone vertical.
 */
export function platformsFor(zoneN, rand) {
    const w = zoneWidth(zoneN) * UNITS_PER_SCREEN;
    const out = [{ x: 0, w, y: 0 }];
    // Later zones get more and higher ledges — the Warren and the Palisade are meant to be climbed.
    const tiers = Math.min(3, Math.floor((zoneN - 1) / 4) + 1);
    for (let t = 1; t <= tiers; t += 1) {
        const y = t * 26;
        let x = 14 + rand() * 30;
        while (x < w - 40) {
            const pw = 26 + rand() * 40;
            out.push({ x, w: pw, y });
            x += pw + 34 + rand() * 60;
        }
    }
    return out;
}

/** The platform directly under a point, or the ground. Used for landing and for where loot settles. */
export function floorUnder(platforms, x, y) {
    let best = platforms[0];
    for (const p of platforms) {
        if (x < p.x || x > p.x + p.w) continue;
        if (p.y <= y + 0.5 && p.y >= best.y) best = p;
    }
    return best;
}

/** A platform you could hop UP onto from here — what the auto-walker aims at when the target is above. */
export function stepUpFrom(platforms, x, y) {
    let best = null;
    for (const p of platforms) {
        if (p.y <= y || p.y > y + 30) continue;
        const near = x >= p.x - 12 && x <= p.x + p.w + 12;
        if (!near) continue;
        if (!best || p.y < best.y) best = p;
    }
    return best;
}

// ── THE SIM ──────────────────────────────────────────────────────────────────────────────────────────────────
// One step of the world. Called from the scene's rAF at a clamped dt.
//
// ⚠️ dt IS CLAMPED BY THE CALLER, NOT HERE. A backgrounded tab resumes with a four-second frame, and a
// four-second step would fire every enemy through the floor. Same scar as the gachapon's physics.

/** Walk a body toward a target x, hopping up when the way is blocked by height. */
export function stepBody(body, platforms, dt, target) {
    const b = body;
    if (target != null) {
        const dx = target - b.x;
        if (Math.abs(dx) > 1.2) {
            b.vx = Math.sign(dx) * WALK * (b.speed || 1);
            b.face = Math.sign(dx);
        } else {
            b.vx = 0;
        }
    } else {
        b.vx = 0;
    }

    b.x += b.vx * dt;
    b.vy -= GRAVITY * dt;
    b.y += b.vy * dt;

    const floor = floorUnder(platforms, b.x, b.y);
    if (b.y <= floor.y) {
        b.y = floor.y;
        b.vy = 0;
        b.grounded = true;
    } else {
        b.grounded = false;
    }
    return b;
}

/** A wandering enemy: drifts, pauses, and hops occasionally. Luke: "The enemies would hop around and wander." */
export function stepWander(foe, platforms, dt, rand) {
    const f = foe;
    f.t = (f.t || 0) - dt;
    if (f.t <= 0) {
        // Re-decide: stand still, amble left, or amble right — and sometimes hop.
        const roll = rand();
        f.goal = roll < 0.34 ? null : f.x + (roll < 0.67 ? -1 : 1) * (8 + rand() * 22);
        f.t = 40 + rand() * 120;
        if (f.grounded && rand() < 0.25) f.vy = HOP * (0.6 + rand() * 0.5);
    }
    return stepBody(f, platforms, dt, f.goal);
}

// ── COMBAT ───────────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "Armor mitigated damage. Life steal applies for the character."
//
// ⚠️ ARMOUR IS DIMINISHING, NOT SUBTRACTIVE. Flat subtraction means that at enough armour an enemy's hit
// rounds to zero and the deep zones become free; a ratio keeps every zone dangerous and keeps armour worth
// stacking without ever reaching immunity. The 60 is the half-point: 60 armour halves incoming damage.
export const ARMOUR_K = 60;
export function mitigate(raw, armour) {
    const a = Math.max(0, Number(armour) || 0);
    return Math.max(1, Math.round(raw * (ARMOUR_K / (ARMOUR_K + a))));
}

/** A swing. Returns what landed and what it healed, so the caller can float both. */
export function swing({ power, critRate = 0, critDamage = 0, lifeSteal = 0 }, targetArmour, rand) {
    const crit = rand() < Math.min(0.75, (Number(critRate) || 0) / 100);
    const raw = Math.round(power * (crit ? 1 + Math.max(0.5, (Number(critDamage) || 0) / 100) : 1));
    const dealt = mitigate(raw, targetArmour);
    return { dealt, crit, healed: Math.round(dealt * (Math.max(0, Number(lifeSteal) || 0) / 100)) };
}

// ── TELEGRAPHS ───────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "He is unique had different attack animations that telecast where they will damage" and enemies
// "Also telecasting."
//
// A telegraph is a window with a PLACE: the attack announces where it will land, the player has `ms` to not
// be standing there, and then it resolves against whoever is. That is the whole mechanic — it is what makes
// standing still wrong without making the fight twitchy.
// ⚠️ THIS RETURNS A LIST, AND IT KEYS ON foe.uid.
//
// Two things were wrong and both were invisible:
//
//   1. IT STORED foe.id, WHICH THE RESOLVER LOOKED UP AS f.uid. `id` is the enemy TYPE ("rootrat"); `uid` is
//      the individual body ("f17-480213"). They never matched, so every telegraph in the game resolved
//      against a null foe and fell through to a hardcoded 5 damage — which means the Elderling's [31, 47],
//      every boss number, and the entire dmgPerZone climb did nothing at all. Twelve zones of difficulty
//      curve, and one wrong property name flattened the lot to five.
//
//   2. ONE TELEGRAPH PER ATTACK. A volley lands in three places at once, so the shape has to be a list.
//
// `attack` is a row from a boss's `attacks` (see GROVE_BOSSES). Omitted, this falls back to the creature's own
// single wind-up, which is what every wanderer uses.
export function makeTelegraph(foe, at, now, attack = null) {
    const ms = Number(attack?.telegraph) || Number(foe.telegraph) || 600;
    const reach = Number(attack?.reach) || Number(foe.reach) || 10;
    const shots = Math.max(1, Number(attack?.shots) || 1);
    const spread = Number(attack?.spread) || 0;
    const out = [];
    for (let i = 0; i < shots; i += 1) {
        // Centred on the target: an odd volley puts one directly on you and the rest either side, so there
        // is always somewhere to run to. A volley with no gap is not a telegraph, it is a tax.
        const off = shots === 1 ? 0 : (i - (shots - 1) / 2) * spread;
        out.push({
            uid: `t${Math.round(now)}-${i}-${foe.uid || foe.id}`,
            foeUid: foe.uid || null,
            kind: attack?.kind || "slam",
            mult: Number(attack?.mult) || 1,
            x: at + off,
            r: reach,
            ms,
            fires: now + ms,
            spawned: now,
        });
    }
    return out;
}

export const telegraphHits = (tel, x) => Math.abs(x - tel.x) <= tel.r;
