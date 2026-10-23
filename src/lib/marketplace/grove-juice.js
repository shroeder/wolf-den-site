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
            // ── ⚠️ CLAMPED AT BOTH ENDS, AND THE BOTTOM ONE IS NOT PARANOIA ────────────────────────
            // THE FIRST FRAME OF THE GROVE PRODUCED A NEGATIVE dt, AND IT EMPTIED THE ENTIRE ZONE.
            //
            // A requestAnimationFrame callback is handed the timestamp of the START of the frame, which can
            // be EARLIER than a performance.now() taken inside the same frame — and the loop seeds `last`
            // with performance.now() when the effect runs. So frame one routinely arrived with
            // now - last = -11ms, i.e. dt = -0.66.
            //
            // Run a physics solver backwards for one frame and gravity becomes lift: velocity goes POSITIVE
            // while position goes DOWN. Every body in the zone ended up a few hundredths of a unit below the
            // floor while rising, which fails the landing test (it requires vy <= 0) — and a body below its
            // own floor can never satisfy that test again. The whole population fell at terminal velocity
            // for ever, grounded stuck true, and the scene photographed as an empty forest with the
            // backdrop scrolling behind nothing.
            //
            // ⚠️ IT WAS NOT A LAB ARTEFACT. It would have happened on the first frame of every real zone
            // entry, on every device. Nothing threw, every gate passed, and the physics harness could not
            // see it because a harness steps with dt = 1.
            const raw = Math.max(0, Math.min(34, now - last)) / 16.67;
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

// ── THE POUNCE ──────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "I want it to be juicy. Don't overlook the fact that we put all this time and effort into making a
// dopamine inducing hit effects and stuff for the character in the grove. We also want that same thing for
// the pet, but it has to be differentiated from the character that's attacking, because otherwise it might
// just get too noisy and confusing."
//
// ⚠️ SO IT IS NOT A SWING, AND THE DIFFERENCE IS THE SHAPE OF THE MOTION, NOT THE SIZE OF IT. The tempting
// version of "differentiated" is the hero's swing scaled down and tinted — and that is precisely the thing
// that becomes noise, because two copies of one motion at two sizes is what the eye reads as one motion
// stuttering. Nothing tells you which body it belonged to without stopping to look.
//
// A pounce is a different VERB. The hero plants his feet, winds back and cuts a crescent through the target
// from where he stands; the pet gathers, throws its whole body ACROSS the gap, and snaps back out. One is an
// arc at arm's length, the other is a round trip. At a glance, from the corner of your eye, in the middle of
// a fight with four numbers on screen, you can tell which one just happened — which is the entire
// requirement.
//
// The three beats are deliberately faster than the hero's 410ms swing and front-loaded differently: a short
// coil, a very fast crossing, and a long drift back to the pet's own spot. The pet is never the body you are
// reading the fight from, so its animation has to be over quickly and then get out of the way.
// 370ms against the hero's 410. Quicker on purpose and asserted in check-grove-pet.mjs: the pet is
// never the body you read the fight from, so its animation has to be over and out of the way first.
export const POUNCE = { coilMs: 95, leapMs: 85, backMs: 190 };
export const POUNCE_TOTAL_MS = POUNCE.coilMs + POUNCE.leapMs + POUNCE.backMs;
// How far it coils back and then throws itself, in world units. The leap is larger than the hero's lunge
// (3.4) because the pet is crossing a gap rather than extending a weapon — it has to visibly ARRIVE at the
// thing it is biting, or the bite reads as happening at a distance.
export const POUNCE_COIL = 1.0;
export const POUNCE_LEAP = 5.2;
// A hop off the floor on the crossing. Small — the pet is lunging, not jumping a ledge — but a pounce with
// no vertical at all reads as a slide, and a slide is the one thing in this scene that says "animating UI".
export const POUNCE_RISE = 1.5;

/**
 * Where the pet's body is in its pounce: a render-only offset in world units, exactly like swingPose.
 *
 * ⚠️ RENDER-ONLY, for the same reason the hero's is. Moving the simulated body would mean the pet's own
 * reach test, the loot it is walking to, and the solver that keeps it on a ledge all changed on every frame
 * of its own animation. `dy` rides the same rule: the shadow stays where the feet are.
 */
