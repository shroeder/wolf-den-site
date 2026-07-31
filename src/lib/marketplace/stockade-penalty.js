import "server-only";

import { db } from "@/lib/db";

// Deliberately a LEAF module: it imports the database and nothing else.
//
// The penalty has to be read by xp.js and boss.js, and the stockade itself has to award XP — so putting this
// in stockade.js makes xp.js -> stockade.js -> xp.js a cycle. Under ESM that resolves to `undefined` at call
// time rather than failing loudly at import, which would mean the debuff silently never applying and a
// "why is this not working" hunt through three files. Splitting the read out costs one file and removes the
// possibility entirely.

/** −10% to XP, coin and boss damage while serving in the stockade. */
export const STOCKADE_PENALTY = 0.9;

/**
 * The multiplier to apply to this member's XP / coin / boss damage.
 *
 * Returns 1 for everyone not in the stockade — which is almost every caller almost every time — so the common
 * path is a single primary-key lookup that misses.
 */
export async function stockadeMultiplier(buyerId) {
    if (!buyerId) return 1;
    const row = await db
        .queryOne(`SELECT 1 AS x FROM mkt_stockade WHERE buyer_id = $1 AND released_at IS NULL`, [buyerId])
        .catch(() => null);
    return row ? STOCKADE_PENALTY : 1;
}
