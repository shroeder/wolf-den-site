import "server-only";

import { db } from "@/lib/db";
import { addChests, CHEST_ORDER, CHEST_TIERS } from "@/lib/marketplace/chests.js";
import { rollQuality } from "@/lib/marketplace/grove-forge.js";
import { TOOL_SLOTS, toolNumeral } from "@/lib/marketplace/grove-recipes.js";
import { toolArt } from "@/lib/marketplace/grove-catalog.js";
import { getChestArt } from "@/lib/marketplace/chest-art.js";

// ── THE KILL BAR ─────────────────────────────────────────────────────────────────────────────────────────────
// Luke, 2026-11-08: "You kill enemies in an area. A bar fills. It reaches full. You get a reward. The reward
// is a crafting tool. The bar resets, you repeat. The reward is each crafting tool of that zone tier. Once you
// have all tools. It becomes a low level chest, with a chance to roll higher. For zones 1 and 2 then high tier
// chest would be iron. 3 and 4 gold, etc"
//
// This is the answer to item R. The workbench and monster parts were deleted earlier the same day, which left
// twelve systems reading groveToolPct and no way on earth to get a tool. The bar is the way.
//
// ── WHY THIS IS NOT A SECOND LOOT ROLL ───────────────────────────────────────────────────────────────────────
// ⚠️ IT IS DELIBERATELY NOT IN grove-roll.js, and that is the most important thing about this file. That
// module is pure and deterministic because the client replays it from a seed to show you what dropped the
// instant a creature dies — no db, no Math.random, no server-only. The bar is the opposite shape: it is a
// running total the server owns, and its reward depends on rows (which tools you already hold) that the
// client has no business deciding. A seeded per-kill roll could not answer "is this the twelfth pickaxe" at
// all.
//
// So the bar ticks on SETTLE, from the kill count the server has already verified by replaying the roll. The
// client cannot inflate it beyond what it can inflate kills by, and kills are bounded by zone population and
// the 45s respawn (see the ceiling in groveSettle). One extra query per settle, not per kill.

// ── ⚠️ 250 KILLS. LUKE'S NUMBER, ASKED DIRECTLY ─────────────────────────────────────────────────────────────
// At the 40 kills/minute ceiling that is a six-minute floor per reward: a full twelve-tool set in about
// seventy-five minutes of farming, and a chest roughly every six minutes for ever after.
//
// ⚠️ THIS CONSTANT IS THE WHOLE FAUCET AND IT IS ONE NUMBER ON PURPOSE. Tools are finite — twelve fills and
// the slots are full — so every fill after the twelfth is a chest. Halving this doubles the Den's chest
// income from the Grove permanently. It is not a difficulty dial; it is a mint rate. See
// [[economy-nerf-measure-daily-total]] before touching it, and measure over three days.
export const BAR_KILLS = 250;

// ── ⚠️ THE CEILING STOPS AT MYTHIC, AND THAT IS A REVERSAL OF THE OBVIOUS READING ───────────────────────────
// Luke's sketch was "zones 1 and 2 then high tier chest would be iron. 3 and 4 gold, etc", and `etc` across
// twelve maps lands on celestial — CHEST_ORDER is wooden, iron, gold, mythic, ascendant, eternal, celestial,
// primordial, so the pairing fits twelve maps exactly.
//
// Asked directly, his call was to CAP AT MYTHIC, because every tier above it is elite-sourced — ascendant,
// eternal, celestial and primordial gear is all `source: "elite"`, which is real money. That is the same
// decision he made when the Grove's own chests were removed ("drop the top tiers rather than pay them another
// way, so the Grove's ladder now ends at mythic"), and an ascendant chest pays its own tier or better 50% of
// the time, so maps 7-8 would have quietly become a grind route to paid gear. Map 7 is built and live.
//
// Maps 5 through 12 therefore share a ceiling. What separates them is the PROMOTION ODDS below, not the top.
const CEILING_BY_PAIR = ["iron", "gold", "mythic"];

