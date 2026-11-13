import { Suspense } from "react";

import Link from "next/link";
import { notFound } from "next/navigation";

import ShopOrdersClient from "@/components/ShopOrdersClient";
import ShopRewardsBanner from "@/components/ShopRewardsBanner";
import { db } from "@/lib/db";
import { getAuthenticatedShopCustomerFromCookies } from "@/lib/shop-customer-session";
import { listCustomerOrders } from "@/lib/shop-orders";

// ── ⚠️ WHAT THEY ACTUALLY EARNED, READ BACK RATHER THAN RECOMPUTED ──────────────────────────────────────────
// Luke, 2026-11-12: "they should be onboarded into the game by visibly seeing the in-game rewards they've
// just achieved by spending money."
//
// The banner here has always said "You just earned Wolf Den Rewards points!" and never said how many, what
// they were worth, or that a game existed to spend them in. A number somebody can check is worth more than
// an exclamation mark, and this is the one moment they are certain to be looking.
//
// ⚠️ READ FROM mkt_xp_event, NOT FROM THE ORDER TOTAL x 5. awardPurchaseXp stamps the event with a
// dedupeKey of `spend:<orderId>`, and the points it wrote already carry Happy Hour, the town's prosperity
// bonus and anything else live at the moment of the sale. Recomputing dollars x SPEND_XP_PER_DOLLAR here
// would quietly disagree with the balance on their card the first time any of those was running.
async function rewardsForOrder(email, orderId) {
    const normalized = email ? String(email).trim().toLowerCase() : null;
    if (!normalized) return null;
    const buyer = await db
        .queryOne(
            `SELECT id, xp, gold, password_hash IS NULL AS unclaimed FROM mkt_buyer WHERE email_normalized = $1`,
            [normalized]
        )
        .catch(() => null);
    if (!buyer) return { account: false };
    let earned = null;
    let coins = null;
    if (orderId) {
        earned = await db
            .queryOne(
                `SELECT points, created_at FROM mkt_xp_event WHERE buyer_id = $1 AND dedupe_key = $2`,
                [buyer.id, `spend:${orderId}`]
            )
            .catch(() => null);
        // ── ⚠️ GOLD IS ITS OWN NUMBER AND IT IS NOT THE XP ──────────────────────────────────────────
        // The first cut of the banner printed the XP figure twice, on the reasoning in
        // [[awardxp-gold-tracks-xp-landmine]] — awardXp pays gold alongside points unless told not to.
        // True, and not the same number: xp and gold take DIFFERENT multipliers (the town's prosperity
        // has an xpPct and a goldPct, and Happy Hour touches one of them). Measured on a real $20 test
        // purchase: 112 XP and 48 gold. Printing 112 twice would have been a made-up figure on the one
        // screen whose whole job is to be checkable against their balance.
        if (earned) {
            coins = await db
                .queryOne(
                    `SELECT COALESCE(SUM(delta), 0)::int AS gold FROM mkt_coin_event
                      WHERE buyer_id = $1 AND created_at BETWEEN $2::timestamptz - INTERVAL '5 seconds'
                                                            AND $2::timestamptz + INTERVAL '5 seconds'
                        AND delta > 0`,
                    [buyer.id, earned.created_at]
                )
                .catch(() => null);
        }
    }
    return {
        account: true,
        // Null when the webhook has not landed yet — the banner says something true either way rather
        // than printing a confident zero.
        points: earned ? Number(earned.points) || 0 : null,
        // Null rather than 0 when the ledger has not been read — the banner has a sentence for "we know
        // you earned something" and should never print a confident zero.
        gold: coins && Number(coins.gold) > 0 ? Number(coins.gold) : null,
        xp: Number(buyer.xp) || 0,
        // ⚠️ A PASSWORDLESS ACCOUNT IS ONE THEY HAVE NEVER OPENED. It was provisioned for them by a
        // purchase or the shop bridge, so the ramp for them is "claim it", not "go play".
        unclaimed: Boolean(buyer.unclaimed),
    };
}

export const metadata = {
    title: "My Orders | The Wolf Den",
    robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// ⚠️ searchParams ON THE SERVER, not useSearchParams in the banner. The banner has always read ?ordered=
// on the client, which is fine for "did they just check out" and useless for "what did that order pay" —
// the answer is a database row. Resolved here and handed down, so the banner stays a dumb renderer.
export default async function ShopOrdersPage({ searchParams }) {
    const sp = await searchParams;
    const orderedId = String(sp?.ordered || "").trim() || null;
    const paymentsEnabled = process.env.PAYMENTS_ENABLED === "true" && process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === "true";
    if (!paymentsEnabled) {
        notFound();
    }

    const customer = await getAuthenticatedShopCustomerFromCookies();

    if (!customer) {
        return (
            <div className="stack">
                <Suspense fallback={null}>
                    <ShopRewardsBanner ordered={null} rewards={null} />
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

    const [orders, rewards] = await Promise.all([
        listCustomerOrders(customer.id, { email: customer.email }),
        rewardsForOrder(customer.email, orderedId),
    ]);

    return (
        <div className="stack">
            <Suspense fallback={null}>
                <ShopRewardsBanner ordered={orderedId} rewards={rewards} />
            </Suspense>
            <ShopOrdersClient orders={orders} email={customer.email} />
        </div>
    );
}
