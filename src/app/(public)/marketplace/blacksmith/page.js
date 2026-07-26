import { notFound } from "next/navigation";

import BlacksmithClient from "@/components/BlacksmithClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getForgeState, logForgeOpen } from "@/lib/marketplace/crafting.js";
import { isOwner } from "@/lib/marketplace/owner.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "The Forge | The Wolf Den" };

// OWNER-ONLY (Phase 1). Non-owners (and logged-out) get a 404 — the feature isn't discoverable to them.
export default async function BlacksmithPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer || !isOwner(buyer.id)) notFound();
    await logForgeOpen(buyer.id).catch(() => {}); // adoption/abandonment funnel
    const initial = await getForgeState(buyer.id);
    return (
        <div className="stack" style={{ maxWidth: 720, margin: "0 auto", padding: "0 12px" }}>
            <BlacksmithClient initial={initial} />
        </div>
    );
}
