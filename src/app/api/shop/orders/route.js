import { NextResponse } from "next/server";
import { db } from "@/lib/db";

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

            // ── ⚠️ A PRE-ORDER MUST NOT READ AS "WE FORGOT YOU" ─────────────────────────────────────
            // My Orders shows the fulfilment status, and a pre-order sits at `unfulfilled` for however
            // many weeks the release is away. To the person who paid, an order that has said
            // "unfulfilled" for three weeks looks neglected — and a pre-order is precisely the order
            // where someone will check this page over and over, because waiting is the whole deal they
            // agreed to.
            //
            // So the order carries what it is waiting for and when, and the page can say "arriving
            // November 22" instead of leaving them to guess.
            const ids = (orders || []).map((o) => o.id).filter(Boolean);
            if (ids.length) {
                const holds = await db.query(
                    `SELECT h.order_id, h.item_name, h.notified_at, r.preorder_arrives_on
                       FROM shop_preorder_holds h
                       LEFT JOIN shop_item_rules r ON r.variation_id = h.variation_id
                      WHERE h.order_id = ANY($1)`,
                    [ids],
                ).catch(() => []);
                const byOrder = new Map();
                for (const h of holds || []) {
                    const list = byOrder.get(h.order_id) || [];
                    list.push({
                        itemName: h.item_name,
                        arrivesOn: h.preorder_arrives_on ? String(h.preorder_arrives_on).slice(0, 10) : null,
                        arrived: Boolean(h.notified_at),
                    });
                    byOrder.set(h.order_id, list);
                }
                for (const o of orders) {
                    const list = byOrder.get(o.id) || [];
                    o.preorders = list;
                    o.waitingOnPreorder = list.some((x) => !x.arrived);
                    // The date the whole order moves on, which is the LAST one — same rule the cart
                    // quotes, because the order travels together.
                    o.preorderArrivesOn = list
                        .filter((x) => !x.arrived && x.arrivesOn)
                        .map((x) => x.arrivesOn)
                        .sort()
                        .pop() || null;
                }
            }

            return NextResponse.json({ orders }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "shop.orders.list.failed" });
        }
    });
}
