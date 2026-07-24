import "server-only";

import { randomBytes, randomUUID } from "crypto";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";

// ── Store credit: a real dollar balance on the member's marketplace account (mkt_buyer.store_credit_cents),
// bought online through Square. Buying it also grants coins. Double-entry: the column is the running total,
// mkt_store_credit_event is the append-only ledger. All mutations here are atomic + race-safe.

export const COINS_PER_CENT = 2; // 2 coins per cent purchased → 200 coins per $1 (doubled 2026-07; 40× in-store).
export const ONLINE_FEE_RATE = 0.035; // processing surcharge passed to the buyer on credit top-ups.
export const MIN_CREDIT_CENTS = 500; // $5 minimum top-up.
export const MAX_CREDIT_CENTS = 50000; // $500 maximum single top-up.
const CLAIM_TTL_MINUTES = 15; // an in-store spend QR is shown at the register right away.

export function coinsForCents(cents) {
    return Math.max(0, Math.round(Number(cents) || 0)) * COINS_PER_CENT;
}
export function feeForCents(cents) {
    return Math.round((Number(cents) || 0) * ONLINE_FEE_RATE);
}

// Current balance (cents) for a member. 0 if unknown.
export async function getStoreCredit(buyerId) {
    if (!buyerId) return 0;
    const row = await db.queryOne(`SELECT store_credit_cents FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    return Math.max(0, row?.store_credit_cents ?? 0);
}

// Recent ledger for the member's history view.
export async function listStoreCreditEvents(buyerId, limit = 20) {
    if (!buyerId) return [];
    const rows = await db
        .query(
            `SELECT delta_cents, balance_after_cents, reason, ref, created_at
               FROM mkt_store_credit_event WHERE buyer_id = $1 ORDER BY created_at DESC LIMIT $2`,
            [buyerId, Math.min(100, Math.max(1, limit))]
        )
        .catch(() => []);
    return rows.map((r) => ({
        deltaCents: r.delta_cents,
        balanceCents: r.balance_after_cents,
        reason: r.reason,
        ref: r.ref || null,
        at: r.created_at,
    }));
}

// Add credit (+cents). Atomic: bump the balance then snapshot it into the ledger. Returns new balance.
export async function addCredit(buyerId, cents, reason, ref = null, meta = null) {
    const delta = Math.max(0, Math.round(Number(cents) || 0));
    if (!buyerId || delta <= 0) return null;
    const row = await db.queryOne(
        `UPDATE mkt_buyer SET store_credit_cents = store_credit_cents + $2, updated_at = NOW() WHERE id = $1 RETURNING store_credit_cents`,
        [buyerId, delta]
    );
    if (!row) return null;
    const balance = row.store_credit_cents;
    await db
        .query(
            `INSERT INTO mkt_store_credit_event (buyer_id, delta_cents, balance_after_cents, reason, ref, meta)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [buyerId, delta, balance, reason, ref, meta ? JSON.stringify(meta) : null]
        )
        .catch(() => {});
    return balance;
}

