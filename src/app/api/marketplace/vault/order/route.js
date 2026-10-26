import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { isTrustedWriteRequest } from "@/lib/request-security";
import { createVaultOrder, quoteVaultShipping } from "@/lib/marketplace/vault.js";
import { vaultOpenFor } from "@/lib/marketplace/vault-gate.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) =>
    NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

const MESSAGES = {
    closed: "The vault isn't available yet.",
    nothing_selected: "Pick at least one card.",
    on_hold: "Those cards aren't ready to leave yet — new store credit settles first.",
    shipping_unavailable: "Shipping isn't available right now. Store pickup still works.",
    no_rates: "We couldn't get a shipping price for that address.",
    insufficient_credit: "Not enough store credit to cover shipping.",
};

// Door 9 of 9. `quote` prices a shipment; `create` commits it.
//
// ⚠️ THE SERVER RE-RESOLVES WHICH CARDS MAY GO. The request carries ids; everything else — what they are
// worth, whether the credit hold has cleared, what shipping costs — is decided here. A client that could
// name its own shipping price could ship a vault for a penny.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/vault/order", async ({ internalError }) => {
        if (!isTrustedWriteRequest(request)) {
            return noStore({ error: "Invalid request origin." }, { status: 403 });
        }
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return noStore({ error: "Sign in first." }, { status: 401 });
            if (!vaultOpenFor(buyer.id)) return noStore({ error: "Not found." }, { status: 404 });

            const body = await request.json().catch(() => ({}));
            const cardIds = Array.isArray(body?.cardIds) ? body.cardIds.map(String) : [];

            if (body?.action === "quote") {
                const quote = await quoteVaultShipping({ buyerId: buyer.id, cardIds, toAddress: body?.shipping });
                if (!quote.ok) {
                    return noStore({ error: MESSAGES[quote.error] || "Couldn't quote that.", code: quote.error, held: quote.heldBack }, { status: 409 });
                }
                return noStore(quote);
            }

            const result = await createVaultOrder({
                buyerId: buyer.id,
                cardIds,
                mode: body?.mode,
                shipping: body?.shipping || null,
                shipmentId: body?.shipmentId || null,
                rateId: body?.rateId || null,
                shippingCents: Number(body?.shippingCents) || 0,
                insuranceCents: Number(body?.insuranceCents) || 0,
            });
            if (!result.ok) {
                return noStore(
                    { error: MESSAGES[result.error] || "Couldn't create that order.", code: result.error, held: result.held },
                    { status: 409 }
                );
            }
            return noStore(result);
        } catch (error) {
            return internalError(error, { event: "vault.order.failure" });
        }
    });
}
