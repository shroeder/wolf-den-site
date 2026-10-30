// ── THE FORGE'S TEN ─────────────────────────────────────────────────────────────────────────────────────────
// Luke: "The crafting minigame sucks. I think that it should, instead of being deterministic, it should be
// random. It should pull from, like, let's say 10 different kind of mini games, and I expect you to make all
// the mini games up, and they all have to look amazing and beautiful, and you have to be proud of it, and
// they all have to be super clear. So it'll pull from a pool of 10 mini games randomly, and it'll pull three
// of them, and there's clearly three phases."
//
// ⚠️ THIS FILE IS THE REGISTRY AND THE SPEC AT ONCE, on purpose. A design doc describing ten minigames and a
// table implementing ten minigames drift the first time one is tuned, and the doc is the half nobody updates.
// What a game IS lives here; how it is drawn lives in its component.
//
// ── THE RULES EVERY ONE OF THEM OBEYS ───────────────────────────────────────────────────────────────────────
//
// 1. ONE NUMBER OUT, 0..1. A phase reports how well it went and nothing else. The act weights three of them
//    (see actScore) and the economy never learns which games were played — so adding an eleventh, or cutting
//    one that turns out to be miserable, cannot move crafting's balance by a hair.
//
// 2. ⚠️ NO INSTRUCTIONS, EVER. teach-by-showing-not-telling. Each one has to be legible from its own picture
//    in the first half-second: a thing that is obviously moving, an obviously good place for it to be, and
//    an obviously single way to act. If a game needs a sentence under it, it is the wrong game and it does
//    not go in the pool.
//
// 3. ONE THUMB, ONE SCREEN. Every verb below is reachable with the hand already holding the phone. No
//    two-finger gestures, nothing in a corner, nothing that needs the other hand.
//
// 4. ⚠️ A DISTINCT VERB EACH. Ten variations on "tap at the right moment" is one minigame wearing ten hats,
//    and a pool of those is worse than the single act it replaced — the draw would stop meaning anything.
//    The `verb` field exists so that rule is checkable rather than hoped for; check-minigames.mjs asserts
//    all ten are different.
//
// 5. FAILURE IS SURVIVABLE AND VISIBLE. No phase can score below 0, every one can be read at a glance as
//    going badly while it goes badly, and none of them can be lost in a way that wastes the parts — a bad
//    craft is a Rough item, never nothing.

/**
 * @typedef {object} Minigame
 * @property {string} id       stable key; stored nowhere, so renaming is free
 * @property {string} name     what the player sees on the phase banner
 * @property {string} verb     the INTERACTION, one per game — see rule 4
 * @property {string} reads    what the picture says without words, in one line
 * @property {number} ms       how long the phase runs; the pool is deliberately not uniform
 * @property {string} tint     the phase's colour, used by the banner and its own art
 * @property {number} room     which of the act's three painted backdrops it is played in:
 *                             0 the forge, 1 the anvil, 2 the rack.
 *
 * ⚠️ THE ROOM IS NOT DECORATION. The act owns three paintings and a hot spot measured on each (see
 * STAGE_ANCHOR), so a game has to say where it happens or the work-piece ends up hovering in front of a
 * fire it is not in. Heat work goes in the forge, metal work on the anvil, finishing at the rack.
 */

