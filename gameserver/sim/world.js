import { PLAYER, WORLD } from "./protocol.js";

// ─────────────────────────────────────────────────────────────────────────
// THE SIMULATION — ONE MODULE, RUN BY BOTH SIDES, IDENTICALLY
//
// ⚠️ CLIENT PREDICTION IS NOT A SEPARATE PIECE OF CODE. The whole mechanism
//    is: the client runs THIS function on its own input immediately, the
//    server runs THIS function on the same input a round trip later, and
//    the two agree. A second implementation on the client -- even a
//    faithful one -- is a divergence waiting for an edge case. The decision
//    record's closing line is exactly this: "the sim is one module".
//
// ⚠️ THEREFORE: NO WALL CLOCK, NO Math.random, NO I/O, NO DATES.
//    `dt` is passed in. Randomness is a seeded generator passed in. Those
//    are not style rules; a step that reads the clock gives two different
//    answers on two machines and every symptom downstream looks like a
//    netcode bug. `npm run check:sim` fails the build if this file names
//    any of them.
//
// ⚠️ AND THE STEP IS PURE OVER ITS ARGUMENTS. It mutates the state object
//    it is handed and returns events; it never reaches for state it was not
//    given. That is what makes rewinding possible -- lag compensation is
//    just "call this again over an older copy".
// ─────────────────────────────────────────────────────────────────────────

export function makePlayer(id, x) {
    return {
        id,
        kind: "player",
        x,
        y: WORLD.groundY,
        hp: PLAYER.maxHp,
        facingLeft: false,
        swingUntilMs: 0,
        cooldownUntilMs: 0,
        lastSeq: 0,
    };
}

export function makeEnemy(id, x, hp) {
    return {
        id,
        kind: "enemy",
        x,
        y: WORLD.groundY,
        hp,
        maxHp: hp,
        facingLeft: true,
        drift: 1,
    };
}

/** A fresh world. `simMs` is simulation time, not wall time: it only ever
 *  advances by whole ticks, so a rewind lands on an exact past instant. */
export function makeWorld() {
    return {
        simMs: 0,
        tick: 0,
        players: new Map(),
        // The doc's own worked example, kept verbatim so the milestone and
        // the document describe the same fight: "Enemy #47 sits at x=312,
        // hp=400."
        enemies: new Map([[47, makeEnemy(47, 312, 400)]]),
    };
}

/** mulberry32: small, fast, and identical in every JS engine. Seeded by the
 *  caller so a replay of the same ticks produces the same rolls. */
export function makeRng(seed) {
    let a = seed >>> 0;
    return function rng() {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Apply ONE input to ONE player. Movement only -- the half a client is
 *  allowed to predict. */
export function stepPlayer(player, input, dtMs) {
    const dt = dtMs / 1000;
    let dir = 0;
    if (input.left) dir -= 1;
    if (input.right) dir += 1;
    if (dir !== 0) {
        player.x += dir * PLAYER.speed * dt;
        player.facingLeft = dir < 0;
        if (player.x < WORLD.minX) player.x = WORLD.minX;
        if (player.x > WORLD.maxX) player.x = WORLD.maxX;
    }
    return player;
}

/** The enemy's own behaviour. Server-only in practice, but it lives here so
 *  that a rewind replays the identical motion. */
export function stepEnemy(enemy, dtMs) {
    const dt = dtMs / 1000;
    // A slow patrol. Enough movement that interpolation has something to
    // smooth and that lag compensation can actually be wrong without it.
    enemy.x += enemy.drift * 38 * dt;
    if (enemy.x > 420) { enemy.x = 420; enemy.drift = -1; }
    if (enemy.x < 240) { enemy.x = 240; enemy.drift = 1; }
    enemy.facingLeft = enemy.drift < 0;
    return enemy;
}

/**
 * Resolve a swing. Returns a hit descriptor or null.
 *
 * ⚠️ THE ENEMY POSITION PASSED IN IS THE REWOUND ONE, NOT THE CURRENT ONE.
 *    That is the entire substance of lag compensation: the player swung at
 *    what they could see, which is where the enemy was one latency ago. The
 *    caller decides which past instant to use; this function just answers
 *    "would that have connected".
 */
export function resolveSwing(player, enemyAtSwingTime, rng) {
    const dx = Math.abs(player.x - enemyAtSwingTime.x);
    if (dx > PLAYER.reach) return null;
    // The roll is here, with a seeded generator, so that a replay of the
    // same tick produces the same crit. Never Math.random.
    const crit = rng() < 0.15;
    const damage = crit ? PLAYER.hitDamage * 2 : PLAYER.hitDamage;
    return { targetId: enemyAtSwingTime.id, damage, crit, distance: dx };
}

export function canSwing(player, simMs) {
    return simMs >= player.cooldownUntilMs;
}

export function beginSwing(player, simMs) {
    player.swingUntilMs = simMs + 180;
    player.cooldownUntilMs = simMs + PLAYER.swingCooldownMs;
}

/** A structural copy, for the history ring. Maps and nested objects, so
 *  JSON round-tripping and shallow spreads both get this wrong. */
export function snapshotWorld(world) {
    const copy = {
        simMs: world.simMs,
        tick: world.tick,
        players: new Map(),
        enemies: new Map(),
    };
    for (const [id, p] of world.players) copy.players.set(id, { ...p });
    for (const [id, e] of world.enemies) copy.enemies.set(id, { ...e });
    return copy;
}
