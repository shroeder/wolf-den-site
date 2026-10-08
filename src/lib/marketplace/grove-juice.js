// ── GAME FEEL ────────────────────────────────────────────────────────────────────────────────────────────────
// The part of a fight that is not the arithmetic. Import-free and DOM-free like its siblings, so the numbers
// can be asserted in bare node and the scene is left owning only pixels.
//
// Luke: "when you attack enemies there's like no attack animation ... it doesn't feel like you're hitting them.
// It's missing most of the design principles around like juicy hit lag and like hit flash and all these things
// that game developers do to make it really sell the feeling of hitting an enemy."
//
// He is describing a known kit, so this is that kit, named:
//
//   HIT-STOP      both bodies freeze for a few dozen milliseconds at the moment of contact. It is the single
//                 highest-value trick in the list: it is what makes a hit read as a COLLISION rather than as a
//                 number changing, and it costs nothing but a scaled dt.
//   HIT FLASH     the struck body goes white for about a frame and a half, so the eye is told WHICH thing was
//                 hit without having to find the damage number.
//   KNOCKBACK     the target is shoved. With real physics underneath (grove-physics.js) this comes for free
//                 and carries the target's weight with it.
//   ANTICIPATION  a wind-up before the swing. Animation's oldest rule: the lead-in is what makes the action
//                 land, and a strike with no anticipation reads as a teleport.
//   SCREEN SHAKE  trauma-based, squared on the way out, so small hits barely register and a crit is felt.
//   ARCS          damage numbers and dropped loot are thrown, not tweened. A straight line reads as UI; a
//                 parabola reads as a thing in the world.
//   CHASE BAR     health drops instantly and a second bar behind it catches up, so the SIZE of the chunk you
//                 just took off is visible as a shape rather than inferred from two numbers.
//
// ⚠️ EVERY DURATION HERE IS IN MILLISECONDS OF REAL TIME, NOT IN FRAMES. Hit-stop scales dt, so anything
// measured in simulation frames would itself be frozen by the hit-stop and never end. That deadlock is easy to
// write and very confusing to debug, which is why the unit is stated in every name.

// ── HIT-STOP ────────────────────────────────────────────────────────────────────────────────────────────────
// Short. These are the values fighting games actually use — a normal hit is three or four frames at 60fps, and
// much more than that stops reading as impact and starts reading as a dropped frame.
export const HITSTOP_MS = { hit: 50, crit: 95, kill: 130, hurt: 70 };
// ⚠️ NOT A FULL FREEZE. At exactly zero the screen looks like it hitched; a sliver of motion keeps the frame
// alive and still delivers the pause. This is the dt multiplier WHILE stopped.
export const HITSTOP_SCALE = 0.06;

/** The clock the whole scene runs on: real ms in, simulation dt out. */
export function makeClock() {
    return {
        stopUntil: 0,
        /** Freeze both bodies for `ms`. Never shortens a freeze already running — a kill outranks a hit. */
        stop(now, ms) { this.stopUntil = Math.max(this.stopUntil, now + ms); },
        stopped(now) { return now < this.stopUntil; },
        /** dt in 60fps frames, clamped for a resumed tab, scaled to near-zero during hit-stop. */
        dt(now, last) {
            const raw = Math.min(34, now - last) / 16.67;
            return this.stopped(now) ? raw * HITSTOP_SCALE : raw;
        },
    };
}

// ── SCREEN SHAKE ────────────────────────────────────────────────────────────────────────────────────────────
// Trauma rather than a duration: hits ADD to a pool that decays, so three fast hits shake harder than one and
// nothing has to decide which shake "wins". Squared on the way out because linear trauma feels mushy at the
// low end — a light hit should be a twitch, not a wobble.
export const TRAUMA = { hit: 0.17, crit: 0.40, kill: 0.46, hurt: 0.52, land: 0.10, boss: 0.7 };
export const TRAUMA_DECAY = 0.055;     // per ms
export const SHAKE_MAX_PX = 13;

export function makeShaker() {
    return {
        trauma: 0,
        x: 0,
        y: 0,
        add(n) { this.trauma = Math.min(1, this.trauma + n); },
        /** `ms` is REAL elapsed time — shake must decay while hit-stop holds the simulation still. */
        step(ms, rand) {
            if (this.trauma <= 0) { this.x = 0; this.y = 0; return this; }
            this.trauma = Math.max(0, this.trauma - TRAUMA_DECAY * ms);
            const amp = this.trauma * this.trauma * SHAKE_MAX_PX;
            this.x = (rand() * 2 - 1) * amp;
            this.y = (rand() * 2 - 1) * amp * 0.7;
            return this;
        },
    };
}

