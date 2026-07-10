import AdminLoginClient from "@/components/AdminLoginClient";
import ShopOrdersAdminClient from "@/components/ShopOrdersAdminClient";
import { getAdminWebSession, getMarketplaceAdmin } from "@/lib/admin-app/web-session";
import { listShopOrders } from "@/lib/shop-orders";

export const metadata = {
    title: "Shop Orders | The Wolf Den",
    robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function parseItems(itemsJson) {
    try {
        return Array.isArray(itemsJson) ? itemsJson : JSON.parse(itemsJson || "[]");
    } catch {
        return [];
    }
}

export default async function ShopOrdersAdminPage() {
    const admin = await getMarketplaceAdmin();
    if (!admin) {
        const session = await getAdminWebSession();
        return <AdminLoginClient noAccessName={session ? session.user.displayName : null} />;
    }

    const orders = await listShopOrders({ limit: 200, paymentStatus: "completed" });
    const safe = orders.map((o) => ({
        id: o.id,
        createdAt: o.created_at ? new Date(o.created_at).toISOString() : null,
        status: o.status,
        fulfillmentStatus: o.fulfillment_status || "unfulfilled",
        fulfillmentMode: o.fulfillment_mode,
        trackingNumber: o.tracking_number || "",
        totalCents: o.total_cents,
        subtotalCents: o.subtotal_cents,
        taxCents: o.tax_cents ?? null,
        shippingCents: o.shipping_cents ?? null,
        onlineFeeCents: o.online_fee_cents,
        shippingCarrier: o.shipping_carrier || null,
        shippingService: o.shipping_service || null,
        shippingLabelUrl: o.shipping_label_url || null,
        hasShipment: Boolean(o.easypost_shipment_id && o.easypost_rate_id),
        items: parseItems(o.items_json),
        shipping: {
            name: o.shipping_name,
            email: o.shipping_email,
            phone: o.shipping_phone,
            addressLine1: o.shipping_address_line1,
            addressLine2: o.shipping_address_line2,
            city: o.shipping_city,
            state: o.shipping_state,
            postalCode: o.shipping_postal_code,
        },
        receiptUrl: o.receipt_url,
    }));

    return <ShopOrdersAdminClient orders={safe} />;
}