export function pouncePose(elapsedMs, face) {
    if (elapsedMs == null || elapsedMs < 0 || elapsedMs > POUNCE_TOTAL_MS) {
        return { dx: 0, dy: 0, sx: 1, sy: 1, t: null };
    }
    const { coilMs, leapMs } = POUNCE;
    if (elapsedMs < coilMs) {
        // The coil: down and back, squashing. A cat flattening before it goes.
        const k = elapsedMs / coilMs;
        const e = 1 - (1 - k) * (1 - k);
        return { dx: -POUNCE_COIL * e * face, dy: 0, sx: 1 + 0.14 * e, sy: 1 - 0.18 * e, t: "coil" };
    }
    if (elapsedMs < coilMs + leapMs) {
        // The crossing. Stretched along the direction of travel and off the ground — the smear is vertical
        // here where the hero's is horizontal, because the body is travelling rather than reaching.
        const k = (elapsedMs - coilMs) / leapMs;
        return {
            dx: POUNCE_LEAP * k * face,
            // Up and back down inside the leap, so it arcs rather than hovers.
            dy: POUNCE_RISE * Math.sin(k * Math.PI),
            sx: 1 - 0.1 * (1 - k), sy: 1 + 0.2 * (1 - k), t: "leap",
        };
    }
    // The way back. Long and eased, so the pet drifts home instead of teleporting to heel.
    const k = (elapsedMs - coilMs - leapMs) / POUNCE.backMs;
    const e = 1 - (1 - k) ** 3;
    return { dx: POUNCE_LEAP * (1 - e) * face, dy: 0, sx: 1, sy: 1, t: "back" };
}

// ── ⚠️ AND THE PET'S HIT IS QUIETER THAN THE HERO'S, BY DESIGN ──────────────────────────────────────────────
// The feel kit above is a set of dials that all point at the player's attention, and attention is the one
// resource in this scene that cannot be increased. If the pet gets the hero's hit-stop, the hero's trauma and
// the hero's crit ring, then at tempo 2 something is grabbing the camera five times a second and the fight
// becomes unreadable — which is exactly the "too noisy and confusing" Luke named.
//
// So the pet gets the parts that say WHERE and WHAT, and none of the parts that say STOP AND LOOK:
//
//   HIT FLASH     yes. It is the thing that says which body was bitten, and it is free.
//   SPARKS        yes, fewer and in the pet's own colour.
//   KNOCKBACK     a fraction. The target twitches; it is not thrown.
//   DAMAGE NUMBER yes, in the pet's colour, smaller. See .gv-num.is-pet.
//   HIT-STOP      NEVER. This is the important one. Hit-stop freezes the whole simulation, and a second
//                 body freezing it on its own schedule is not twice the impact, it is a stutter. The hero
//                 owns time in this scene.
//   SCREEN SHAKE  a sixth, and only on a crit. Below that it is indistinguishable from the hero's and
//                 therefore just adds to the total amount of shaking.
//   CRIT RING     NEVER. The ring is the one thing an ordinary hero hit never does, which is what makes it
//                 readable (see the note in GroveScene). Spending it on the pet as well is how a signal
//                 stops being a signal.
export const PET_TRAUMA_SHARE = 0.17;
export const PET_KNOCK_SHARE = 0.3;
export const PET_SPARKS = 0.5;

// ── KNOCKBACK ───────────────────────────────────────────────────────────────────────────────────────────────
// Light, and mostly horizontal. A big vertical component launches everything into the canopy and the zone
// stops reading as a place with a floor.
export const KNOCK = { hit: 0.30, crit: 0.62, up: 0.22, upCrit: 0.44 };
// The hero's own recoil. Tiny — it exists so the two bodies react to each other rather than one being furniture.
export const RECOIL = 0.11;

// ── FLASH, SQUASH AND DEATH ─────────────────────────────────────────────────────────────────────────────────
export const FLASH_MS = 95;
export const SPAWN_FADE_MS = 220;