// ── THE SWING ───────────────────────────────────────────────────────────────────────────────────────────────
// Three beats, and the proportions are the point: a long slow wind-up, a very fast strike, a slow settle.
// Equal thirds read as a robot waving. The strike being the SHORTEST phase is what makes it look fast.
export const SWING = { windMs: 150, strikeMs: 70, recoverMs: 190 };
export const SWING_TOTAL_MS = SWING.windMs + SWING.strikeMs + SWING.recoverMs;
// How far the hero leans back, then lunges, in world units.
export const SWING_LEAN = 1.1;
export const SWING_LUNGE = 3.4;

/**
 * Where the hero's body is in its swing: a render-only offset, never a change to the simulated position.
 *
 * ⚠️ RENDER-ONLY MATTERS. Moving the real body would change what its reach and the telegraphs resolve
 * against, so a swing would alter the fight's geometry on every frame of its own animation. Returns an offset
 * the painter adds and the simulation never sees.
 */
export function swingPose(elapsedMs, face) {
    if (elapsedMs == null || elapsedMs < 0 || elapsedMs > SWING_TOTAL_MS) return { dx: 0, sx: 1, sy: 1, t: null };
    const { windMs, strikeMs } = SWING;
    if (elapsedMs < windMs) {
        // Anticipation: back and down, easing out so it settles into the coil.
        const k = elapsedMs / windMs;
        const e = 1 - (1 - k) * (1 - k);
        return { dx: -SWING_LEAN * e * face, sx: 1 - 0.06 * e, sy: 1 - 0.05 * e, t: "wind" };
    }
    if (elapsedMs < windMs + strikeMs) {
        // The strike. Fast, stretched along the direction of travel — the classic smear.
        const k = (elapsedMs - windMs) / strikeMs;
        return { dx: SWING_LUNGE * k * face, sx: 1 + 0.16 * (1 - k), sy: 1 - 0.1 * (1 - k), t: "strike" };
    }
    // Recovery: drift back from full extension.
    const k = (elapsedMs - windMs - strikeMs) / SWING.recoverMs;
    const e = 1 - (1 - k) ** 3;
    return { dx: SWING_LUNGE * (1 - e) * face, sx: 1, sy: 1, t: "recover" };
}

// ── KNOCKBACK ───────────────────────────────────────────────────────────────────────────────────────────────
// Light, and mostly horizontal. A big vertical component launches everything into the canopy and the zone
// stops reading as a place with a floor.
export const KNOCK = { hit: 0.30, crit: 0.62, up: 0.22, upCrit: 0.44 };
// The hero's own recoil. Tiny — it exists so the two bodies react to each other rather than one being furniture.
export const RECOIL = 0.11;

// ── FLASH, SQUASH AND DEATH ─────────────────────────────────────────────────────────────────────────────────
export const FLASH_MS = 95;
export const DEATH_MS = 420;
export const SPAWN_FADE_MS = 220;

// ── THE CHASE BAR ───────────────────────────────────────────────────────────────────────────────────────────
// Luke: "how it shows their health plummeting with their like intermediate red lerp bar."
//
// Two layers. The front one IS the health and moves instantly; the one behind holds where the health used to
// be and catches up, so the red strip between them is the size of the chunk just taken off. It waits a beat
// before moving, because the pause is what makes the strip readable at all.
export const CHASE_HOLD_MS = 110;
export const CHASE_RATE = 0.011;      // share of the remaining gap, per ms

export function stepChase(bar, now, target) {
    const b = bar;
    if (target < b.shown) { b.shown = target; b.holdUntil = now + CHASE_HOLD_MS; }
    else if (target > b.shown) { b.shown = target; b.ghost = Math.max(b.ghost, target); }
    if (now >= b.holdUntil && b.ghost > b.shown) {
        b.ghost = Math.max(b.shown, b.ghost - (b.ghost - b.shown) * Math.min(1, CHASE_RATE * 16.67));
        if (b.ghost - b.shown < 0.004) b.ghost = b.shown;
    }
    return b;
}

export const makeChase = (v = 1) => ({ shown: v, ghost: v, holdUntil: 0 });

