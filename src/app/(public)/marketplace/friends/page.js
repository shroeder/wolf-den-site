import MarketplaceFriendsClient from "@/components/MarketplaceFriendsClient";
import MarketplaceLoginClient from "@/components/MarketplaceLoginClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Friends | Wolf Den Marketplace",
    robots: { index: false, follow: false },
};

export default async function FriendsPage() {
    const buyer = await getAuthenticatedBuyer();
    if (!buyer) return <MarketplaceLoginClient redirectTo="/marketplace/friends" />;
    return (
        <div className="stack reveal">
            <MarketplaceFriendsClient />
        </div>
    );
}
