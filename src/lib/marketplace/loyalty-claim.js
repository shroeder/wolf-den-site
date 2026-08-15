import "server-only";

import { randomBytes } from "node:crypto";

import { db } from "@/lib/db";
import { awardPurchaseXp, levelForXp } from "@/lib/marketplace/xp.js";

// Scan-to-earn loyalty claims. A claim ties a specific Square payment (amount + dedupe id) to a QR that
// a customer scans to bank the XP on their own account. Single-use, one per payment. TTL is generous
// (24h) so a cashier who misses the push can still pull the claim up later and have the QR redeem.

const DEFAULT_TTL_MINUTES = 24 * 60;

// Create (or reuse) a claim for a Square payment. Idempotent per payment so webhook retries don't mint
// duplicates. Returns { token, amountCents, isNew } or null.
export async function createLoyaltyClaim({ squarePaymentId, awardOrderId, amountCents = 0, locationId = null, ttlMinutes = DEFAULT_TTL_MINUTES }) {
    if (!squarePaymentId || !awardOrderId) return null;
    // ── ONE PURCHASE, ONE CLAIM ──────────────────────────────────────────────────────────────────────────
    // Keyed on the ORDER, not the payment. A single Square order can carry more than one payment — a split
    // tender, or a first attempt superseded by a second — and each one used to mint its own claim for the
    // FULL amount and fire its own push. Luke: "im getting double alerts sometimes", two of them 14 seconds
    // apart for the same $83.70. Ten orders out of 505 did it; three were redeemed twice, and only awardXp's
    // `spend:<orderId>` dedupe stopped that becoming real points. That dedupe is PER BUYER, so two different
    // people each holding one of a pair would both have been paid for the same purchase.
    const already = await db
        .queryOne(`SELECT token, amount_cents FROM mkt_loyalty_claim WHERE award_order_id = $1`, [awardOrderId])
        .catch(() => null);
    if (already) return { token: already.token, amountCents: already.amount_cents, isNew: false };

    const token = randomBytes(24).toString("hex");
    const rows = await db
        .query(
            `INSERT INTO mkt_loyalty_claim (token, square_payment_id, award_order_id, amount_cents, location_id, expires_at)
             VALUES ($1, $2, $3, $4, $5, NOW() + ($6 || ' minutes')::interval)
             ON CONFLICT DO NOTHING
             RETURNING token, amount_cents`,
            [token, squarePaymentId, awardOrderId, Math.max(0, Math.trunc(amountCents) || 0), locationId, String(Math.max(1, ttlMinutes))]
        )
        .catch(() => []);
    if (rows.length) return { token: rows[0].token, amountCents: rows[0].amount_cents, isNew: true };

    // A claim already exists for this payment or this order (a retry, or a race with the sibling payment
    // that arrived a second earlier) — reuse it rather than minting a second.
    const existing = await db
        .queryOne(
            `SELECT token, amount_cents FROM mkt_loyalty_claim WHERE square_payment_id = $1 OR award_order_id = $2`,
            [squarePaymentId, awardOrderId]
        )
        .catch(() => null);
    return existing ? { token: existing.token, amountCents: existing.amount_cents, isNew: false } : null;
}

// Recent claims (newest first) for the admin/employee "pull up a QR" screen — so a missed push isn't a
// lost claim. Staff-facing, so the redeemer's name is shown for confirmation.
export async function listRecentClaims(limit = 50) {
    const rows = await db
        .query(
            `SELECT c.token, c.amount_cents, c.created_at, c.expires_at, c.redeemed_at,
                    b.first_name, b.last_name, b.alias, b.display_name
               FROM mkt_loyalty_claim c
               LEFT JOIN mkt_buyer b ON b.id = c.redeemed_buyer_id
              ORDER BY c.created_at DESC
              LIMIT $1`,
            [Math.max(1, Math.min(200, limit))]
        )
        .catch(() => []);
    const now = new Date();
    return rows.map((r) => {
        const name = `${r.first_name || ""} ${r.last_name || ""}`.trim();
        const redeemed = Boolean(r.redeemed_at);
        const status = redeemed ? "redeemed" : new Date(r.expires_at) <= now ? "expired" : "active";
        let createdLabel = "";
        try {
            createdLabel = new Date(r.created_at).toLocaleString("en-US", {
                timeZone: "America/Chicago",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
            });
        } catch {
            /* leave blank */
        }
        return {
            token: r.token,
            cents: Number(r.amount_cents) || 0,
            createdAt: r.created_at,
            createdLabel,
            expiresAt: r.expires_at,
            redeemed,
            status,
            memberName: redeemed ? name || r.display_name || r.alias || "Member" : null,
        };
    });
}

// Staff-side detail for ONE claim, keyed by the token the push carries. The admin app uses this to find the
// SQUARE ORDER behind the sale so it can itemize it (line items + cost + profit) against Square directly —
// the app already owns all the unit-cost/FIFO machinery, so the server only has to hand over the order id.
// award_order_id is stored as "sq:<orderId>" (see the Square webhook).
export async function getClaimOrderDetail(token) {
    if (!token) return null;
    const row = await db
        .queryOne(
            `SELECT token, amount_cents, award_order_id, square_payment_id, location_id, created_at, expires_at, redeemed_at
               FROM mkt_loyalty_claim WHERE token = $1`,
            [token]
        )
        .catch(() => null);
    if (!row) return null;
    const awardId = String(row.award_order_id || "");
    return {
        token: row.token,
        cents: Number(row.amount_cents) || 0,
        squareOrderId: awardId.startsWith("sq:") ? awardId.slice(3) : null,
        squarePaymentId: row.square_payment_id || null,
        locationId: row.location_id || null,
        redeemed: Boolean(row.redeemed_at),
        status: row.redeemed_at ? "redeemed" : new Date(row.expires_at) <= new Date() ? "expired" : "active",
    };
}

