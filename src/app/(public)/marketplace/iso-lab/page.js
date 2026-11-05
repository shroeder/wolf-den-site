import { redirect } from "next/navigation";

import IsoLab from "@/components/IsoLab.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { isOwner } from "@/lib/marketplace/owner.js";

// ── THE ISOMETRIC LAB ────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ OWNER-GATED, NOT DEV-ONLY, for the same reason as the model lab: the whole point is that it opens on a
// phone, and tap-to-move is a touch feature that cannot be judged with a mouse on a desktop.
export const dynamic = "force-dynamic";
export const metadata = {
    title: "Iso Lab | Wolf Den",
    robots: { index: false, follow: false },
};

export default async function IsoLabPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer || !isOwner(buyer.id)) redirect("/marketplace");

    return (
        <div className="stack">
            <h1 style={{ marginBottom: 2 }}>Iso Lab</h1>
            <p className="muted" style={{ marginTop: 0, maxWidth: "62ch" }}>
                A true isometric camera over a grid. Tap the ground and the hero turns, walks there, and
                settles back to idle — the walk cycle&apos;s playback rate is driven from the speed he
                actually achieves, so his feet stay planted through the turn and the stop.
            </p>
            <IsoLab />
        </div>
    );
}
