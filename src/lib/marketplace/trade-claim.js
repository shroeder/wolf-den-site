import "server-only";

import { randomBytes } from "node:crypto";

import { db } from "@/lib/db";
import { syncEarnedBadges } from "@/lib/marketplace/badges.js";
import { PAYOUT_REWARD_RATE } from "@/lib/marketplace/reward-rates.js";
import { awardXp } from "@/lib/marketplace/xp.js";

// Trade rewards. A recorded trade mints a single-use claim (QR) the customer scans to bank XP + record
// the trade to their account (driving trade badges). One claim per trade; 24h TTL.
const DEFAULT_TTL_MINUTES = 24 * 60;

// XP for a trade (Luke's formula): a flat bit for the trade itself, mostly driven by the single most
// valuable card traded in, plus a slight amount on the overall trade size. Tune the constants freely.
const TRADE_XP_FLAT = 20;
const TRADE_XP_PER_TOP_DOLLAR = 1; // highest-value card is the main driver
const TRADE_XP_PER_TOTAL_DOLLAR = 0.15; // trade size is a slight nudge

export function tradeXp({ topCardValueCents = 0, totalValueCents = 0 } = {}) {
    const top = Math.max(0, Math.round((Number(topCardValueCents) || 0) / 100));
    const total = Math.max(0, Math.round((Number(totalValueCents) || 0) / 100));
    // A trade is a payout, so the value-driven portion rewards at the discounted rate (flat bit unaffected).
    const value = top * TRADE_XP_PER_TOP_DOLLAR + total * TRADE_XP_PER_TOTAL_DOLLAR;
    return TRADE_XP_FLAT + Math.round(value * PAYOUT_REWARD_RATE);
}

// Compute the reward-relevant stats from a trade's lines. IN lines = cards the customer traded in.
export function tradeStatsFromLines(lines = [], marketTotal = 0) {
    let cardCount = 0;
    let topCardCents = 0;
    for (const l of lines) {
        if (l?.direction !== "IN") continue;
        const qty = Math.max(0, Math.round(Number(l.quantity) || 0));
        cardCount += qty;
        const unit = Math.round((Number(l.unitMarket) || 0) * 100);
        if (unit > topCardCents) topCardCents = unit;
    }
    const totalValueCents = Math.max(0, Math.round((Number(marketTotal) || 0) * 100));
    return { cardCount, totalValueCents, topCardValueCents: topCardCents };
}

// Mint (or reuse) the claim for a trade. Returns { token, isNew } or null. Deduped by trade id.
export async function createTradeClaim({ tradeId, cardCount = 0, totalValueCents = 0, topCardValueCents = 0, ttlMinutes = DEFAULT_TTL_MINUTES }) {
    if (!tradeId) return null;
    const token = randomBytes(24).toString("hex");
    const rows = await db
        .query(
            `INSERT INTO mkt_trade_claim (token, trade_id, card_count, total_value_cents, top_card_value_cents, expires_at)
             VALUES ($1, $2, $3, $4, $5, NOW() + ($6 || ' minutes')::interval)
             ON CONFLICT (trade_id) DO NOTHING
             RETURNING token`,
            [token, tradeId, cardCount, totalValueCents, topCardValueCents, String(Math.max(1, ttlMinutes))]
        )
        .catch(() => []);
    if (rows.length) return { token: rows[0].token, isNew: true };
    const existing = await db.queryOne(`SELECT token FROM mkt_trade_claim WHERE trade_id = $1`, [tradeId]).catch(() => null);
    return existing ? { token: existing.token, isNew: false } : null;
}

// Read a claim for the scan page (does not redeem).
export async function getTradeClaim(token) {
    if (!token) return null;
    const row = await db
        .queryOne(`SELECT card_count, total_value_cents, top_card_value_cents, redeemed_at, expires_at FROM mkt_trade_claim WHERE token = $1`, [token])
        .catch(() => null);
    if (!row) return null;
    return {
        cardCount: row.card_count,
        totalValueCents: row.total_value_cents,
        topCardValueCents: row.top_card_value_cents,
        potentialXp: tradeXp({ topCardValueCents: row.top_card_value_cents, totalValueCents: row.total_value_cents }),
        redeemed: Boolean(row.redeemed_at),
        expired: new Date(row.expires_at) < new Date(),
    };
}

// Redeem a claim to a buyer: atomically win it, award XP, record it (for trade badges), sync badges.
// Returns { ok, xp, cardCount, newBadges } or { ok:false, error }.
export async function redeemTradeClaim(token, buyerId) {
    if (!token || !buyerId) return { ok: false, error: "invalid" };
    const won = await db
        .query(
            `UPDATE mkt_trade_claim
                SET redeemed_at = NOW(), redeemed_buyer_id = $2
              WHERE token = $1 AND redeemed_at IS NULL AND expires_at > NOW()
              RETURNING trade_id, card_count, total_value_cents, top_card_value_cents`,
            [token, buyerId]
        )
        .catch(() => []);

    if (!won.length) {
        const row = await db.queryOne(`SELECT redeemed_at, redeemed_buyer_id, expires_at FROM mkt_trade_claim WHERE token = $1`, [token]).catch(() => null);
        if (!row) return { ok: false, error: "not_found" };
        if (row.redeemed_at) return { ok: false, error: row.redeemed_buyer_id === buyerId ? "already_yours" : "already_claimed" };
        return { ok: false, error: "expired" };
    }

    const c = won[0];
    const xp = tradeXp({ topCardValueCents: c.top_card_value_cents, totalValueCents: c.total_value_cents });
    await awardXp(buyerId, "trade", { points: xp, dedupeKey: `trade:${c.trade_id}`, meta: { tradeId: c.trade_id } });
    await db.query(`UPDATE mkt_trade_claim SET xp_awarded = $2 WHERE token = $1`, [token, xp]).catch(() => {});
    const newBadges = await syncEarnedBadges(buyerId).catch(() => []);
    return { ok: true, xp, cardCount: c.card_count, newBadges: newBadges.map((b) => ({ slug: b.slug, label: b.label, icon: b.icon })) };
}
