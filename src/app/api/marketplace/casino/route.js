import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { gambleWin, getCasinoState, moveCasino, playKeno, spinSlot } from "@/lib/marketplace/casino.js";
import { spinSlot5 } from "@/lib/marketplace/casino-slot5-play.js";
import { chipShelf } from "@/lib/marketplace/chips.js";
import { buyWithChips } from "@/lib/marketplace/chip-store.js";
// Composed HERE rather than inside getCasinoState: casino.js must not import blackjack.js, because
// blackjack.js imports casino.js for the floor's shared furniture (perks, prizes, bounties) and a cycle
// between the two would be a runtime landmine in a serverless bundle rather than a compile error.
import { blackjackState, dealBlackjack, doubleBlackjack, hitBlackjack, splitBlackjack, standBlackjack } from "@/lib/marketplace/blackjack.js";
import { bingoState, buyBingoCard } from "@/lib/marketplace/bingo.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// ── OWNER ONLY, AND ENFORCED HERE ────────────────────────────────────────────────────────────────────────────
// The town door is hidden for everybody else (GATED_BUILDINGS, gate: "owner"), but a hidden link is not a
// gate — the address is guessable and this endpoint moves GOLD. So the check lives on the server, on every
// verb, and the page does it again for the render. A door that is only closed on the screen is not closed.
const gate = async () => {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer || !isOwner(buyer.id)) return null;
    return buyer;
};

export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/casino", async ({ internalError }) => {
        try {
            const buyer = await gate();
            if (!buyer) return noStore({ open: false });
            const [floor, table, hall] = await Promise.all([
                getCasinoState(buyer.id), blackjackState(buyer.id), bingoState(),
            ]);
            return noStore({ open: true, ...floor, blackjack: table, bingo: hall });
        } catch (error) {
            return internalError(error, { event: "marketplace.casino.state.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/casino", async ({ internalError }) => {
        try {
            const buyer = await gate();
            if (!buyer) return noStore({ ok: false, error: "closed" }, { status: 403 });
            const b = await request.json().catch(() => ({}));
            switch (String(b?.action || "")) {
                // Walking. Fire-and-forget from the client's point of view, but it still answers so a failed
                // move does not leave somebody convinced they are somewhere they are not.
                case "move": return noStore(await moveCasino(buyer.id, { x: b?.x, y: b?.y, facing: b?.facing }));
                // ── THE PULL ── the bet is validated and taken server-side. `bet` arriving from a POST body is
                // a number somebody can type, so it is clamped in spinSlot rather than trusted here.
                case "spin": return noStore(await spinSlot(buyer.id, { bet: b?.bet, machine: b?.machine }));
                // ── THE FIVE-REEL MACHINE ── gold in, chips out. Its own action rather than a flag on the
                // one above, because it shares nothing with it: a different engine, a different currency and
                // a different response shape. Two games behind one verb is how a payout path gets confused
                // about which table it is paying from.
                case "spin5":
                    return noStore(await spinSlot5(buyer.id, { bet: b?.bet, machine: b?.machine, offerId: b?.offer, force: b?.force }));
                // ── THE COUNTER ── the shelf, and buying off it. The price is read from the catalog in code,
                // never from the body; `item` is only a key.
                case "chip_shelf": return noStore({ ok: true, ...(await chipShelf(buyer.id)) });
                case "chip_buy": return noStore(await buyWithChips(buyer.id, String(b?.item || "")));
                // ── DOUBLE OR NOTHING ── the amount is read from the meter, never from the body. What is
                // being gambled is what the last paid pull actually won, which is not a thing a POST gets
                // an opinion about.
                case "gamble": return noStore(await gambleWin(buyer.id, { machine: b?.machine }));
                // The ticket validates its own picks server-side — a list of numbers from a
                // five-number ticket are the two things a POST body can most easily lie about, and either
                // would break the odds these games were priced on.
                case "keno": return noStore(await playKeno(buyer.id, { bet: b?.bet, picks: b?.picks }));
                // ── THE TABLE ── five verbs instead of one, because a hand of blackjack is a conversation.
                // None of them carries state from the client: which hand is in play, what is left in the
                // shoe and whose turn it is are all read from the row, so the only thing a POST body can
                // decide here is the size of the opening bet.
                case "bj_deal": return noStore(await dealBlackjack(buyer.id, { bet: b?.bet }));
                case "bj_hit": return noStore(await hitBlackjack(buyer.id));
                case "bj_stand": return noStore(await standBlackjack(buyer.id));
                case "bj_double": return noStore(await doubleBlackjack(buyer.id));
                case "bj_split": return noStore(await splitBlackjack(buyer.id));
                // ── THE HALL ── one verb. A card is bought, dealt, flown over and scored in a single answer,
                // and the balls that follow on screen are a ceremony over a result already banked. There is no
                // shared round any more (see bingo-kit.js): the forty numbers belong to the card.
                //
                // `force` is the owner's dragon trigger, and it is checked HERE rather than trusted from the
                // body — the same rule as the slot cabinet's forced bonuses one screen up. This whole route is
                // already behind `gate()`, so it is belt and braces, and it stays that way on purpose: the day
                // the floor opens to members, the gate above changes and this line must not have to.
                case "bingo":
                    return noStore(await buyBingoCard(buyer.id, {
                        bet: b?.bet, force: isOwner(buyer.id) && b?.force === "dragon",
                    }));
                default: return noStore({ ok: false, error: "bad_action" }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "marketplace.casino.action.failure" });
        }
    });
}
