import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { isTrustedWriteRequest } from "@/lib/request-security";
import { sellVaultCards } from "@/lib/marketplace/vault.js";
import { vaultOpenFor } from "@/lib/marketplace/vault-gate.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) =>
    NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

// Door 8 of 9. Sell one or many cards back for store credit.
//
// ⚠️ THE SERVER PRICES THE SALE, NOT THE CLIENT. The request carries card ids and nothing else — no amounts,
// no totals. A buy-back pays out real money, and a client-supplied figure is a client-supplied withdrawal.
const MESSAGES = {
    closed: "The vault isn't available yet.",
    nothing_selected: "Pick at least one card.",
    nothing_sellable: "Those cards aren't available to sell — they may already be on an order.",
};

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/vault/sell", async ({ internalError }) => {
        if (!isTrustedWriteRequest(request)) {
            return noStore({ error: "Invalid request origin." }, { status: 403 });
        }
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return noStore({ error: "Sign in first." }, { status: 401 });
            if (!vaultOpenFor(buyer.id)) return noStore({ error: "Not found." }, { status: 404 });

            const body = await request.json().catch(() => ({}));
            const cardIds = Array.isArray(body?.cardIds) ? body.cardIds.map(String) : [];

            const result = await sellVaultCards({ buyerId: buyer.id, cardIds });
            if (!result.ok) {
                return noStore(
                    { error: MESSAGES[result.error] || "Couldn't sell those.", code: result.error },
                    { status: 409 }
                );
            }
            return noStore(result);
        } catch (error) {
            return internalError(error, { event: "vault.sell.failure" });
        }
    });
}
