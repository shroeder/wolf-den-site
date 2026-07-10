import AdminLoginClient from "@/components/AdminLoginClient";
import ShopOrdersAdminClient from "@/components/ShopOrdersAdminClient";
import { getAdminWebSession, getMarketplaceAdmin } from "@/lib/admin-app/web-session";
import { listShopOrders, serializeShopOrderForAdmin } from "@/lib/shop-orders";

export const metadata = {
    title: "Shop Orders | The Wolf Den",
    robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ShopOrdersAdminPage() {
    const admin = await getMarketplaceAdmin();
    if (!admin) {
        const session = await getAdminWebSession();
        return <AdminLoginClient noAccessName={session ? session.user.displayName : null} />;
    }

    const orders = await listShopOrders({ limit: 200, paymentStatus: "completed" });
    const safe = orders.map(serializeShopOrderForAdmin);

    return <ShopOrdersAdminClient orders={safe} />;
}