/** @type {Minigame[]} */
export const MINIGAMES = [
    {
        id: "bellows", room: 0, name: "The Bellows", verb: "tap-fast", ms: 2600, tint: "#ff8a3c",
        reads: "A bar that empties while you watch and a button the size of your thumb.",
        // The one that already existed. Kept because a flat-out sprint is the right way to OPEN a craft —
        // it spends the player's nerves early and makes the quieter games afterwards feel like precision.
    },
    {
        id: "anvil", room: 1, name: "The Anvil", verb: "timed-stop", ms: 3450, tint: "#ffd75e",
        reads: "A marker sweeping a bar with a bright zone in the middle of it.",
        // Also already existed, as three strikes. Three beats of the same verb is one game, so in the pool
        // it keeps its three swings and reports their average.
    },
    {
        id: "quench", room: 0, name: "The Quench", verb: "precision-window", ms: 2400, tint: "#5ad7ff",
        reads: "Heat falling fast down a gauge, and a narrow band it has to be caught inside.",
        // One shot. The needle drops from white through orange to grey and the band sits where the steel is
        // right; late is brittle, early is soft. The tension is that it only ever gets harder to hit.
    },
    {
        id: "draw", room: 0, name: "The Draw", verb: "hold-release", ms: 3200, tint: "#9ad86a",
        reads: "Metal stretching longer the longer you hold, and a strain line creeping toward red.",
        // Press and the bar grows; let go and you keep what you drew. Hold past the line and it snaps, which
        // is the only game in the pool with a real bust — and the reason it is worth having.
    },
    {
        id: "fold", room: 1, name: "The Fold", verb: "rhythm-alternate", ms: 3600, tint: "#c89bff",
        reads: "Two plates and a beat, lighting left, right, left.",
        // Alternate sides ON the beat. Hitting the same side twice does nothing at all, which teaches the
        // rule in one mistake instead of one sentence.
    },
    {
        id: "grind", room: 1, name: "The Grind", verb: "speed-drag", ms: 3400, tint: "#b9c6d4",
        reads: "A stone you drag along an edge, with sparks that get fat when you go too hard.",
        // Steady wins. Too fast throws sparks and burns the temper; too slow leaves the edge dull. The
        // feedback IS the score: the spark size is the error term, drawn.
    },
    {
        id: "temper", room: 0, name: "The Temper", verb: "spin-stop", ms: 2800, tint: "#ff6f91",
        reads: "A dial spinning past a mark, and one button.",
        // A single stop, no second chance. The dial accelerates slightly as it goes, so waiting for a
        // cleaner pass costs you.
    },
    {
        id: "rivet", room: 1, name: "The Rivets", verb: "reaction-sequence", ms: 3300, tint: "#ffc24d",
        reads: "Rivets that appear one at a time and shrink; hit each before it is gone.",
        // Pure reaction, five of them. The only game where the targets move position, so it is the one that
        // makes a player sit up straight.
    },
    {
        id: "polish", room: 2, name: "The Polish", verb: "coverage-scrub", ms: 3600, tint: "#ffe9a8",
        reads: "A dull surface that brightens exactly where your thumb has been.",
        // Coverage, not speed. Scrubbing one spot forever gets you nothing; the score is how much of the
        // face you actually reached. Deliberately the calmest game in the pool.
    },
    {
        id: "inlay", room: 2, name: "The Inlay", verb: "path-trace", ms: 4000, tint: "#7fe3c4",
        reads: "A gold channel winding across the piece, and a bead that follows your finger.",
        // Trace the channel without leaving it. The hardest of the ten and the longest, which is why it is
        // weighted like any other — a pool where one game is worth more would make the draw unfair.
    },
];

export const MINIGAME_BY_ID = Object.fromEntries(MINIGAMES.map((m) => [m.id, m]));

/**
 * The three a craft plays, drawn without replacement.
 *
 * ⚠️ RANDOM PER CRAFT, NOT PER SESSION OR PER RECIPE. Luke asked for random and the point of random here is
 * that you cannot practise the one you are about to get — a player who drew the same three all evening would
 * be back to a deterministic act with extra steps.
 *
 * ⚠️ WITHOUT REPLACEMENT, because drawing The Bellows twice in one craft reads as a bug, not as luck.
 *
 * Takes an rng so the picker is testable and so a lab can force a line-up; defaults to real randomness.
 */
export function drawPhases(rng = Math.random, pool = MINIGAMES) {
    const bag = [...pool];
    const out = [];
    for (let i = 0; i < 3 && bag.length; i += 1) {
        out.push(bag.splice(Math.floor(rng() * bag.length), 1)[0]);
    }
    return out;
}

/** Total milliseconds a drawn line-up will take, for anything that wants to size a progress rail. */
export const lineUpMs = (games) => (games || []).reduce((a, g) => a + (g?.ms || 0), 0);
