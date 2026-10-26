import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { isTrustedWriteRequest } from "@/lib/request-security";
import { cancelVaultOrder } from "@/lib/marketplace/vault.js";
import { vaultOpenFor } from "@/lib/marketplace/vault-gate.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) =>
    NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

const MESSAGES = {
    not_found: "We couldn't find that order.",
    shipping_order: "A shipped order can't be cancelled here — message us and we'll sort it out.",
    too_late: "That order has already been collected.",
    nothing_to_cancel: "Those cards are already back in your vault.",
};

// A member cancels their own PICKUP order. Nothing was paid and nothing has moved, so this really cancels
// rather than filing a request — unlike the shop's own orders, which only flag for review.
export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/marketplace/vault/order/[id]/cancel", async ({ internalError }) => {
        if (!isTrustedWriteRequest(request)) {
            return noStore({ error: "Invalid request origin." }, { status: 403 });
        }
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return noStore({ error: "Sign in first." }, { status: 401 });
            if (!vaultOpenFor(buyer.id)) return noStore({ error: "Not found." }, { status: 404 });

            const { id } = await params;
            const result = await cancelVaultOrder({ buyerId: buyer.id, orderId: id });
            if (!result.ok) {
                return noStore({ error: MESSAGES[result.error] || "Couldn't cancel that.", code: result.error }, { status: 409 });
            }
            return noStore(result);
        } catch (error) {
            return internalError(error, { event: "vault.cancel.failure" });
        }
    });
}
