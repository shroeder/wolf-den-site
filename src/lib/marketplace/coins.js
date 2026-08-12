import "server-only";

import { db } from "@/lib/db";

// ===== Coin (gold) ledger =====
// Append-only record of player coin flow. Call logCoin RIGHT AFTER a successful `gold = gold ± n` mutation
// (best-effort — a ledger write must never break the actual game action). Positive delta = earned, negative
// = spent. Pass balanceAfter when the mutating query already RETURNed the new gold balance so the statement
// can show a running total; it's fine to omit it.
//
//   logCoin(buyerId, delta, reason, { ref, meta, balanceAfter })
export async function logCoin(buyerId, delta, reason, { ref = null, meta = null, balanceAfter = null } = {}) {
    if (!buyerId || !delta || !reason) return; // no-op rows add noise; a real 0-delta event isn't worth logging
    try {
        await db.query(
            `INSERT INTO mkt_coin_event (buyer_id, delta, balance_after, reason, ref, meta)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [buyerId, Math.round(delta), balanceAfter == null ? null : Math.round(balanceAfter), reason, ref, meta ? JSON.stringify(meta) : null]
        );
    } catch {
        // swallow — ledger is observability, not correctness
    }
}

// A member's coin statement. All-time by default (row-limited, newest first). Computes a running balance
// backward from the latest known snapshot when balance_after is present, else leaves it null.
//   coinLedger(buyerId, { limit, days })
export async function coinLedger(buyerId, { limit = 200, days = null } = {}) {
    if (!buyerId) return { events: [], earned: 0, spent: 0 };
    const lim = Math.min(1000, Math.max(1, limit));
    const windowClause = days ? `AND created_at > NOW() - ($3 || ' days')::interval` : "";
    const params = days ? [buyerId, lim, days] : [buyerId, lim];
    const rows = await db
        .query(
            `SELECT id, delta, balance_after, reason, ref, meta, created_at
               FROM mkt_coin_event
              WHERE buyer_id = $1 ${windowClause}
              ORDER BY created_at DESC, id DESC
              LIMIT $2`,
            params
        )
        .catch(() => []);
    let earned = 0;
    let spent = 0;
    const events = rows.map((r) => {
        const delta = Number(r.delta) || 0;
        if (delta >= 0) earned += delta;
        else spent += -delta;
        let meta = r.meta;
        if (typeof meta === "string") {
            try {
                meta = JSON.parse(meta);
            } catch {
                meta = null;
            }
        }
        return {
            delta,
            balanceAfter: r.balance_after == null ? null : Number(r.balance_after),
            reason: r.reason,
            ref: r.ref || null,
            meta: meta || null,
            at: r.created_at,
        };
    });
    return { events, earned, spent };
}

// Per-reason coin totals over an optional window — powers an admin "where do their coins come from / go" view.
export async function coinBreakdown(buyerId, { days = null } = {}) {
    if (!buyerId) return [];
    const windowClause = days ? `AND created_at > NOW() - ($2 || ' days')::interval` : "";
    const params = days ? [buyerId, days] : [buyerId];
    const rows = await db
        .query(
            `SELECT reason,
                    COUNT(*)::int AS n,
                    COALESCE(SUM(delta) FILTER (WHERE delta > 0), 0)::int AS earned,
                    COALESCE(-SUM(delta) FILTER (WHERE delta < 0), 0)::int AS spent
               FROM mkt_coin_event
              WHERE buyer_id = $1 ${windowClause}
              GROUP BY reason
              ORDER BY (COALESCE(SUM(ABS(delta)), 0)) DESC`,
            params
        )
        .catch(() => []);
    return rows.map((r) => ({ reason: r.reason, n: r.n, earned: r.earned, spent: r.spent }));
}
