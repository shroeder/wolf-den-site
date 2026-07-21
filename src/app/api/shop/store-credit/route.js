import { NextResponse } from "next/server";

import { getAuthenticatedShopCustomerFromCookies } from "@/lib/shop-customer-session";
import { resolveBuyerId } from "@/lib/marketplace/xp.js";
import { getStoreCredit } from "@/lib/marketplace/store-credit.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET — the store-credit balance available to APPLY to an online order. Only for a signed-in shop customer
// whose (verified) email maps to a marketplace account; returns 0 for guests so nobody can probe balances.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/shop/store-credit", async ({ internalError }) => {
        try {
            const customer = await getAuthenticatedShopCustomerFromCookies();
            if (!customer?.email) return noStore({ balanceCents: 0, linked: false });
            const buyerId = await resolveBuyerId({ email: customer.email }).catch(() => null);
            if (!buyerId) return noStore({ balanceCents: 0, linked: false });
            const balanceCents = await getStoreCredit(buyerId).catch(() => 0);
            return noStore({ balanceCents, linked: true });
        } catch (error) {
            return internalError(error, { event: "shop.store_credit.get.failure" });
        }
    });
}
