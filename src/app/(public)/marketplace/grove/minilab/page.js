import MiniLab from "@/components/grove/MiniLab.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { isOwner } from "@/lib/marketplace/owner.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Forge Minigames | The Wolf Den", robots: { index: false } };

// ── THE TEN, ON A BENCH ─────────────────────────────────────────────────────────────────────────────────────
// Luke asked for ten crafting minigames and then: "Built them and show me screenshots afterwards."
//
// A lab rather than a description. Ten interactive screens cannot be reviewed from prose or from a still —
// whether one is CLEAR is a thing you find out in the first half-second of playing it, which is exactly the
// bar he set ("they all have to be super clear"). So this plays every one of them, on demand, with the score
// each reports printed underneath.
//
// ⚠️ OWNER ONLY. It is a workshop, not a feature: it shows unreleased content and it lets you replay a phase
// forever, which is not a thing a player should be able to do with a minigame that gates item quality.
export default async function MiniLabPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer || !isOwner(buyer.id)) {
        return (
            <div className="stack" style={{ maxWidth: 720, margin: "0 auto", padding: "0 12px" }}>
                <section className="card" style={{ textAlign: "center", padding: 28 }}>
                    <h1 style={{ marginTop: 0 }}>Not here</h1>
                    <p className="muted">This bench is the owner&apos;s.</p>
                </section>
            </div>
        );
    }
    return <MiniLab />;
}
