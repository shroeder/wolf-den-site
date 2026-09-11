import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import {
    CARDS_UNLOCKED, bossOffers, bumpCardProgress, cardOffers, grantForRoom, loadRun, nextAct, potionDrop,
    recordRun, saveRun, shopStock, startRun, takePerk, advanceFight, fightOutcome, FIGHT_ROOMS, dealFight,
} from "@/lib/marketplace/cards.js";
import { applyEventChoice, eventById, pickEvent } from "@/lib/marketplace/cards-events.js";
import { reachable, resolveUnknown } from "@/lib/marketplace/cards-map.js";
import {
    ACTS, ALL_CARDS, BOSS_PERKS, CURSE_POOL, FINAL_ACT, KEYS, PERKS, ascRule, baseIdOf, beltSize,
    hasAllKeys, perkById, perkSum, restHeal, RUN_LENGTH, SKIP_EMBERS, canUpgrade, cardById, pickEncounter,
    removalCost, upgradedId,
} from "@/lib/marketplace/cards-kit.js";

// A hand is five cards. Below that a deck stops being a deck, so removal has a floor.
const DECK_FLOOR = 5;
import { withRequestLogging } from "@/lib/server-logger";

// ── WHAT A WON ROOM PAYS ─────────────────────────────────────────────────────────────────────────────────────
// Lifted out of the old client-callable "won" action unchanged. It is called now by the server itself, the
// moment its OWN fight has no creature left standing in it -- see `act`. Nothing reaches this because a
// browser said so.
//
// It reads run.hp, which by then is the health the server's fight ended on.
async function roomWon(buyerId, run) {
                run.fight = null;           // won: there is no fight to come back to, only a reward
                // Stamped on the ROOM, because the fight is what gets cleared and the room is what stays. It
                // is what stops a second set of moves being posted into a room that is already paid for --
                // see the guard in advanceFight.
                run.at = { ...run.at, won: true };
                // Iron Ration pays here — after a win, before the reward, so the number on the card is the
                // number you keep.
                // Warm Blood pays after every win; Bone Broth pays only when the win nearly cost you the
                // run — read against the health the FIGHT ended on, before the ration heals it, or a hero on
                // 20 would be judged as a hero on 32 and the trinket would never fire.
                const spent = run.hp < run.hpMax / 2;
                const ration = (run.perks || []).reduce((n, id) => n
                    + (perkById(id)?.healAfter || 0)
                    + (spent ? (perkById(id)?.healAfterLow || 0) : 0), 0);
                if (ration) run.hp = Math.min(run.hpMax, run.hp + ration);
                // ── AND WHAT A WIN IS WORTH IN COIN ──────────────────────────────────────────────
                // Their Ceramic Fish family: a trinket that pays a little every time, which over sixteen
                // rooms is a card off the shelf you could not otherwise have bought. Paid here beside the
                // ration because "the fight is won" is one moment and should have one place.
                const purse = perkSum(run.perks, "emberPerWin");
                if (purse) run.embers = (run.embers || 0) + purse;
                const wonKind = run.at?.kind || "fight";
                // An elite hands over a perk for the health it just cost you.
                if (run.at?.kind === "elite") {
                    // Their Mango-on-a-kill idea: an elite is the only fight worth growing for, and a
                    // trinket that pays only there is a reason to take the room you would rather walk past.
                    const grew = perkSum(run.perks, "maxHpPerElite");
                    if (grew) { run.hpMax += grew; run.hp = Math.min(run.hpMax, run.hp + grew); }
                    const got = grantForRoom(run, run.at.row, run.at.lane, "elite");
                    // takePerk owns the health bump too — see the note on it. Two copies of that is Ember
                    // Heart paying its +8 from an elite and not from the shop.
                    if (got.perk) takePerk(run, got.perk);
                    if (got.embers) run.embers = (run.embers || 0) + got.embers;
                    // ── AND THE SCREEN IS TOLD WHICH ONE ─────────────────────────────────────────
                    // It used to appear in the strip along the top and nowhere else — a strip nobody is
                    // looking at, because the same request also deals three cards to choose between. A
                    // trinket is carried for the rest of the run and has to be READ once; see CardGot.
                    // Cleared when the reward is taken, like `dropped`.
                    if (got.perk) run.gotPerk = got.perk;
                }
                // ── AND THE BOTTLE THE FIGHT PAID ────────────────────────────────────────────────
                // See potionDrop: two combats in five, theirs, and the reserve a hero needs to arrive at an
                // elite with. Keyed to the room so a re-posted win cannot pay twice, and a full belt is said
                // out loud rather than swallowed — the chest already works this way.
                const dropKey = `${run.at?.row ?? 0}:${run.at?.lane ?? 0}`;
                if (run.dropped?.key !== dropKey) {
                    // ── ⚠️ AND THE MONEY, WHICH A WON FIGHT HAS NEVER PAID ───────────────────────
                    // Found by playing it: five fights won and the purse never moved off sixty. Embers came
                    // from chests, from skipping a card and from an elite that had nothing left to give —
                    // and from nothing else. Every combat in their game pays gold, and it is what makes the
                    // merchant a room you can use rather than scenery: card removal is the strongest
                    // purchase in Spire and ours was priced at 55 against an income of almost zero.
                    //
                    // Worse, the SIMULATOR has been paying 15 a win all along, so every number it has
                    // printed about shops, burns and the Bonesetter was for a player with money the browser
                    // never gave them. Paid inside the same once-per-room guard the bottle uses, so a
                    // re-posted win cannot pay twice.
                    run.embers = (run.embers || 0) + (wonKind === "boss" ? 30 : wonKind === "elite" ? 30 : 15);
                    const bottle = potionDrop(run, run.at?.row ?? 0, run.at?.lane ?? 0);
                    const room = (run.potions || []).length < beltSize(run.perks, run.asc);
                    if (bottle && room) run.potions = [...(run.potions || []), bottle];
                    run.dropped = bottle ? { key: dropKey, potion: bottle, spilled: !room } : { key: dropKey };
                }
                const wasBoss = run.at?.kind === "boss" || run.stop > RUN_LENGTH;
                // WON IS WON, and an elite or a boss is also its own line in the ledger — those are the two
                // counts the harder unlocks are keyed to, and they are the two a player remembers doing.
                await bumpCardProgress(buyerId, "fights", { bestStop: run.stop });
                if (run.at?.kind === "elite") await bumpCardProgress(buyerId, "elites");
                // ── RUNG SIXTEEN: AN ELITE LEAVES SOMETHING BEHIND ──────────────────────────────────
                // The relic an elite pays is the reason to fight one, and past rung fifteen that trade needs
                // a second side to it. Rolled off the run's own seed and the stop, so the same climb dealt
                // twice hands out the same curse — a run that reloads must not be able to reroll its price.
                if (run.at?.kind === "elite" && ascRule(run.asc || 0, 16)) {
                    const pick = CURSE_POOL[((run.seed >>> 0) + run.stop * 7717) % CURSE_POOL.length];
                    run.deck = [...(run.deck || []), pick];
                }
                if (wasBoss) await bumpCardProgress(buyerId, "bosses");
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
                    // ── AND THE THIRD BOSS IS A DOOR, IF YOU BROUGHT THE KEYS ────────────────────
                    // Three acts still finishes the game and still counts as a win — see the note on ACTS.
                    // What all three keys buy is the right to keep going instead, into a corridor that ends
                    // at the only fight in this game that was built to beat a finished deck.
                    const opensDoor = (run.act || 1) === ACTS && hasAllKeys(run);
                    if ((run.act || 1) >= FINAL_ACT || ((run.act || 1) >= ACTS && !opensDoor)) {
                        run.done = "won";
                        run.bossOffers = null;
                        // ── AND IT GOES IN THE LEDGER ────────────────────────────────────────
                        // The one moment a climb is finished. See recordRun: written once, here, and the
                        // stamp it leaves means a reloaded result screen cannot write a second row.
                        await recordRun(buyerId, run, "won");
                    } else {
                        run.bossOffers = bossOffers(run);
                    }
                } else {
                    run.offers = await cardOffers(buyerId, run);
                }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── WHERE A RUN MOVES FORWARD, AND WHERE THE FIGHT IS PLAYED ─────────────────────────────────────────────────
