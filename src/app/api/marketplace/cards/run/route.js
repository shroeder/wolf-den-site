import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { CARDS_UNLOCKED, cardOffers, loadRun, saveRun } from "@/lib/marketplace/cards.js";
import { reachable, resolveUnknown } from "@/lib/marketplace/cards-map.js";
import { RUN_LENGTH, SKIP_EMBERS } from "@/lib/marketplace/cards-kit.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── WHERE A RUN MOVES FORWARD ────────────────────────────────────────────────────────────────────────────────
// The rules still run in the browser and this route does not check them, because the run pays NOTHING — there
// is no gold, no XP and no row anywhere else to protect. What it is for is memory: the health you finished a
// fight on and the card you picked have to outlive a locked phone.
//
// ⚠️ THE DAY THIS PAYS A SINGLE COIN, THIS IS THE FILE THAT CHANGES. The fight would move behind this route
// (cards-kit is written to survive that move unchanged — pure, seeded, no clock) and `hp` would stop being
// something the client is trusted to report. Until then, trusting it costs nobody anything.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/cards/run", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
            if (!CARDS_UNLOCKED(buyer.id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

            const body = await request.json().catch(() => ({}));
            const action = String(body?.action || "");
            const run = await loadRun(buyer.id, { create: true });

            // ── WALKING ONTO A ROOM ──────────────────────────────────────────────────────────────────
            // The move is checked, not because the numbers are worth defending — nothing here pays a coin —
            // but because an unchecked move lets a refresh at the wrong moment put somebody on a room their
            // route never reached, and then the map on screen stops describing the run.
            if (action === "enter") {
                const want = { row: Number(body?.row), lane: Number(body?.lane) };
                const legal = reachable(run.map, run.at ? { row: run.at.row, lane: run.at.lane } : null)
                    .some((n) => n.row === want.row && n.lane === want.lane);
                if (!legal) return NextResponse.json({ error: "unreachable" }, { status: 400 });

                const node = run.map.nodes.find((n) => n.row === want.row && n.lane === want.lane);
                // AN UNKNOWN DECIDES ITSELF ON ENTRY, which is the whole reason theirs can be a fifth of the
                // map — a question mark resolved when the map was drawn is just a room with a worse label.
                const kind = node.kind === "unknown" ? resolveUnknown(run.seed, want.row) : node.kind;
                run.at = { row: want.row, lane: want.lane, kind };
                run.stop = want.row + 1;
                run.trail = [...(run.trail || []), { row: want.row, lane: want.lane }];

                // A rest is not a fight: it heals and hands you straight back to the map.
                if (kind === "rest") {
                    run.hp = Math.min(run.hpMax, run.hp + Math.ceil(run.hpMax * 0.3));
                    run.at = null;
                }
                // Treasure pays embers rather than a relic, because relics do not exist yet and a room that
                // silently gives nothing is the Drowned Admiral's scroll all over again.
                if (kind === "treasure") { run.embers = (run.embers || 0) + 40; run.at = null; }
                // The merchant has no shop to open yet. It says so on the map rather than pretending.
                if (kind === "merchant") { run.at = null; }

                await saveRun(buyer.id, run);
                return NextResponse.json({ run });
            }

            if (action === "won") {
                // The fight is over and won. Bank the health it was won on, then put three cards on the table.
                run.hp = Math.max(1, Math.min(run.hpMax, Math.round(Number(body.hp) || run.hp)));
                if (run.at?.kind === "boss" || run.stop > RUN_LENGTH) {
                    run.done = "won";
                    run.offers = null;
                } else {
                    run.offers = await cardOffers(buyer.id, run);
                }
                await saveRun(buyer.id, run);
                return NextResponse.json({ run });
            }

            if (action === "pick") {
                // A pick is only legal against the offers actually on the table, which is also what makes a
                // replayed request harmless: once the offers are cleared there is nothing to pick.
                const id = String(body?.id || "");
                if (!run.offers?.includes(id)) return NextResponse.json({ error: "no_such_offer" }, { status: 400 });
                run.deck = [...run.deck, id];
                run.offers = null;
                run.at = null;              // back to the sheet to choose where next
                await saveRun(buyer.id, run);
                return NextResponse.json({ run });
            }

            if (action === "skip") {
                // Spire lets you take nothing, and it is a real choice: a deck that stays small draws its good
                // cards more often. Taking it away would make every reward automatic. Ours pays EMBERS on top
                // — the run's own money, for the run's own shop — so the fork is "a card" against "a smaller
                // deck and the means to fix it later".
                run.embers = (run.embers || 0) + SKIP_EMBERS;
                run.offers = null;
                run.at = null;
                await saveRun(buyer.id, run);
                return NextResponse.json({ run });
            }

            if (action === "dead") {
                run.done = "dead";
                await saveRun(buyer.id, run);
                return NextResponse.json({ run });
            }

            if (action === "restart") {
                await saveRun(buyer.id, { ...run, done: "dead" });
                const fresh = await loadRun(buyer.id, { create: true });
                return NextResponse.json({ run: fresh });
            }

            return NextResponse.json({ error: "bad_action" }, { status: 400 });
        } catch (error) {
            return internalError(error, { event: "cards.run.failure" });
        }
    });
}
