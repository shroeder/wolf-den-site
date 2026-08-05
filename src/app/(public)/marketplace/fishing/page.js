import { notFound } from "next/navigation";

import FishingHome from "@/components/FishingHome";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getSailingState } from "@/lib/marketplace/sailing.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Fishing — The Wolf Den",
    description: "Your fishing log, the Den's biggest catches, and every species in the sea.",
};

// The dedicated fishing screen. The log, the leaderboard and the record board previously lived inside a modal
// opened from a button that only appears while a voyage is in flight — so your own collection was unreachable
// whenever your boat was docked, which is most of the time.
//
// Owner-gated like the rest of fishing: getSailingState returns `fishing: null` for anyone else (see
// fishingUnlocked), and without it there is nothing to show, so this 404s rather than rendering an empty shell.
export default async function FishingPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) return notFound();

    const state = await getSailingState(buyer.id).catch(() => null);
    if (!state?.fishing) return notFound();

    // gold and status ride along so this screen can OFFER the recharge and describe the boat, instead of
    // being a log with one dead-looking link off it.
    return <FishingHome fishing={state.fishing} gold={state.gold || 0} status={state.status || null} />;
}
