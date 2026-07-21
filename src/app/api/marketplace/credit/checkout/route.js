import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { createSquareCardPayment } from "@/lib/consignment/square";
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
// surcharge; the amount lands in the member's store credit and they're granted 100 coins per $1. Crediting
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
            const coins = coinsForCents(amountCents);
            const idempotencyKey = randomUUID();

            const purchaseId = await createPendingCreditPurchase({ buyerId: buyer.id, amountCents, feeCents, chargedCents, coins, idempotencyKey });

            let payment;
            try {
                payment = await createSquareCardPayment({
                    sourceId,
                    amountCents: chargedCents,
                    idempotencyKey,
                    note: `Store credit $${(amountCents / 100).toFixed(2)} — ${buyer.alias ? `@${buyer.alias}` : buyer.id}`,
                    referenceId: purchaseId,
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
            return noStore({
                ok: true,
                amountCents,
                feeCents,
                chargedCents,
                coins,
                balanceCents: result.balanceCents,
                receiptUrl: payment?.receipt_url || null,
            });
        } catch (error) {
            return internalError(error, { event: "marketplace.credit.checkout.failure" });
        }
    });
}
