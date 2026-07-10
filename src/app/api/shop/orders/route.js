import { NextResponse } from "next/server";

import { getAuthenticatedShopCustomerFromCookies } from "@/lib/shop-customer-session";
import { listCustomerOrders } from "@/lib/shop-orders";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isPaymentsEnabled() {
    return process.env.PAYMENTS_ENABLED === "true";
}

// The signed-in customer's own orders (for their "My Orders" page).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/shop/orders", async ({ internalError }) => {
        if (!isPaymentsEnabled()) {
            return NextResponse.json({ error: "Payments are currently disabled." }, { status: 403 });
        }
        try {
            const customer = await getAuthenticatedShopCustomerFromCookies();
            if (!customer) {
                return NextResponse.json({ error: "Sign in to view your orders." }, { status: 401 });
            }
            const orders = await listCustomerOrders(customer.id);
            return NextResponse.json({ orders }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "shop.orders.list.failed" });
        }
    });
}