// ── DYING ───────────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "We want death animations for enemies and our character."
//
// What was here before was a PINWHEEL: a constant 14 degrees a frame until the sprite had faded out, applied
// identically to a rat and to a boss. It reads as the creature being deleted rather than killed, and it reads
// the same whatever just died, which wastes the single most repeated beat in the whole feature.
//
// A death is a FALL. The body is launched by the blow, topples away from it, hits the floor, and only then
// goes. Three things make that land:
//
//   1. THE ROTATION EASES OUT. A constant spin has no weight — nothing in the world turns at a fixed rate on
//      the way down. Fast at the start while the blow still owns it, slowing as it meets the ground.
//   2. IT TOPPLES AWAY FROM THE BLOW, not in a fixed direction, so the death points back at what caused it.
//   3. IT IS STILL IN THE SOLVER. Already true and worth keeping: a creature killed on a ledge falls off it,
//      which no canned animation could do.
//
// ⚠️ ANGLES AND DURATIONS ONLY — NO DISTANCES. Everything positional here is either degrees or a share of the
// body's own height, because a tuned distance in world units is a share of the frame in disguise and breaks
// the moment the Grove's zoom changes. See [[view-space-constants-break-on-zoom]].
export const DEATH = {
    // A rat should be gone before you have finished the swing; a boss should take long enough that you watch.
    small:  { ms: 380, lean: 88, launch: 0.95, up: 0.85, dust: 0.85 },
    normal: { ms: 520, lean: 82, launch: 0.75, up: 0.72, dust: 1.00 },
    big:    { ms: 820, lean: 70, launch: 0.42, up: 0.46, dust: 1.70 },
};
/** Which weight class a creature dies in. Bosses and rares get the heavy fall. */
export const deathKit = (foe) => (foe?.isBoss || foe?.big || foe?.rare)
    ? DEATH.big
    : ((foe?.h || 1) <= 0.85 ? DEATH.small : DEATH.normal);

// The body settles INTO the floor as it goes, as a share of its own height. Sinking rather than simply
// fading is most of what stops it reading as a sprite being switched off.
export const DEATH_SINK = 0.22;
// It holds full opacity for this share of the fall, so the topple is watched rather than faded through.
export const DEATH_OPAQUE_UNTIL = 0.55;
// The squash when a toppling body hits the floor, and how long it holds.
export const DEATH_IMPACT = { sx: 1.26, sy: 0.72, ms: 150 };

// ── THE HERO'S DEATH ────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ THE HERO HAD NO DEATH AT ALL. Hitting zero fired a hitstop, a shake and a sound, and then a dark panel
// slid over a hero who was still standing up straight underneath it. The one moment that ends the run was the
// only beat in the feature with nothing on screen.
//
// He falls slower than anything he kills — it is the only death the player is meant to feel — and he does NOT
// vanish. He stays on the floor at a readable opacity while the veil comes over him, because the run ending
// with the body still there is the picture, and a hero who dissolves reads as a disconnect.
export const HERO_DEATH = {
    ms: 820,
    lean: 74,              // degrees; he keels rather than going fully flat
    launch: 0.85,          // thrown back by whatever killed him
    up: 0.55,
    rest: 0.5,             // the opacity he settles at, never 0
    knee: 0.38,            // share of the fall spent buckling before he goes over
};
// ⚠️ THE DARK WAITS FOR THE FALL. The veil used to arrive in 320ms over a standing hero. It now holds until
// he is down, because covering the animation that was just built is the one way to waste it. The comment on
// .gv-dead still stands — a dimmed, still-moving zone reads as a stutter — but a zone whose only remaining
// motion is the hero going down is not that.
export const DEATH_VEIL_DELAY_MS = 560;

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

// ── ⚠️ AND THE BAR ITSELF REACTS, NOT JUST ITS WIDTH ────────────────────────────────────────────────────────
// Luke: "damage numbers and hp bar effects should be way more juicy."
//
// A width that changes is INFORMATION; what makes it feel like a hit is the bar being struck. Three things,
// all keyed off the same moment: a white wash over the whole strip, a sideways jolt, and a swell in height.
// They are short — the point is that the eye catches movement at the bar without being asked to look at it.
export const BAR_HIT_MS = 190;
export const BAR_JOLT_PX = 2.6;
export const BAR_SWELL = 0.3;        // extra height, as a share, at the moment of the hit

