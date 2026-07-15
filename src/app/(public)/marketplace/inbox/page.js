import MarketplaceInboxClient from "@/components/MarketplaceInboxClient";
import MarketplaceLoginClient from "@/components/MarketplaceLoginClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Inbox | Wolf Den Marketplace",
    robots: { index: false, follow: false },
};

export default async function InboxPage() {
    const buyer = await getAuthenticatedBuyer();
    if (!buyer) return <MarketplaceLoginClient redirectTo="/marketplace/inbox" />;
    return (
        <div className="stack reveal">
            <section className="card">
                <h1>Inbox</h1>
                <p className="muted" style={{ fontSize: "0.9rem" }}>All your messages — friends and shops — in one place.</p>
                <MarketplaceInboxClient />
            </section>
        </div>
    );
}
