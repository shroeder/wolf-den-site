import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import {
    CARDS_UNLOCKED, bossOffers, bumpCardProgress, cardOffers, grantForRoom, loadRun, nextAct, saveRun,
    shopStock, takePerk,
} from "@/lib/marketplace/cards.js";
import { reachable, resolveUnknown } from "@/lib/marketplace/cards-map.js";
import {
    ACTS, BOSS_PERKS, PERKS, perkById, POTION_SLOTS, RUN_LENGTH, SKIP_EMBERS, canUpgrade, cardById, pickEncounter,
    removalCost, upgradedId,
} from "@/lib/marketplace/cards-kit.js";

// A hand is five cards. Below that a deck stops being a deck, so removal has a floor.
const DECK_FLOOR = 5;
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

                // ── AND IT COUNTS ───────────────────────────────────────────────────────────────────
                // Every room you walk into is a room walked into, for ever — see migration 432. Counted HERE
                // rather than on the way out, because half the rooms in this game (a fight you lose, a
                // merchant you leave empty-handed) have no way out that the server hears about.
                //
                // ⚠️ NOT AWAITED INTO THE RESPONSE PATH ON PURPOSE? No — awaited. Vercel kills work a handler
                // did not wait for, and a counter that increments only when the phone is fast is a counter
                // nobody can trust. One upsert, on a tap the player already waited for.
                run.fight = null;           // whatever was held belonged to the room you are leaving
                const node = run.map.nodes.find((n) => n.row === want.row && n.lane === want.lane);
                // AN UNKNOWN DECIDES ITSELF ON ENTRY, which is the whole reason theirs can be a fifth of the
                // map — a question mark resolved when the map was drawn is just a room with a worse label.
                const kind = node.kind === "unknown" ? resolveUnknown(run.seed, want.row) : node.kind;
                // ── THE GROUP IS CHOSEN ONCE, WHEN YOU WALK IN ───────────────────────────────────
                // Off the room's own seed, like every other roll here, so a refresh mid-fight finds the same
                // party. Stamped onto the room because `recent` is about to change: re-rolling later would
                // draw against a memory that already holds this encounter.
                const encSeed = (run.seed >>> 0) + (want.row * 31 + want.lane) * 104729;
                const enc = pickEncounter(encSeed, want.row + 1, kind, run.recent || [], run.act || 1);
                run.at = { row: want.row, lane: want.lane, kind, enc: enc?.id || null };
                run.stop = want.row + 1;
                run.trail = [...(run.trail || []), { row: want.row, lane: want.lane }];
                // Two deep, which is the reference's own window: what you just fought, and what you fought
                // before that, cannot be what is standing in the next doorway.
                if (enc?.id) run.recent = [enc.id, ...(run.recent || [])].slice(0, 2);

                // ⚠️ A REST AND A CHEST ARE ROOMS YOU STAND IN. Both of them used to resolve RIGHT HERE —
                // heal 30% and clear `at`, or pay the chest out and clear `at` — so walking into either one
                // dropped you back on the map with a number quietly different. Luke, on a question mark that
                // had turned into a chest: "I clicked the question mark encounter and it did nothing." It had
                // paid him 40 embers and a potion; there was simply nothing to see.
                //
                // That is the merchant's own lesson (see the note on the shop below): a room that resolves on
                // entry is not a room, it is a number. Two of the five things on the map were invisible, which
                // is most of why the sheet feels like fights with gaps in it — and it is why the campfires
                // read as missing even at their full Spire weight. They open screens now; `at` survives them
                // exactly as the merchant's does, and `leave` is what clears it.
                if (kind === "rest") run.at.rested = false;
                if (kind === "treasure") run.at.opened = null;
                // ── THE MERCHANT KEEPS YOU ──────────────────────────────────────────────────────
                // It used to hand you straight back to the map, which made it the one room that was a
                // promise the game could not keep. The shelf is rolled HERE and stored on the run, so a
                // reload is not a reroll — the same rule the reward offers follow.
                if (kind === "merchant") {
                    run.shop = { stock: await shopStock(buyer.id, run, encSeed), bought: [], removed: false };
                }

                await bumpCardProgress(buyer.id, "rooms", { bestStop: run.stop });
                await saveRun(buyer.id, run);
                return NextResponse.json({ run });
            }

            // ── THE CAMPFIRE ────────────────────────────────────────────────────────────────────────
            // Once, and it has to be asked for. The heal is unchanged — 30% of max, which is what it paid
            // when it happened TO you on the way past — but sitting down is now a thing you do, and a thing
            // you can see having happened. `rested` is on the room rather than the run so a refresh at the
            // fire cannot buy a second one.
            if (action === "rest") {
                if (run.at?.kind !== "rest") return NextResponse.json({ error: "not_at_fire" }, { status: 400 });
                if (run.at.rested) return NextResponse.json({ error: "already_rested" }, { status: 400 });
                const before = run.hp;
                run.hp = Math.min(run.hpMax, run.hp + Math.ceil(run.hpMax * 0.3));
                run.at = { ...run.at, rested: true, healed: run.hp - before };
                await saveRun(buyer.id, run);
                return NextResponse.json({ run });
            }

            // ── THE SMITH ───────────────────────────────────────────────────────────────────────────
            // ⚠️ ONE OR THE OTHER, AND THAT IS THE WHOLE POINT. Their campfire is Rest or Smith and you may
            // only do one, which is what turns a fire into a decision instead of a free stop: health now, or
            // a deck that is permanently better. Both write `rested`, so the room is spent either way.
            //
            // A card is upgraded ONCE. `canUpgrade` is the authority — it refuses a copy that already carries
            // the mark and a card with no upgrade authored — so the deck can never grow a "bite++".
            if (action === "smith") {
                if (run.at?.kind !== "rest") return NextResponse.json({ error: "not_at_fire" }, { status: 400 });
                if (run.at.rested) return NextResponse.json({ error: "already_rested" }, { status: 400 });
                const at = Number(body?.index);
                const deck = run.deck || [];
                if (!Number.isInteger(at) || at < 0 || at >= deck.length) {
                    return NextResponse.json({ error: "no_such_card" }, { status: 400 });
                }
                if (!canUpgrade(deck[at])) return NextResponse.json({ error: "already_sharp" }, { status: 400 });
                const was = cardById(deck[at]);
                const now = upgradedId(deck[at]);
                run.deck = deck.map((id, i) => (i === at ? now : id));
                // THE ID TRAVELS, NOT ONLY THE NAME. The fire draws the card it just changed (see CardRoom),
                // and a name is not something a card renderer can look up — "Bite" is not "bite+". `smithed`
                // stays as the name so a run that was mid-fire when this shipped still says what it did.
                run.at = { ...run.at, rested: true, smithed: was?.name || null, smithedId: now };
                await bumpCardProgress(buyer.id, "smiths");
                await saveRun(buyer.id, run);
                return NextResponse.json({ run });
            }

            // ── THE CHEST ───────────────────────────────────────────────────────────────────────────
            // Seeded off the room, so a refresh with the lid open cannot roll a second one — the Drowned
            // Admiral's scroll taught that a reward path with no record of itself is the one that silently
            // goes wrong. What it held is STORED, because the screen has to be able to show it again.
            if (action === "open") {
                if (run.at?.kind !== "treasure") return NextResponse.json({ error: "no_chest" }, { status: 400 });
                if (run.at.opened) return NextResponse.json({ error: "already_open" }, { status: 400 });
                const got = grantForRoom(run, run.at.row, run.at.lane, "treasure");
                run.embers = (run.embers || 0) + (got.embers || 0);
                // A full belt is not a lost potion quietly: the chest says what it could not give you.
                const belted = got.potion && (run.potions || []).length < POTION_SLOTS;
                if (belted) run.potions = [...(run.potions || []), got.potion];
                run.at = {
                    ...run.at,
                    opened: { embers: got.embers || 0, potion: belted ? got.potion : null, spilled: Boolean(got.potion && !belted) },
                };
                await saveRun(buyer.id, run);
                return NextResponse.json({ run });
            }

            // ── BUYING ──────────────────────────────────────────────────────────────────────────────
            // Every refusal below is a real one: you cannot buy what is gone, what you cannot afford, a
            // potion with no belt slot free, or a perk you already carry. The shelf is the authority on
            // price, not the request — a POST body is something anybody can write.
            if (action === "buy") {
                if (run.at?.kind !== "merchant" || !run.shop) {
                    return NextResponse.json({ error: "not_in_shop" }, { status: 400 });
                }
                const slot = Number(body?.slot);
                const item = (run.shop.stock || []).find((x) => x.slot === slot);
                if (!item) return NextResponse.json({ error: "no_such_item" }, { status: 400 });
                if ((run.shop.bought || []).includes(slot)) {
                    return NextResponse.json({ error: "already_bought" }, { status: 400 });
                }
                if ((run.embers || 0) < item.price) {
                    return NextResponse.json({ error: "too_few_embers" }, { status: 400 });
                }
                if (item.kind === "card") {
                    run.deck = [...(run.deck || []), item.ref];
                } else if (item.kind === "potion") {
                    if ((run.potions || []).length >= POTION_SLOTS) {
                        return NextResponse.json({ error: "no_potion_slot" }, { status: 400 });
                    }
                    run.potions = [...(run.potions || []), item.ref];
                } else if (item.kind === "perk") {
                    if (!takePerk(run, item.ref)) {
                        return NextResponse.json({ error: "already_carried" }, { status: 400 });
                    }
                } else {
                    return NextResponse.json({ error: "bad_item" }, { status: 400 });
                }
                run.embers = (run.embers || 0) - item.price;
                run.shop.bought = [...(run.shop.bought || []), slot];
                await bumpCardProgress(buyer.id, "buys");
                await saveRun(buyer.id, run);
                return NextResponse.json({ run });
            }

            // ── AND THE THING A SHOP IS ACTUALLY FOR ────────────────────────────────────────────────
            // Everything else in this game makes the deck BIGGER, and a deck that only grows draws its good
            // cards less often the longer the run goes. This is the only place it can get better instead.
            //
            // Once per shop, and the price rises every time across the whole run — theirs is 75 rising 25,
            // and the escalation is what stops a rich run deleting itself down to four perfect cards.
            if (action === "remove") {
                if (run.at?.kind !== "merchant" || !run.shop) {
                    return NextResponse.json({ error: "not_in_shop" }, { status: 400 });
                }
                if (run.shop.removed) return NextResponse.json({ error: "already_removed" }, { status: 400 });
                const at = Number(body?.index);
                const deck = run.deck || [];
                if (!Number.isInteger(at) || at < 0 || at >= deck.length) {
                    return NextResponse.json({ error: "no_such_card" }, { status: 400 });
                }
                // A hand is drawn five at a time; a deck below that stops being a deck.
                if (deck.length <= DECK_FLOOR) {
                    return NextResponse.json({ error: "deck_too_small" }, { status: 400 });
                }
                const cost = removalCost(run.removals || 0);
                if ((run.embers || 0) < cost) {
                    return NextResponse.json({ error: "too_few_embers" }, { status: 400 });
                }
                run.deck = deck.filter((_, i) => i !== at);
                run.embers = (run.embers || 0) - cost;
                run.removals = (run.removals || 0) + 1;
                await bumpCardProgress(buyer.id, "burns");
                run.shop.removed = true;
                await saveRun(buyer.id, run);
                return NextResponse.json({ run });
            }

            // Back to the sheet. The shelf goes with you — a shop you walked out of is not a shop you can
            // walk back into, which is what makes the money a decision rather than a running tab.
            if (action === "leave") {
                run.at = null;
                run.shop = null;
                await saveRun(buyer.id, run);
                return NextResponse.json({ run });
            }

            if (action === "won") {
                // The fight is over and won. Bank the health it was won on, then put three cards on the table.
                run.hp = Math.max(1, Math.min(run.hpMax, Math.round(Number(body.hp) || run.hp)));
                run.fight = null;           // won: there is no fight to come back to, only a reward
                // Iron Ration pays here — after a win, before the reward, so the number on the card is the
                // number you keep.
                const ration = (run.perks || []).reduce((n, id) => n + (perkById(id)?.healAfter || 0), 0);
                if (ration) run.hp = Math.min(run.hpMax, run.hp + ration);
                // An elite hands over a perk for the health it just cost you.
                if (run.at?.kind === "elite") {
                    const got = grantForRoom(run, run.at.row, run.at.lane, "elite");
                    // takePerk owns the health bump too — see the note on it. Two copies of that is Ember
                    // Heart paying its +8 from an elite and not from the shop.
                    if (got.perk) takePerk(run, got.perk);
                    if (got.embers) run.embers = (run.embers || 0) + got.embers;
                }
                const wasBoss = run.at?.kind === "boss" || run.stop > RUN_LENGTH;
                // WON IS WON, and an elite or a boss is also its own line in the ledger — those are the two
                // counts the harder unlocks are keyed to, and they are the two a player remembers doing.
                await bumpCardProgress(buyer.id, "fights", { bestStop: run.stop });
                if (run.at?.kind === "elite") await bumpCardProgress(buyer.id, "elites");
                if (wasBoss) await bumpCardProgress(buyer.id, "bosses");
                if (wasBoss) {
                    // ── THE BOSS IS A GATE ───────────────────────────────────────────────────────────
                    // Luke, having just killed one: "the run isn't supposed to end when you beat the boss...
                    // you get a really powerful enhancement that you get to choose from, and then you keep
                    // going." Which is Spire exactly: the relic is the payment for the act, and the next act
                    // opens harder. Ending here finished every good run at the moment the deck got
                    // interesting.
                    //
                    // The LAST act still ends — a game with no end is not a run — and that is the only place
                    // `done: "won"` is set now.
                    run.offers = null;
                    if ((run.act || 1) >= ACTS) {
                        run.done = "won";
                        run.bossOffers = null;
                    } else {
                        run.bossOffers = bossOffers(run);
                    }
                } else {
                    run.offers = await cardOffers(buyer.id, run);
                }
                await saveRun(buyer.id, run);
                return NextResponse.json({ run });
            }

            // ── TAKE THE BOSS TRINKET, AND WALK INTO THE NEXT ACT ───────────────────────────────────
            // One request, because they are one decision: there is no state worth having between "I choose
            // the crown" and "act two is dealt". Legal only against the three actually on the table, which is
            // also what makes a replayed request harmless — once they are cleared there is nothing to take.
            if (action === "bosspick") {
                const id = String(body?.id || "");
                if (!run.bossOffers?.includes(id) || !BOSS_PERKS[id]) {
                    return NextResponse.json({ error: "no_such_boss_perk" }, { status: 400 });
                }
                takePerk(run, id);
                nextAct(run);
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
                run.fight = null;           // the fight it came from is finished with
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
                run.fight = null;
                run.at = null;
                await saveRun(buyer.id, run);
                return NextResponse.json({ run });
            }

            // A potion is spent from the RUN, not from the fight: the fight reports what it did, and the run
            // is what remembers the bottle is empty. Kept here so a refresh mid-fight cannot un-drink one.
            // ── A FIGHT THAT SURVIVES A LOCKED PHONE ────────────────────────────────────────────────
            // ⚠️ THE ROOM RESTARTED. The run row banks your health when a fight ENDS, so a reload in the
            // middle of one rebuilt the room from the seed: the foes back at full health, your health back to
            // what you walked in on, and the beating you had just taken undone. That is a lost fight if you
            // were winning and a free retry if you were not — the exact thing the run row exists to prevent,
            // which it already does for every other room in the game.
            //
            // The engine state IS the fight (pure, seeded, serialisable — see the note at the top of
            // cards-kit), so holding it is holding the room. Written at the END of a turn, not per card: a
            // turn is the unit somebody would be annoyed to replay, and it is one write for ten taps.
            if (action === "save") {
                const snap = body?.fight;
                // Shape-checked rather than trusted. It is the owner's own prototype and the engine runs in
                // the browser anyway, but a malformed blob here is a run that cannot be loaded at all.
                if (!snap || typeof snap !== "object" || !Array.isArray(snap.hand) || !Array.isArray(snap.foes)) {
                    return NextResponse.json({ error: "bad_fight" }, { status: 400 });
                }
                run.fight = snap;
                await saveRun(buyer.id, run);
                return NextResponse.json({ run });
            }

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
                run.fight = null;              // the room is over; nothing to come back to
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
