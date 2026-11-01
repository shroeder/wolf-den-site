import { NextResponse } from "next/server";
import { db } from "@/lib/db";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { listShopOrders, serializeShopOrderForAdmin } from "@/lib/shop-orders";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// List paid online orders for the admin app's Shop Orders screen (the web page uses a server
// component; the phone app needs JSON). Same shape both sides via serializeShopOrderForAdmin.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/shop/orders", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;

        try {
            const url = new URL(request.url);
            const fulfillmentStatus = url.searchParams.get("fulfillment") || null;
            const limit = Number(url.searchParams.get("limit")) || 200;
            // ?archived=1 for the filed ones, ?archived=all for both. Anything else means the active list,
            // which is what every screen asks for by default.
            const archivedParam = url.searchParams.get("archived");
            const archived = archivedParam === "all" ? "all" : archivedParam === "1" || archivedParam === "true";

            const orders = await listShopOrders({
                limit,
                paymentStatus: "completed",
                fulfillmentStatus: fulfillmentStatus && fulfillmentStatus !== "all" ? fulfillmentStatus : null,
                archived,
            });

            const serialized = orders.map(serializeShopOrderForAdmin);

            // ── ⚠️ AN ORDER HOLDING A PRE-ORDER CANNOT BE FULFILLED, AND THE LIST HAD NO WAY TO SAY SO ──
            // A pre-order pickup looks exactly like any other unfulfilled pickup on this screen: a name, a
            // total, and a Ready button. Somebody would go to the shelf for a box that is not in the
            // building, not find it, and have no way to tell whether it was stolen, mis-shelved or never
            // existed. Luke's own worry about the shelf and the screen disagreeing.
            //
            // One query for the whole page rather than one per row — the list is up to 200 orders and this
            // runs on the neon() HTTP driver, where per-row would be 200 round trips (CLAUDE.md, family A).
            const ids = serialized.map((o) => o.id).filter(Boolean);
            if (ids.length) {
                const holds = await db.query(
                    `SELECT h.order_id, h.item_name, h.quantity, h.notified_at, r.preorder_arrives_on
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
                        quantity: Number(h.quantity) || 1,
                        arrivesOn: h.preorder_arrives_on ? String(h.preorder_arrives_on).slice(0, 10) : null,
                        // notified_at is set the moment the item is marked arrived, so this is the one
                        // flag that says "the stock is here, this order can actually be worked".
                        arrived: Boolean(h.notified_at),
                    });
                    byOrder.set(h.order_id, list);
                }
                for (const o of serialized) {
                    const list = byOrder.get(o.id) || [];
                    o.preorders = list;
                    // The thing the screen actually branches on: is this order still waiting on stock.
                    o.waitingOnPreorder = list.some((x) => !x.arrived);
                }
            }

            return NextResponse.json({ orders: serialized });
        } catch (error) {
            return internalError(error, { event: "admin.shop.orders.list.failure" });
        }
    });
}
