import MarketplaceBrowseClient from "@/components/MarketplaceBrowseClient";
import { listVendorsForBrowse } from "@/lib/marketplace/search.js";

export const metadata = {
    title: "Browse Vendors | Wolf Den Marketplace",
    description:
        "Find card vendors near you and browse their full online catalog of sealed Pokemon and Magic: The Gathering product and singles.",
    alternates: {
        canonical: "/marketplace/vendors",
    },
};

export const dynamic = "force-dynamic";

export default async function MarketplaceVendorsPage() {
    const vendors = await listVendorsForBrowse();

    return <MarketplaceBrowseClient vendors={vendors} />;
}
