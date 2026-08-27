// ── THE TURN TIMER ───────────────────────────────────────────────────────────────────────────────────────────
// Pure. No DB, no server-only, no wall clock — same rule as arena-engine.js and arena-ring.js. The "time" in
// here is a number the ring carries and the screen plays back; nothing in this file asks what time it is.
//
// A bar per fighter that fills at their own rate. Whoever fills first swings, and their bar empties. That is
// the whole mechanic, and every other thing in this file is one of four ways to interfere with a bar.
//
// ── THIS EXISTED, AND IT WAS REMOVED, AND THAT IS THE MOST IMPORTANT THING TO KNOW ───────────────────────────
// Speed used to pace every fight: a beat came round every 1/speed. It was removed on 2026-08-21 (see the
// tombstone in arena-engine.js) because a bout is resolved ONE TAP AT A TIME on the server, and a tap returned
// your swing plus every beat the clock owed the other fighter before your next one. A faster opponent's extra
// blow therefore always arrived in a clump, in the last sentence before your turn came back, and it read as
// the game taking turns away from you. It was reported as a bug twice in one day; the second time it was not a
// bug at all — the beats were exactly the 1.06 v 1.31 speed gap, correctly applied, and unreadable.
//
// The arithmetic was never wrong. It was INVISIBLE. So the one rule this file exists to keep is:
//
//     NOTHING MAY HAPPEN THAT THE PLAYER DID NOT WATCH APPROACH.
//
// Which is why every event carries `at` — the millisecond it happens — and a snapshot of both bars. The clump
// is still there in the data. Spread across the timeline it came from, with two bars filling above it, it
// stops being a clump and becomes a thing you saw coming.
//
// If a future change makes the server hand back events without a time on them, this is back to being the
// mechanic that got removed, and no amount of tuning the rates will fix it.

// ── THE GATE ─────────────────────────────────────────────────────────────────────────────────────────────────
// Same shape as ROAD_OPEN and COMBAT_OPEN in arena.js, which is the house pattern for a subsystem that is
// finished before the room is opened. Flip ATB_OPEN to true to give it to the whole Den.
//
// AND IT IS CHECKED WHERE A BOUT IS STARTED, not where one is rendered — a bout is stamped with its mode at
// the bell and keeps it to the end, so a fight in flight is never re-decided, and there is no address a member
// can guess that puts them in a mode they were not given.
export const ATB_OPEN = false;
export const atbOpenFor = (buyerId, isOwner = false) => ATB_OPEN || Boolean(isOwner && buyerId);

// ── HOW LONG A BAR TAKES ─────────────────────────────────────────────────────────────────────────────────────
// At tempo 1.0, which is nobody: it is the reference the real numbers are measured against.
//
// SIZED OFF THE REAL LADDER, and the first attempt at this was sized off the wrong measurement. Gear-only
// ferocity (what `combatStats` returns for an equipped loadout) tops out around 40, so 5000 looked right. But
// a FIGHTER's ferocity comes through kitFor, which adds the tree and the upgrade tracks on top — and measured
// across the 40 most active arena members the real tempo spread is:
//
//     min 0.84    p25 1.02    median 1.34    p75 1.59    max 2.24
//
// At 5000 that put the median member at 3.7s and the fastest at 2.2s, well under the five seconds Luke asked
// for. 6700 puts the MEDIAN on 5.0s exactly, the slowest at 8.0s and the fastest at 3.0s.
//
// DELIBERATELY LONG TO START. Luke: "ensuring that we do it in a way that is elongated to start." A bar that
// is too slow is a pacing complaint fixed by changing this one number; a bar that is too fast is the old
// unreadable clock again, and that does not get reported as "too fast", it gets reported as the fight being
// broken. Start where the mechanic is legible and come down.
//
// The 2.67x spread between the fastest and slowest member is the EXISTING stat's spread, not something this
// introduced — it is what weapon speed and Ferocity already buy, made visible for the first time. Whether
// that gap is too wide is a balance question and deliberately not answered here.
export const BASE_FILL_MS = 6700;

