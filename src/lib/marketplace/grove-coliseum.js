import "server-only";

// ── THE COLISEUM'S WRITES ────────────────────────────────────────────────────────────────────────────────────
// The plan — floor, waves, what a run is worth — lives in grove-coliseum-plan.js so the client can read it
// too. This half touches the database and therefore cannot.

import { db } from "@/lib/db";
import { wavesFor, chestsFor, runPlan } from "@/lib/marketplace/grove-coliseum-plan.js";

export * from "@/lib/marketplace/grove-coliseum-plan.js";

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
