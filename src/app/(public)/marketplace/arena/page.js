import { redirect } from "next/navigation";

import ArenaClient from "@/components/ArenaClient";
import { getArenaState } from "@/lib/marketplace/arena.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";

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

    return (
        <div className="stack reveal">
            <ArenaClient initial={state} />
        </div>
    );
}
