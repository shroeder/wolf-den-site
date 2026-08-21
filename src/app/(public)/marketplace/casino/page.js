import { redirect } from "next/navigation";

import CasinoClient from "@/components/CasinoClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getCasinoState } from "@/lib/marketplace/casino.js";
import { isOwner } from "@/lib/marketplace/owner.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "The Casino | The Wolf Den",
    description: "A room off the town where the machines take your gold.",
    robots: { index: false, follow: false },
};

export default async function CasinoPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) redirect("/marketplace/login?returnTo=/marketplace/casino");

    // Owner-gated while it is being built. The check is repeated on every API verb (see the route) — this one
    // is for the RENDER, so somebody who guesses the address lands back in the town rather than on a room
    // whose buttons all refuse. A hidden door is not a locked one.
    if (!isOwner(buyer.id)) redirect("/marketplace/town");

    return <CasinoClient initial={await getCasinoState(buyer.id)} />;
}