/** The bar's reaction `ms` after it was struck: a flash, a jolt and a swell, all decaying together. */
export function barHit(sinceMs) {
    if (sinceMs == null || sinceMs < 0 || sinceMs > BAR_HIT_MS) return { flash: 0, jolt: 0, swell: 1 };
    const k = 1 - sinceMs / BAR_HIT_MS;
    const e = k * k;
    return {
        flash: e,
        // Alternating rather than decaying in one direction: a jolt that only goes one way is a nudge.
        jolt: Math.sin(sinceMs / BAR_HIT_MS * Math.PI * 3) * BAR_JOLT_PX * e,
        swell: 1 + BAR_SWELL * e,
    };
}

// ── WHAT COLOUR A BAR IS ────────────────────────────────────────────────────────────────────────────────────
// ⚠️ THREE BANDS, NOT A HUE RAMP. A continuous green-to-red interpolation spends most of its range in the
// muddy olive-to-ochre middle, where nothing reads as either healthy or in trouble — and "in trouble" is the
// only thing this colour is for. Hard bands at a third and a sixth say it in one glance.
export const BAR_BANDS = [
    { at: 0.34, from: "#ffd35e", to: "#ffb01f" },
    { at: 0.16, from: "#ff7a5e", to: "#e8361f" },
];
export const BAR_FULL = { from: "#9be36a", to: "#5aa833" };
export function barColor(frac) {
    let out = BAR_FULL;
    for (const b of BAR_BANDS) if (frac <= b.at) out = b;
    return out;
}

// ── A DAMAGE NUMBER ARRIVES, IT DOES NOT APPEAR ─────────────────────────────────────────────────────────────
// ⚠️ THE ARC WAS THE ONLY THING THESE EVER DID, AND AN ARC IS NOT AN IMPACT. A number that fades in at its
// final size reads as a label that was always going to be there. Punched in over-sized and snapped down to
// its real size in a seventh of a second is the whole difference between a notification and a hit — it is
// the same anticipation-then-snap the swing itself is built out of, at a tenth of the duration.
export const POP_PUNCH_MS = 150;
export const POP_PUNCH_FROM = 1.85;   // how much bigger it lands than it ends
export const POP_PUNCH_OVER = 0.08;   // the overshoot under the settle, so it has somewhere to come back from

/** The scale of a damage number `ms` after it was thrown. Punches in, undershoots, settles at 1. */
export function popScale(ageMs) {
    if (ageMs == null || ageMs < 0) return POP_PUNCH_FROM;
    if (ageMs >= POP_PUNCH_MS) return 1;
    const k = ageMs / POP_PUNCH_MS;
    // Two beats inside the punch: the collapse from oversized, then the small bounce back up to 1.
    if (k < 0.62) return POP_PUNCH_FROM + (1 - POP_PUNCH_OVER - POP_PUNCH_FROM) * (k / 0.62);
    return (1 - POP_PUNCH_OVER) + POP_PUNCH_OVER * ((k - 0.62) / 0.38);
}

// ── ⚠️ A BIG HIT HAS TO LOOK BIG, AND "BIG" IS A SHARE OF THE TARGET ────────────────────────────────────────
// Every damage number in the Grove was the same size, so 4 off a rootrat and 400 off the Heartwood Elder
// arrived with identical weight — the one piece of feedback that could say "that was a good hit" was saying
// nothing at all. A flat damage threshold cannot work either: 400 is a huge hit on a rootrat and a scratch
// on a boss. What makes a hit feel big is the CHUNK it took out, which is damage over the target's max.
export const POP_SIZE_MIN = 0.86;
export const POP_SIZE_MAX = 1.7;
export const POP_BIG_AT = 0.14;       // a hit worth this share of the target is "big" and gets the loud class

/** How large a hit's number should be drawn, from the share of the target's health it removed. */
export function popWeight(dealt, maxHp) {
    const share = Math.max(0, Math.min(1, (Number(dealt) || 0) / Math.max(1, Number(maxHp) || 1)));
    // Square-rooted: the first few percent is where the interesting range is, and a linear map leaves every
    // ordinary hit identical at the bottom of the scale.
    const k = Math.sqrt(Math.min(1, share / 0.35));
    return { scale: POP_SIZE_MIN + (POP_SIZE_MAX - POP_SIZE_MIN) * k, big: share >= POP_BIG_AT };
}

