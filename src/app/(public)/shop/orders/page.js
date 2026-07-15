import { Suspense } from "react";

import Link from "next/link";
import { notFound } from "next/navigation";

import ShopOrdersClient from "@/components/ShopOrdersClient";
import ShopRewardsBanner from "@/components/ShopRewardsBanner";
import { db } from "@/lib/db";
import { getAuthenticatedShopCustomerFromCookies } from "@/lib/shop-customer-session";
import { listCustomerOrders } from "@/lib/shop-orders";

// Does a rewards (marketplace) account already exist for this email? Tailors the post-purchase hook.
async function hasRewardsAccount(email) {
    if (!email) return false;
    const row = await db
        .queryOne(`SELECT 1 FROM mkt_buyer WHERE email_normalized = $1`, [String(email).trim().toLowerCase()])
        .catch(() => null);
    return Boolean(row);
}

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
            <div className="stack">
                <Suspense fallback={null}>
                    <ShopRewardsBanner hasRewards={false} />
                </Suspense>
                <section className="card cart-page-shell">
                    <h1>My Orders</h1>
                    <p className="secondary">
                        <Link href="/shop/account">Sign in</Link> to see your orders and their status.
                    </p>
                </section>
            </div>
        );
    }

    const [orders, hasRewards] = await Promise.all([
        listCustomerOrders(customer.id, { email: customer.email }),
        hasRewardsAccount(customer.email),
    ]);

    return (
        <div className="stack">
            <Suspense fallback={null}>
                <ShopRewardsBanner hasRewards={hasRewards} />
            </Suspense>
            <ShopOrdersClient orders={orders} email={customer.email} />
        </div>
    );
}
