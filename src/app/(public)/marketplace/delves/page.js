import { redirect } from "next/navigation";

import DelveClient from "@/components/DelveClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getDelveState } from "@/lib/marketplace/delves.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Dungeon Delves | The Wolf Den",
    description: "Ten floors down, and something waiting at the bottom.",
};

export default async function DelvesPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) redirect("/marketplace/login?returnTo=/marketplace/delves");

    const state = await getDelveState(buyer.id);
    // OWNER-GATED while in development — a non-owner goes to the town rather than being shown an empty page,
    // the same contract the Kitchen and the Mine used before they opened.
    if (!state?.unlocked) redirect("/marketplace/town");

    return <DelveClient initial={state} />;
}
