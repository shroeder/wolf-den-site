import { redirect } from "next/navigation";

import CardEvent from "@/components/cards/CardEvent";
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
// WHAT IT PAYS, AS OF LAUNCH. Still no gold and no item — the run cannot mint currency and does not touch
// the shop. What it does pay is its own ladder (score is lifetime XP, and crossing a rung opens cards,
// trinkets and four pets nothing else in the game can hand over) and PET XP to the animals whose cards were
// in the deck, capped at 300 a pet a run. That second one is the only thing a run puts back into the wider
// Den, because a pet's level is read by the arena and the road. See recordRun.
//
// ?seed=N STILL WORKS and still means what it always did: one standalone fight, the starter deck, full
// health, no run touched. That is the replay link you hand somebody to argue about a specific turn, and a run
// would make it a different fight every time.
export default async function CardsPage({ searchParams }) {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) redirect("/marketplace/login?returnTo=/marketplace/cards");
    // Signed in is the whole gate now (CARDS_UNLOCKED). The bounce stays: a signed-out visitor is sent to
    // login above, and this catches anything else rather than rendering a game with no player attached.
    if (!await CARDS_UNLOCKED(buyer.id)) redirect("/marketplace/town");

    const q = await searchParams;
    const asked = Number.parseInt(q?.seed, 10);

    // ── A NAMED SEED IS THE OLD ONE-OFF FIGHT ────────────────────────────────────────────────────────────
    if (Number.isFinite(asked) && asked > 0) {
        const fixture = await getCardFightFixture(buyer.id, asked >>> 0);
        return <CardFightClient fixture={fixture} />;
    }

    // ── ⚠️ A FINISHED RUN IS NOT RUBBISH TO BE SWEPT UP ──────────────────────────────────────────────────
    // This asked for a run with `create: true`, and loadRun answers that by DEALING A NEW ONE the moment it
    // sees a finished one — so beating the last boss of the third act and then reloading (or letting anything
    // call router.refresh) replaced the victory screen with a fresh act-one map. Forty-five rooms, and the
    // payoff was a screen you could lose by pressing F5. Tested by winning one: the ending was gone.
    //
    // A stored run is returned whatever state it is in; a new one is dealt only when there is no run at all.
    // Starting the next climb is a thing the player DOES (the table's seat, or New run on the result screen),
    // both of which post `restart` — see CardTable.
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
    // ── THE QUESTION-MARK ROOM ──────────────────────────────────────────────────────────────────────
    // Needs the same pet art the campfire does, because both of them can put your own deck on screen: the
    // Old Wall and the Bonesetter ask WHICH card, and a picker that draws names instead of cards is the
    // fault the fire's picker was rebuilt to fix.
    if (run.at?.kind === "event") {
        return <CardEvent run={run} art={await petArtFor(buyer.id, run.deck || [])} />;
    }

    if (run.at?.kind === "merchant") {
        const art = await petArtFor(buyer.id, (run.shop?.stock || []).filter((s) => s.kind === "card").map((s) => s.ref)
            .concat(run.deck || []));
        return <CardShop run={run} art={art} />;
    }

    const fixture = await runFixture(buyer.id, run);
    return <CardFightClient fixture={fixture} run={run} />;
}
