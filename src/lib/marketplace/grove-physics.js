// ── THE GROVE'S PHYSICS ──────────────────────────────────────────────────────────────────────────────────────
// A deliberately small 2D platformer solver: gravity, friction, one-way platforms, impulses. Import-free and
// DOM-free on purpose, exactly like grove-view.js and grove-roll.js, so scripts/check-grove.mjs can run the
// whole thing in bare node and assert it never drops a body through the floor.
//
// Luke: "I think what we need is some kind of minimalistic kind of physics engine so that we don't have to try
// and pre-calculate where platforms are and instead just like spawn them on a platform and have some gravity
// and like friction and stuff."
//
// That is the right instinct and it names the actual defect. The old `stepBody` set `vx` directly from a
// target and snapped `y` to whatever `floorUnder` returned for the body's CURRENT position — so position was
// being authored frame by frame rather than simulated, and three things followed from it:
//
//   · ⚠️ NOTHING EVER RESTED ON A LEDGE IT HAD NOT BEEN PLACED ON. `floorUnder(x, y)` returns the highest
//     platform whose top is at or below `y`, so a body standing at y=0 under a ledge was never going to find
//     it, and a body spawned at a ledge's y was snapped there whether or not it was still above its x range.
//     Walk off the side of a ledge and the body kept its height until its x left the span, then teleported
//     down. Which is to say: things were positioned ON platforms by arithmetic, never GROUNDED on them.
//   · ⚠️ VELOCITY WAS AN OUTPUT, NOT A STATE. vx was assigned from the sign of the distance to the target and
//     zeroed on arrival, so everything started and stopped instantly at exactly one speed. There was no
//     weight, no slide, nothing to knock back, and nothing for a hit to interrupt.
//   · A big dt could still pass straight through a ledge, because the test was "where am I now" rather than
//     "what did I cross getting here".
//
// ── THE MODEL ───────────────────────────────────────────────────────────────────────────────────────────────
// y is UP, y=0 is the ground, and every length is a world unit (see grove-world.js). A body is an upright box
// standing on its own feet: `x` is the middle of it, `y` is the SOLE. So a body's position is the point it
// touches the floor at, which is the only anchor that makes "grounded" mean anything and the only one a
// renderer can plant a sprite and a contact shadow on without guessing.

// ── CONSTANTS ───────────────────────────────────────────────────────────────────────────────────────────────
// Tuned in units-per-frame-at-60fps, the same frame the rest of the Grove is written in, so these read against
// WALK and HOP in grove-world.js.
export const GRAVITY = 0.055;
// ⚠️ TERMINAL VELOCITY IS NOT A FEEL KNOB, IT IS THE ANTI-TUNNELLING FLOOR. Combined with the substepping
// below it bounds how far a body can move in one step, which is what makes "did I cross a ledge" answerable.
export const MAX_FALL = 3.2;
// How much of its speed a grounded body keeps each frame with nothing pushing it. 0.80 stops a walker in
// about four frames — enough to feel like it has mass, not enough to feel like ice.
export const GROUND_FRICTION = 0.80;
export const AIR_FRICTION = 0.97;
// Below this a body is simply stopped, so nothing creeps for ever on a rounding error.
export const REST_SPEED = 0.004;
// ⚠️ A STEP NEVER COVERS MORE THAN THIS MUCH VERTICAL. Anything further is split into substeps, so a resumed
// background tab or a knockback that doubles a body's speed still tests every ledge it passes.
export const MAX_STEP_Y = 2.0;
// Still-grounded for this many frames after walking off an edge, which is what stops a hop at the lip of a
// ledge silently doing nothing. Every platformer has this and it is invisible when it works.
export const COYOTE_FRAMES = 6;

/** A body. `h` is its height and `halfW` its half-width — both used for landing and for being hit. */
export function makeBody({ x = 0, y = 0, h = 7, halfW = 2.2, speed = 1, face = 1, ...rest } = {}) {
    return { x, y, vx: 0, vy: 0, h, halfW, speed, face, grounded: true, coyote: 0, ...rest };
}

/**
 * The surface a body at `x` would land on if it fell from `fromY`.
 *
 * ⚠️ THIS TAKES THE HEIGHT IT IS FALLING FROM, WHICH IS THE WHOLE DIFFERENCE from the old floorUnder. "What
 * is under me" is not answerable from a position alone: a body inside a ledge's x-span is either standing on
 * it or walking along underneath it, and only where it came from distinguishes those.
 */
export function surfaceUnder(platforms, x, fromY) {
    let best = null;
    for (const p of platforms) {
        if (x < p.x || x > p.x + p.w) continue;
        if (p.y > fromY + 0.001) continue;          // above where we are — not something to land on
        if (!best || p.y > best.y) best = p;
    }
    return best || { x: -1e6, w: 2e6, y: 0 };
}

/** Is there floor directly beneath this body's feet? Used for edge-awareness, not for landing. */
export const hasFloorAt = (platforms, x, y) =>
    platforms.some((p) => x >= p.x && x <= p.x + p.w && Math.abs(p.y - y) < 0.35);

/**
 * Accelerate toward a direction instead of assigning a speed.
 *
 * `dir` is -1, 0 or 1. The body's own `speed` scales its ceiling, so a slow wanderer and the hero share this
 * function and differ by a number — see reuse-the-rule-never-restate-it.
 */
export function drive(body, dir, { accel = 0.09, max = 0.26 } = {}) {
    const b = body;
    if (!dir) return b;
    const ceiling = max * (b.speed || 1);
    b.vx += dir * accel * (b.grounded ? 1 : 0.6);   // less authority in the air, so a hop commits
    if (Math.abs(b.vx) > ceiling) b.vx = Math.sign(b.vx) * ceiling;
    b.face = dir;
    return b;
}

