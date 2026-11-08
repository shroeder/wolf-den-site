import "server-only";

// ── THE COLISEUM'S WRITES ────────────────────────────────────────────────────────────────────────────────────
// The plan — floor, waves, what a run is worth — lives in grove-coliseum-plan.js so the client can read it
// too. This half touches the database and therefore cannot.

import { db } from "@/lib/db";
import { wavesFor, chestsFor, runPlan, COLISEUM_NPCS, COLISEUM_ZONE } from "@/lib/marketplace/grove-coliseum-plan.js";

export * from "@/lib/marketplace/grove-coliseum-plan.js";

/**
 * The shop's own day, for the Coliseum daily.
 *
 * ⚠️ MOVED HERE WITH claimDailyKey ON 2026-11-08 — it lived at the top of grove-quests.js, above the cut
 * that lifted the Coliseum's functions out, so it did not come across with them. lint:undef caught it.
 *
 * ⚠️ A DAY, NOT A TIMESTAMP. The daily is idempotent against this string rather than against an interval,
 * so "once today" means the shop's today in Chicago and not "once per 24 hours since you last claimed".
 * See the note in migration 500 about why this is a date, and [[postgres-landmines]] on the 7pm DATE reset.
 */
const centralDay = (d = new Date()) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/**
 * Spend a key and start a run.
 *
 * ⚠️ THE KEY IS TAKEN AT THE START, CONDITIONALLY. Deducting on completion would let somebody close the tab
 * on a bad run and keep the key, which makes the clock advisory. The conditional update is the lock, the same
 * shape as the casino stake.
 */
export async function startRun(buyerId, mapN) {
    const row = await db.queryOne(
        `UPDATE mkt_grove_coliseum SET keys = keys - 1, runs = runs + 1, updated_at = NOW()
          WHERE buyer_id = $1 AND map_n = $2 AND keys >= 1 RETURNING keys`,
        [buyerId, Number(mapN)],
    ).catch(() => null);
    if (!row) return { ok: false, error: "no_key" };
    return { ok: true, keys: Number(row.keys) || 0, plan: runPlan(mapN) };
}

/**
 * Settle a finished run: record how far they got and put the chests on the ground.
 *
 * The kills themselves are settled by the ordinary Grove path — same loot, same multi-kill, same zone
 * progress — so nothing about drops happens here. This is the frame only.
 */
export async function settleRun(buyerId, { map, wavesCleared, cleared }) {
    const m = Number(map) || 1;
    const total = wavesFor(m).length;
    const got = Math.max(0, Math.min(total, Number(wavesCleared) || 0));
    const won = Boolean(cleared) && got >= total;

    await db.query(
        `UPDATE mkt_grove_coliseum
            SET best_wave = GREATEST(best_wave, $3), clears = clears + $4, updated_at = NOW()
          WHERE buyer_id = $1 AND map_n = $2`,
        [buyerId, m, got, won ? 1 : 0],
    ).catch(() => {});

    const tiers = chestsFor({ map: m, wavesCleared: got, totalWaves: total, cleared: won });
    for (const tier of tiers) {
        await db.query(
            `INSERT INTO mkt_grove_coliseum_chest (buyer_id, map_n, tier) VALUES ($1,$2,$3)`,
            [buyerId, m, tier],
        ).catch(() => {});
    }
    // ✂️ A `ticket` quest step used to be ticked here — the only place that knows how far a run got.
    // The quest chains are gone, so a run just pays its chests.
    return { ok: true, wavesCleared: got, totalWaves: total, cleared: won, chests: tiers };
}

/** Chests still sitting on the ground, waiting to be tapped. */
export async function pendingChests(buyerId) {
    const rows = await db.query(
        `SELECT id, map_n, tier FROM mkt_grove_coliseum_chest
          WHERE buyer_id = $1 AND opened_at IS NULL ORDER BY id`,
        [buyerId],
    ).catch(() => []);
    return (rows || []).map((r) => ({ id: Number(r.id), map: Number(r.map_n), tier: r.tier }));
}


// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ MOVED HERE FROM grove-quests.js ON 2026-11-08, UNCHANGED. The quest chains were removed and that file
// deleted; the keys, the daily and the state read were the half of it that belonged to the Coliseum all
// along. The only edit is that `coliseumState` no longer reports a quest step beside the marshal.
//
// ⚠️ AND THE DAILY IS NOW THE ONLY FAUCET. A finished chain used to pay a token too, so the cap note below
// saying "enforced at every faucet" now describes one faucet rather than two. That was checked before the
// chains were deleted: without the daily, removing quests would have made the Coliseum unenterable.
// ── ⚠️ HOW MANY TOKENS A PLAYER MAY HOLD ───────────────────────────────────────────────────────────────────
// Luke's call, asked directly: 3 per map. Enough that missing a day is not punishing and a good session can
// be spent in one sitting; not enough to bank a fortnight and marathon the chest ladder in an afternoon.
//
// ⚠️ ENFORCED AT EVERY FAUCET, NOT ON THE WAY OUT. Both sources — the daily and a finished chain — clamp
// against it, because a cap checked only when spending is not a cap, it is a display.
export const COLISEUM_KEY_CAP = 3;

// ── THE COLISEUM ─────────────────────────────────────────────────────────────────────────────────────────────

/** Keys, the daily, and how far this member has got on one map. */
export async function coliseumState(buyerId, mapN) {
    const row = await db.queryOne(
        `SELECT keys, daily_on, best_wave, runs, clears FROM mkt_grove_coliseum WHERE buyer_id = $1 AND map_n = $2`,
        [buyerId, mapN],
    ).catch(() => null);
    const marshal = COLISEUM_NPCS.find((n) => n.map === Number(mapN)) || null;
    return {
        map: Number(mapN),
        zone: COLISEUM_ZONE[Number(mapN)] ? (Number(mapN) - 1) * 12 + COLISEUM_ZONE[Number(mapN)] : null,
        marshal: marshal ? { id: marshal.id, name: marshal.name, line: marshal.line } : null,
        keys: Number(row?.keys) || 0,
        bestWave: Number(row?.best_wave) || 0,
        runs: Number(row?.runs) || 0,
        clears: Number(row?.clears) || 0,
        dailyReady: (row?.daily_on || null) !== centralDay(),
    };
}

/** Take the day's free key. Idempotent by the shop's own date, not by a timestamp. */
export async function claimDailyKey(buyerId, mapN) {
    const today = centralDay();
    const row = await db.queryOne(
        `INSERT INTO mkt_grove_coliseum (buyer_id, map_n, keys, daily_on)
         VALUES ($1,$2,1,$3)
         ON CONFLICT (buyer_id, map_n) DO UPDATE
           SET keys = LEAST($4, mkt_grove_coliseum.keys + 1), daily_on = $3, updated_at = NOW()
         WHERE mkt_grove_coliseum.daily_on IS DISTINCT FROM $3
         RETURNING keys`,
        [buyerId, mapN, today, COLISEUM_KEY_CAP],
    ).catch(() => null);
    if (!row) return { ok: false, error: "already_today" };
    return { ok: true, keys: Number(row.keys) || 0 };
}
