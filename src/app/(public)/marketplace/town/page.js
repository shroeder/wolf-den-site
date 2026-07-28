import TownClient from "@/components/TownClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { getTownState } from "@/lib/marketplace/town.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Wolf Den Town | The Wolf Den", robots: { index: false } };

// The persistent social overworld — OWNER-GATED during the build (like Sailing was). Non-owners get a teaser.
export default async function TownPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer || !isOwner(buyer.id)) {
        return (
            <div className="stack" style={{ maxWidth: 720, margin: "0 auto", padding: "0 12px" }}>
                <section className="card" style={{ textAlign: "center", padding: 28 }}>
                    <h1 style={{ marginTop: 0 }}>🏘️ Wolf Den Town</h1>
                    <p className="muted">A place to gather, see what the pack is up to, and hang out — coming soon.</p>
                </section>
            </div>
        );
    }
    const initial = await getTownState(buyer.id).catch(() => null);
    return (
        <div className="stack" style={{ maxWidth: 820, margin: "0 auto", padding: "0 12px" }}>
            <TownClient initial={initial} />
        </div>
    );
}
