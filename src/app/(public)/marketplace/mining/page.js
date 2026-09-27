import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import MiningClient from "@/components/MiningClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getMiningState } from "@/lib/marketplace/mining.js";
import { devFixture } from "@/lib/dev-fixture.js";
import { canPreview } from "@/lib/marketplace/owner.js";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "The Mine | The Wolf Den",
    description: "Swing a pick at the seams below the den.",
};

export default async function MiningPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) redirect("/marketplace/login?returnTo=/marketplace/mining");

    // A canned state instead of the database, in dev only, when the rig asks for one — see dev-fixture.js.
    // The tunnel's own HUD only exists mid-descent, and a descent costs one of three a day on a real
    // account, so the alternative to this is spending a player's trips to look at a line of text.
    const state = devFixture("mining", (await cookies()).get("wolfden-fixture")?.value) || await getMiningState(buyer.id);
    // OWNER-GATED while in development. A non-owner is bounced to the town rather than shown an empty mine —
    // same contract the Kitchen used before it opened up.
    if (!state?.unlocked) redirect("/marketplace/town");

    // The same gate the plaza, the sea, the dig and the farm use — the member's own town_halloween column
    // behind canPreview. One flag, five screens; see halloween.js for why that is one switch and not five.
    const hw = canPreview("halloween", buyer.id)
        ? await db.queryOne(`SELECT town_halloween FROM mkt_buyer WHERE id = $1`, [buyer.id]).catch(() => null)
        : null;
    return <MiningClient initial={state} halloween={Boolean(hw?.town_halloween)} />;
}
