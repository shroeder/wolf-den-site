import Link from "next/link";
import { notFound } from "next/navigation";

import ShopOrdersClient from "@/components/ShopOrdersClient";
import { getAuthenticatedShopCustomerFromCookies } from "@/lib/shop-customer-session";
import { listCustomerOrders } from "@/lib/shop-orders";

export const metadata = {
    title: "My Orders | The Wolf Den",
    robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ShopOrdersPage() {
    const paymentsEnabled = process.env.PAYMENTS_ENABLED === "true" && process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === "true";
    if (!paymentsEnabled) {
        notFound();
    }

    const customer = await getAuthenticatedShopCustomerFromCookies();

    if (!customer) {
        return (
            <section className="card cart-page-shell">
                <h1>My Orders</h1>
                <p className="secondary">
                    <Link href="/shop/account">Sign in</Link> to see your orders and their status.
                </p>
            </section>
        );
    }

    const orders = await listCustomerOrders(customer.id, { email: customer.email });

    return <ShopOrdersClient orders={orders} email={customer.email} />;
}
