import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { createSquareCardPayment, createSquareOrder, getCreationTokensVariationId } from "@/lib/consignment/square";
import { sendAdminPush } from "@/lib/push/send.js";
import { isTrustedWriteRequest } from "@/lib/request-security";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getStoreCredit, spendCredit } from "@/lib/marketplace/store-credit.js";
import { getCreationTier } from "@/lib/marketplace/creation-tokens.js";
import {
    createPendingCreationPurchase,
    failCreationPurchase,
    finalizeCreationPurchase,
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

            // Granting creation tokens is ADMIN-APP ONLY now (POST /api/admin/creations, marketplace.manage +
            // full audit ledger). The old website owner self-grant path was removed — owners instead create for
            // FREE (no token needed), so there's no reason to mint tokens to yourself here.

            // ── PAYING WITH THE BALANCE THEY ALREADY HAVE ───────────────────────────────────────────
            // Luke: "use store credit as a valid method of payment to buy generation tokens."
            //
            // ⚠️ AND IT GRANTS NO COINS, WHICH IS THE WHOLE REASON THIS NEEDS A COMMENT. Every dollar of store
            // credit in this system minted coins the moment it was BOUGHT — 200 a dollar, see COINS_PER_CENT —
            // so paying with it and then also paying the tier's coins would mint the same dollar twice. On the
            // $25 tier that is 5,000 coins at top-up plus 6,000 again here: store credit would become a coin
            // doubler and the one lever on the mint rate would be a customer's choice of payment method. See
            // [[gold-mint-rate-lever]] and [[awardxp-gold-tracks-xp-landmine]], which is the same shape of bug.
            //
            // So a credit purchase buys the TOKENS. The pending row is written with coins: 0, which is what
            // finalizeCreationPurchase grants from — the row is the record of what was promised, so there is no
            // second place that has to remember this rule.
            //
            // Not behind PAYMENTS_ENABLED: that flag guards taking a CARD. No card is touched here, and the
            // money entered the system when the credit was bought.
            if (String(body?.pay || "") === "credit") {
                const balance = await getStoreCredit(buyer.id);
                if (balance < tier.priceCents) {
                    return noStore({ error: "Not enough store credit.", code: "insufficient_credit", balanceCents: balance }, { status: 402 });
                }
                const purchaseId = await createPendingCreationPurchase({
                    buyerId: buyer.id,
                    tierId: tier.id,
                    amountCents: tier.priceCents,
                    tokens: tier.tokens,
                    coins: 0,
                    idempotencyKey: randomUUID(),
                });
                // Race-safe by construction: the spend is a conditional UPDATE that only succeeds while the
                // balance still covers it, so two taps cannot both go through. The purchase id is the ledger
                // ref, which is what makes a stuck pending row reconcilable afterwards.
                const spent = await spendCredit(buyer.id, tier.priceCents, "creation_tokens", purchaseId, { tierId: tier.id, tokens: tier.tokens });
                if (!spent.ok) {
                    await failCreationPurchase(purchaseId);
                    return noStore({ error: "Not enough store credit.", code: "insufficient_credit" }, { status: 402 });
                }
                const paid = await finalizeCreationPurchase(purchaseId);
                if (paid.granted) {
                    sendAdminPush({
                        title: "🎨 Creation tokens bought with credit",
                        body: `${buyer.alias ? `@${buyer.alias}` : "A member"} spent $${(tier.priceCents / 100).toFixed(2)} of store credit on ${tier.tokens} creation tokens.`,
                        data: { type: "creation_purchase", buyerId: buyer.id, tierId: tier.id, paidWith: "credit" },
                    }).catch(() => {});
                }
                return noStore({
                    ok: true,
                    paidWith: "credit",
                    tokens: paid.tokens,
                    coins: 0,
                    amountCents: tier.priceCents,
                    tokenBalance: paid.tokenBalance,
                    creditCents: spent.balanceCents,
                });
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
