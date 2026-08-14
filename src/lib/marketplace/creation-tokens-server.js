import "server-only";

import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { grantCustomCredit } from "@/lib/marketplace/custom-deco.js";
import { grantCoins } from "@/lib/marketplace/store-credit.js";
import { getCreationTier } from "@/lib/marketplace/creation-tokens.js";
import { grantEventBadge } from "@/lib/marketplace/badges.js";

// ── Creation Token purchase bookkeeping. Mirrors the store-credit purchase flow (record pending → charge →
// finalize on the single pending→paid transition) so a retried charge can never double-grant. On finalize we
// grant TOKENS (grantCustomCredit → mkt_buyer.custom_deco_credits) + COINS (grantCoins → gold). We deliberately
// do NOT touch store_credit_cents — this is a token/coin bundle, not a dollar balance.
//
// ── AND THE EXCLUSIVITY RUNS BOTH WAYS NOW ───────────────────────────────────────────────────────────────────
// The rule was always "buy tokens or buy credit, not both", and only this half of it was ever enforced. The
// store-credit checkout paid one token per full $5 loaded, which made it the largest source of Creation tokens
// in the game — 75 from $350 loaded, against the 16 this shop has sold. Removed 2026-08-13, because a credit
// load hands the money back as goods: the dollars are still spendable, so the token cost nothing. If you ever
// add a token to another purchase path, that is the test — does the member still have the money afterwards.
//
// A Creation token is minted HERE, by an admin grant, or not at all.

// Record a pending purchase BEFORE charging the card, so granting can be made idempotent on success.
export async function createPendingCreationPurchase({ buyerId, tierId, amountCents, tokens, coins, idempotencyKey }) {
    const id = randomUUID();
    await db.query(
        `INSERT INTO mkt_creation_purchase (id, buyer_id, tier_id, amount_cents, tokens, coins, status, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)`,
        [id, buyerId, tierId, amountCents, tokens, coins, idempotencyKey]
    );
    return id;
}

// Mark a purchase paid and grant the tokens + coins — but ONLY on the first pending→paid transition, so a
// retried/duplicated charge can never double-grant. Returns { granted, tokens, coins, tokenBalance }.
export async function finalizeCreationPurchase(purchaseId, { squarePaymentId = null, receiptUrl = null } = {}) {
    const won = await db
        .queryOne(
            `UPDATE mkt_creation_purchase SET status = 'paid', square_payment_id = $2, receipt_url = $3, granted_at = NOW()
              WHERE id = $1 AND status = 'pending'
              RETURNING buyer_id, tokens, coins`,
            [purchaseId, squarePaymentId, receiptUrl]
        )
        .catch(() => null);
    if (!won) {
        const balance = await getTokenBalance(await purchaseBuyerId(purchaseId));
        return { granted: false, tokens: 0, coins: 0, tokenBalance: balance };
    }
    const res = await grantCustomCredit(won.buyer_id, won.tokens, { source: "purchase", actorId: won.buyer_id, actorLabel: "self (paid)", meta: { purchaseId, coins: won.coins } }).catch(() => null);
    await grantCoins(won.buyer_id, won.coins);
    await grantEventBadge(won.buyer_id, "creation_patron").catch(() => {}); // backed the artists — bought a bundle
    return { granted: true, tokens: won.tokens, coins: won.coins, tokenBalance: res?.credits ?? (await getTokenBalance(won.buyer_id)) };
}

export async function failCreationPurchase(purchaseId) {
    await db.query(`UPDATE mkt_creation_purchase SET status = 'failed' WHERE id = $1 AND status = 'pending'`, [purchaseId]).catch(() => {});
}

async function purchaseBuyerId(purchaseId) {
    const row = await db.queryOne(`SELECT buyer_id FROM mkt_creation_purchase WHERE id = $1`, [purchaseId]).catch(() => null);
    return row?.buyer_id || null;
}

export async function getTokenBalance(buyerId) {
    if (!buyerId) return 0;
    const row = await db.queryOne(`SELECT COALESCE(custom_deco_credits, 0) AS c FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    return row?.c || 0;
}

// Owner self-grant (for testing without a live charge): grant a tier's tokens + coins directly. Callers MUST
// gate this on isOwner. Returns { ok, tokens, coins, tokenBalance }.
export async function grantCreationTierToOwner(buyerId, tierId) {
    const tier = getCreationTier(tierId);
    if (!buyerId || !tier) return { ok: false, error: "bad_tier" };
    const res = await grantCustomCredit(buyerId, tier.tokens, { source: "owner_grant", actorId: buyerId, actorLabel: "owner test grant", meta: { tierId, coins: tier.coins } }).catch(() => null);
    await grantCoins(buyerId, tier.coins);
    return { ok: true, tokens: tier.tokens, coins: tier.coins, tokenBalance: res?.credits ?? (await getTokenBalance(buyerId)) };
}
