import { redirect } from "next/navigation";

import MarketClient from "@/components/MarketClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getMarketState } from "@/lib/marketplace/market.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "The Market | The Wolf Den",
    description: "Buy and sell what the Den grows, catches and preps.",
};

export default async function MarketPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) redirect("/marketplace/login?returnTo=/marketplace/market");

    const state = await getMarketState(buyer.id);
    // Owner-gated while the pricing settles. Somebody who follows a link here lands back in the town rather
    // than on an empty stall with no way out.
    if (!state?.unlocked) redirect("/marketplace/town");

    return <MarketClient initial={state} />;
}