/** The best chest the bar can pay on a given map. */
export function barCeiling(mapN) {
    const m = Math.max(1, Math.floor(Number(mapN) || 1));
    // Pairs of maps: 1-2, 3-4, 5-6, ... and everything from the third pair on is capped.
    const pair = Math.floor((m - 1) / 2);
    return CEILING_BY_PAIR[Math.min(pair, CEILING_BY_PAIR.length - 1)];
}

// ── ⚠️ DEPTH BUYS ODDS, SINCE IT NO LONGER BUYS A CEILING ───────────────────────────────────────────────────
// "a low level chest, with a chance to roll higher" is a promotion chain: start at the bottom of the ladder
// and step up while the roll keeps succeeding, stopping at the map's ceiling. With a flat chance, every map
// from five to twelve would pay identically, which makes eight maps of progression worth nothing at the one
// reward they all share.
//
// So the chance climbs with the map. Map 1 promotes at 25%, map 12 at 47%. On a mythic ceiling (three steps)
// that moves mythic from 1.6% of chests at map 5 to 10.4% at map 12 — the deep end feels different without a
// single new item entering the game.
const promoteChance = (mapN) => 0.25 + 0.02 * (Math.max(1, Math.floor(Number(mapN) || 1)) - 1);

/**
 * Which chest one fill pays.
 *
 * ⚠️ A CHAIN, AND IT WALKS UP RATHER THAN DOWN. Rolling a tier directly off a weight table would mean the
 * ceiling change above re-tuned every row beneath it; promoting from the floor means the only thing a deeper
 * map changes is how far the walk gets. [[chest-chain-compounds]] is about the chest's CONTENTS being a
 * first-match-wins chain, which is a different chain in a different file — but the lesson is the same one, so
 * this stays a single readable walk instead of six interacting numbers.
 */
export function rollBarChest(mapN, rand = Math.random) {
    const ceiling = barCeiling(mapN);
    const top = CHEST_ORDER.indexOf(ceiling);
    const p = promoteChance(mapN);
    let i = 0;                       // wooden
    while (i < top && rand() < p) i += 1;
    return CHEST_ORDER[i];
}

/**
 * The next tool this map owes, or null when the set is complete.
 *
 * ⚠️ "MISSING" MEANS tier < map, NOT "no tool at all". A rod at tier V is already better than anything map
 * three can hand over — tool tiers only ever go up — so a member farming map three is owed nothing for that
 * slot. Without this test, walking back to an early map would offer to DOWNGRADE every tool you own, and the
 * grant below would either refuse silently or undo your progress.
 *
 * ⚠️ AND THE ORDER IS TOOL_SLOTS ORDER, NOT RANDOM. The bar can therefore say what is coming next, which is
 * the whole of how this game teaches: a number moving toward a named thing. A random pick among the missing
 * would be marginally more exciting once and unreadable for the other eleven fills.
 * [[teach-by-showing-not-telling]]
 */
export function nextToolFor(mapN, tools = {}) {
    const m = Math.max(1, Math.floor(Number(mapN) || 1));
    for (const t of TOOL_SLOTS) {
        if ((Number(tools[t.slot]) || 0) < m) return t;
    }
    return null;
}