// ── WHAT MAKES A BAR FILL FASTER ─────────────────────────────────────────────────────────────────────────────
// The weapon sets it and Ferocity sharpens it — the same sentence arena-kit.js's speedOf has always said, and
// the same two inputs. What changed is the divisor.
//
// arena-kit.js uses ferocity/500, which was sized for a tie-break rather than for a bar somebody watches: at
// /500 the median member's entire Ferocity investment is worth +0.006 tempo, which across a five-second bar is
// thirty milliseconds. Nobody can see thirty milliseconds. A stat that visibly does nothing is worse than a
// stat that is absent, because the player spends real points finding out.
//
// /100 measured against REAL kits (not gear-only ferocity — see the note on BASE_FILL_MS for that mistake)
// gives a tempo spread of 0.84 to 2.24 across the 40 most active arena members, which is a swing every 8.0s at
// the bottom and every 3.0s at the top. Ferocity is worth stacking and it is not the whole fight.
//
// THE 2.67x GAP IS THE EXISTING STAT'S, not this file's. Weapon speed and Ferocity already bought exactly that
// much; it was spent on a go-again chance nobody could see rather than on a bar. Whether the gap should be
// narrower is a balance question, and the answer is this one constant.
//
// speedOf is NOT reused here on purpose, and this is the one duplication in this file: it carries /500, and
// importing it to then divide the result differently would leave two divisors in play with only a comment
// explaining which is which. One function, one rate, named for the thing it paces.
export const FEROCITY_PER_TEMPO = 100;
export const BARE_TEMPO = 1;

// ── AND IT IS CLAMPED, WHICH IS THE WHOLE OF "THE NPC KEEPS SWINGING TWICE IN A ROW" ─────────────────────────
// Luke: "it appears that NPCs are still attacking twice in a row."
//
// He was right, and it was not the go-again mechanic — that is already switched off under the timer (see
// closeTurn in arena-ring.js). It was this line, with no ceiling on it.
//
// /100 was sized against MEMBER ferocity, which the note above measures at 20-140 across the forty most active
// arena members. NPC ferocity is not on that scale at all: it is a gear BUDGET that scales with the rung and
// keeps going. Measured off npcFor:
//
//     rung  40    136 ferocity   tempo 2.10      <- the band this was tuned for
//     rung  60    525            tempo 6.08
//     rung 100  7,858            tempo 79.66     <- the rung Luke was fighting
//     rung 120 30,408            tempo 305.57
//
// A bar that fills eighty times faster than yours is not a fast opponent, it is a fight you watch. Simulated
// at rung 60 against a real member's kit: 52.8% of every turn in the bout was somebody going twice in a row,
// 570 of them the NPC's, and 330 of those were runs of THREE OR MORE. That is exactly the report.
//
// ── THE CEILING IS UNDER TWICE THE FLOOR, ON PURPOSE ─────────────────────────────────────────────────────────
// Not a round number picked for looking tidy. Both bars are filled to the moment the winner's completes, the
// winner is emptied, and the loser keeps what it had — so whether a fighter can EVER swing twice in a row is
// decided by one ratio. Work it through and the fast fighter goes again only when the slow one's rate is under
// half of theirs. Keep the whole band inside a factor of two and back-to-back turns cannot happen at all,
// whatever anybody is wearing and however far the ladder inflates above what a member can carry.
//
// 2.3 / 1.2 = 1.92. The fast end is untouched (the fastest member measured 2.24); the floor lifts the slowest
// from 0.84, which costs the bottom of the range some of its spread and buys the guarantee. Ferocity and weapon
// speed still set where inside the band you sit, and still buy everything else they buy.
//
// The bar was elongated to start (see BASE_FILL_MS): this puts the slowest swing at 5.6s and the fastest at
// 2.9s, against the 8.0s / 3.0s that line was tuned to. Come down on BASE_FILL_MS, not on this.
export const TEMPO_MIN = 1.2;
export const TEMPO_MAX = 2.3;
export const tempoOf = (weaponSpeed = BARE_TEMPO, ferocity = 0) =>
    Math.max(TEMPO_MIN, Math.min(TEMPO_MAX,
        (Number(weaponSpeed) || BARE_TEMPO) + Math.max(0, Number(ferocity) || 0) / FEROCITY_PER_TEMPO));

