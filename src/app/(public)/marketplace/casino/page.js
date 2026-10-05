import { redirect } from "next/navigation";

import CasinoClient from "@/components/CasinoClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { bingoState } from "@/lib/marketplace/bingo.js";
import { blackjackState } from "@/lib/marketplace/blackjack.js";
import { getCasinoState } from "@/lib/marketplace/casino.js";
import { vipShadows, vipStanding } from "@/lib/marketplace/vip.js";
import { halloweenOn } from "@/lib/marketplace/owner.js";
import { leaderboard } from "@/lib/marketplace/casino-leaderboard.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "The Casino | The Wolf Den",
    description: "A room off the town where the machines take your gold.",
    robots: { index: false, follow: false },
};

export default async function CasinoPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) redirect("/marketplace/login?returnTo=/marketplace/casino");

    // The floor is open to every member. The redirect that stood here while it was being built is gone, and
    // so is the API's matching owner check — both had to go together, because a page that renders for
    // everybody in front of an endpoint that answers nobody is a room full of buttons that all refuse.
    //
    // What did NOT go with them is the owner check on the machines' force-a-bonus buttons. That one is inside
    // spinSlot5, it reads the buyer id rather than the request body, and it is the only thing standing
    // between a member and a POST that says `force: "hoard"`. See casino-slot5-play.js.

    // A hand left open survives a refresh, which is the whole reason the table lives in a row: closing the
    // tab mid-hand must not be a way to lose a stake, and it must not be a way to escape one either.
    // ── AND THE ROPE HAS TO BE IN THE FIRST PAINT ───────────────────────────────────────
    // `vip` was added to the API route's GET and NOT to this one, and the client only ever reads `initial`
    // plus the three fields its poll merges. So the door rendered "Members only" to the owner forever: the
    // server knew the answer, the API said so when asked directly, and nothing on the page was ever told.
    //
    // Caught by check:feel, which could not reach the lounge at all and said so instead of quietly passing.
    // That is the entire argument for the gate opening every room rather than the first one.
    const [floor, table, hall, standing, shadows, board] = await Promise.all([
        getCasinoState(buyer.id), blackjackState(buyer.id), bingoState(),
        vipStanding(buyer.id), vipShadows(),
        // Luke: "have the number one dude's sprite in there." Just the top row — the board on the wall needs a
        // face and a name, and the full standings are already a fetch away behind the tap.
        //
        // RIDES THE EXISTING Promise.all RATHER THAN BEING AWAITED AFTER IT. Two more queries in parallel with
        // five calls that were already in flight costs the room nothing; the same two awaited on their own line
        // would add a whole round trip to every casino visit for a face on a wall.
        leaderboard(buyer.id).catch(() => null),
    ]);
    // ── THE GACHAPON IS ONLY THERE WHILE THE EVENT IS ───────────────────────────────────────────────────
    // Luke: "Keep in mind this system is only on when the halloween event is on."
    //
    // ⚠️ THE SERVER ALREADY REFUSED IT — gachaView, pull and rollTicket are all gated on halloweenOn — but the
    // CABINET was in MACHINES unconditionally, so in November the floor would have carried a tenth machine
    // standing in its own bay that answered `closed` to anybody who walked up to it. An unobtainable thing
    // that is still advertised is the exact shape of the ownerOnly landmine: leaky one way, dead the other.
    //
    // Answered here rather than fetched, so the floor paints with the right number of machines on the FIRST
    // frame — a cabinet that appears a beat after the room does is a cabinet that looks like a bug.
    const hw = halloweenOn(buyer.id);
    return (
        <CasinoClient initial={{
            ...floor, blackjack: table, bingo: hall,
            vip: { allowed: standing.vip, shadows },
            boardTop: board?.top?.[0] || null,
        }} halloween={hw} />
    );
}
