import Link from "next/link";

import TrophyRoom from "@/components/TrophyRoom";
import ViewPing from "@/components/ViewPing";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Trophy Room | The Wolf Den",
    description: "Eleven walls that fill as you play — every upgrade you buy anywhere in the Den raises the XP you earn on everything.",
    alternates: { canonical: "/marketplace/trophies" },
};

// ── ITS OWN ROOM ─────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "trophy room needs to be its own thing, out of the farm, and have its own menu sprite and location."
//
// It was a TAB inside the farm, which is where it was first built and never where it belonged: nothing on that
// screen is about crops or pets — it is eleven walls that fill from every upgrade bought anywhere in the game,
// and the bonus it pays applies to XP earned everywhere. Filed under the farm it was reachable only by people
// already tending a garden, and the tab bar it sat in had to hide the whole pasture to show it.
//
// The component is unchanged and still mounts inside the farm's tab for now; this is a second door, not a fork.
export default async function TrophiesPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    return (
        <div className="stack reveal">
            <ViewPing event="view_trophies" />
            {buyer ? (
                <TrophyRoom active />
            ) : (
                <section className="card">
                    <p className="muted" style={{ margin: 0 }}>Sign in to see your Trophy Room.</p>
                    <Link href="/marketplace/login" className="btn-gold" style={{ marginTop: 10, display: "inline-block" }}>Sign in →</Link>
                </section>
            )}
        </div>
    );
}