// Read a claim for display on the scan page (does not redeem). Returns { amountCents, expired, redeemed }.
export async function getLoyaltyClaim(token) {
    if (!token) return null;
    const row = await db
        .queryOne(`SELECT amount_cents, expires_at, redeemed_at FROM mkt_loyalty_claim WHERE token = $1`, [token])
        .catch(() => null);
    if (!row) return null;
    return {
        amountCents: row.amount_cents,
        redeemed: Boolean(row.redeemed_at),
        expired: new Date(row.expires_at) < new Date(),
    };
}

// Redeem a claim for a signed-in buyer: bank the payment's XP on their account, once. Idempotent and
// race-safe (the UPDATE atomically wins the claim). Returns { ok, points, level } or { ok:false, error }.
export async function redeemLoyaltyClaim(token, buyerId) {
    if (!token || !buyerId) return { ok: false, error: "invalid" };

    // Atomically win the claim: only the first unredeemed, unexpired redeemer gets the row.
    const won = await db
        .query(
            `UPDATE mkt_loyalty_claim
                SET redeemed_at = NOW(), redeemed_buyer_id = $2
              WHERE token = $1 AND redeemed_at IS NULL AND expires_at > NOW()
              RETURNING award_order_id, amount_cents, square_payment_id`,
            [token, buyerId]
        )
        .catch(() => []);

    if (!won.length) {
        // Didn't win — figure out why for a friendly message.
        const row = await db
            .queryOne(`SELECT expires_at, redeemed_at, redeemed_buyer_id FROM mkt_loyalty_claim WHERE token = $1`, [token])
            .catch(() => null);
        if (!row) return { ok: false, error: "not_found" };
        if (row.redeemed_at) return { ok: false, error: row.redeemed_buyer_id === buyerId ? "already_yours" : "already_claimed" };
        return { ok: false, error: "expired" };
    }

    const before = await db.queryOne(`SELECT xp FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    await awardPurchaseXp({ buyerId, amountCents: won[0].amount_cents, orderId: won[0].award_order_id });
    const after = await db.queryOne(`SELECT xp FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);

    // ── THE SCAN IS THE ATTRIBUTION ──────────────────────────────────────────────────────────────────────
    // A mystery bag sale tried to find its buyer on the Square payment, at the moment the webhook fired —
    // which is BEFORE the member has done the one thing that actually identifies them, scanning this QR.
    // Six sales in 186 carried a customer Square could match. Thirty-two have a claim behind them, because
    // claiming is the deliberate act and the terminal record is an accident of how the cashier rang it up.
    //
    // So the claim credits the bag. Same payment id on both sides, and it is the same member either way —
    // this simply asks the question at the point in time where the answer exists.
    await creditMysteryBagsForPayment(won[0].square_payment_id, buyerId).catch(() => {});

    const points = Math.max(0, (after?.xp || 0) - (before?.xp || 0));
    return { ok: true, points, level: levelForXp(after?.xp || 0) };
}

/**
 * Credit any mystery bags sold on this payment to the member who just claimed it.
 *
 * Counted from mystery_sold_events rather than incremented blindly, and written as a FLOOR, so a re-scan, a
 * webhook retry or the backfill running again cannot inflate anybody. Never throws: a badge is not worth
 * failing a member's XP claim over.
 */
async function creditMysteryBagsForPayment(squarePaymentId, buyerId) {
    if (!squarePaymentId || !buyerId) return;
    const rows = await db.query(
        `SELECT e.id, c.market_value
           FROM mystery_sold_events e
           LEFT JOIN mystery_sold_assignments a ON a.sold_event_id = e.id
           LEFT JOIN mystery_bag_cards c ON c.id = a.mystery_card_id
          WHERE e.square_payment_id = $1`,
        [squarePaymentId]
    ).catch(() => []);
    if (!rows.length) return;

    // Everything this member has ever been credited for, so the floor is over their whole history rather
    // than this payment alone — otherwise a second claim would write a 1 over an existing 4.
    const total = await db.queryOne(
        `SELECT COUNT(*)::int AS n
           FROM mystery_sold_events e
           JOIN mkt_loyalty_claim c ON c.square_payment_id = e.square_payment_id
          WHERE c.redeemed_buyer_id = $1`,
        [buyerId]
    ).catch(() => null);

    await db.query(
        `UPDATE mkt_buyer SET mystery_bags_bought = GREATEST(COALESCE(mystery_bags_bought, 0), $2) WHERE id = $1`,
        [buyerId, Math.max(rows.length, Number(total?.n) || 0)]
    ).catch(() => {});

    if (rows.some((r) => Number(r.market_value) >= 100)) {
        await db.query(`UPDATE mkt_buyer SET mystery_big_hit = TRUE WHERE id = $1`, [buyerId]).catch(() => {});
    }
    const { syncEarnedBadges } = await import("@/lib/marketplace/badges.js");
    await syncEarnedBadges(buyerId).catch(() => {});
}
