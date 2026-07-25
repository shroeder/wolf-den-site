import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { createSquareCardPayment, createSquareOrder, getCreationTokensVariationId } from "@/lib/consignment/square";
import { sendAdminPush } from "@/lib/push/send.js";
import { isTrustedWriteRequest } from "@/lib/request-security";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { getCreationTier } from "@/lib/marketplace/creation-tokens.js";
import {
    createPendingCreationPurchase,
    failCreationPurchase,
    finalizeCreationPurchase,
    grantCreationTierToOwner,
} from "@/lib/marketplace/creation-tokens-server.js";
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

// POST — buy Creation Tokens. Body: { tierId, sourceId } to charge a card, OR { tierId, grant:true } for the
// owner to self-grant a tier's contents for testing (no charge). A paid tier grants TOKENS
// (custom_deco_credits) + COINS (gold) — never store credit. Granting is idempotent (guarded by the
// pending→paid transition on mkt_creation_purchase).
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/creations/checkout", async ({ logger, internalError }) => {
        if (!isTrustedWriteRequest(request)) return noStore({ error: "Invalid request origin." }, { status: 403 });
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "Sign in to buy creation tokens." }, { status: 401 });

            const body = await request.json().catch(() => ({}));
            const tier = getCreationTier(body?.tierId);
            if (!tier) return noStore({ error: "Pick a token bundle." }, { status: 400 });

            // ── Owner self-grant (test path): no card, no charge — just grant the tier's tokens + coins. ──
            if (body?.grant === true) {
                if (!isOwner(buyer.id)) return noStore({ error: "Not allowed." }, { status: 403 });
                const g = await grantCreationTierToOwner(buyer.id, tier.id);
                if (!g.ok) return noStore({ error: "Grant failed." }, { status: 400 });
                return noStore({ ok: true, granted: true, owner: true, tokens: g.tokens, coins: g.coins, tokenBalance: g.tokenBalance });
            }

            // ── Real charge (dark until PAYMENTS_ENABLED, exactly like store credit). ──
            if (!isPaymentsEnabled()) return noStore({ error: "Payments are currently disabled." }, { status: 403 });

            const sourceId = String(body?.sourceId || "").trim();
            if (!sourceId) return noStore({ error: "Missing payment source." }, { status: 400 });

            const amountCents = tier.priceCents; // charge the advertised tier price exactly — no surcharge
            const idempotencyKey = randomUUID();
            const purchaseId = await createPendingCreationPurchase({
                buyerId: buyer.id,
                tierId: tier.id,
                amountCents,
                tokens: tier.tokens,
                coins: tier.coins,
                idempotencyKey,
            });

            // Itemize against the catalog "Creation Tokens" item so the sale rolls up under its Square category
            // in reports (auto-provisions the category + variable-price item on first use). If catalog write
            // isn't available, fall back to a plain-named line so the sale is still readable. Best-effort.
            let squareOrderId = null;
            try {
                const creationVariationId = await getCreationTokensVariationId().catch(() => null);
                const lineItem = creationVariationId
                    ? { catalog_object_id: creationVariationId, quantity: "1", base_price_money: { amount: amountCents, currency: "USD" } }
                    : { name: `Creation Tokens (${tier.tokens})`, quantity: "1", base_price_money: { amount: amountCents, currency: "USD" } };
                const order = await createSquareOrder({
                    lineItems: [lineItem],
                    referenceId: purchaseId,
                    idempotencyKey: `creation-order-${purchaseId}`,
                });
                squareOrderId = order?.id || null;
            } catch (orderError) {
                logger.warn("marketplace.creations.order_itemize_failed", { purchaseId, message: orderError instanceof Error ? orderError.message : "unknown" });
            }

            let payment;
            try {
                payment = await createSquareCardPayment({
                    sourceId,
                    amountCents,
                    idempotencyKey,
                    note: `Creation tokens ×${tier.tokens} — ${buyer.alias ? `@${buyer.alias}` : buyer.id}`,
                    referenceId: purchaseId,
                    orderId: squareOrderId,
                });
            } catch (error) {
                await failCreationPurchase(purchaseId);
                logger.warn("marketplace.creations.payment_failed", { purchaseId, squareCode: error?.squareCode, squareStatus: error?.squareStatus });
                return noStore(
                    { error: "Payment could not be processed.", code: error?.squareCode || "payment_create_failed" },
                    { status: error?.squareStatus === 400 ? 402 : 502 }
                );
            }

            if (!OK_STATUSES.has(String(payment?.status || "").toUpperCase())) {
                await failCreationPurchase(purchaseId);
                return noStore({ error: "Payment was not completed.", code: "payment_not_completed" }, { status: 402 });
            }

            const result = await finalizeCreationPurchase(purchaseId, { squarePaymentId: payment?.id, receiptUrl: payment?.receipt_url });

            if (result.granted) {
                sendAdminPush({
                    title: "🎨 Creation tokens purchased",
                    body: `${buyer.alias ? `@${buyer.alias}` : "A member"} bought ${tier.tokens} creation tokens (+${tier.coins.toLocaleString()} coins) for $${(amountCents / 100).toFixed(2)}.`,
                    data: { type: "creation_purchase", buyerId: buyer.id, tierId: tier.id },
                }).catch(() => {});
            }

            return noStore({
                ok: true,
                tokens: result.tokens,
                coins: result.coins,
                amountCents,
                tokenBalance: result.tokenBalance,
                receiptUrl: payment?.receipt_url || null,
            });
        } catch (error) {
            return internalError(error, { event: "marketplace.creations.checkout.failure" });
        }
    });
}
