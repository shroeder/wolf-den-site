import "server-only";

import { db } from "@/lib/db";

// ── Creation-token audit ledger ────────────────────────────────────────────────────────────────────────────
// One row per balance change to mkt_buyer.custom_deco_credits. GIFTS (admin_grant / owner_grant) are the ones we
// most care about — a member getting tokens they didn't pay for — but we log spends + refunds too so a member's
// full token history is auditable. Logging is best-effort: it must NEVER break the grant/spend it records.

export const GIFT_SOURCES = ["admin_grant", "owner_grant"];

// delta > 0 = tokens in, delta < 0 = tokens out. `ctx` carries who/why: { source, actorId, actorLabel, balanceAfter, meta }.
export async function logCreationLedger(buyerId, delta, ctx = {}) {
    if (!buyerId || !Number.isFinite(Number(delta)) || Number(delta) === 0) return;
    const { source = "grant", actorId = null, actorLabel = null, balanceAfter = null, meta = {} } = ctx;
    await db
        .query(
            `INSERT INTO mkt_creation_ledger (buyer_id, delta, balance_after, source, actor_id, actor_label, meta)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
            [buyerId, Math.round(Number(delta)), balanceAfter == null ? null : Math.round(Number(balanceAfter)), String(source), actorId == null ? null : String(actorId), actorLabel, JSON.stringify(meta || {})]
        )
        .catch(() => {}); // telemetry must not break the transaction it audits
}

// Recent GIFTS across all members (admin/owner comps) with the recipient's name — the "who got a free creation" feed.
export async function giftedCreations({ limit = 100 } = {}) {
    const rows = await db
        .query(
            `SELECT l.id, l.buyer_id, l.delta, l.source, l.actor_id, l.actor_label, l.meta, l.created_at,
                    b.display_name, b.alias
               FROM mkt_creation_ledger l
               LEFT JOIN mkt_buyer b ON b.id = l.buyer_id
              WHERE l.source = ANY($1)
              ORDER BY l.created_at DESC
              LIMIT $2`,
            [GIFT_SOURCES, Math.min(500, Math.max(1, limit))]
        )
        .catch(() => []);
    return rows.map((r) => ({
        id: Number(r.id),
        buyerId: r.buyer_id,
        recipient: r.display_name || r.alias || "member",
        alias: r.alias || null,
        tokens: Number(r.delta),
        source: r.source,
        grantedBy: r.actor_label || r.actor_id || "unknown",
        meta: r.meta || {},
        at: r.created_at,
    }));
}

// Full ledger for ONE member (grants + spends + refunds), newest first.
export async function creationLedger(buyerId, { limit = 100 } = {}) {
    if (!buyerId) return [];
    const rows = await db
        .query(
            `SELECT id, delta, balance_after, source, actor_id, actor_label, meta, created_at
               FROM mkt_creation_ledger WHERE buyer_id = $1 ORDER BY created_at DESC LIMIT $2`,
            [buyerId, Math.min(500, Math.max(1, limit))]
        )
        .catch(() => []);
    return rows.map((r) => ({
        id: Number(r.id),
        tokens: Number(r.delta),
        balanceAfter: r.balance_after == null ? null : Number(r.balance_after),
        source: r.source,
        actor: r.actor_label || r.actor_id || null,
        meta: r.meta || {},
        at: r.created_at,
    }));
}