// ── THE FLOATING ENEMY BAR ──────────────────────────────────────────────────────────────────────────────────
// Luke: "Enemies should have hp bars."
//
// ⚠️ NOT ON ALL THIRTY OF THEM AT ONCE. A zone holds 15 to 30 wandering creatures and a permanent bar over
// every one is a row of UI across the forest — it would undo the work that made these read as animals in a
// place rather than targets on a screen. A bar appears when the creature is HURT or is the one you are
// fighting, and fades out again when neither is true. Which is also why it is cheap: the loop only steps a
// chase bar for the handful that are actually showing one.
export const FOE_BAR_LINGER_MS = 2600;

// ── NUMBERS THAT ARE THROWN ─────────────────────────────────────────────────────────────────────────────────
// A damage number is a tiny physics body with a lifetime, so it arcs. Crits are thrown harder and live longer.
//
// ⚠️ A COLLECTED-LOOT LABEL IS NOT ONE OF THESE, AND TREATING IT LIKE ONE PUT TEXT IN THE TREES. Thrown
// at a damage number's 0.52 against this gravity it apexes SEVEN UNITS up, which on top of the hero's head
// is fifteen units off the floor — better than halfway up a phone screen — and at a 1.5 second life several
// of them hang there at once. On film it read as floating words in the canopy with no relationship to
// anything. A damage number wants to be thrown because it is an IMPACT; a pickup wants to drift off the
// hero's shoulder, because it is a receipt.
// ⚠️ AND THE THROW IS MEASURED AGAINST THE CREATURE, NOT PICKED BY FEEL. apex = vy squared over twice
// gravity, so the old 0.52 against 0.019 threw every number SEVEN UNITS up — two and a half times the
// height of the rootrat it came off, which put it better than halfway up a phone screen. On film there were
// five numbers hanging in the canopy at once with nothing under them. A damage number has to stay near the
// body it describes or it stops being feedback and becomes weather.
//
//   hit   apex 2.6 units — about the height of a rootrat, so it clears the body and no more
//   crit  apex 4.5       — higher on purpose: the arc itself is part of what says this one was bigger
// ⚠️ A PROC HOLDS, IT IS NOT THROWN. A damage number is one of several on screen and gets out of the way
// quickly; a proc is the only thing saying the player's own gear just fired, and it is rarer than a hit by
// an order of magnitude. It rises straight, with no sideways drift, and stays long enough to be read.
// ⚠️ pet IS A REGISTERED KIND, NOT A FALLBACK. makePop reads POP_MS[kind] || 700 and POP_THROW[kind] ||
// POP_THROW.hit, so an unlisted kind silently inherits a HIT's lifetime and a hit's arc — which is how the
// pet's bite ended up thrown on the same trajectory, for nearly the same duration, as the blow it is
// supposed to be distinguishable from. Filmed at 375px the two numbers overlapped into unreadable gibberish
// and the DOM had to be read to find out what they even said. Nothing threw, nothing errored, and the
// defect was invisible at desktop width.
//
// The pet's number is the shortest-lived on the board: it fires twice as often as anything else here and it
// describes the smaller half of the damage, so it has to clear out of the way of the number the player is
// actually reading.
// `multi` is the longest-lived number in the game on purpose: an overkill worth four kills happens a few
// times a zone, not sixty times a minute, and it is the only pop that reports PROGRESS rather than damage.
export const POP_MS = { hit: 620, crit: 820, heal: 700, took: 760, loot: 850, proc: 900, pet: 520, multi: 1000 };
export const POP_GRAVITY = 0.028;
const POP_THROW = {
    hit: { vy: 0.38, vx: 0.17 },
    crit: { vy: 0.50, vx: 0.30 },
    heal: { vy: 0.32, vx: 0.14 },
    took: { vy: 0.42, vx: 0.22 },
    loot: { vy: 0.20, vx: 0.07 },
    // Straight up, no sideways throw: nothing about a proc should look like it was knocked loose by a blow.
    proc: { vy: 0.30, vx: 0 },
    // A lower, wider arc than a hit. Lower so it stays down near the legs where the bite landed instead of
    // climbing into the band the hero's number occupies; wider so two bites in a row do not stack into one
    // column. apex is vy squared over twice gravity: 1.6 units here against the hit's 2.6.
    pet: { vy: 0.30, vx: 0.26 },
    // Straight up and higher than anything else, like the proc words: a multi-kill was not knocked loose by
    // the blow, it IS the blow, and it has to clear the damage number thrown off the same body on the same
    // frame rather than tangle with it.
    multi: { vy: 0.56, vx: 0 },
};

