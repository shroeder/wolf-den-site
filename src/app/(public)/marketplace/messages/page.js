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
    // Messaging is unified: buyer<->vendor conversations now use the same first-class DM chat as friend
    // DMs. Route this thread to the right surface — the buyer side into the good DM UI, the vendor's own
    // side to the seller portal Inbox. The bare list (no ?thread) stays here as a legacy fallback.
    if (thread) {
        const vendorId = await getAccountLinkedVendorId(buyer.id);
        const part = await threadParticipantSide(thread, { buyerId: buyer.id, vendorId: vendorId || null });
        if (part?.side === "vendor") redirect("/marketplace/portal?tab=messages");
        if (part?.side === "buyer") redirect(`/marketplace/dm/${thread}`);
    }
    return <MarketplaceMessagesClient buyerName={buyer.displayName} />;
}