/** A hop. Only from the floor (or inside the coyote window), so double-jumping is not free. */
export function hop(body, power) {
    const b = body;
    if (!b.grounded && b.coyote <= 0) return false;
    b.vy = power;
    b.grounded = false;
    b.coyote = 0;
    return true;
}

/** Shove a body. Knockback, a loot spill, a death pop — all the same call. */
export function impulse(body, dx, dy) {
    const b = body;
    b.vx += dx;
    b.vy += dy;
    if (dy > 0) b.grounded = false;
    return b;
}

/**
 * One step of the solver, substepped so nothing tunnels.
 *
 * `bounce` is restitution for things that are meant to land twice — loot. 0 for anything that walks.
 * `clampX` keeps bodies inside the zone.
 */
export function integrate(body, platforms, dt, { bounce = 0, friction = null, clampX = null, drag = true } = {}) {
    const b = body;
    // How many substeps this frame needs to keep every vertical move under MAX_STEP_Y.
    const travel = Math.abs(b.vy * dt) + GRAVITY * dt * dt;
    const steps = Math.max(1, Math.min(8, Math.ceil(travel / MAX_STEP_Y)));
    const h = dt / steps;

    for (let i = 0; i < steps; i += 1) {
        const wasY = b.y;

        b.vy -= GRAVITY * h;
        if (b.vy < -MAX_FALL) b.vy = -MAX_FALL;
        b.x += b.vx * h;
        b.y += b.vy * h;

        if (clampX) {
            if (b.x < clampX[0]) { b.x = clampX[0]; if (b.vx < 0) b.vx = 0; }
            if (b.x > clampX[1]) { b.x = clampX[1]; if (b.vx > 0) b.vx = 0; }
        }

        // ── LANDING ─────────────────────────────────────────────────────────────────────────────────
        // ⚠️ RESOLVED AGAINST THE SURFACE WE WERE ABOVE WHEN THE STEP BEGAN, not the one under where we
        // ended up. That is what makes a platform ONE-WAY — you land on its top coming down and pass
        // straight through it going up — and it is what stops a fast fall skipping a ledge entirely.
        const surf = surfaceUnder(platforms, b.x, wasY);
        if (b.vy <= 0 && b.y <= surf.y && wasY >= surf.y - 0.001) {
            b.y = surf.y;
            b.vy = 0;
            if (bounce > 0 && Math.abs(b.vyPrev || 0) > 0.35) {
                b.vy = Math.abs(b.vyPrev || 0) * bounce;
                b.vx *= 0.6;
                b.bounced = (b.bounced || 0) + 1;
            } else {
                b.grounded = true;
            }
        } else if (b.y > surf.y + 0.001) {
            // Walked off a lip, or still rising. Keep the coyote window open for a few frames.
            if (b.grounded) b.coyote = COYOTE_FRAMES;
            b.grounded = false;
        }
        b.vyPrev = b.vy;
        if (!b.grounded && b.coyote > 0) b.coyote -= h;
    }

    // ── FRICTION ────────────────────────────────────────────────────────────────────────────────────
    // Applied once per frame rather than per substep: it is a feel number, and compounding it by the
    // substep count would make a fast-moving body stickier than a slow one for no reason a player could
    // ever see. Expressed per frame-at-60 and raised to dt so a 30fps frame decays the same amount.
    if (drag) {
        const f = friction != null ? friction : (b.grounded ? GROUND_FRICTION : AIR_FRICTION);
        b.vx *= f ** dt;
        if (Math.abs(b.vx) < REST_SPEED) b.vx = 0;
    }
    return b;
}

/**
 * Put a body on a platform.
 *
 * Luke: "just like spawn them on a platform". So this picks one and stands the body on its surface, inset
 * from the ends so nothing spawns hanging over an edge and immediately walks off it. Bodies spawn ALREADY
 * RESTING — not dropped from above — because a zone that opens with thirty creatures falling out of the sky
 * is the floating-in problem again, dressed as physics.
 */
export function spawnOnPlatform(platforms, rand, { minX = null, maxX = null, inset = 4 } = {}) {
    const usable = platforms.filter((p) => p.w > inset * 2 + 2
        && (minX == null || p.x + p.w > minX) && (maxX == null || p.x < maxX));
    const pool = usable.length ? usable : platforms;
    // Weighted by width, so a long ground plank gets its fair share of a zone's population and a 26-unit
    // ledge does not end up as crowded as the whole forest floor.
    const total = pool.reduce((a, p) => a + p.w, 0);
    let pick = rand() * total;
    let plat = pool[pool.length - 1];
    for (const p of pool) { pick -= p.w; if (pick <= 0) { plat = p; break; } }
    const lo = Math.max(plat.x + inset, minX == null ? -Infinity : minX);
    const hi = Math.min(plat.x + plat.w - inset, maxX == null ? Infinity : maxX);
    const x = hi > lo ? lo + rand() * (hi - lo) : plat.x + plat.w / 2;
    return { x, y: plat.y, platform: plat };
}

/**
 * How far a body can safely walk before the floor runs out, in the direction it is heading.
 * Lets a wanderer turn around at a lip instead of strolling off every ledge in the zone.
 */
export function edgeAhead(platforms, body, dir, look = 6) {
    for (let d = 1; d <= look; d += 1) {
        if (!hasFloorAt(platforms, body.x + dir * d, body.y)) return d;
    }
    return Infinity;
}
