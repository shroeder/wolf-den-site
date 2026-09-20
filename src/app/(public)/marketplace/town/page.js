import TownClient from "@/components/TownClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { canPreview } from "@/lib/marketplace/owner.js";
import { getTownState } from "@/lib/marketplace/town.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Wolf Den Town | The Wolf Den", robots: { index: false } };

// The persistent social overworld — LIVE for all signed-in members. Logged-out visitors get a sign-in nudge.
export default async function TownPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) {
        return (
            <div className="stack" style={{ maxWidth: 720, margin: "0 auto", padding: "0 12px" }}>
                <section className="card" style={{ textAlign: "center", padding: 28 }}>
                    <h1 style={{ marginTop: 0 }}>🏘️ Wolf Den Town</h1>
                    <p className="muted">Gather with the pack, see what everyone&apos;s up to, and hang out. Sign in to enter the plaza.</p>
                </section>
            </div>
        );
    }
    const initial = await getTownState(buyer.id).catch(() => null);
    // ── THE HALLOWEEN FLAG ───────────────────────────────────────────────────────────────────────────────
    // Whether this member may TURN THE DRESSING ON, decided on the server — never a client check, or the
    // whole plaza gets the seasonal art the moment somebody sets a localStorage key by hand. Whether it is
    // currently on is the member's own business and lives in localStorage; this is only the door.
    const canDressUp = canPreview("halloween", buyer.id);
    return (
        <div className="stack" style={{ maxWidth: 820, margin: "0 auto", padding: "0 12px" }}>
            <TownClient initial={initial} canDressUp={canDressUp} />
        </div>
    );
}
