import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { gambleWin, getCasinoState, moveCasino, playKeno, spinSlot, spinWheel } from "@/lib/marketplace/casino.js";
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
                getCasinoState(buyer.id), blackjackState(buyer.id), bingoState(buyer.id),
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
                // ── DOUBLE OR NOTHING ── the amount is read from the meter, never from the body. What is
                // being gambled is what the last paid pull actually won, which is not a thing a POST gets
                // an opinion about.
                case "gamble": return noStore(await gambleWin(buyer.id, { machine: b?.machine }));
                // The wheel and the ticket. Both validate their own choice server-side — a bet id and a
                // five-number ticket are the two things a POST body can most easily lie about, and either
                // would break the odds these games were priced on.
                case "wheel": return noStore(await spinWheel(buyer.id, { bet: b?.bet, choice: b?.choice, pick: b?.pick }));
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
                // ── THE HALL ── one verb. A card is bought, dealt and scored in a single answer, and the
                // balls that follow on screen are a ceremony over a result already banked. What the ROUND
                // shares is the forty numbers, not the moment of watching them: buy at any point in the
                // three minutes and you are playing the same draw as everybody else who did.
                case "bingo": return noStore(await buyBingoCard(buyer.id, { bet: b?.bet }));
                default: return noStore({ ok: false, error: "bad_action" }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "marketplace.casino.action.failure" });
        }
    });
}
