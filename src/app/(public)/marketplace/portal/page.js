import VendorLoginClient from "@/components/VendorLoginClient";
import VendorPortalClient from "@/components/VendorPortalClient";
import { getVendorRequestStats, listVendorContactRequests } from "@/lib/marketplace/contact.js";
import { listSearchDemand } from "@/lib/marketplace/demand.js";
import { listAgingInventory, listVendorListings } from "@/lib/marketplace/listings.js";
import { listDealerStockInDemand, listVendorMissions } from "@/lib/marketplace/missions.js";
import { listDealerOffers } from "@/lib/marketplace/offers.js";
import { getVendorSalesCount } from "@/lib/marketplace/sales.js";
import { listOpenSellOffers, listVendorSellBids } from "@/lib/marketplace/sell-offers.js";
import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { listMostWanted } from "@/lib/marketplace/wants.js";

export const metadata = {
    title: "Vendor Portal | Wolf Den Marketplace",
    robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function VendorPortalPage() {
    const vendor = await getAuthenticatedVendor();

    if (!vendor) {
        return <VendorLoginClient />;
    }

    const [listings, wanted, salesCount, requests, requestStats, sellOffers, missions] = await Promise.all([
        listVendorListings(vendor.id),
        listMostWanted(30).catch(() => []),
        getVendorSalesCount(vendor.id).catch(() => 0),
        listVendorContactRequests(vendor.id).catch(() => []),
        getVendorRequestStats(vendor.id).catch(() => null),
        listOpenSellOffers(40).catch(() => []),
        listVendorMissions(vendor.id).catch(() => ({ demandGaps: [], uniques: [] })),
    ]);
    const [dealerOffers, dealerDemand, sellBids, searchDemand, agingInventory] = await Promise.all([
        listDealerOffers(vendor.id).catch(() => ({ incoming: [], outgoing: [] })),
        listDealerStockInDemand(vendor.id).catch(() => []),
        listVendorSellBids(vendor.id).catch(() => []),
        listSearchDemand({ vendorId: vendor.id }).catch(() => []),
        listAgingInventory(vendor.id).catch(() => []),
    ]);

    return (
        <VendorPortalClient
            vendor={vendor}
            listings={listings}
            wanted={wanted}
            salesCount={salesCount}
            requests={requests}
            requestStats={requestStats}
            sellOffers={sellOffers}
            missions={missions}
            dealerOffers={dealerOffers}
            dealerDemand={dealerDemand}
            sellBids={sellBids}
            searchDemand={searchDemand}
            agingInventory={agingInventory}
        />
    );
}
