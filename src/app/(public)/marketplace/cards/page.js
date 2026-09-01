import { redirect } from "next/navigation";

import CardFightClient from "@/components/cards/CardFightClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { CARDS_UNLOCKED, getCardFightFixture } from "@/lib/marketplace/cards.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Cards | The Wolf Den",
    description: "A deck, a foe, and one decision a turn.",
};

// ── THE VERTICAL SLICE ───────────────────────────────────────────────────────────────────────────────────────
// One fight. A hand, a draw pile, a discard pile, you on the left, something off the Long Road on the right,
// and cards you drag onto it. No map, no rewards, no economy, no writes — the point of a slice is to find out
// whether the thing in the middle is any fun before building the rest of the building around it.
//
// ?seed=N IS THE WHOLE POINT OF THE URL. The shuffle, and the foe, come from it — so two people can play the
// identical fight on different devices and argue about the same turn instead of about two different ones.
export default async function CardsPage({ searchParams }) {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) redirect("/marketplace/login?returnTo=/marketplace/cards");
    // Owner-gated while it is a prototype. A member who wanders in goes back to the town rather than meeting a
    // half-built game — the same bounce the mine and the kitchen used before they opened.
    if (!CARDS_UNLOCKED(buyer.id)) redirect("/marketplace/town");

    const q = await searchParams;
    const asked = Number.parseInt(q?.seed, 10);
    // A fresh seed per visit when none is asked for, so opening the page twice is two different fights.
    const seed = Number.isFinite(asked) && asked > 0 ? asked >>> 0 : (Math.floor(Math.random() * 900000) + 1000);

    const fixture = await getCardFightFixture(buyer.id, seed);
    return <CardFightClient fixture={fixture} />;
}