// ── THE FOUR WAYS TO INTERFERE WITH A BAR ────────────────────────────────────────────────────────────────────
// Two of them change the RATE and two of them HOLD it, and that difference is the entire reason a player can
// tell them apart at a glance. A frozen bar that merely ran slowly would be indistinguishable from a chilled
// one, and the two mean completely different things.
export const HASTE_MULT = 2;        // green, fills at double rate
export const CHILL_MULT = 0.55;     // deep blue, fills slower — a tax, not a stop
export const HASTE_MS = 6000;       // about one of your own turns' worth
export const CHILL_MS = 8000;
export const STUN_HOLD_MS = 1000;   // yellow, the bar stops dead where it is
export const FREEZE_HOLD_MS = 1600; // pale blue, the same but longer — freeze is the bigger one

/** A fresh bar. `fill` is 0..1 of the way to a swing. */
export const newTrack = (tempo = BARE_TEMPO) => ({
    tempo: Math.max(0.2, Number(tempo) || BARE_TEMPO),
    fill: 0,
    holdUntil: 0,    // stun / freeze: the bar does not move at all until this
    hasteUntil: 0,
    chillUntil: 0,
    held: null,      // "stun" | "freeze" — what the screen should say and colour it
});

/** How fast this bar is filling AT a given moment, in fill-units per millisecond. Zero while held. */
export function rateAt(track, now) {
    if (!track) return 0;
    if (now < (track.holdUntil || 0)) return 0;
    let mult = 1;
    if (now < (track.hasteUntil || 0)) mult *= HASTE_MULT;
    if (now < (track.chillUntil || 0)) mult *= CHILL_MULT;
    return (track.tempo * mult) / BASE_FILL_MS;
}

// ── WHEN DOES THIS BAR NEXT FILL ─────────────────────────────────────────────────────────────────────────────
// Solved forward through the windows rather than by stepping a millisecond at a time: the rate is piecewise
// constant, and the only places it can change are the three `*Until` marks. So walk the edges, and between any
// two of them the answer is arithmetic.
//
// A 60,000ms ceiling stops a pathological bar — a chilled fighter with a hold that outlives the fight — from
// spinning this loop forever. It returns Infinity instead, and the caller reads that as "this one is not going
// to swing", which settle() then resolves the same way it resolves any fight nobody can win.
const HORIZON_MS = 60000;
export function fillsAt(track, now) {
    if (!track) return Infinity;
    let t = now;
    let fill = track.fill;
    for (let guard = 0; guard < 8; guard += 1) {
        const rate = rateAt(track, t);
        // The next moment the rate could change. Only marks in the FUTURE count — a window that has already
        // closed is not an edge, and treating it as one puts the walk into a loop that never advances.
        const edges = [track.holdUntil, track.hasteUntil, track.chillUntil]
            .filter((e) => e > t)
            .sort((a, z) => a - z);
        const nextEdge = edges.length ? edges[0] : Infinity;
        if (rate > 0) {
            const need = (1 - fill) / rate;
            if (t + need <= nextEdge) return t + need;
            fill += rate * (nextEdge - t);
        }
        if (nextEdge === Infinity || nextEdge - now > HORIZON_MS) return Infinity;
        t = nextEdge;
    }
    return Infinity;
}

/** Move a bar forward to `now`, honouring every window it crosses on the way. */
export function fillTo(track, from, now) {
    if (!track || now <= from) return track;
    let t = from;
    for (let guard = 0; guard < 8 && t < now; guard += 1) {
        const rate = rateAt(track, t);
        const edges = [track.holdUntil, track.hasteUntil, track.chillUntil]
            .filter((e) => e > t && e < now)
            .sort((a, z) => a - z);
        const until = edges.length ? edges[0] : now;
        track.fill = Math.min(1, track.fill + rate * (until - t));
        t = until;
    }
    // The hold is over the moment the clock passes it, and the screen must stop saying FROZEN — this is the
    // only place `held` is cleared, so a bar that is moving can never still be labelled as stopped.
    if (t >= (track.holdUntil || 0)) track.held = null;
    return track;
}

