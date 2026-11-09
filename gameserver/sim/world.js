import { ENEMY, FACING_STEPS, PLAYER, WORLD } from "./protocol.js";

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
//    `dt` is passed in. Randomness is a seeded generator passed in. A step
//    that reads the clock gives two different answers on two machines and
//    every symptom downstream looks like a netcode bug.
//
// ⚠️ AND THE STEP IS PURE OVER ITS ARGUMENTS. It mutates the state it is
//    handed and returns events; it never reaches for state it was not
//    given. That is what makes rewinding possible -- lag compensation is
//    just "call this again over an older copy".
// ─────────────────────────────────────────────────────────────────────────

const clampToWorld = (v) => Math.min(WORLD.max, Math.max(WORLD.min, v));

/** Facing is sent as 0..255 around the circle; keep one conversion for it. */
export const facingToRadians = (f) => (f / FACING_STEPS) * Math.PI * 2;
export const radiansToFacing = (r) => {
    const t = Math.round((r / (Math.PI * 2)) * FACING_STEPS) % FACING_STEPS;
    return t < 0 ? t + FACING_STEPS : t;
};

export function makePlayer(id, x, y) {
    return {
        id,
        kind: "player",
        x,
        y,
        hp: PLAYER.maxHp,
        facing: 0,
        swingUntilMs: 0,
        cooldownUntilMs: 0,
        deadUntilMs: 0,
        lastSeq: 0,
    };
}

export function makeEnemy(id, x, y, hp) {
    return {
        id, kind: "enemy", x, y, hp, maxHp: hp,
        facing: 0, homeX: x, homeY: y,
        attackUntilMs: 0, cooldownUntilMs: 0, deadAtMs: 0,
    };
}

/** A fresh world. `simMs` only ever advances by whole ticks, so a rewind
 *  lands on an exact past instant. */
export function makeWorld() {
    const enemies = new Map();
    // A ring of them around the spawn, far enough out that arriving is
    // peaceful and walking in any direction finds a fight.
    // ⚠️ 14 TO 19 METRES FROM SPAWN, NOT 77. The first ring was written with
    //    the old 2048-unit side-scroller's numbers still in mind and left
    //    every goblin a fifteen second run away -- so arriving meant jogging
    //    across an empty field looking for the game. Close enough to see one
    //    from the spawn point, far enough that arriving is not an ambush.
    //    Aggro range is 14 m, so they come to you about as soon as you can
    //    make them out.
    const ring = [
        [520, 548], [502, 550], [526, 572], [498, 572], [512, 544],
    ];
    ring.forEach(([x, y], i) => enemies.set(47 + i, makeEnemy(47 + i, x, y, 120)));
    return { simMs: 0, tick: 0, players: new Map(), enemies };
}