/** Everything the panels need about one map's bar, without writing anything. */
export async function barState(buyerId, mapN) {
    if (!buyerId) return null;
    const m = Math.max(1, Math.floor(Number(mapN) || 1));
    const [row, toolRows] = await Promise.all([
        db.queryOne(`SELECT kills, fills FROM mkt_grove_bar WHERE buyer_id = $1 AND map_n = $2`, [buyerId, m])
            .catch(() => null),
        db.query(`SELECT slot, tier FROM mkt_grove_tool WHERE buyer_id = $1`, [buyerId]).catch(() => []),
    ]);
    const tools = Object.fromEntries((toolRows || []).map((t) => [t.slot, Number(t.tier) || 0]));
    const next = nextToolFor(m, tools);
    return {
        map: m,
        kills: Number(row?.kills) || 0,
        need: BAR_KILLS,
        fills: Number(row?.fills) || 0,
        // ── ⚠️ THE BAR FILLS TOWARD A CHEST, AND NEVER NAMES THE PRIZE ──────────────────────────────
        // Luke: "it shouldn't say im getting item x, it should show a chest, and when that chests bumps
        // around and opens, it reveals what I get."
        //
        // It used to read "Barrow Spade I" with the tool's own sprite on it — a correct answer to the
        // wrong question. Knowing exactly what is coming for 250 kills is an errand; not knowing is the
        // thing people open chests for. The reward underneath is unchanged — the ladder still pays each
        // tool in TOOL_SLOTS order and then chests — the BAR simply stops spoiling it.
        //
        // `next` is still computed and still sent, because the reveal has to know what to open INTO and
        // the client cannot work that out. It is just not drawn on the strip any more.
        next: next
            ? { kind: "tool", slot: next.slot, name: next.name, tier: m,
                numeral: toolNumeral(m), art: toolArt(next.slot, m) }
            : { kind: "chest", ceiling: barCeiling(m) },
        // ⚠️ A REAL SPRITE, NOT A GLYPH. [[no-icons-or-glyphs-in-the-game]] — every destination gets drawn
        // art, and a chest emoji here would hide the gap rather than fill it. These are the same painted
        // chests the equipment screen and the casino counter use, so the thing on the bar is the thing
        // that opens. Null rather than a character on failure; a missing sprite should read as missing.
        chestArt: (await getChestArt().catch(() => ({})))[barCeiling(m)] || null,
        // How many of the twelve this map still owes, for the "7 of 12" line.
        toolsHeld: TOOL_SLOTS.filter((t) => (Number(tools[t.slot]) || 0) >= m).length,
        toolsTotal: TOOL_SLOTS.length,
    };
}

/**
 * Tick the bar for a settle, and pay out every fill it crossed.
 *
 * ⚠️ A LOOP, BECAUSE ONE SETTLE CAN CROSS SEVERAL FILLS. A ten-minute session at the kill ceiling is four
 * hundred kills; paying one reward and discarding the rest would quietly eat the second half of every long
 * session. The remainder carries too — 300 kills on an empty bar pays once and leaves 50 on the clock.
 *
 * ⚠️ AND IT IS CAPPED. BAR_MAX_FILLS bounds how many rewards a single settle can pay, because the kills
 * number is the one thing a tampered client can inflate and this is the only place in the Grove where kills
 * convert directly into chests. The settle's own ceiling (zone population plus the 45s respawn) is the real
 * guard; this is the second one, so a hole in the first cannot mint an unbounded pile of chests.
 *
 * Returns the rewards paid, newest last, plus the bar's new state — so the scene can announce each one.
 * Failure-tolerant by design: a bar that misses a tick is a reward that arrives slightly later, while a
 * throw here is a settle that fails and loses loot the player watched drop.
 */
const BAR_MAX_FILLS = 8;

