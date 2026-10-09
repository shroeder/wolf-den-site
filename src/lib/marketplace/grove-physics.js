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
// ── ⚠️ HOP LIVES HERE NOW, NOT IN grove-world.js, BECAUSE IT IS MEANINGLESS AWAY FROM GRAVITY ──────────
// A jump height is the PAIR (power, gravity) and nothing else: 2.0 against 0.055 apexes at v2/2g = 36 units,
// which clears the 26-unit first tier with room to misjudge and takes about 0.6s to get there. Written in two
// different files those two numbers drift apart, and the symptom is a hero who can no longer reach a ledge —
// which reads as a level-design problem rather than as a constant having moved. grove-world.js carried its own
// GRAVITY alongside this repo's other scar about exactly that (balance-constants-never-copied).
export const HOP = 1.35;
// How high a body can get from a standing hop, which is what any pathing has to be allowed to assume.
export const HOP_RISE = (HOP * HOP) / (2 * GRAVITY);

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
// ⚠️ TOP SPEED AGAINST THE FRAME, NOT AGAINST NOTHING. 0.26 a frame is 15.6 units a second, which
// crosses an eighteen-unit phone frame in 1.15 seconds — a sprint, and fast enough that the hero outruns the
// camera's own easing. 0.22 crosses it in 1.4s, which still feels brisk and keeps him inside the deadzone.
export function drive(body, dir, { accel = 0.08, max = 0.22 } = {}) {
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

    // ── ⚠️ THE BACKSTOP: NOTHING IS EVER BELOW THE GROUND ───────────────────────────────────────────
    // The landing test above is deliberately one-way — it only catches a body that was ABOVE a surface when
    // the step began — and that is what makes platforms passable from underneath. The cost is that a body
    // which somehow ends up UNDER a floor can never land again: it falls at terminal velocity for ever with
    // grounded stuck at whatever it was. That is not a theoretical hole; it is exactly what a single
    // negative-dt frame did to every body in the Grove at once (see makeClock in grove-juice.js).
    //
    // The ground is y = 0 and platformsFor guarantees it is continuous across the whole zone, so "below
    // zero" is never a legal position for anything. Catching it here rather than only fixing the clock is
    // the difference between fixing one bug and closing the trapdoor: a future tunnelling cause — a resumed
    // tab, a huge knockback, a dt that is NaN — lands a body back on the floor instead of deleting the
    // entire population of the zone in a way that reads as the sprites having failed to load.
    if (b.y < 0) {
        b.y = 0;
        if (b.vy < 0) b.vy = 0;
        b.grounded = true;
        b.recovered = (b.recovered || 0) + 1;
    }
    if (!Number.isFinite(b.y) || !Number.isFinite(b.vy)) {
        b.y = 0; b.vy = 0; b.vx = 0; b.grounded = true;
        b.recovered = (b.recovered || 0) + 1;
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

/**
 * The ledge the body should get onto NEXT on its way to a goal, or null if there is no climbing left to do.
 *
 * ⚠️ IT WALKS THE PARENT CHAIN THE GENERATOR RECORDED, rather than looking for the nearest ledge above.
 * Nearest-above is the obvious implementation and it does not work: tier two sits above ONE tier-one ledge,
 * so a hero who walks to the tier-one ledge closest to the goal and then looks up finds a ledge it cannot
 * reach from where it is standing, walks at it, falls off the lip, lands, and repeats — a creature visibly
 * trying and visibly failing, for ever. The chain is the only thing that knows which ledge leads where.
 */
export function routeTo(platforms, body, goalX, goalY) {
    const goal = surfaceUnder(platforms, goalX, goalY + 0.5);
    const at = surfaceUnder(platforms, body.x, body.y + 0.5);
    // Goal down to the ground. Bounded — a malformed chain must not spin the frame.
    const chain = [];
    let p = goal;
    while (p && chain.length < 8) {
        chain.push(p);
        p = p.parent >= 0 ? platforms[p.parent] : null;
    }
    const idx = chain.indexOf(at);
    if (idx === 0) return null;                  // already on the goal's own ledge
    if (idx > 0) return chain[idx - 1];          // the next rung up
    // Not on the route at all: the thing to do is get back to its foot, which for anything standing on a
    // ledge means walking at it and coming off the lip. Returning the chain's lowest LEDGE (not the ground)
    // is what points the walk the right way along the zone.
    return chain.length > 1 ? { ...chain[chain.length - 2], descend: true } : null;
}

/**
 * Which way to walk, and whether to hop, to get from a body to a point — INCLUDING a point on a ledge above it.
 *
 * ⚠️ NOTHING IN THE GROVE COULD CLIMB BEFORE THIS, AND THE LEDGES HAVE EXISTED SINCE THE FIRST VERSION.
 * Luke asked for zones where "the hero and pet can navigate left and right and hop platforms making the zone
 * vertical", the platform ladder was built, the ledges were drawn, enemies were spawned onto them — and the
 * only mover in the scene walked toward a target x and never jumped. So every creature standing on a ledge
 * was unreachable, every ledge was scenery, and the vertical half of the zone was decoration. A thing the
 * player can see, can tap, and cannot get to is worse than one that is not there.
 *
 * Returns { dir, hop } — an intent, never a position. The caller passes dir to drive() and hop to hop(), so
 * the result still goes through the solver and a climbing body keeps its weight, friction and knockback. A
 * body knocked off mid-climb simply re-plans from wherever it landed; no path is stored and none goes stale.
 */
export function navigate(platforms, body, goalX, goalY, { arrive = 1.6 } = {}) {
    const b = body;
    const walk = (toX) => {
        const dx = toX - b.x;
        return { dir: Math.abs(dx) > arrive ? Math.sign(dx) : 0, hop: false };
    };
    // Level with us, or below: walk at it. Falling needs no decision — the lip of the ledge makes it.
    if (goalY - b.y < 4) return walk(goalX);

    const next = routeTo(platforms, b, goalX, goalY);
    if (!next) return walk(goalX);
    if (next.descend) return walk(next.x + next.w / 2);

    const at = surfaceUnder(platforms, b.x, b.y + 0.5);
    // ⚠️ AIM INSIDE THE OVERLAP OF WHAT WE ARE ON AND WHAT WE ARE CLIMBING ONTO. That intersection IS the
    // launch pad — the only stretch of floor from which a straight-up hop lands on the next rung. The
    // generator guarantees it is at least TIER_OVERLAP wide.
    const lo = Math.max(next.x + 1, at.x + 1);
    const hi = Math.min(next.x + next.w - 1, at.x + at.w - 1);
    const pad = hi > lo;
    const over = pad && b.x >= lo && b.x <= hi;
    if (!pad) return walk(next.x + next.w / 2);
    // Aim at the middle of the pad rather than its lip, biased toward the goal — hopping off the very edge of
    // the launch pad lands on the very edge of the ledge above, which is where a body then slides off.
    const aim = Math.max(Math.min(lo + 2, hi), Math.min(Math.max(hi - 2, lo), goalX));
    // ⚠️ NO ARRIVAL TOLERANCE WHILE CLIMBING, AND THAT IS NOT A DETAIL — IT WAS A DEADLOCK. walk()
    // stops pushing once it is within 1.6 units of its aim, which is fine for a destination and fatal for a
    // launch pad: a body standing 0.3 units SHORT of the pad was "arrived", so dir went to 0 while over
    // stayed false, and it stood there not climbing for ever. Four ledges across five zones were unreachable
    // for exactly that reason and the symptom was a hero who simply would not jump. Pushing until over is
    // true always terminates, because aim is strictly inside the pad.
    return { dir: over ? 0 : Math.sign(aim - b.x) || 1, hop: over && (b.grounded || b.coyote > 0) };
}

/**
 * A wandering body's next intent: amble, pause, turn at a lip, occasionally hop.
 *
 * ⚠️ IT TURNS AROUND AT AN EDGE RATHER THAN WALKING OFF IT. The old wanderer authored a target x and let
 * gravity sort out the rest, so a zone's whole population drained off its ledges onto the floor within about
 * twenty seconds and every ledge was permanently empty — which is the same bug as the ledges being
 * unreachable, seen from the other side. edgeAhead is what a creature uses to notice the floor ends.
 */
export const WANDER_HOP_CHANCE = 0.18;
export function wanderIntent(body, platforms, rand, dt) {
    const f = body;
    f.wait = (f.wait || 0) - dt;
    if (f.wait <= 0) {
        const roll = rand();
        f.wdir = roll < 0.3 ? 0 : roll < 0.65 ? -1 : 1;
        f.wait = 30 + rand() * 110;
        f.wantHop = f.grounded && rand() < WANDER_HOP_CHANCE;
    }
    let dir = f.wdir || 0;
    // The floor runs out ahead: turn now and commit to the new direction, so it does not jitter on the lip.
    if (dir && edgeAhead(platforms, f, dir, 4) < 4) { dir = -dir; f.wdir = dir; f.wait = 30 + rand() * 60; }

    // ── ⚠️ A HOP IS IN PLACE, AND NEVER NEAR A LIP ──────────────────────────────────────────────────
    // Turning round at an edge is not enough on its own. A hop carries about eighteen units of horizontal
    // drift, and air friction barely touches it, so a creature that hopped anywhere near the end of its
    // ledge sailed off it — 28 of 40 wanderers were on the floor within fifteen seconds of a test that only
    // ever asked them to amble. Every ledge in the zone emptying itself looks exactly like enemies never
    // having been put there.
    let hop = Boolean(f.wantHop);
    f.wantHop = false;
    if (hop && f.y > 0.5 && Math.min(edgeAhead(platforms, f, 1, 5), edgeAhead(platforms, f, -1, 5)) < 5) hop = false;
    // Up, not along: the hop is a bit of life, not travel.
    return { dir: hop ? 0 : dir, hop };
}
