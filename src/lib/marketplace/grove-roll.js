// ── THE LOOT ROLL — RUN ON BOTH SIDES, TRUSTED ON ONE ────────────────────────────────────────────────────────
// Luke: "Its all enemies and as I described. Its also mostly client side except for maybe the drops because we
// can't let costs get out of hand, we are already cost constrained."
//
// That constraint decides the whole architecture, and this file is the hinge of it.
//
// ── THE COST PROBLEM ─────────────────────────────────────────────────────────────────────────────────────────
// A kill loop is the worst possible shape for server traffic. A ten-minute session is a couple of hundred
// kills; one request per kill is a couple of hundred round trips, and round trips ARE Active CPU — every
// neon() query is its own HTTPS request with its own handshake. That is the meter that actually bills (see
// CLAUDE.md). Per-kill requests would make this the most expensive feature in the game by an order of
// magnitude, for a feature whose entire appeal is that you kill a lot of things.
//
// ── THE ANSWER: A SEED, NOT A CONVERSATION ───────────────────────────────────────────────────────────────────
// The server issues a SEED when you enter a zone. The client runs the whole scene from it — movement, wander,
// combat, telegraphs, and the loot roll below. It can show you exactly what dropped the instant the enemy
// dies, because it is computing the same answer the server will.
//
// On settle, the client sends only WHAT IT KILLED, in order. The server re-runs these same pure functions
// from the same seed and grants what they produce. It never reads a single item the client claims to have —
// so the client cannot invent a drop, only lie about kills, and kills are cheap to bound (see the ceiling in
// the settle route: zone population and the 45s respawn put a hard roof on kills per minute).
//
// This is the pattern the card game already uses: the engine runs in the browser and `verifyWin` replays the
// move log through the same pure engine server-side. Same problem, same shape, already proven here.
//
// ⚠️ SO THIS FILE MUST STAY PURE AND DETERMINISTIC. No Math.random, no Date.now, no db, no server-only. The
// moment anything here is non-deterministic the two sides disagree, and the player watches a part drop and
// then not arrive — which is a worse bug than any amount of latency.

