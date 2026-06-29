import VendorLoginClient from "@/components/VendorLoginClient";
import VendorPortalClient from "@/components/VendorPortalClient";
import { listVendorListings } from "@/lib/marketplace/listings.js";
import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";

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

    const listings = await listVendorListings(vendor.id);

    return <VendorPortalClient vendor={vendor} listings={listings} />;
}
