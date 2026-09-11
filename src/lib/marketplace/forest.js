// ── THE FOREST ───────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "trees and like a dark Forest background and you tap the trees to cut them down and you see a chopping
// ax going WAP WAP WAP and you just tap as fast as you can to chop fast and then it's going to chop the trees
// down and then you're going to get wood and there's like different kinds of trees some of them are really
// rare and you can like upgrade your ax and make it look cool and stuff."
//
// So: a stand of trees in the dark, and one button — the tree itself. Every tap is a swing. Swing fast enough
// and the axe BITES: consecutive taps inside the streak window stack a multiplier, so the difference between
// mashing and pacing yourself is real damage rather than flavour. Fell it and the wood is yours.
//
// ⚠️ THE LIMITER IS REGROWTH, NOT STAMINA. A tap-as-fast-as-you-can game with a swing budget is a game that
// tells you to stop in the middle of the only fun part, and the Den already has two systems whose cost is a
// number ticking down. The forest instead has a fixed number of TREES: fell one and that patch is bare until
// it grows back. You can chop as hard as you like — there is simply nothing left standing until it returns.
// That bounds the wood without ever interrupting a swing.
//
// PURE — no database, no imports with side effects — like ship-battle.js and captains.js, so the chop maths
// can be run in a simulator rather than argued about. forest-store.js is the half that persists it.
//
// ⚠️ AND IT HAS TO STAY THAT WAY, BECAUSE ForestClient IMPORTS IT. Anything this file pulls in is pulled into
// the browser bundle with it. The gate briefly lived here and imported owner.js, which looks like a file of
// constants until line 138, where hasOwnerStanding does `await import("@/lib/db")` — Turbopack traces that
// into the client graph and the build stops with "you are importing a module that depends on server-only".
// The gate now lives in forest-gate.js, which is server-only on purpose.

// ── WHAT GROWS HERE ──────────────────────────────────────────────────────────────────────────────────────────
// `bites` is how many clean swings at bite 1 it takes to fell — the tree's health in axe-blows. `wood` is what
// it drops. `weight` is how often it comes up when a patch regrows, and `regrow` is how long that patch stays
// bare afterwards, in minutes.
//
// ⚠️ THESE WERE ALL ROUGHLY A THIRD OF THIS AND EVERY TREE FELL IN UNDER TWO SECONDS. Simulated at real thumb
// speeds before a line of the screen was written: a maxed axe took the LEGENDARY down in 1.2 seconds, which is
// two taps and a noise. A chopping game has to be a chop. They are scaled so a common is a few seconds even on
// a bare hatchet, and the Moonash is a genuine sit-down at any axe you can own.
//
// The curve is deliberately steeper in WOOD than in BITES: an ironwood is four times the wood of a birch and
// only two and a half times the work, so finding a rare tree is a good afternoon rather than a longer chore.
export const TREES = {
    birch:      { id: "birch",      name: "Birch",        rarity: "common",    bites: 40,  wood: 4,   weight: 30, regrow: 8,   tint: "#d9d2c4" },
    pine:       { id: "pine",       name: "Pine",         rarity: "common",    bites: 55,  wood: 6,   weight: 26, regrow: 10,  tint: "#4f7a5c" },
    oak:        { id: "oak",        name: "Oak",          rarity: "uncommon",  bites: 95,  wood: 12,  weight: 18, regrow: 16,  tint: "#8a6a3f" },
    ash:        { id: "ash",        name: "Ash",          rarity: "uncommon",  bites: 120, wood: 15,  weight: 13, regrow: 20,  tint: "#9aa2a8" },
    blackthorn: { id: "blackthorn", name: "Blackthorn",   rarity: "rare",      bites: 190, wood: 26,  weight: 7,  regrow: 34,  tint: "#4a3a52" },
    ironwood:   { id: "ironwood",   name: "Ironwood",     rarity: "rare",      bites: 280, wood: 38,  weight: 4,  regrow: 45,  tint: "#5c6b73" },
    heartwood:  { id: "heartwood",  name: "Heartwood",    rarity: "epic",      bites: 420, wood: 70,  weight: 1.6, regrow: 70, tint: "#c0533f" },
    // ⚠️ NOT IN THE ORDINARY ROLL AT ALL — weight 0. The Moonash is what a felled tree can leave behind in its
    // own patch (see MOONASH_CHANCE), which makes it a thing that HAPPENS to you rather than a rarity tier
    // nobody ever reaches. A 0.4% weight in a seven-way table is indistinguishable from never.
    moonash:    { id: "moonash",    name: "Moonash",      rarity: "legendary", bites: 700, wood: 160, weight: 0,  regrow: 120, tint: "#a9d8ff" },
};
export const TREE_IDS = Object.keys(TREES);
export const treeById = (id) => TREES[id] || TREES.birch;

/** How many patches the stand holds. Small on purpose: the walk between them is the pacing. */
export const PATCHES = 6;

// A felled patch sometimes comes back as something that should not be there.
export const MOONASH_CHANCE = 0.012;

