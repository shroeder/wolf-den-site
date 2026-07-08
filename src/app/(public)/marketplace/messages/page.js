import { redirect } from "next/navigation";

import MarketplaceLoginClient from "@/components/MarketplaceLoginClient";
import MarketplaceMessagesClient from "@/components/MarketplaceMessagesClient";
import { getAccountLinkedVendorId, getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { threadParticipantSide } from "@/lib/marketplace/messaging.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Messages | Wolf Den Marketplace",
    robots: { index: false, follow: false },
};

export default async function MarketplaceMessagesPage({ searchParams }) {
    const thread = (await searchParams)?.thread;
    const buyer = await getAuthenticatedBuyer();
    if (!buyer) {
        // Keep the thread through login so the one-time web sign-in lands on the actual conversation.
        const redirectTo = thread
            ? `/marketplace/messages?thread=${encodeURIComponent(String(thread))}`
            : "/marketplace/messages";
        return <MarketplaceLoginClient redirectTo={redirectTo} />;
    }
    // App Links open the marketplace app for this URL; this page is only the browser fallback (no app).
    // If this specific thread is the user's VENDOR side (a buyer contacted their shop), send them to
    // the portal Inbox. Buyer-side conversations (them contacting another shop) stay here.
    if (thread) {
        const vendorId = await getAccountLinkedVendorId(buyer.id);
        if (vendorId) {
            const side = await threadParticipantSide(thread, { buyerId: buyer.id, vendorId });
            if (side === "vendor") {
                redirect("/marketplace/portal?tab=messages");
            }
        }
    }
    return <MarketplaceMessagesClient buyerName={buyer.displayName} />;
}
