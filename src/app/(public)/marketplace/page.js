import { Suspense } from "react";

import MarketplaceLiveStats from "@/components/MarketplaceLiveStats";
import MarketplaceSearchClient from "@/components/MarketplaceSearchClient";
import { getMarketplaceLiveStats } from "@/lib/marketplace/search.js";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Vendor Marketplace | The Wolf Den",
    description:
        "Search sealed Pokemon and Magic: The Gathering product and singles across vetted local vendors. See who has what in stock, compare prices, and contact a vendor to arrange a deal.",
    alternates: {
        canonical: "/marketplace",
    },
};

export default async function MarketplacePage() {
    const stats = await getMarketplaceLiveStats().catch(() => null);

    return (
        <>
            {stats ? <MarketplaceLiveStats {...stats} /> : null}
            <Suspense fallback={null}>
                <MarketplaceSearchClient />
            </Suspense>
        </>
    );
}
