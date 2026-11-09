import { redirect } from "next/navigation";

import WalkLab from "@/components/WalkLab.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { isOwner } from "@/lib/marketplace/owner.js";

// ── THE WALK LAB ─────────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ OWNER-GATED, NOT DEV-ONLY, for the same reason as the model lab: the point is that it opens on a phone.
// Walking is a touch feature and it cannot be judged with a keyboard on a desktop.
export const dynamic = "force-dynamic";
export const metadata = {
    title: "Walk Lab | Wolf Den",
    robots: { index: false, follow: false },
};

export default async function WalkLabPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer || !isOwner(buyer.id)) redirect("/marketplace");

    return (
        <div className="stack">
            <h1 style={{ marginBottom: 2 }}>Walk Lab</h1>
            <p className="muted" style={{ marginTop: 0, maxWidth: "62ch" }}>
                The low-poly set as a place, seen from 30° above the ground with the 1.85 m player as the
                avatar. The model lab shows one object filling a frame, which is the view in which everything
                looks correctly sized — this is the one that can tell you it isn&apos;t.
            </p>
            <WalkLab />
        </div>
    );
}
