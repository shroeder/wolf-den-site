import { redirect } from "next/navigation";

import CardTable from "@/components/cards/CardTable";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { CARDS_UNLOCKED, loadRun } from "@/lib/marketplace/cards.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "The Back Table | The Wolf Den",
    description: "The back table, the lamp, and the stranger with the deck.",
};

// ── THE FRONT ROOM ───────────────────────────────────────────────────────────────────────────────────────
// Where Return goes now. See the note in CardTable for why the game needed a room of its own to back out to.
//
// ⚠️ IT DOES NOT START A RUN. `create: false`, so looking at the table is not sitting down at it — the run is
// still made by /marketplace/cards, which is what the button pushes to. Creating one here would mean a player
// who pressed Return, changed their mind and walked to town had silently begun an act they never played, and
// the next Sit down would drop them into somebody else's map.
export default async function CardTablePage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) redirect("/marketplace/login?returnTo=/marketplace/cards/table");
    // Owner-gated while it is a prototype, on the same terms and with the same bounce as the game itself.
    if (!CARDS_UNLOCKED(buyer.id)) redirect("/marketplace/town");

    const run = await loadRun(buyer.id, { create: false });
    return <CardTable run={run} />;
}
