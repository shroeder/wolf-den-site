import { redirect } from "next/navigation";

import CardCollection from "@/components/cards/CardCollection";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { CARDS_UNLOCKED, cardProgress, ownedPetIds, petArtFor } from "@/lib/marketplace/cards.js";
import { ALL_CARDS, BASIC_UNLOCKS, CARDS, PERKS, POTIONS, UNLOCKS, unlockedCards } from "@/lib/marketplace/cards-kit.js";

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

    const [have, art, progress] = await Promise.all([
        ownedPetIds(buyer.id),
        petArtFor(buyer.id, Object.keys(ALL_CARDS)),
        cardProgress(buyer.id),
    ]);
    const earned = unlockedCards(progress);

    // ⚠️ PLAIN DATA ACROSS THE BOUNDARY. CardFace reads the card's own fields (cost, kind, text and the
    // numbers the text interpolates), so the whole entry travels — but only the entry, never the module.
    //
    // A LOCKED CARD SAYS WHICH KIND OF LOCKED IT IS. Two doors lead into this deck and they are opened in
    // completely different places: one is an animal you have to go and collect, the other is something you
    // have to go and DO. "Locked" without saying which is the game refusing to tell you where to go.
    const cards = Object.values(ALL_CARDS)
        .map((c) => {
            const byPlay = Boolean(UNLOCKS[c.id]);
            const owned = Boolean(CARDS[c.id]) || BASIC_UNLOCKS.includes(c.id)
                || (byPlay ? earned.has(c.id) : have.has(c.pet));
            return {
                ...c,
                owned,
                // What to do about it, in the player's words. Null on an owned card so the client has one
                // thing to test rather than two.
                need: owned ? null : byPlay ? UNLOCKS[c.id].how : null,
            };
        })
        // Ordered the way you meet them: the deck you start with, then by how deep a card can first appear,
        // then by name so the grid does not reshuffle itself between two visits.
        .sort((a, b) => (Boolean(CARDS[b.id]) - Boolean(CARDS[a.id]))
            || ((a.tier || 0) - (b.tier || 0))
            || a.name.localeCompare(b.name));

    // ── AND THE THINGS THAT ARE NOT CARDS ────────────────────────────────────────────────────────────
    // Luke: "we need item and perk cards like the spire has." Theirs are not playable cards and neither are
    // these — a trinket sits on the strip and works by itself, a potion is drunk — but the compendium is
    // where you go to find out what exists, and until now the only way to learn what a Whetstone does was to
    // be handed one mid-run. They are a CATALOGUE, not a collection: nothing here is owned, because nothing
    // in this game keeps a trinket between runs.
    const trinkets = Object.values(PERKS).map((p) => ({
        id: p.id, name: p.name, text: p.text,
        art: `/images/cards/items/${p.id}.png`,
        from: "Elites and chests, or the merchant's shelf",
    }));
    const potions = Object.values(POTIONS).map((p) => ({
        id: p.id, name: p.name, text: p.text,
        art: `/images/cards/potions/${p.id}.png`,
        from: "Chests and the merchant — drunk in a fight",
    }));

    return (
        <CardCollection
            cards={cards}
            art={art}
            trinkets={trinkets}
            potions={potions}
            counts={{ total: cards.length, owned: cards.filter((c) => c.owned).length }}
        />
    );
}
