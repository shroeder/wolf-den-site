import { redirect } from "next/navigation";

import CasinoClient from "@/components/CasinoClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { bingoState } from "@/lib/marketplace/bingo.js";
import { blackjackState } from "@/lib/marketplace/blackjack.js";
import { getCasinoState } from "@/lib/marketplace/casino.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { vipShadows, vipStanding } from "@/lib/marketplace/vip.js";

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

    // A hand left open survives a refresh, which is the whole reason the table lives in a row: closing the
    // tab mid-hand must not be a way to lose a stake, and it must not be a way to escape one either.
    // ── AND THE ROPE HAS TO BE IN THE FIRST PAINT ───────────────────────────────────────
    // `vip` was added to the API route's GET and NOT to this one, and the client only ever reads `initial`
    // plus the three fields its poll merges. So the door rendered "Members only" to the owner forever: the
    // server knew the answer, the API said so when asked directly, and nothing on the page was ever told.
    //
    // Caught by check:feel, which could not reach the lounge at all and said so instead of quietly passing.
    // That is the entire argument for the gate opening every room rather than the first one.
    const [floor, table, hall, standing, shadows] = await Promise.all([
        getCasinoState(buyer.id), blackjackState(buyer.id), bingoState(),
        vipStanding(buyer.id), vipShadows(),
    ]);
    return (
        <CasinoClient initial={{
            ...floor, blackjack: table, bingo: hall,
            vip: { allowed: standing.vip, shadows },
        }} />
    );
}