export async function bumpBar(buyerId, mapN, kills) {
    const add = Math.max(0, Math.floor(Number(kills) || 0));
    if (!buyerId || !add) return null;
    const m = Math.max(1, Math.floor(Number(mapN) || 1));

    // ⚠️ ONE STATEMENT, AND IT RETURNS THE NEW TOTAL. Read-then-write would let two settles landing together
    // (two tabs, a retry) both read the same start and each pay the same fill. The increment is atomic and
    // the arithmetic below works off what the database actually wrote.
    const row = await db.queryOne(
        `INSERT INTO mkt_grove_bar (buyer_id, map_n, kills) VALUES ($1, $2, $3)
         ON CONFLICT (buyer_id, map_n) DO UPDATE
            SET kills = mkt_grove_bar.kills + $3, updated_at = NOW()
         RETURNING kills`,
        [buyerId, m, add],
    ).catch(() => null);
    if (!row) return null;

    const total = Number(row.kills) || 0;
    const earned = Math.min(BAR_MAX_FILLS, Math.floor(total / BAR_KILLS));
    if (earned < 1) {
        return { map: m, kills: total % BAR_KILLS, need: BAR_KILLS, paid: [] };
    }

    // Spend exactly what was earned, leaving the remainder on the clock.
    await db.query(
        `UPDATE mkt_grove_bar SET kills = GREATEST(0, kills - $3), fills = fills + $4, updated_at = NOW()
          WHERE buyer_id = $1 AND map_n = $2`,
        [buyerId, m, earned * BAR_KILLS, earned],
    ).catch(() => {});

    // ⚠️ TOOLS ARE RE-READ ONCE AND TRACKED IN MEMORY ACROSS THE LOOP. Asking the database again per fill
    // would be a round trip per reward, and worse, nextToolFor would hand out the same slot twice if the
    // grant for the first had not landed yet.
    const toolRows = await db.query(
        `SELECT slot, tier FROM mkt_grove_tool WHERE buyer_id = $1`, [buyerId],
    ).catch(() => []);
    const tools = Object.fromEntries((toolRows || []).map((t) => [t.slot, Number(t.tier) || 0]));

    const paid = [];
    const chests = {};
    for (let i = 0; i < earned; i += 1) {
        const next = nextToolFor(m, tools);
        if (next) {
            // ── ⚠️ THE BAND IS STILL ROLLED, AND THE LEVEL INPUT IS THE MAP ─────────────────────────────
            // A tool carries a quality as well as a tier, and toolBonusFor multiplies the two — the band is
            // half of what a tool is worth. Crafting rolled it against the crafting level, which no longer
            // exists, so the map stands in: a tier VII pickaxe rolls on a deeper curve than a tier I.
            //
            // ⚠️ GREATEST ON BOTH COLUMNS. Walking back to an early map must never lower a tool you hold,
            // and nextToolFor already refuses to offer one — this is the second guard, in the statement
            // itself, because a downgrade written by a race is not recoverable from.
            const quality = rollQuality(m, Math.random);
            await db.query(
                `INSERT INTO mkt_grove_tool (buyer_id, slot, tier, quality) VALUES ($1, $2, $3, $4)
                 ON CONFLICT (buyer_id, slot) DO UPDATE
                    SET tier = GREATEST(mkt_grove_tool.tier, $3),
                        quality = CASE WHEN $3 > mkt_grove_tool.tier THEN $4
                                       ELSE GREATEST(mkt_grove_tool.quality, $4) END`,
                [buyerId, next.slot, m, quality],
            ).catch(() => {});
            tools[next.slot] = m;
            paid.push({
                kind: "tool", slot: next.slot, name: next.name, tier: m,
                numeral: toolNumeral(m), quality, art: toolArt(next.slot, m),
            });
            continue;
        }
        const tier = rollBarChest(m);
        chests[tier] = (chests[tier] || 0) + 1;
        // ⚠️ THE LABEL AND THE RUNG ARE RESOLVED HERE, NOT ON THE CLIENT. chests.js is server-only, so
        // a client component cannot read CHEST_TIERS or CHEST_ORDER to turn "gold" into "Gold Chest" or
        // to work out which of two chests was better. Sending both means the scene needs no chest
        // vocabulary at all — the same reason bar.next carries its own art.
        paid.push({
            kind: "chest", tier,
            label: CHEST_TIERS[tier]?.label || "Chest",
            rung: CHEST_ORDER.indexOf(tier),
        });
    }

    // ⚠️ ONE addChests CALL FOR THE WHOLE SETTLE, not one per fill. It is the single faucet every chest in
    // the game arrives through (the Halloween substitution lives inside it), and it takes a tally — so
    // batching is what it is built for and eight separate calls would be eight round trips.
    if (Object.keys(chests).length) {
        await addChests(buyerId, chests, { source: "grove_bar", meta: { map: m } }).catch(() => {});
    }

    return { map: m, kills: total - earned * BAR_KILLS, need: BAR_KILLS, paid };
}
