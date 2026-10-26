import { redirect } from "next/navigation";

import PackTelemetryClient from "@/components/admin/PackTelemetryClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { isOwner } from "@/lib/marketplace/owner.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Virtual packs | Wolf Den admin",
    robots: { index: false, follow: false },
};

// The owner's view of the virtual pack feature: the money, the pool guardrail, the pull queue and per-member
// net position. The API behind it enforces its own permissions (mystery.report / mystery.manage) — this is
// just the door, and the door is not the gate.
export default async function AdminPacksPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer || !isOwner(buyer.id)) redirect("/marketplace");

    return (
        <div className="stack">
            <h1 style={{ marginBottom: 2 }}>Virtual packs</h1>
            <p className="muted" style={{ marginTop: 0 }}>
                Opens, margin, the pool, and the bags waiting to be pulled. Owner test opens are excluded from
                these counts and still appear in the books.
            </p>
            <PackTelemetryClient />
        </div>
    );
}
