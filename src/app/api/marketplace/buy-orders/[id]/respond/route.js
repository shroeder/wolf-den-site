import { NextResponse } from "next/server";

import { sendBuyOrderResponseEmail } from "@/lib/marketplace/email.js";
import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { getBuyOrderById } from "@/lib/marketplace/wants.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A vendor tells a buyer "I can fill this" — emails the buyer (reply routes to the vendor). Works for
// the web portal (cookie session) and the app (bearer token linked to a vendor).
export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/marketplace/buy-orders/[id]/respond", async ({ logger, internalError }) => {
        try {
            const vendor = await getAuthenticatedVendor();
            if (!vendor) {
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            const { id } = await params;
            const body = await request.json().catch(() => ({}));

            const order = await getBuyOrderById(id);
            if (!order) {
                return NextResponse.json({ error: "That buy order is no longer open." }, { status: 404 });
            }

            const price = body.price != null && body.price !== "" && Number.isFinite(Number(body.price)) ? Number(body.price) : null;
            const message = body.message ? String(body.message).trim().slice(0, 800) : null;

            await sendBuyOrderResponseEmail(order.email, {
                vendor,
                product: { name: order.name, setName: order.set_name, catalogProductId: String(order.catalog_product_id) },
                message,
                price,
            });

            logger.info("marketplace.buy_order.responded", { orderId: id, vendorId: vendor.id });
            return NextResponse.json({ ok: true });
        } catch (error) {
            return internalError(error, { event: "marketplace.buy_order.respond.failure" });
        }
    });
}
