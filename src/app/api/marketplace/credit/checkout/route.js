import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { createSquareCardPayment, createSquareOrder, getStoreCreditVariationId } from "@/lib/consignment/square";
import { sendAdminPush } from "@/lib/push/send.js";
import { isTrustedWriteRequest } from "@/lib/request-security";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import {
    coinsForCents,
    feeForCents,
    createPendingCreditPurchase,
    failCreditPurchase,
    finalizeCreditPurchase,
    MAX_CREDIT_CENTS,
    MIN_CREDIT_CENTS,
} from "@/lib/marketplace/store-credit.js";
import { syncEarnedBadges } from "@/lib/marketplace/badges.js";
import { getEquippedIds } from "@/lib/marketplace/inventory.js";
import { creditPurchaseBonus } from "@/lib/marketplace/signatures.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

function isPaymentsEnabled() {
    return process.env.PAYMENTS_ENABLED === "true";
}

// Square treats these as a successful capture.
const OK_STATUSES = new Set(["COMPLETED", "APPROVED"]);

// POST — buy store credit. Body: { sourceId, amountCents }. The card is charged amount + a 3.5% processing
// surcharge; the amount lands in the member's store credit and they're granted 200 coins per $1. Crediting
// is idempotent (guarded by the pending→paid transition on mkt_credit_purchase).
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/credit/checkout", async ({ logger, internalError }) => {
        if (!isTrustedWriteRequest(request)) return noStore({ error: "Invalid request origin." }, { status: 403 });
        if (!isPaymentsEnabled()) return noStore({ error: "Payments are currently disabled." }, { status: 403 });
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "Sign in to buy store credit." }, { status: 401 });

            const body = await request.json().catch(() => ({}));
            const sourceId = String(body?.sourceId || "").trim();
            if (!sourceId) return noStore({ error: "Missing payment source." }, { status: 400 });

            const amountCents = Math.round(Number(body?.amountCents) || 0);
            if (!Number.isFinite(amountCents) || amountCents < MIN_CREDIT_CENTS || amountCents > MAX_CREDIT_CENTS) {
                return noStore(
                    { error: `Choose an amount between $${(MIN_CREDIT_CENTS / 100).toFixed(0)} and $${(MAX_CREDIT_CENTS / 100).toFixed(0)}.` },
                    { status: 400 }
                );
            }

            const feeCents = feeForCents(amountCents);
            const chargedCents = amountCents + feeCents;
            // Equipped "credit" gear grants guaranteed, additive bonus coins on the buy — locked in at purchase.
            const baseCoins = coinsForCents(amountCents);
            const creditBonus = creditPurchaseBonus(await getEquippedIds(buyer.id).catch(() => ({})));
            const coins = Math.round(baseCoins * (1 + creditBonus));
            const bonusCoins = coins - baseCoins;
            const idempotencyKey = randomUUID();

            const purchaseId = await createPendingCreditPurchase({ buyerId: buyer.id, amountCents, feeCents, chargedCents, coins, idempotencyKey });

            // Itemize the charge against a "Store Credit" Square catalog item (auto-provisioned: created in
            // Square on first sale if it doesn't exist) so it lands under the right item/category in reports.
            // Falls back to a plain payment if the token lacks catalog write or order creation hiccups.
            let squareOrderId = null;
            const creditVariationId = await getStoreCreditVariationId().catch(() => null);
            if (creditVariationId) {
                try {
                    const lineItems = [
                        { catalog_object_id: creditVariationId, quantity: "1", base_price_money: { amount: amountCents, currency: "USD" } },
                    ];
                    if (feeCents > 0) {
                        lineItems.push({ name: "Online processing fee", quantity: "1", base_price_money: { amount: feeCents, currency: "USD" } });
                    }
                    const order = await createSquareOrder({ lineItems, referenceId: purchaseId, idempotencyKey: `credit-order-${purchaseId}` });
                    squareOrderId = order?.id || null;
                } catch (orderError) {
                    logger.warn("marketplace.credit.order_itemize_failed", { purchaseId, message: orderError instanceof Error ? orderError.message : "unknown" });
                }
            }

            let payment;
            try {
                payment = await createSquareCardPayment({
                    sourceId,
                    amountCents: chargedCents,
                    idempotencyKey,
                    note: `Store credit $${(amountCents / 100).toFixed(2)} — ${buyer.alias ? `@${buyer.alias}` : buyer.id}`,
                    referenceId: purchaseId,
                    orderId: squareOrderId,
                });
            } catch (error) {
                await failCreditPurchase(purchaseId, { reason: error?.squareCode || "payment_create_failed" });
                logger.warn("marketplace.credit.payment_failed", { purchaseId, squareCode: error?.squareCode, squareStatus: error?.squareStatus });
                return noStore(
                    { error: "Payment could not be processed.", code: error?.squareCode || "payment_create_failed" },
                    { status: error?.squareStatus === 400 ? 402 : 502 }
                );
            }

            if (!OK_STATUSES.has(String(payment?.status || "").toUpperCase())) {
                await failCreditPurchase(purchaseId, { reason: payment?.status || "not_completed" });
                return noStore({ error: "Payment was not completed.", code: "payment_not_completed" }, { status: 402 });
            }

            const result = await finalizeCreditPurchase(purchaseId, { squarePaymentId: payment?.id, receiptUrl: payment?.receipt_url });

            // Ping the owner's phone that a coin/credit sale just happened (best-effort).
            if (result.credited) {
                sendAdminPush({
                    title: "💳 Store credit purchased",
                    body: `${buyer.alias ? `@${buyer.alias}` : "A member"} bought $${(amountCents / 100).toFixed(2)} credit (+${coins.toLocaleString()} coins).`,
                    route: `storeCredit:${buyer.id}`, // tapping opens the Store Credit area focused on this buyer
                    data: { type: "credit_purchase", buyerId: buyer.id, amountCents },
                }).catch(() => {});
                // Grant any newly-earned store-credit badges from the higher lifetime total.
                syncEarnedBadges(buyer.id).catch(() => {});
                // ── NO CREATION TOKENS ON THIS PATH ──────────────────────────────────────────────────
                // This used to mint one Creation token per full $5 loaded, and it was the single largest
                // source of them in the game: $350 loaded produced 75 tokens, against 16 ever sold by the
                // Creations shop itself.
                //
                // The two purchases are meant to be exclusive, and only one of them was. A Creation bundle
                // deliberately never touches store_credit_cents ("a token/coin bundle, not a dollar
                // balance" — creation-tokens-server.js); loading credit paid credit AND coins AND tokens.
                //
                // The asymmetry that matters is not the count, it is that A CREDIT LOAD DOES NOT CONSUME
                // THE MONEY. Load $350 and you still have $350 to spend in the shop — the dollars come back
                // as goods, so the token rode along free. The $5 that buys a bundle is gone for good. A
                // paid-only resource cannot have a path that hands it out for nothing, which is the same
                // rule that just took it off the cooking ladder.
                //
                // Tokens already granted stay granted (89 unspent across all members, most of them one
                // member's) — they were paid for in good faith under the old rule.
            }

            return noStore({
                ok: true,
                amountCents,
                feeCents,
                chargedCents,
                coins,
                bonusCoins, // extra coins from equipped credit gear (0 if none)
                balanceCents: result.balanceCents,
                receiptUrl: payment?.receipt_url || null,
            });
        } catch (error) {
            return internalError(error, { event: "marketplace.credit.checkout.failure" });
        }
    });
}
