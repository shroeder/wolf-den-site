import MarketplaceDmClient from "@/components/MarketplaceDmClient";
import MarketplaceLoginClient from "@/components/MarketplaceLoginClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Message | Wolf Den Marketplace",
    robots: { index: false, follow: false },
};

export default async function DmPage({ params }) {
    const { id } = await params;
    const buyer = await getAuthenticatedBuyer();
    if (!buyer) return <MarketplaceLoginClient redirectTo={`/marketplace/dm/${id}`} />;
    return <MarketplaceDmClient threadId={id} />;
}