// The old note here said "the day this pays a single coin, this is the file that changes". It went on to pay
// pet XP and four pets, and the first attempt at the change was the wrong shape: the browser still played the
// fight and still SAID "I won this room at 34 health", and the server re-ran the moves afterwards to decide
// whether to believe it. That is a verifier, and a verifier means the rules live in two places, the server's
// copy only ever runs in judgement, and a disagreement is a support ticket rather than an impossibility.
//
// There is no "won" action here now, and no "dead" one either. The server deals the fight when the room is
// entered (`enter`), holds it on the run, and is the only thing that ever applies a move to it (`act`). What a
// browser sends is what the PLAYER DID — a list of plays, drinks and end-turns — and what it gets back is the
// fight as it now is. An outcome is something this file NOTICES, never something it is told. The one ending a
// player still declares is `forfeit`, because the only thing that can ever do is cost them the run.
//
// A TURN is the unit, not a tap. That is one request per end-turn, which is exactly what the old per-turn save
// already cost — a move-per-request design would have been the honest-looking answer and a ruinous one. See
// CLAUDE.md on round trips being the bill.
//
// Everything else here was already the server's and always has been: which room is reachable, which party
// stands in it, every card offered, the shop's stock and its prices, the deck, the trinkets, the bottles.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/cards/run", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
            if (!await CARDS_UNLOCKED(buyer.id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

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
                // ⚠️ AND THE HEALTH AT THE DOOR IS STAMPED HERE. The replay that checks the win has to start
                // the fight from the health the fight STARTED on, and run.hp stops being that the moment a
                // potion is drunk mid-room (the `drink` action moves it). One number, written once, by the
                // only party that knows it before the fight exists. See verifyWin.
                run.at = { row: want.row, lane: want.lane, kind, enc: enc?.id || null, hp: run.hp };
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
                // ── AND THE ROOMS THAT ARE WRITING ──────────────────────────────────────────────
                // Same rule as the merchant's shelf and the reward's three cards: rolled once, on the way in,
                // and stored — so a reload stands you in the same room reading the same page rather than
                // re-rolling the act underneath you. `seen` is the run's memory of which ones it has shown.
                if (kind === "event") {
                    const ev = pickEvent(encSeed, run.act || 1, run.seenEvents || []);
                    run.at.event = ev.id;
                    run.seenEvents = [...(run.seenEvents || []), ev.id];
                }
                if (kind === "rest") run.at.rested = false;
                if (kind === "treasure") run.at.opened = null;
                // ── THE MERCHANT KEEPS YOU ──────────────────────────────────────────────────────
                // It used to hand you straight back to the map, which made it the one room that was a
                // promise the game could not keep. The shelf is rolled HERE and stored on the run, so a
                // reload is not a reroll — the same rule the reward offers follow.
                if (kind === "merchant") {
                    run.shop = { stock: await shopStock(buyer.id, run, encSeed), bought: [], removed: false };
                }

                // ── AND IF IT IS A FIGHT, THE SERVER DEALS IT ───────────────────────────────────
                // Here, on the way in, rather than on the first move. The hand, the shuffle and the creatures
                // are decided by the room and the seed, so this is the same fight either way -- but dealing it
                // at the door means the fight EXISTS before anybody can send a move to it, and a room the
                // server never dealt can never come back reported as won.
                if (FIGHT_ROOMS.has(kind)) run.fight = await dealFight(buyer.id, run);

                await bumpCardProgress(buyer.id, "rooms", { bestStop: run.stop });
                await saveRun(buyer.id, run);
                return NextResponse.json({ run });
            }

            // ── A CHOICE IN A QUESTION-MARK ROOM ────────────────────────────────────────────────────
            // Two shapes, one action: a choice that needs a card comes back `pending` and arrives again
            // carrying one. `spent` is what stops a refresh from taking the pearl twice — the same guard the
            // campfire's `rested` and the chest's `opened` already use.
            if (action === "choose") {
                if (run.at?.kind !== "event") return NextResponse.json({ error: "not_at_event" }, { status: 400 });
                if (run.at.spent) return NextResponse.json({ error: "already_chosen" }, { status: 400 });
                const ev = eventById(run.at.event);
                if (!ev) return NextResponse.json({ error: "no_such_event" }, { status: 400 });
                const index = Number(body?.index);
                const out = applyEventChoice(run, ev, index, body?.card ? String(body.card) : null);
                if (out.error) return NextResponse.json({ error: out.error }, { status: 400 });
                await saveRun(buyer.id, run);
                // ⚠️ THE CARDS GO BACK WITH IT, NOT ONLY THE ROOM. A room that sharpens two cards at random
                // has to be able to show the same fire the campfire shows, and the screen cannot animate what
                // it was never told — the reply carried `run` alone, so the only evidence anything had
                // happened was a sentence. Rides beside the run rather than on it: it is what just happened,
                // not part of the run's state, and it must not survive a reload and play a second time.
                return NextResponse.json({ run, sharpened: out.sharpened || [] });
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
                // A third of the bar, plus whatever you are carrying that makes a fire worth more (Down
                // Pillow). Theirs is 30% and the relic that raises it is one of the reasons a rest-heavy
                // route is a real plan rather than the thing you do when you are losing.
                run.hp = Math.min(run.hpMax, run.hp + restHeal(run.hpMax, run.asc)
                    + perkSum(run.perks, "restBonus"));
                run.at = { ...run.at, rested: true, healed: run.hp - before };
                await saveRun(buyer.id, run);
                return NextResponse.json({ run });
            }

            // ── PAY FOR THE DOOR ────────────────────────────────────────────────────────────────────
            // One action for all three keys, because they are one decision wearing three costumes: you are
            // stood in a room that is about to give you something, and you take the key instead.
            //
            // The room is SPENT either way — `rested`/`opened`/`gotPerk` are cleared or set exactly as the
            // ordinary path would set them — so a key can never be taken and the reward taken as well, and
            // a replayed request finds the room already used rather than handing out a second key.
            if (action === "takekey") {
                const which = String(body?.key || "");
                const spec = KEYS[which];
                if (!spec) return NextResponse.json({ error: "no_such_key" }, { status: 400 });
                if (run.keys?.[which]) return NextResponse.json({ error: "already_held" }, { status: 400 });
                if (run.at?.kind !== spec.from) {
                    return NextResponse.json({ error: "wrong_room" }, { status: 400 });
                }
                // Each room has its own word for "already used", and the key has to respect all three.
                if (spec.from === "rest" && run.at.rested) {
                    return NextResponse.json({ error: "already_rested" }, { status: 400 });
                }
                if (spec.from === "treasure" && run.at.opened) {
                    return NextResponse.json({ error: "already_open" }, { status: 400 });
                }
                // The red key is paid for with the trinket an elite just dropped, so there has to be one on
                // the table to walk away from.
                if (spec.from === "elite" && !run.gotPerk) {
                    return NextResponse.json({ error: "nothing_to_leave" }, { status: 400 });
                }
                run.keys = { ...(run.keys || {}), [which]: true };
                // ── AND THE THIRD ONE COSTS SOMETHING YOU CANNOT PUT DOWN ───────────────────────────
                // ⚠️ THE HOLLOW WAS UNOBTAINABLE. Its own comment in CURSE_CARDS says "nothing hands this
                // out except the last act's keys" — and nothing did, because that half was never written.
                // A card in the table that no path can deal is the same dead content as a card behind a pet
                // nobody owns; it just hides better, because it reads as finished.
                //
                // ONE, on the third key, rather than one per key. Three unremovable curses bleeding for
                // every card in your hand is not a bet, it is a refusal — and the keys already cost three
                // rooms' worth of reward. This is the single mark that says the door was opened on purpose,
                // it lands at the moment the set completes, and the merchant cannot take it.
                if (hasAllKeys(run) && !(run.deck || []).includes("hollow")) {
                    run.deck = [...(run.deck || []), "hollow"];
                }
                if (spec.from === "rest") run.at = { ...run.at, rested: true, healed: 0, tookKey: which };
                if (spec.from === "treasure") {
                    run.at = { ...run.at, opened: { embers: 0, perk: null, potion: null, spilled: false, tookKey: which } };
                }
                if (spec.from === "elite") run.gotPerk = null;
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
                // ⚠️ THE PERK GOES THROUGH takePerk, NOT INTO THE ARRAY. A trinket can carry max health or
                // embers of its own, and the elite payout has always granted them through that one function
                // — so pushing an id here would have handed over a Mango that was worth nothing. This is
                // the third caller of it and the reason it exists.
                const tookPerk = got.perk && takePerk(run, got.perk) ? got.perk : null;
                // A full belt is not a lost potion quietly: the chest says what it could not give you.
                const belted = got.potion && (run.potions || []).length < beltSize(run.perks, run.asc);
                if (belted) run.potions = [...(run.potions || []), got.potion];
                run.at = {
                    ...run.at,
                    opened: {
                        embers: got.embers || 0, perk: tookPerk,
                        potion: belted ? got.potion : null, spilled: Boolean(got.potion && !belted),
                    },
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
                    if ((run.potions || []).length >= beltSize(run.perks, run.asc)) {
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
                // ⚠️ THE HOLLOW DOES NOT COME OUT. The last act charges a curse that cannot be burned for
                // each of its keys, and a bargain the merchant can undo for embers is not a bargain. Checked
                // on the server because the shelf is not the authority on what is legal — see the note on
                // the gate at the top of this file.
                if (ALL_CARDS[baseIdOf(deck[at])]?.noBurn) {
                    return NextResponse.json({ error: "cannot_be_removed" }, { status: 400 });
                }
                const cost = removalCost(run.removals || 0, run.perks, run.asc || 0);
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

            // ── THE ONLY WAY A FIGHT MOVES ──────────────────────────────────────────────────────────
            // What the player DID, in order, for one turn: [["p", uid, target], ["d", slot], ["e"]]. The
            // server applies it to ITS OWN held fight and then looks at the result. There is no "won" action
            // and no "dead" action any more, because an outcome is not a thing a browser is allowed to have an
            // opinion about -- the room is over when the server's own creatures are dead, and not before.
            //
            // A turn is the unit for the same reason the old save was: it is what somebody would mind
            // replaying, and it is one request for ten taps. See CLAUDE.md on round trips.
            if (action === "act") {
                const out = await advanceFight(buyer.id, run, body?.moves);
                if (!out.ok) {
                    // The fight is untouched -- applyMoves builds forward and only assigns on success -- so an
                    // illegal move leaves the room exactly as it was and the screen re-reads it.
                    //
                    // ⚠️ AND IT IS WRITTEN DOWN. This column was a shadow verifier's disagreement count; the
                    // verifier is gone because the server plays the fight now, and what is worth counting
                    // instead is a move the server REFUSED. For an honest player that is zero for ever -- the
                    // screen runs the same engine and would not offer an illegal move. Anything else is a bug
                    // of mine or somebody at the API by hand, and one query says which and whose.
                    run.refused = (Number(run.refused) || 0) + 1;
                    run.lastRefused = String(out.why || "").slice(0, 120);
                    await saveRun(buyer.id, run);
                    return NextResponse.json({ error: out.why, run }, { status: 400 });
                }
                const ended = fightOutcome(out.state);
                if (ended === "won") {
                    // The health the SERVER's fight ended on. This is the number the whole rewrite is about.
                    run.hp = Math.max(1, Math.min(run.hpMax, Math.round(Number(out.state.hero?.hp) || 1)));
                    await roomWon(buyer.id, run);
                    await saveRun(buyer.id, run);
                    return NextResponse.json({ run });
                }
                if (ended === "dead") {
                    run.hp = 0;
                    run.done = "dead";
                    run.fight = null;
                    await recordRun(buyer.id, run, "dead");
                    await saveRun(buyer.id, run);
                    return NextResponse.json({ run });
                }
                // Still standing. run.hp tracks the fight so the map, the strip and a reload all read one
                // number -- and it is the server's number, not a reported one.
                run.hp = Math.max(0, Math.round(Number(out.state.hero?.hp) || 0));
                await saveRun(buyer.id, run);
                return NextResponse.json({ run });
            }

            // ── GIVING UP IS THE ONE ENDING A PLAYER DECLARES ───────────────────────────────────────
            // And it is safe to let them, because it can only ever cost them the run. Spire has no in-combat
            // forfeit; ours is a door out of a fight that has become unwinnable, and it ends the climb.
            if (action === "forfeit") {
                run.done = "dead";
                run.fight = null;
                run.gaveUp = true;
                await recordRun(buyer.id, run, "dead");
                await saveRun(buyer.id, run);
                return NextResponse.json({ run });
            }

            if (action === "bosspick") {
                run.dropped = null;
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
                run.dropped = null;         // the reward screen is done; so is the line about the bottle
                run.gotPerk = null;
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
                run.dropped = null;
                run.gotPerk = null;
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
            if (action === "restart") {
                // Explicit, because loading no longer deals one — see startRun. A run given up is still a
                // run that happened, and it goes in the history saying how far it actually got.
                await recordRun(buyer.id, run, "dead");
                await saveRun(buyer.id, { ...run, done: "dead", recorded: true });
                // A new run is dealt on the rung asked for, defaulting to the one just finished — climbing
                // back onto the same step is what anybody does after a loss.
                return NextResponse.json({ run: await startRun(buyer.id, Number(body?.asc ?? run.asc ?? 0)) });
            }

            // ── A TAB THAT HAS NOT RELOADED SINCE THIS SHIPPED ──────────────────────────────────────
            // "won", "dead", "save" and "drink" were how the old client drove a fight, and all four are gone
            // on purpose -- three of them let the browser assert something. A browser still holding that code
            // is not doing anything wrong, it is just old, and the only thing it needs is to fetch itself
            // again. The run underneath it is untouched and it comes back to the room it was standing in.
            if (["won", "dead", "save", "drink"].includes(action)) {
                return NextResponse.json({ error: "stale_client", reload: true, run }, { status: 409 });
            }
            return NextResponse.json({ error: "bad_action" }, { status: 400 });
        } catch (error) {
            return internalError(error, { event: "cards.run.failure" });
        }
    });
}
