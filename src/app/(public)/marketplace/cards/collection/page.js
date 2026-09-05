import { redirect } from "next/navigation";

import CardCollection from "@/components/cards/CardCollection";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { CARDS_UNLOCKED, ownedPetIds, petArtFor } from "@/lib/marketplace/cards.js";
import { ALL_CARDS, BASIC_UNLOCKS, CARDS } from "@/lib/marketplace/cards-kit.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "The Collection | The Wolf Den",
    description: "Every card in the game, and which of them are yours.",
};

// ── THE CABINET ──────────────────────────────────────────────────────────────────────────────────────────
// See the note in CardCollection for what this screen is for. The server's whole job is answering "which of
// these can be dealt to me", and it answers it with the SAME rule the offer pool uses rather than a second
// copy of it: the starter cards are everybody's, BASIC_UNLOCKS are everybody's (that is what the list is for —
// a member with five pets still gets a real choice), and the rest belong to whoever owns the animal.
export default async function CardCollectionPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) redirect("/marketplace/login?returnTo=/marketplace/cards/collection");
    if (!CARDS_UNLOCKED(buyer.id)) redirect("/marketplace/town");

    const [have, art] = await Promise.all([
        ownedPetIds(buyer.id),
        petArtFor(buyer.id, Object.keys(ALL_CARDS)),
    ]);

    // ⚠️ PLAIN DATA ACROSS THE BOUNDARY. CardFace reads the card's own fields (cost, kind, text and the
    // numbers the text interpolates), so the whole entry travels — but only the entry, never the module.
    const cards = Object.values(ALL_CARDS)
        .map((c) => ({
            ...c,
            owned: Boolean(CARDS[c.id]) || BASIC_UNLOCKS.includes(c.id) || have.has(c.pet),
        }))
        // Ordered the way you meet them: the deck you start with, then by how deep a card can first appear,
        // then by name so the grid does not reshuffle itself between two visits.
        .sort((a, b) => (Boolean(CARDS[b.id]) - Boolean(CARDS[a.id]))
            || ((a.tier || 0) - (b.tier || 0))
            || a.name.localeCompare(b.name));

    return (
        <CardCollection
            cards={cards}
            art={art}
            counts={{ total: cards.length, owned: cards.filter((c) => c.owned).length }}
        />
    );
}