// ── NUMBERS THAT ARE THROWN ─────────────────────────────────────────────────────────────────────────────────
// A damage number is a tiny physics body with a lifetime, so it arcs. Crits are thrown harder and live longer.
export const POP_MS = { hit: 700, crit: 980, heal: 820, took: 900, loot: 1500 };
export const POP_GRAVITY = 0.019;

export function makePop(kind, x, y, rand) {
    const crit = kind === "crit";
    return {
        kind, x, y,
        vx: (rand() * 2 - 1) * (crit ? 0.34 : 0.20),
        vy: crit ? 0.70 : 0.52,
        born: 0,
        life: POP_MS[kind] || 700,
        node: null,
    };
}

export function stepPop(pop, dt) {
    const p = pop;
    p.x += p.vx * dt;
    p.vy -= POP_GRAVITY * dt;
    p.y += p.vy * dt;
    return p;
}

// ── LOOT ────────────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "when they drop loot, it needs to be like a dopamine inducing explosion of like what they drop and it
// should hang out on the ground for a while. You should actually see the sprite and the name of it before it
// gets sucked up to your character when you get close enough."
//
// So loot is three distinct stages and each one is a real behaviour rather than a transition:
//
//   SPILL   thrown out of the corpse on a radial arc, each piece a physics body, bouncing when it lands.
//   REST    sitting on the floor with its sprite and its NAME, bobbing, for long enough to read.
//   DRAWN   once the hero is close it accelerates toward them — easing IN, so it visibly commits rather than
//           sliding over at a constant speed, which is what makes a magnet feel like suction.
export const LOOT_SPILL = { up: 0.62, upVar: 0.34, out: 0.42, spin: 0 };
export const LOOT_BOUNCE = 0.42;
export const LOOT_REST_MS = 900;      // how long before it is even willing to be drawn in
export const LOOT_LABEL_MS = 4200;    // how long the name stays up
export const LOOT_DRAW_ACCEL = 0.055;
export const LOOT_DRAW_MAX = 1.5;
export const LOOT_EAT_DIST = 2.2;

/** Radial spill velocities for `n` pieces, fanned so two pieces never take the same path. */
export function spillVelocity(i, n, rand) {
    const spread = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;        // -1 .. 1
    return {
        vx: spread * LOOT_SPILL.out + (rand() * 2 - 1) * 0.1,
        vy: LOOT_SPILL.up + rand() * LOOT_SPILL.upVar,
    };
}

// ── AMBIENT LIFE ────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "the enemy sprites are like super flat looking".
//
// Some of that is the drawing and some of it is that a body standing perfectly still at a fixed scale is read
// by the eye as a sticker. A breath cycle and a landing squash cost nothing and are most of the difference
// between a sprite ON a scene and a sprite IN one. Keyed off the body's own phase so thirty creatures are not
// breathing in unison, which is its own kind of wrong.
export const BREATH_MS = 1700;
export const BREATH_AMT = 0.035;
export const WALK_BOB_AMT = 0.055;
export const WALK_BOB_MS = 380;
export const LAND_SQUASH_MS = 160;

export function breathe(phase, nowMs, moving) {
    const t = (nowMs / (moving ? WALK_BOB_MS : BREATH_MS) + phase) * Math.PI * 2;
    const amt = moving ? WALK_BOB_AMT : BREATH_AMT;
    const s = Math.sin(t);
    // Volume-preserving: wider as it gets shorter, which is what makes it read as weight rather than as a
    // scale animation.
    return { sx: 1 - s * amt * 0.5, sy: 1 + s * amt };
}

export function landSquash(sinceLandMs, force = 1) {
    if (sinceLandMs == null || sinceLandMs > LAND_SQUASH_MS) return { sx: 1, sy: 1 };
    const k = 1 - sinceLandMs / LAND_SQUASH_MS;
    const amt = 0.22 * k * k * Math.min(1, force);
    return { sx: 1 + amt, sy: 1 - amt };
}

// ── THE CONTACT SHADOW ──────────────────────────────────────────────────────────────────────────────────────
// It is the only thing on screen that says how high off the floor a body is, which makes it the thing that
// sells "grounded" — a sprite with no shadow is pasted on, and a sprite with a shadow that does not shrink as
// it rises is pasted on while moving. See sprite-floats-object-fit-contain.
export function shadowFor(heightAboveFloor, bodyH) {
    const k = Math.max(0, Math.min(1, heightAboveFloor / Math.max(1, bodyH * 1.6)));
    return { scale: 1 - k * 0.55, opacity: 0.42 * (1 - k * 0.72) };
}