// Spend credit (−cents). Atomic + guarded: the conditional UPDATE only wins when the balance covers it, so
// two concurrent spends can't overdraw. Returns { ok, balanceCents } or { ok:false, error:"insufficient" }.
export async function spendCredit(buyerId, cents, reason, ref = null, meta = null) {
    const amount = Math.max(0, Math.round(Number(cents) || 0));
    if (!buyerId || amount <= 0) return { ok: false, error: "bad_amount" };
    const row = await db
        .queryOne(
            `UPDATE mkt_buyer SET store_credit_cents = store_credit_cents - $2, updated_at = NOW()
              WHERE id = $1 AND store_credit_cents >= $2 RETURNING store_credit_cents`,
            [buyerId, amount]
        )
        .catch(() => null);
    if (!row) return { ok: false, error: "insufficient" };
    const balance = row.store_credit_cents;
    await db
        .query(
            `INSERT INTO mkt_store_credit_event (buyer_id, delta_cents, balance_after_cents, reason, ref, meta)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [buyerId, -amount, balance, reason, ref, meta ? JSON.stringify(meta) : null]
        )
        .catch(() => {});
    return { ok: true, balanceCents: balance };
}

// Grant purchased coins straight to the gold wallet (no Happy-Hour multiplier — this is a paid purchase,
// not gameplay). Kept separate from awardXp so it never touches XP/levels. Negative clamps at 0.
export async function grantCoins(buyerId, coins) {
    const n = Math.round(Number(coins) || 0);
    if (!buyerId || n === 0) return;
    if (n > 0) {
        await db.query(`UPDATE mkt_buyer SET gold = gold + $2, updated_at = NOW() WHERE id = $1`, [buyerId, n]).catch(() => {});
    } else {
        await db.query(`UPDATE mkt_buyer SET gold = GREATEST(0, gold + $2), updated_at = NOW() WHERE id = $1`, [buyerId, n]).catch(() => {});
    }
    await logCoin(buyerId, n, "coin_grant").catch(() => {});
}

// ── Refunds ──────────────────────────────────────────────────────────────────────────────────────────

// How much store credit was applied to a given online order (positive cents) + which member.
export async function getOrderCreditApplied(orderId) {
    if (!orderId) return { buyerId: null, cents: 0 };
    const rows = await db
        .query(`SELECT buyer_id, delta_cents FROM mkt_store_credit_event WHERE ref = $1 AND reason = 'spend_online'`, [orderId])
        .catch(() => []);
    if (!rows.length) return { buyerId: null, cents: 0 };
    return { buyerId: rows[0].buyer_id, cents: rows.reduce((s, r) => s + Math.abs(r.delta_cents || 0), 0) };
}

// Restore the store credit a refunded order had applied. Idempotent: a prior refund event for this order
// short-circuits so we never double-restore. Returns { cents, buyerId }.
export async function refundOrderCredit(orderId) {
    if (!orderId) return { cents: 0 };
    const already = await db.queryOne(`SELECT 1 FROM mkt_store_credit_event WHERE ref = $1 AND reason = 'refund' LIMIT 1`, [orderId]).catch(() => null);
    if (already) return { cents: 0 };
    const { buyerId, cents } = await getOrderCreditApplied(orderId);
    if (!buyerId || cents <= 0) return { cents: 0 };
    await addCredit(buyerId, cents, "refund", orderId, { orderId });
    return { cents, buyerId };
}

// ── Admin manual adjust (Members screen) ─────────────────────────────────────────────────────────────

// Owner/staff nudge a member's store credit and/or coins with an audit reason. Credit changes flow through
// the ledger (addCredit/spendCredit) so history stays truthful. Returns the new balances.
export async function adminAdjust(buyerId, { creditDeltaCents = 0, coinsDelta = 0, reason = "adjust", by = "admin" } = {}) {
    if (!buyerId) return { ok: false, error: "missing_buyer" };
    const credit = Math.round(Number(creditDeltaCents) || 0);
    const coins = Math.round(Number(coinsDelta) || 0);
    if (credit > 0) await addCredit(buyerId, credit, "adjust", null, { reason, by });
    else if (credit < 0) {
        const spent = await spendCredit(buyerId, -credit, "adjust", null, { reason, by });
        if (!spent.ok) return { ok: false, error: spent.error, balanceCents: await getStoreCredit(buyerId) };
    }
    if (coins !== 0) await grantCoins(buyerId, coins);
    const row = await db.queryOne(`SELECT store_credit_cents, gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    return { ok: true, balanceCents: Math.max(0, row?.store_credit_cents ?? 0), coins: Math.max(0, row?.gold ?? 0) };
}

// ── Online purchase bookkeeping ────────────────────────────────────────────────────────────────────────

// Record a pending purchase BEFORE charging the card, so crediting can be made idempotent on success.
export async function createPendingCreditPurchase({ buyerId, amountCents, feeCents, chargedCents, coins, idempotencyKey }) {
    const id = randomUUID();
    await db.query(
        `INSERT INTO mkt_credit_purchase (id, buyer_id, amount_cents, fee_cents, charged_cents, coins, status, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)`,
        [id, buyerId, amountCents, feeCents, chargedCents, coins, idempotencyKey]
    );
    return id;
}

// Mark a purchase paid and apply the credit + coins — but ONLY on the first pending→paid transition, so a
// retried/duplicated charge can never double-credit. Returns { credited, balanceCents } (credited=false if
// it was already applied). Callers should treat credited=false as a benign no-op.
export async function finalizeCreditPurchase(purchaseId, { squarePaymentId = null, receiptUrl = null } = {}) {
    const won = await db
        .queryOne(
            `UPDATE mkt_credit_purchase SET status = 'paid', square_payment_id = $2, receipt_url = $3, credited_at = NOW()
              WHERE id = $1 AND status = 'pending'
              RETURNING buyer_id, amount_cents, coins`,
            [purchaseId, squarePaymentId, receiptUrl]
        )
        .catch(() => null);
    if (!won) {
        const existing = await db.queryOne(`SELECT buyer_id FROM mkt_credit_purchase WHERE id = $1`, [purchaseId]).catch(() => null);
        const balanceCents = existing ? await getStoreCredit(existing.buyer_id) : 0;
        return { credited: false, balanceCents };
    }
    const balanceCents = await addCredit(won.buyer_id, won.amount_cents, "purchase", purchaseId, { coins: won.coins });
    await grantCoins(won.buyer_id, won.coins);
    return { credited: true, balanceCents: balanceCents ?? (await getStoreCredit(won.buyer_id)), coins: won.coins };
}

export async function failCreditPurchase(purchaseId, { reason = null } = {}) {
    await db
        .query(`UPDATE mkt_credit_purchase SET status = 'failed' WHERE id = $1 AND status = 'pending'`, [purchaseId])
        .catch(() => {});
    void reason;
}

// ── In-store spend handshake (member shows QR → staff scan + enter amount) ───────────────────────────────

// Mint a single-use claim so staff can look the member up and deduct from their balance. Nothing is spent
// until staff redeem it. Reuses a live claim so rapid re-taps don't pile up. Returns { ok, token, expiresAt }.
export async function createCreditClaim(buyerId) {
    if (!buyerId) return { ok: false, error: "unauthorized" };
    const balance = await getStoreCredit(buyerId);
    if (balance <= 0) return { ok: false, error: "no_credit" };
    const existing = await db
        .queryOne(
            `SELECT token, expires_at FROM mkt_credit_claim
              WHERE buyer_id = $1 AND redeemed_at IS NULL AND expires_at > NOW()
              ORDER BY created_at DESC LIMIT 1`,
            [buyerId]
        )
        .catch(() => null);
    if (existing) return { ok: true, token: existing.token, expiresAt: new Date(existing.expires_at).toISOString(), balanceCents: balance };
    const token = randomBytes(24).toString("hex");
    const row = await db
        .queryOne(
            `INSERT INTO mkt_credit_claim (token, buyer_id, expires_at)
             VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval) RETURNING expires_at`,
            [token, buyerId, String(CLAIM_TTL_MINUTES)]
        )
        .catch(() => null);
    if (!row) return { ok: false, error: "mint_failed" };
    return { ok: true, token, expiresAt: new Date(row.expires_at).toISOString(), balanceCents: balance };
}

async function memberLabel(buyerId) {
    const m = await db
        .queryOne(`SELECT display_name, alias, first_name, last_name FROM mkt_buyer WHERE id = $1`, [buyerId])
        .catch(() => null);
    if (!m) return "Member";
    return m.display_name || [m.first_name, m.last_name].filter(Boolean).join(" ") || (m.alias ? `@${m.alias}` : "Member");
}

// Staff scanned a member's credit QR — PEEK only (does not consume the token): who is this + how much do
// they have, so staff know the ceiling before entering an amount.
export async function lookupCreditClaim(token) {
    const t = String(token || "").trim();
    if (!t) return { ok: false, error: "not_found" };
    const claim = await db.queryOne(`SELECT buyer_id, redeemed_at, expires_at FROM mkt_credit_claim WHERE token = $1`, [t]).catch(() => null);
    if (!claim) return { ok: false, error: "not_found" };
    if (claim.redeemed_at) return { ok: false, error: "already_redeemed" };
    if (new Date(claim.expires_at).getTime() < Date.now()) return { ok: false, error: "expired" };
    const balanceCents = await getStoreCredit(claim.buyer_id);
    return { ok: true, member: { name: await memberLabel(claim.buyer_id) }, balanceCents };
}

// Staff redeem the claim for a specific amount (≤ balance). Atomic: win the single-use token, then spend.
// If the spend can't cover it (balance moved), release the token so a corrected retry still works.
export async function redeemCreditClaim(token, amountCents, { by = "admin" } = {}) {
    const t = String(token || "").trim();
    const amount = Math.max(0, Math.round(Number(amountCents) || 0));
    if (!t) return { ok: false, error: "not_found" };
    if (amount <= 0) return { ok: false, error: "bad_amount" };
    const claim = await db
        .queryOne(
            `UPDATE mkt_credit_claim SET redeemed_at = NOW(), redeemed_by = $2, amount_cents = $3
              WHERE token = $1 AND redeemed_at IS NULL AND expires_at > NOW()
              RETURNING buyer_id`,
            [t, by, amount]
        )
        .catch(() => null);
    if (!claim) {
        const existing = await db.queryOne(`SELECT redeemed_at FROM mkt_credit_claim WHERE token = $1`, [t]).catch(() => null);
        if (!existing) return { ok: false, error: "not_found" };
        if (existing.redeemed_at) return { ok: false, error: "already_redeemed" };
        return { ok: false, error: "expired" };
    }
    const spend = await spendCredit(claim.buyer_id, amount, "spend_store", t, { by });
    if (!spend.ok) {
        // Release the token for a corrected retry (e.g. staff typed more than the current balance).
        await db.query(`UPDATE mkt_credit_claim SET redeemed_at = NULL, redeemed_by = NULL, amount_cents = NULL WHERE token = $1`, [t]).catch(() => {});
        const balanceCents = await getStoreCredit(claim.buyer_id);
        return { ok: false, error: spend.error, balanceCents };
    }
    return { ok: true, member: { name: await memberLabel(claim.buyer_id) }, amountCents: amount, balanceCents: spend.balanceCents };
}
