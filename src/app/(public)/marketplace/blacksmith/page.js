import BlacksmithClient from "@/components/BlacksmithClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getForgeState, logForgeOpen } from "@/lib/marketplace/crafting.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "The Forge | The Wolf Den" };

// LIVE for every signed-in member. We render server-resolved state when we can (a full-page nav may not carry
// the app's bearer token); otherwise the client fetches /api/marketplace/crafting itself — so it never dead-ends.
export default async function BlacksmithPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (buyer) await logForgeOpen(buyer.id).catch(() => {}); // adoption/abandonment funnel
    const initial = buyer ? await getForgeState(buyer.id).catch(() => null) : null;
    return (
        <div className="stack" style={{ maxWidth: 720, margin: "0 auto", padding: "0 12px" }}>
            <BlacksmithClient initial={initial} />
        </div>
    );
}
