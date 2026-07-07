import MarketplaceLoginClient from "@/components/MarketplaceLoginClient";
import MarketplaceMessagesClient from "@/components/MarketplaceMessagesClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Messages | Wolf Den Marketplace",
    robots: { index: false, follow: false },
};

export default async function MarketplaceMessagesPage() {
    const buyer = await getAuthenticatedBuyer();
    if (!buyer) {
        return <MarketplaceLoginClient redirectTo="/marketplace/messages" />;
    }
    return <MarketplaceMessagesClient buyerName={buyer.displayName} />;
}