export function makePop(kind, x, y, rand) {
    const throwing = POP_THROW[kind] || POP_THROW.hit;
    return {
        kind, x, y,
        vx: (rand() * 2 - 1) * throwing.vx,
        vy: throwing.vy,
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
export const LOOT_LABEL_MS = 2800;    // how long the name stays up — 4.2s put four names on screen at once
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

// ── SPARKS AND DUST ─────────────────────────────────────────────────────────────────────────────────────────
// Particles are the cheapest thing on this list and they do a specific job: they put the moment of contact in
// a PLACE. A damage number tells you how much; a burst of sparks at the point of impact tells you where, and
// the eye needs the where first. Dust does the same for weight — a body that lands without disturbing
// anything has no mass.
//
// ⚠️ THEY ARE DELIBERATELY FEW. Eight sparks a hit at thirty bodies is still nothing, but two hundred is a
// phone dropping frames in the middle of a fight, which costs more feel than the sparks add.
export const SPARK = { n: 8, nCrit: 14, speed: 0.55, speedCrit: 0.95, life: 320, lifeCrit: 440, gravity: 0.028 };
export const DUST = { n: 5, speed: 0.22, life: 380, gravity: 0.006 };

/** One particle, thrown from a point. Angles are fanned deterministically so a burst reads as a burst. */
export function makeSpark(i, n, x, y, { speed, life, dir = 0, rand }) {
    // Biased into the half-plane the blow came from, so a burst leans away from the hit rather than being a
    // symmetrical firework. A symmetrical burst reads as an explosion; a leaning one reads as an impact.
    const spread = (i / Math.max(1, n - 1)) * Math.PI - Math.PI / 2;
    const a = spread + (dir ? dir * 0.5 : 0) + (rand() - 0.5) * 0.4;
    const v = speed * (0.55 + rand() * 0.75);
    return { x, y, vx: Math.cos(a) * v, vy: Math.abs(Math.sin(a)) * v * 0.9 + 0.1, born: 0, life, node: null };
}

// ── THE SCREEN ITSELF REACTS ────────────────────────────────────────────────────────────────────────────────
// A red wash at the edges when you are hit, and a slow pulse while you are nearly dead. This is the one piece
// of feedback a player cannot miss while looking at their own character instead of the health bar — and in a
// game where death sends you back to town, "I did not notice I was low" is the complaint it prevents.
export const VIGNETTE = { hurtMs: 420, lowAt: 0.3, pulseMs: 1100 };

// ── THE COMBO ───────────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ PRESENTATION ONLY — IT PAYS NOTHING, AND THAT IS DELIBERATE. The Grove is a kill loop with no daily
// cap, so anything that multiplies rewards for killing faster is a faucet with a pedal on it (see
// economy-nerf-measure-daily-total and gold-mint-rate-lever). What a streak is FOR here is the rhythm: a
// number that climbs, a sound that rises with it, and a word at the rungs. That is most of what a grinder's
// dopamine actually comes from, and it costs the economy nothing at all.
//
// The window is short on purpose. Long enough to survive walking to the next creature, not long enough that
// it is simply always on — a counter that never drops is a label, not a streak.
export const COMBO_WINDOW_MS = 3400;
export const COMBO_RUNGS = [
    { at: 5, label: "Nice" },
    { at: 12, label: "Rolling" },
    { at: 25, label: "Relentless" },
    { at: 45, label: "Unstoppable" },
    { at: 80, label: "The Grove Remembers" },
];
/** ⚠️ FAILS UPWARD — a streak past the last rung keeps the last rung. See ladder-lookups-must-fail-upward. */
export function comboRung(n) {
    let out = null;
    for (const r of COMBO_RUNGS) if (n >= r.at) out = r;
    return out;
}
// How far up the hit sound walks as a streak builds. Capped, because a pitch that keeps rising becomes a
// whistle, and because the ceiling is what makes reaching it feel like something.
export const COMBO_PITCH_STEPS = 12;