// ── THE SWING ────────────────────────────────────────────────────────────────────────────────────────────────
// One tap, one swing. `bite` is the damage of a swing at axe level 0, and every level of Edge adds to it.
export const BASE_BITE = 1;

// ── AND THE STREAK, WHICH IS THE WHOLE MINIGAME ──────────────────────────────────────────────────────────────
// A swing landing inside STREAK_MS of the last one continues the rhythm; anything slower drops it to nothing.
// The multiplier climbs by STREAK_STEP a swing to STREAK_CAP, so a sustained mash is worth roughly double a
// leisurely one — enough that going fast is obviously right, not so much that a slow chopper gets nothing.
//
// ⚠️ THE WINDOW WIDENS WITH THE HAFT TRACK RATHER THAN THE MULTIPLIER CLIMBING FASTER. Buying "more damage per
// tap" twice is one upgrade wearing two names; buying "the rhythm is easier to hold" is a different thing to
// want, and it is the one that helps a player on a phone with a slow screen.
//
// ⚠️ THE BASE WINDOW WAS 420ms AND THAT MADE THE HAFT TRACK DECORATIVE. Anybody mashing a phone is tapping
// six or seven times a second — 150ms apart — so a 420ms window was never missed by anyone, and "the rhythm is
// easier to keep hold of" was an upgrade that solved a problem no player had. At 260ms you have to hold better
// than four taps a second to keep the streak alive, which is a real ask on a small screen, and the eight Haft
// levels walk it back out to half a second. The track now buys relief from something that actually happens.
export const STREAK_MS = 260;
export const STREAK_STEP = 0.08;
export const STREAK_CAP = 2.0;

//
// ⚠️ THE THREE TRACKS ARE NOT WORTH THE SAME AND SO THEY MUST NOT COST THE SAME. They all charged a flat
// 30 wood for the first level, at which price Edge bought +35% damage and Heft bought +3.5% — ten times the
// value for the same purse. A shop with one right answer and two wrong ones is not a shop, it is a delay before
// the obvious purchase. Each track now carries its own `base` and `pow`.
//
// The point of the curve is the CROSSOVER. Edge's marginal value falls as it climbs (the twelfth level adds
// 0.35 to a bite of 4.85, which is +7%, where the first added 0.35 to a bite of 1) while Heft's stays flat, so
// pricing Edge steeply and Heft cheaply makes Edge the obvious early buy and Heft the better one somewhere
// around Edge 7. That is a decision the player gets to make twice rather than a column they read once.
export const AXE_TRACKS = {
    edge:  { id: "edge",  name: "Edge",  max: 12, per: 0.35, base: 38, pow: 1.8,
        verb: "Sharpen", effect: "Damage a swing", unit: "a swing",
        blurb: "A sharper bite. Every swing takes more out of the trunk." },
    haft:  { id: "haft",  name: "Haft",  max: 8,  per: 30,  base: 18, pow: 1.4,
        verb: "Re-haft", effect: "Rhythm window", unit: "to keep the rhythm",
        blurb: "A longer handle and a better grip — the rhythm is easier to keep hold of." },
    heft:  { id: "heft",  name: "Heft",  max: 8,  per: 0.045, base: 22, pow: 1.5,
        verb: "Weight it", effect: "Double-bite chance", unit: "to bite twice",
        blurb: "Weight behind the head. Sometimes one swing takes two swings' worth." },
};
export const AXE_TRACK_IDS = Object.keys(AXE_TRACKS);

export const biteFor = (edge = 0) => BASE_BITE + Math.max(0, Math.min(AXE_TRACKS.edge.max, edge)) * AXE_TRACKS.edge.per;
export const streakWindow = (haft = 0) => STREAK_MS + Math.max(0, Math.min(AXE_TRACKS.haft.max, haft)) * AXE_TRACKS.haft.per;
export const doubleChance = (heft = 0) => Math.max(0, Math.min(AXE_TRACKS.heft.max, heft)) * AXE_TRACKS.heft.per;

/** What a level of a track costs, in wood. Climbs so the last levels are a project. */
export const trackCost = (track, level) => {
    const t = AXE_TRACKS[track];
    if (!t || level >= t.max) return null;
    return Math.round(t.base * (level + 1) ** t.pow);
};

/**
 * What a level of a track is actually WORTH, as the two numbers a player wants to compare.
 *
 * ⚠️ THE SHOP USED TO SHOW A LEVEL COUNTER, A ROW OF PIPS AND A SENTENCE OF FLAVOUR, AND NO NUMBER. "A
 * sharper bite" next to "0 / 12" and a price does not tell you whether 38 wood is a good deal, so the only way
 * to find out what an upgrade did was to buy it and go hit a tree. This returns the before and the after in the
 * track's own units, and lives here rather than in the screen so the simulator prices the same numbers the
 * player is shown.
 */
