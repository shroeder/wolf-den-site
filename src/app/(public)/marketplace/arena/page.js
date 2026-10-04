import { redirect } from "next/navigation";

import ArenaClient from "@/components/ArenaClient";
import { getArenaState } from "@/lib/marketplace/arena.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { halloweenOn } from "@/lib/marketplace/owner.js";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "The Arena | The Wolf Den",
    description: "The pack, weakest to strongest. Start at the bottom and climb.",
};

export default async function ArenaPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) redirect("/marketplace/login?returnTo=/marketplace/arena");

    const state = await getArenaState(buyer.id);
    // OWNER-GATED while it's built out — a non-owner goes to the town rather than an empty page, the same
    // contract the Kitchen, the Mine and the Dungeons all used before they opened.
    if (!state?.unlocked) redirect("/marketplace/town");

    // ── THE RING, WITH THE HALLOWEEN FLAG UP ─────────────────────────────────────────────────────────
    // The same one question every dressed screen asks — halloweenOn, then the member's own town_halloween.
    // Resolved on the server and handed over as a prop because ArenaClient seeds from `initial` and never
    // refetches the backdrop; a plate arriving later would flash the sunlit colosseum first, which is the
    // one thing a costume must not do.
    // ⚠️ ONE QUESTION NOW. This used to be canDressUp() AND a `town_halloween` column read — two gates that
    // could disagree, which is how the plaza came to be decorated for a member who could not see the
    // Gourdfather standing in it. See halloweenOn in owner.js.
    const hw = halloweenOn(buyer?.id);

    return (
        <div className="stack reveal">
            <ArenaClient initial={state} halloween={hw} />
        </div>
    );
}