// ── A SMALL, FAST, SEEDABLE PRNG ─────────────────────────────────────────────────────────────────────────────
// mulberry32. Deterministic across engines, which is the only property that matters here — the browser and
// node must produce byte-identical sequences from the same seed.
export function rngFrom(seed) {
    let a = (Number(seed) >>> 0) || 1;
    return function next() {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * A per-kill stream, derived from the session seed and the kill's index.
 *
 * ⚠️ DERIVED PER KILL, NOT DRAWN FROM ONE RUNNING STREAM. If every kill pulled from a single sequence, the
 * server would have to replay the session in exactly the client's order to land on the same numbers — and one
 * dropped kill, one retry, one reorder would desync every roll after it. Keying the stream on the index makes
 * each kill independently reproducible, so a settle can be verified out of order or in pieces.
 */
export const killRng = (seed, index) => rngFrom(((Number(seed) >>> 0) ^ Math.imul(Number(index) + 1, 0x9E3779B1)) >>> 0);

/** Weighted pick from rows carrying `w`. Returns null for an empty table rather than throwing. */
export function pickWeighted(rows, r) {
    const list = (rows || []).filter((x) => Number(x?.w) > 0);
    if (!list.length) return null;
    const total = list.reduce((s, x) => s + Number(x.w), 0);
    let n = r * total;
    for (const row of list) {
        n -= Number(row.w);
        if (n <= 0) return row;
    }
    return list[list.length - 1];
}

const span = ([lo, hi], r) => Math.round(lo + (hi - lo) * r);

/**
 * What one kill produces. The SAME call on both sides of the wire.
 *
 * @param {object} foe     the enemy from grove-catalog (or GROVE_RARE)
 * @param {number} seed    the session seed the server issued
 * @param {number} index   which kill this is in the session
 * @param {object} bonus   emblem-derived multipliers: { rarityFind, emblemFind }
 * @returns {{parts: object, emblem: string|null, gold: number, chest: string|null, xp: number}}
 */
// ── WHAT A KILL IS WORTH ────────────────────────────────────────────────────────────────────────────────────
// Luke: "I think the grove probably gives a little too much EXP, including the bosses and enemies."
//
// It was a lot more than a little, and the reason is that the divisors were set against the creature's HEALTH
// without ever being compared to what anything else in the game pays. Measured against the last seven days of
// mkt_xp_event:
//
//   a rootrat    770 hp / 12  =    64 xp   -- an ARENA WIN pays 67, a fishing catch 66, a mining trip 66
//   deepest foe 1460 hp / 12  =   122 xp
//   Glutmaw   59,000 hp / 40  = 1,475 xp   -- a DELVE RUN pays 225, a raid 287, an xp potion 1,311
//   zone 12  180,000 hp / 40  = 4,500 xp
//
// A rootrat is the cheapest action in the game -- there are fifteen to thirty of them, they replenish every
// forty-five seconds, and they do not fight back in zone one -- and each one paid what winning an arena bout
// pays. That is roughly 77,000 xp an hour in zone one and 146,000 at depth, against the game's top earner
// making 212,438 in a WEEK from everything else combined.
//
// ⚠️ THE BAND TO AIM AT IS THE OTHER REPEATABLE LOOPS, NOT A NUMBER SOMEBODY LIKES. craft_combine pays 9.1
// per event, harvest 11.1, salvage 11.2, a sail wave 13.3, a town duel 17.8. Those are the things a player
// does hundreds of times, which is exactly what a Grove kill is -- and unlike a daily, this loop has no cap
// at all. See [[economy-nerf-measure-daily-total]]: the per-event number only matters through how often it
// can be repeated.
//
// A boss is a different animal: once per zone, behind a kill count and a thirty-minute cooldown. Its peers
// are the delve run (225) and the raid (287), and it should sit above them and scale with depth.
//
// Both are single constants on purpose. If these are still wrong, they are wrong by a multiplier and the fix
// is one number, not a formula.
const XP_PER_FOE_HP = 96;    // 770hp -> 8 xp,  1460hp -> 15 xp
const XP_PER_BOSS_HP = 200;  // 59k   -> 295,   180k   -> 900

import { bossChestChance, bossMerits, chestForZone } from "@/lib/marketplace/grove-forge.js";

export function rollKill(foe, seed, index, bonus = {}) {
    const out = { parts: {}, emblem: null, gold: 0, chest: null, xp: 0 };
    if (!foe) return out;
    const r = killRng(seed, index);

    // ── PARTS ───────────────────────────────────────────────────────────────────────────────────────
    const row = pickWeighted(foe.loot, r());
    if (row) {
        let n = span(row.n, r());
        // "increased rarity of items found in this feature" — the emblem reads as MORE of the thing, which
        // is the only reading that works on a table where every row is a part rather than a rarity tier.
        const rarity = Number(bonus.rarityFind) || 0;
        if (rarity > 0 && r() < Math.min(0.75, rarity / 100)) n += 1;
        out.parts[row.part] = (out.parts[row.part] || 0) + n;
    }

    // ── EMBLEM ──────────────────────────────────────────────────────────────────────────────────────
    const emblemChance = (Number(foe.emblemChance) || 0) * (1 + (Number(bonus.emblemFind) || 0) / 100);
    if (foe.emblem && r() < emblemChance) out.emblem = foe.emblem;

    // ── THE RARE SPAWN'S OWN PAYLOAD ────────────────────────────────────────────────────────────────
    // ⚠️ GOLD AND CHESTS ONLY EVER COME FROM HERE. Gold has fourteen faucets already and a kill loop has no
    // natural daily cap; the chest is granted through addChests at the call site rather than by reaching
    // into the chest ROLL, which is a chain where the first match wins and raising one tier steals from gear.
    if (Array.isArray(foe.gold)) out.gold = span(foe.gold, r());
    if (foe.chestChance && r() < foe.chestChance) out.chest = foe.chestTier || "wooden";

    // Small, flat, and deliberately boring. Luke: "small amounts of exp are fine."
    // ⚠️ Whoever grants this MUST pass `gold: 0` to awardXp — it pays gold 1:1 with points otherwise, which
    // on a repeatable kill loop is a money printer. See awardxp-gold-tracks-xp-landmine.
    out.xp = Math.max(1, Math.round((foe.hp || 10) / XP_PER_FOE_HP));
    return out;
}

/**
 * What a BOSS kill produces. A different function rather than a flag on rollKill, because almost nothing about
 * it is the same shape.
 *
 * ⚠️ IT PAYS EVERY LOOT ROW, NOT ONE. That is the whole difference between a boss and the two hundredth
 * rootrat: a wanderer rolls its table and usually gives you the common row, a boss hands over the lot. It is
 * also why boss rows carry no `w` — there is nothing to weight.
 *
 * ⚠️ AND IT PAYS NO GOLD. Bosses are repeatable on a timer, and gold already has fourteen faucets; the Crystal
 * Stag stays the one thing in this feature that mints. Luke: "We dont grant gold."
 *
 * @param {object} boss   the entry from GROVE_BOSSES
 * @param {number} zoneN  which zone it stands at — sets the hyper-rare chance
 * @param {number} seed   the session seed
 * @param {number} index  the kill index, same stream as every other kill
 * @param {object} bonus  emblem-derived { rarityFind, emblemFind }
 */
export function rollBoss(boss, zoneN, seed, index, bonus = {}, hyperChance = 0, hyperTable = null) {
    const out = { parts: {}, emblem: null, hyper: null, xp: 0, chest: null, merits: 0 };
    if (!boss) return out;
    const r = killRng(seed, index);

    const rarity = Number(bonus.rarityFind) || 0;
    for (const row of boss.loot || []) {
        let n = span(row.n, r());
        if (rarity > 0 && r() < Math.min(0.75, rarity / 100)) n += 1;
        out.parts[row.part] = (out.parts[row.part] || 0) + n;
    }

    // The reliable route to an emblem. A wanderer is a fraction of a percent; a boss is roughly one in nine,
    // on a thirty-minute timer. "Emblems are rare" stays true and the player has something to aim AT.
    const em = (Number(boss.emblemChance) || 0) * (1 + (Number(bonus.emblemFind) || 0) / 100);
    if (boss.emblem && r() < em) out.emblem = boss.emblem;

    // ⚠️ THE HYPER ROLL IS DRAWN LAST AND FROM THE SAME STREAM, so the server lands on the same answer the
    // client already showed. It is NOT re-rolled server-side off a fresh seed — that would mean the scene can
    // celebrate a Mythic Morsel the settle then declines to hand over.
    if (r() < (Number(hyperChance) || 0) * (1 + rarity / 100)) {
        out.hyper = pickHyper(zoneN, r(), hyperTable);
    }

    out.xp = Math.max(4, Math.round((boss.hp || 100) / XP_PER_BOSS_HP));

    // ── ⚠️ THE CHEST AND THE MERITS, AND WHY THEY ARE HERE AND NOT IN THE CHEST CHAIN ────────────────
    // Luke: "the boss table has a loot table its got good shot like random chests and stuff, the chests
    // are a parallel chest that have rare crafting goods for the grove."
    //
    // Rolled from the SAME seeded stream as everything else above, so the server re-rolling a claimed
    // boss arrives at the identical answer the client already showed -- which is the whole contract of
    // this file. A chest decided anywhere else would be a second source of truth about one kill.
    //
    // It is a Grove chest, never one of chests.js's eight tiers. Granting through addChests would push
    // Grove parts into the chain that pays Arena gear, where the first match wins and raising one tier
    // steals from the ones beneath it. See [[chest-rolls-are-a-chain]].
    //
    // ⚠️ MERITS ARE FLAT AND NOT ROLLED. The chest is the variance; a standing currency that swung as
    // well would make the thing it buys unpriceable, and merits exist to have exactly one sink.
    const depth = Math.max(1, Number(zoneN) || 1);
    if (r() < bossChestChance(depth)) out.chest = chestForZone(depth).id;
    out.merits = bossMerits(depth);
    return out;
}

/**
 * What a Grove chest pays when it is opened.
 *
 * ⚠️ EVERY ROW IS ROLLED INDEPENDENTLY, NOT AS A WEIGHTED CHAIN. A chest should feel like opening a chest --
 * several things at once -- and an independent roll per row cannot be stolen from by raising a sibling,
 * which is the exact failure the main chest line has and the reason this one is separate at all.
 *
 * Seeded by the chest's own opening, not by a kill: these are opened from the bag at a time of the player's
 * choosing, long after whatever dropped them.
 */
export function rollGroveChest(chest, seed, index, bonus = {}) {
    const out = { parts: {}, merits: 0 };
    if (!chest) return out;
    const r = killRng(seed, index);
    const rarity = Number(bonus.rarityFind) || 0;
    for (const row of chest.parts || []) {
        if (row.chance != null && r() >= row.chance) continue;
        let n = span(row.n, r());
        if (rarity > 0 && r() < Math.min(0.75, rarity / 100)) n += 1;
        out.parts[row.part] = (out.parts[row.part] || 0) + n;
    }
    out.merits = span(chest.merits, r());
    return out;
}

/**
 * Which hyper-rare, given the depth it dropped at.
 *
 * ⚠️ THE TABLE IS PASSED IN, NOT IMPORTED — same reason settleKills takes a `lookup`. This module
 * is pure on purpose so the check scripts can run it in bare node, where the "@/" alias does not resolve;
 * one catalogue import would have taken both of them out.
 *
 * ⚠️ THE FLOOR FAILS UPWARD. `minZone` is the shallowest boss allowed to pay a reward, so a deep boss is
 * eligible for everything at or below it rather than only its own rung. A table that matched the rung exactly
 * would hand the hardest kill in the map the narrowest table — the bug this codebase has now hit three times.
 * See ladder-lookups-must-fail-upward.
 */
export function pickHyper(zoneN, r, table) {
    const z = Math.max(1, Number(zoneN) || 1);
    const open = (table || []).filter((h) => z >= (h.minZone || 1));
    if (!open.length) return null;
    const pick = pickWeighted(open, r);
    return pick ? pick.id : null;
}

/** Did the crystal spawn in place of an ordinary enemy? Same seed, same answer on both sides. */
export function rollRareSpawn(baseChance, seed, index, bonus = {}) {
    const r = killRng(seed, index ^ 0x5bf03635);
    const chance = (Number(baseChance) || 0) * (1 + (Number(bonus.rareSpawn) || 0) / 100);
    return r() < chance;
}

/**
 * Settle a whole session. The server calls this with the client's kill list and grants what comes back.
 *
 * ⚠️ IT TAKES IDS AND INDEXES, NEVER ITEMS. The client says "I killed a thornling, and it was kill 41"; it
 * does not get to say what fell out. That is the entire anti-cheat budget of this design and it costs one
 * request instead of two hundred.
 */
export function settleKills(kills, lookup, seed, bonus = {}) {
    const parts = {};
    const emblems = {};
    let gold = 0;
    let xp = 0;
    const chests = [];

    for (const k of kills || []) {
        const foe = lookup(k.id);
        if (!foe) continue;
        const got = rollKill(foe, seed, k.i, bonus);
        for (const [p, n] of Object.entries(got.parts)) parts[p] = (parts[p] || 0) + n;
        if (got.emblem) emblems[got.emblem] = (emblems[got.emblem] || 0) + 1;
        gold += got.gold;
        xp += got.xp;
        if (got.chest) chests.push(got.chest);
    }
    return { parts, emblems, gold, xp, chests };
}