export function trackReadout(track, level = 0) {
    const t = AXE_TRACKS[track];
    if (!t) return null;
    const at = (n) => {
        if (track === "edge") return `${(BASE_BITE + n * t.per).toFixed(2)}`;
        if (track === "haft") return `${Math.round(STREAK_MS + n * t.per)}ms`;
        return `${Math.round(n * t.per * 100)}%`;
    };
    const lvl = Math.max(0, Math.min(t.max, Number(level) || 0));
    return { now: at(lvl), next: lvl >= t.max ? null : at(lvl + 1), unit: t.unit };
}

// ── WHAT THE AXE LOOKS LIKE ──────────────────────────────────────────────────────────────────────────────────
// "you can like upgrade your ax and make it look cool and stuff." The FORM is read off total levels rather than
// any one track, so every purchase moves it — a cosmetic that only some upgrades touch is a cosmetic most
// upgrades feel bad next to.
export const AXE_FORMS = [
    { at: 0,  id: "hatchet",   name: "Notched Hatchet" },
    { at: 4,  id: "felling",   name: "Felling Axe" },
    { at: 9,  id: "broad",     name: "Broadaxe" },
    { at: 15, id: "black",     name: "Blackiron Axe" },
    { at: 22, id: "silvered",  name: "Silvered Axe" },
    { at: 28, id: "heart",     name: "The Heartsplitter" },
];
export const axeForm = (total = 0) => [...AXE_FORMS].reverse().find((f) => total >= f.at) || AXE_FORMS[0];
export const axeTotal = (axe = {}) => AXE_TRACK_IDS.reduce((n, k) => n + Math.max(0, Number(axe?.[k]) || 0), 0);

// ── ONE SWING ────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Resolve a tap. Returns the new patch, what the swing did, and whether the tree came down.
 *
 * `now` and `roll` are passed in rather than read, so a simulator can drive a thousand swings without a clock
 * and without randomness — the same reason the card engine takes its seed.
 */
export function swing(patch, axe = {}, { now = 0, last = 0, streak = 0, roll = Math.random() } = {}) {
    if (!patch || patch.felled) return { patch, hit: 0, streak: 0, felled: false, error: "nothing_there" };
    const inRhythm = last > 0 && now - last <= streakWindow(axe.haft);
    const nextStreak = inRhythm ? Math.min(Math.round((STREAK_CAP - 1) / STREAK_STEP), streak + 1) : 0;
    const mult = 1 + Math.min(STREAK_CAP - 1, nextStreak * STREAK_STEP);
    const doubled = roll < doubleChance(axe.heft);
    const hit = biteFor(axe.edge) * mult * (doubled ? 2 : 1);
    const hp = Math.max(0, (Number(patch.hp) || 0) - hit);
    const felled = hp <= 0;
    return {
        patch: { ...patch, hp, felled },
        hit: Math.round(hit * 10) / 10,
        mult: Math.round(mult * 100) / 100,
        streak: nextStreak,
        doubled,
        felled,
    };
}

/** The wood a felled tree pays. Kept separate from swing() so the payout can be read without a tap. */
export const woodFor = (treeId) => treeById(treeId).wood;

/** A fresh patch of the given kind, at full health. */
export const plant = (treeId) => ({ tree: treeId, hp: treeById(treeId).bites, felled: false });

/** Roll what grows back. `roll` and `moonRoll` passed in for the same reason swing() takes one. */
export function regrow(roll = Math.random(), moonRoll = Math.random()) {
    if (moonRoll < MOONASH_CHANCE) return "moonash";
    const pool = TREE_IDS.filter((id) => TREES[id].weight > 0);
    const total = pool.reduce((n, id) => n + TREES[id].weight, 0);
    let r = roll * total;
    for (const id of pool) { r -= TREES[id].weight; if (r <= 0) return id; }
    return pool[pool.length - 1];
}

/** Is a felled patch ready to come back? `felledAt` is a millisecond stamp. */
export const readyAt = (treeId, felledAt) => Number(felledAt || 0) + treeById(treeId).regrow * 60000;
export const isReady = (treeId, felledAt, now = Date.now()) => now >= readyAt(treeId, felledAt);

// ── ⚠️ OWNER-GATED, AND THE GATE COMES IN A PAIR ─────────────────────────────────────────────────────────────
// Luke: "it's owner gated." Three checks, all asking forest-gate.js the same question so none can drift: the
// PAGE has to be invisible, the API has to refuse, and the MENU has to leave the entry off. A feature gated
// only at the door still has an open play path; one gated only at the play path still advertises itself in the
// nav; and one gated only at those two shows a menu entry that 404s. See [[feature-gates-come-in-pairs]].
//
// Luke, later: "make it visible for me and little wolf in the game menu." Invited guests are named per feature
// in owner.js (PREVIEW_GUESTS) — NOT by adding them to the owner allow-list, which now decides far more than
// dev previews.
//
// ⚠️ AND IT GOES ON THE MASTER LIST. When this launches, flip this one constant and delete the entry from
// [[sailing-test-overrides]]. Nothing else in the feature reads a flag.
export const FOREST_PUBLIC = false;

// The question "may this person walk in?" is asked in three places and lives in ONE — forest-gate.js, which
// can import the owner allow-list without dragging the database into ForestClient's bundle.
