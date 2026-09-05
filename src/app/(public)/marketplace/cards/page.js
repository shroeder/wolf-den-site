import { redirect } from "next/navigation";

import CardFightClient from "@/components/cards/CardFightClient";
import CardMap from "@/components/cards/CardMap";
import CardRoom from "@/components/cards/CardRoom";
import CardShop from "@/components/cards/CardShop";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { CARDS_UNLOCKED, getCardFightFixture, loadRun, petArtFor, runFixture } from "@/lib/marketplace/cards.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Cards | The Wolf Den",
    description: "A deck, a foe, and one decision a turn.",
};

// ── THE RUN ──────────────────────────────────────────────────────────────────────────────────────────────────
// It was one fight: a hand, a draw pile, three fighters off the Long Road, and nothing on either side of it.
// The slice answered the question it was built to ask — the fight is worth repeating — so this is the loop
// around it. Eight stops, your health carried from one to the next, a card picked after every win, an elite
// in the middle and a boss at the end.
//
// WHAT MAKES IT A GAME rather than eight fights is the carry. Health does not reset, so a win at 12 HP is a
// problem you take with you, and the deck only grows, so every pick is a bet about the fights you have not
// seen yet.
//
// STILL PAYS NOTHING. No gold, no XP, no item, no row outside its own — and still owner-gated. That is what
// keeps the rules in the browser where they can be changed in a minute (see cards-kit.js).
//
// ?seed=N STILL WORKS and still means what it always did: one standalone fight, the starter deck, full
// health, no run touched. That is the replay link you hand somebody to argue about a specific turn, and a run
// would make it a different fight every time.
export default async function CardsPage({ searchParams }) {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) redirect("/marketplace/login?returnTo=/marketplace/cards");
    // Owner-gated while it is a prototype. A member who wanders in goes back to the town rather than meeting a
    // half-built game — the same bounce the mine and the kitchen used before they opened.
    if (!CARDS_UNLOCKED(buyer.id)) redirect("/marketplace/town");

    const q = await searchParams;
    const asked = Number.parseInt(q?.seed, 10);

    // ── A NAMED SEED IS THE OLD ONE-OFF FIGHT ────────────────────────────────────────────────────────────
    if (Number.isFinite(asked) && asked > 0) {
        const fixture = await getCardFightFixture(buyer.id, asked >>> 0);
        return <CardFightClient fixture={fixture} />;
    }

    const run = await loadRun(buyer.id, { create: true });

    // ── THE MAP IS THE DEFAULT SCREEN ────────────────────────────────────────────────────────────────────
    // `at` is null whenever the run is between rooms — at the start, after a card is taken, after a rest or a
    // treasure — and that is exactly when Spire shows you the sheet. A fight is what happens when you have
    // chosen where to go, not the thing the game opens on.
    // The sheet draws your DECK as cards now (see the note in CardMap), so it needs the same pet art the shop
    // and the ring use — which is also what carries each pet's LEVEL onto the face. Only the deck's pets are
    // asked for, so a fifteen-card deck costs the same two round trips a three-card shelf does.
    if (!run.at && !run.done) return <CardMap run={run} art={await petArtFor(buyer.id, run.deck || [])} />;

    // ── THE FIRE AND THE CHEST ARE ROOMS TOO ─────────────────────────────────────────────────────────────
    // Both used to resolve inside the enter handler and clear `at` on the way through, so the map was the
    // only screen that ever knew they had happened — a heal and a payout with nothing to look at. See the
    // note in CardRoom. They stand you in the room now and `leave` is what puts you back on the sheet.
    if (run.at?.kind === "rest" || run.at?.kind === "treasure") {
        // The fire draws your DECK now (it can sharpen a card), so it needs the same pet art the shop and the
        // ring use. A chest needs none of it and pays for none of it.
        const art = run.at.kind === "rest" ? await petArtFor(buyer.id, run.deck || []) : {};
        return <CardRoom run={run} art={art} />;
    }

    // ── THE MERCHANT IS A SCREEN, NOT A FIGHT ────────────────────────────────────────────────────────────
    // Three of the five rooms stand you in a place now; only a fight and an elite open the ring.
    // THE SHOP DRAWS ITS STOCK AS CARDS, so it needs the same pet art the fight uses — the portrait in the
    // window, the rarity that colours the banner and the pet's colour for the stock. Fetched for the three
    // cards on the shelf and nothing else (petArtFor), because a shelf is not a fight.
    if (run.at?.kind === "merchant") {
        const art = await petArtFor(buyer.id, (run.shop?.stock || []).filter((s) => s.kind === "card").map((s) => s.ref)
            .concat(run.deck || []));
        return <CardShop run={run} art={art} />;
    }

    const fixture = await runFixture(buyer.id, run);
    return <CardFightClient fixture={fixture} run={run} />;
}
