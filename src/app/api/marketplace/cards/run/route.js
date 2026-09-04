import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { CARDS_UNLOCKED, cardOffers, grantForRoom, loadRun, saveRun } from "@/lib/marketplace/cards.js";
import { reachable, resolveUnknown } from "@/lib/marketplace/cards-map.js";
import { PERKS, POTION_SLOTS, RUN_LENGTH, SKIP_EMBERS, pickEncounter } from "@/lib/marketplace/cards-kit.js";
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
                // ── WHERE YOU ARE STANDING WHEN YOU CHOOSE IS THE LAST ROOM YOU TOOK ─────────────────
                // ⚠️ THIS CHECKED `run.at`, AND `run.at` IS NULL EXACTLY WHEN THIS RUNS. It means "the room
                // I am inside right now", and it is cleared the moment a room finishes — by a rest, by a
                // chest, by the merchant, by taking a card, by a win. Choosing where to go next only ever
                // happens in that state, so the check was always reading null, and `reachable(map, null)`
                // returns THE ENTRY ROW. Every run could therefore walk row 0 and nothing else, for ever.
                //
                // CardMap has always drawn the right thing — it opens `reachable(map, trail[last])` — so the
                // screen offered the correct next rooms and the server answered 400 to every one of them.
                // Measured on a real run: the client offered 1:0, the server allowed 0:0, 0:5, 0:2 and 0:3,
                // and POST enter {row:1,lane:0} came back `unreachable`. Nothing happened when you tapped.
                //
                // The trail's last entry is the same room `run.at` names while a room is open, and it is
                // still there once the room closes — so it is the one source both sides can agree on, which
                // is the whole reason they disagreed. Same expression as CardMap's `last`.
                const from = (run.trail || []).length ? run.trail[run.trail.length - 1] : null;
                const legal = reachable(run.map, from)
                    .some((n) => n.row === want.row && n.lane === want.lane);
                if (!legal) return NextResponse.json({ error: "unreachable" }, { status: 400 });

                const node = run.map.nodes.find((n) => n.row === want.row && n.lane === want.lane);
                // AN UNKNOWN DECIDES ITSELF ON ENTRY, which is the whole reason theirs can be a fifth of the
                // map — a question mark resolved when the map was drawn is just a room with a worse label.
                const kind = node.kind === "unknown" ? resolveUnknown(run.seed, want.row) : node.kind;
                // ── THE GROUP IS CHOSEN ONCE, WHEN YOU WALK IN ───────────────────────────────────
                // Off the room's own seed, like every other roll here, so a refresh mid-fight finds the same
                // party. Stamped onto the room because `recent` is about to change: re-rolling later would
                // draw against a memory that already holds this encounter.
                const encSeed = (run.seed >>> 0) + (want.row * 31 + want.lane) * 104729;
                const enc = pickEncounter(encSeed, want.row + 1, kind, run.recent || []);
                run.at = { row: want.row, lane: want.lane, kind, enc: enc?.id || null };
                run.stop = want.row + 1;
                run.trail = [...(run.trail || []), { row: want.row, lane: want.lane }];
                // Two deep, which is the reference's own window: what you just fought, and what you fought
                // before that, cannot be what is standing in the next doorway.
                if (enc?.id) run.recent = [enc.id, ...(run.recent || [])].slice(0, 2);

                // A rest is not a fight: it heals and hands you straight back to the map.
                if (kind === "rest") {
                    run.hp = Math.min(run.hpMax, run.hp + Math.ceil(run.hpMax * 0.3));
                    run.at = null;
                }
                // Chests and elites pay out here. Both are seeded off the room, so a refresh mid-room cannot
                // roll a second reward — the Drowned Admiral's scroll taught that a reward path with no
                // record of itself is the one that silently goes wrong.
                if (kind === "treasure") {
                    const got = grantForRoom(run, want.row, want.lane, "treasure");
                    run.embers = (run.embers || 0) + (got.embers || 0);
                    if (got.potion && (run.potions || []).length < POTION_SLOTS) {
                        run.potions = [...(run.potions || []), got.potion];
                    }
                    run.at = null;
                }
                // The merchant has no shop to open yet. It says so on the map rather than pretending.
                if (kind === "merchant") { run.at = null; }

                await saveRun(buyer.id, run);
                return NextResponse.json({ run });
            }

            if (action === "won") {
                // The fight is over and won. Bank the health it was won on, then put three cards on the table.
                run.hp = Math.max(1, Math.min(run.hpMax, Math.round(Number(body.hp) || run.hp)));
                // Iron Ration pays here — after a win, before the reward, so the number on the card is the
                // number you keep.
                const ration = (run.perks || []).reduce((n, id) => n + (PERKS[id]?.healAfter || 0), 0);
                if (ration) run.hp = Math.min(run.hpMax, run.hp + ration);
                // An elite hands over a perk for the health it just cost you.
                if (run.at?.kind === "elite") {
                    const got = grantForRoom(run, run.at.row, run.at.lane, "elite");
                    if (got.perk && !(run.perks || []).includes(got.perk)) {
                        run.perks = [...(run.perks || []), got.perk];
                        const bump = PERKS[got.perk]?.maxHp || 0;
                        if (bump) { run.hpMax += bump; run.hp += bump; }
                    }
                    if (got.embers) run.embers = (run.embers || 0) + got.embers;
                }
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

            // A potion is spent from the RUN, not from the fight: the fight reports what it did, and the run
            // is what remembers the bottle is empty. Kept here so a refresh mid-fight cannot un-drink one.
            if (action === "drink") {
                const idx = Number(body?.slot);
                if (!Number.isInteger(idx) || !(run.potions || [])[idx]) {
                    return NextResponse.json({ error: "no_such_potion" }, { status: 400 });
                }
                run.potions = run.potions.filter((_, i) => i !== idx);
                if (Number.isFinite(Number(body?.hp))) {
                    run.hp = Math.max(1, Math.min(run.hpMax, Math.round(Number(body.hp))));
                }
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