/** Empty a bar, because its owner just swung. */
export const spend = (track) => { if (track) track.fill = 0; return track; };

// ── APPLYING THE FOUR ────────────────────────────────────────────────────────────────────────────────────────
// Each EXTENDS rather than replaces, so a second stun landing on a stunned fighter adds to the hold instead of
// restarting a shorter one — being hit twice must never be better for the victim than being hit once.
export function hold(track, now, kind = "stun") {
    if (!track) return track;
    const ms = kind === "freeze" ? FREEZE_HOLD_MS : STUN_HOLD_MS;
    track.holdUntil = Math.max(track.holdUntil || 0, now) + ms;
    // A freeze showing over a stun is right: it is the longer and the more serious of the two, and if both are
    // running the bar is stopped until the freeze ends anyway.
    track.held = track.held === "freeze" ? "freeze" : kind;
    return track;
}
export function haste(track, now, ms = HASTE_MS) {
    if (!track) return track;
    track.hasteUntil = Math.max(track.hasteUntil || 0, now) + ms;
    return track;
}
export function chill(track, now, ms = CHILL_MS) {
    if (!track) return track;
    track.chillUntil = Math.max(track.chillUntil || 0, now) + ms;
    return track;
}

// ── WHAT THE SCREEN DRAWS ────────────────────────────────────────────────────────────────────────────────────
// Both bars at one instant, with the state each is in. Sent with every event rather than derived on the client:
// the client re-deriving it would be a second implementation of rateAt, and a bar that disagrees with the blow
// underneath it is exactly the class of bug this whole mode exists to remove.
export const snapshot = (track, now) => (!track ? null : {
    fill: Math.max(0, Math.min(1, track.fill)),
    // The rate as a MULTIPLE of this fighter's own baseline, so the screen can show "2x" without knowing what
    // their tempo is. 0 means stopped.
    mult: track.tempo > 0 ? Number(((rateAt(track, now) * BASE_FILL_MS) / track.tempo).toFixed(2)) : 0,
    state: now < (track.holdUntil || 0) ? (track.held || "stun")
        : now < (track.hasteUntil || 0) ? "haste"
            : now < (track.chillUntil || 0) ? "chill"
                : null,
    // How much longer the current state runs, so a bar can show a countdown rather than ending without warning.
    until: Math.max(0, Math.max(
        now < (track.holdUntil || 0) ? track.holdUntil - now : 0,
        now < (track.hasteUntil || 0) ? track.hasteUntil - now : 0,
        now < (track.chillUntil || 0) ? track.chillUntil - now : 0,
    )),
});

/** Both bars, ready to hang on a log line. */
export const bars = (atb, now) => ({ me: snapshot(atb?.me, now), foe: snapshot(atb?.foe, now), at: now });

// ── WHO SWINGS NEXT ──────────────────────────────────────────────────────────────────────────────────────────
// The one decision this file exists to make, and the single line it replaces in arena-ring.js (`ring.up = the
// other one`). Returns the side and the moment, or null if neither bar will ever fill.
//
// A TIE GOES TO WHOEVER DID NOT JUST SWING. Two identical fighters have identical bars, so without this rule
// the same side wins every tie for the whole fight and the other one never acts — the fairest-looking possible
// inputs producing the least fair possible fight.
export function nextUp(atb, now, lastActed = null) {
    const mine = fillsAt(atb?.me, now);
    const theirs = fillsAt(atb?.foe, now);
    if (!Number.isFinite(mine) && !Number.isFinite(theirs)) return null;
    if (mine === theirs) {
        const side = lastActed === "me" ? "foe" : "me";
        return { side, at: mine };
    }
    return mine < theirs ? { side: "me", at: mine } : { side: "foe", at: theirs };
}
