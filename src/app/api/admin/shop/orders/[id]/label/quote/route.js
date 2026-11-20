import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getShopOrderById } from "@/lib/shop-orders";
import { buildParcel, getShippingRates, isEasyPostEnabled } from "@/lib/shipping/easypost";
import { shippingBoxFor } from "@/lib/shipping/own-shipping";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── WHAT WOULD THIS LABEL COST? (BUYS NOTHING) ───────────────────────────────────────────────────────────────
// Luke, 2026-11-20, after a $52.83 label on a $25 shipping charge: "Let's say that we shipped it in that
// smaller box. What would it have cost?" Rating a shipment is free at EasyPost — only buying spends money — so
// this creates a throwaway shipment for the order's address with the weight and box given and returns the USPS
// rates. It never touches the order row.
export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/admin/shop/orders/[id]/label/quote", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        if (!isEasyPostEnabled()) return NextResponse.json({ error: "EasyPost is not configured." }, { status: 400 });

        const { id } = await params;
        try {
            const order = await getShopOrderById(id);
            if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

            const body = await request.json().catch(() => ({}));
            const estimate = buildParcel(order.items_json || []);
            const box = shippingBoxFor(String(body?.boxId || ""));
            const n = (v) => (Number(v) > 0 ? Number(v) : null);
            const parcel = {
                weight: n(body?.weightOz) ?? estimate.weight,
                length: n(body?.lengthIn) ?? box?.length ?? estimate.length,
                width: n(body?.widthIn) ?? box?.width ?? estimate.width,
                height: n(body?.heightIn) ?? box?.height ?? estimate.height,
            };
            const quoted = await getShippingRates({
                toAddress: {
                    name: order.shipping_name,
                    addressLine1: order.shipping_address_line1,
                    addressLine2: order.shipping_address_line2,
                    city: order.shipping_city,
                    state: order.shipping_state,
                    postalCode: order.shipping_postal_code,
                    country: order.shipping_country || "US",
                    phone: order.shipping_phone,
                },
                items: order.items_json || [],
                parcel,
            });
            return NextResponse.json({
                parcel,
                chargedCustomerCents: Number(order.shipping_cents) || 0,
                rates: (quoted?.rates || []).filter((r) => /usps/i.test(r.carrier))
                    .map((r) => ({ service: r.service, cents: r.amountCents, days: r.deliveryDays })),
            });
        } catch (error) {
            if (error?.easyPostStatus) {
                return NextResponse.json({ error: error.message }, { status: 502 });
            }
            return internalError(error, { event: "admin.shop.order.label.quote_failure" });
        }
    });
}
