import BlacksmithClient from "@/components/BlacksmithClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getForgeState, logForgeOpen } from "@/lib/marketplace/crafting.js";
import { isOwner } from "@/lib/marketplace/owner.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "The Forge | The Wolf Den" };

// OWNER-ONLY. We DON'T 404 non-owners here — a bearer-token (app) session isn't sent on a full-page navigation,
// so the server can't always resolve the owner even when they ARE signed in. Instead we render the client with
// server-resolved state when we can, and otherwise the client fetches the OWNER-GATED /api/marketplace/crafting
// (which carries the token and 403s non-owners) — so the data is always gated, the page just never dead-ends.
export default async function BlacksmithPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    const owner = Boolean(buyer && isOwner(buyer.id));
    if (owner) await logForgeOpen(buyer.id).catch(() => {}); // adoption/abandonment funnel
    const initial = owner ? await getForgeState(buyer.id) : null;
    return (
        <div className="stack" style={{ maxWidth: 720, margin: "0 auto", padding: "0 12px" }}>
            <BlacksmithClient initial={initial} />
        </div>
    );
}
