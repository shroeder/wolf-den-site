import MarketplaceLoginClient from "@/components/MarketplaceLoginClient";
import MarketplaceMessagesClient from "@/components/MarketplaceMessagesClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Messages | Wolf Den Marketplace",
    robots: { index: false, follow: false },
};

export default async function MarketplaceMessagesPage({ searchParams }) {
    const buyer = await getAuthenticatedBuyer();
    if (!buyer) {
        // Keep the thread through login so the one-time web sign-in lands on the actual conversation.
        const thread = (await searchParams)?.thread;
        const redirectTo = thread
            ? `/marketplace/messages?thread=${encodeURIComponent(String(thread))}`
            : "/marketplace/messages";
        return <MarketplaceLoginClient redirectTo={redirectTo} />;
    }
    return <MarketplaceMessagesClient buyerName={buyer.displayName} />;
}