/** mulberry32: small, fast, identical in every JS engine. */
export function makeRng(seed) {
    let a = seed >>> 0;
    return function rng() {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Apply ONE input to ONE player: movement on the ground plane, and the
 * facing that follows from it. Movement only -- the half a client may
 * predict.
 *
 * ⚠️ THE INPUT VECTOR IS NORMALISED. Holding forward and left at once is
 *    two unit vectors added, which is 1.41 times the speed -- the oldest
 *    movement bug there is, and it is a real advantage in a game where
 *    disengaging matters. Normalising here means the server and the
 *    predictor are wrong in the same way if it is ever wrong at all.
 */
export function stepPlayer(player, input, dtMs) {
    if (player.hp <= 0) return player;
    const dt = dtMs / 1000;
    let dx = 0;
    let dy = 0;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;
    if (input.forward) dy -= 1;
    if (input.back) dy += 1;
    const mag = Math.hypot(dx, dy);
    if (mag > 0) {
        player.x = clampToWorld(player.x + (dx / mag) * PLAYER.speed * dt);
        player.y = clampToWorld(player.y + (dy / mag) * PLAYER.speed * dt);
        player.facing = radiansToFacing(Math.atan2(dx, -dy));
    }
    return player;
}

/**
 * The enemy's own behaviour: chase the nearest living player inside aggro
 * range, otherwise drift home.
 *
 * ⚠️ IT TAKES THE PLAYER LIST AS AN ARGUMENT rather than reading a world.
 *    A rewind replays this against a PAST set of players, and a function
 *    that reaches for the live world would quietly use the present one.
 */
export function stepEnemy(enemy, players, dtMs, simMs) {
    if (enemy.hp <= 0) return null;
    const dt = dtMs / 1000;

    let target = null;
    let best = ENEMY.aggroRange;
    for (const p of players) {
        if (p.hp <= 0) continue;
        const d = Math.hypot(p.x - enemy.x, p.y - enemy.y);
        if (d < best) { best = d; target = p; }
    }

    const goalX = target ? target.x : enemy.homeX;
    const goalY = target ? target.y : enemy.homeY;
    const dx = goalX - enemy.x;
    const dy = goalY - enemy.y;
    const dist = Math.hypot(dx, dy);

    // Stop at reach rather than walking into the player's own position,
    // which looks like possession rather than combat.
    const stopAt = target ? ENEMY.reach * 0.85 : 0.4;
    if (dist > stopAt) {
        const step = Math.min(ENEMY.speed * dt, dist - stopAt);
        enemy.x = clampToWorld(enemy.x + (dx / dist) * step);
        enemy.y = clampToWorld(enemy.y + (dy / dist) * step);
    }
    if (dist > 0.01) enemy.facing = radiansToFacing(Math.atan2(dx, -dy));

    if (target && dist <= ENEMY.reach && simMs >= enemy.cooldownUntilMs) {
        enemy.cooldownUntilMs = simMs + ENEMY.attackCooldownMs;
        enemy.attackUntilMs = simMs + 200;
        return { targetId: target.id, damage: ENEMY.hitDamage };
    }
    return null;
}

/**
 * Resolve a player's swing against one candidate.
 *
 * ⚠️ THE TARGET PASSED IN IS THE REWOUND ONE, NOT THE CURRENT ONE. That is
 *    the entire substance of lag compensation: the player swung at what
 *    they could see, which is where the target was one latency ago. The
 *    caller decides which past instant; this answers "would that have
 *    connected".
 *
 * ⚠️ AND IT IS AN ARC, NOT A CIRCLE. A radius-only check lets you hit
 *    something standing behind you, which on a ground plane is obvious and
 *    absurd in a way it never was in a side-scroller. 100 degrees either
 *    side of facing is generous enough that it never feels like a miss you
 *    did not deserve.
 */
export function resolveSwing(player, targetAtSwingTime, rng) {
    const dx = targetAtSwingTime.x - player.x;
    const dy = targetAtSwingTime.y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist > PLAYER.reach) return null;

    const facing = facingToRadians(player.facing);
    const toTarget = Math.atan2(dx, -dy);
    let delta = Math.abs(((toTarget - facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (delta > Math.PI) delta = Math.PI * 2 - delta;
    if (delta > (100 * Math.PI) / 180) return null;

    const crit = rng() < 0.15;
    return {
        targetId: targetAtSwingTime.id,
        damage: crit ? PLAYER.hitDamage * 2 : PLAYER.hitDamage,
        crit,
        distance: dist,
    };
}

export const canSwing = (player, simMs) => player.hp > 0 && simMs >= player.cooldownUntilMs;

export function beginSwing(player, simMs) {
    player.swingUntilMs = simMs + 180;
    player.cooldownUntilMs = simMs + PLAYER.swingCooldownMs;
}

/** A structural copy, for the history ring. Maps and nested objects, so
 *  JSON round-tripping and shallow spreads both get this wrong. */
export function snapshotWorld(world) {
    const copy = { simMs: world.simMs, tick: world.tick, players: new Map(), enemies: new Map() };
    for (const [id, p] of world.players) copy.players.set(id, { ...p });
    for (const [id, e] of world.enemies) copy.enemies.set(id, { ...e });
    return copy;
}
