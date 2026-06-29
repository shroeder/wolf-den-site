import { Suspense } from "react";

import MarketplaceSearchClient from "@/components/MarketplaceSearchClient";

export const metadata = {
    title: "Vendor Marketplace | The Wolf Den",
    description:
        "Search sealed Pokemon and Magic: The Gathering product and singles across vetted local vendors. See who has what in stock, compare prices, and contact a vendor to arrange a deal.",
    alternates: {
        canonical: "/marketplace",
    },
};

export default function MarketplacePage() {
    return (
        <Suspense fallback={null}>
            <MarketplaceSearchClient />
        </Suspense>
    );
}
