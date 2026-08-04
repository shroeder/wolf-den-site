import "server-only";

import { db } from "@/lib/db";
import { awardXp } from "@/lib/marketplace/xp.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { addChests } from "@/lib/marketplace/chests.js";
import { grantEventBadge } from "@/lib/marketplace/badges.js";
import { bumpQuestProgress } from "@/lib/marketplace/quests.js";
import { bumpTownQuest } from "@/lib/marketplace/town-quests.js";
import { DELVE_FLOORS, DUNGEONS, KIND, dungeonById, encounterArt } from "@/lib/marketplace/delve-catalog.js";

// ── DELVE: CHOICES, ADVANCING AND THE PAYOUT ─────────────────────────────────────────────────────────────────
// Split out of delves.js purely for size: that file owns the run (start, state, strike, potion) and this one
// owns what happens when a floor asks you a question, and what happens when the run ends. They share the run
// object and nothing else.

// ── CHOICE FLOORS ────────────────────────────────────────────────────────────────────────────────────────────
// Merchants, wells, shrines and forks in the tunnel ask a question and wait.
//
// THE OPTIONS DO NOT TELL YOU WHAT THEY DO. The first cut wrote the answer on the button — "Take the risky way
// (55%)", "Take the long way", "Walk on" — so every floor read as trap / safe / nothing and the decision was
// made before you finished the sentence. A stated probability turns a choice into arithmetic, and arithmetic
// with one correct answer is not a choice.
//
// What each option gives you now is a POSTURE, not a number. Reaching into the dark is greedier than looking at
// it; drinking the water commits harder than filling a flask. The posture is legible from the fiction, the
// outcome is not, and every posture has a real spread — the greedy line can pay a chest or cost you a fifth of
// your health, and the careful line is usually small but is not always nothing. You are picking a shape of risk.
//
// The rolls live on the run but are NEVER sent to the client (publicRun exposes `awaiting`, which is the public
// half; the weighted tables sit on `run.rolls`). Rolling on the server at resolve time is also what makes the
// reload button worthless.
export async function offerChoice(ctx, run, d, floor, action, choice) {
    const { buyerId, saveRun, hurt, bank, finishRun, settle, state } = ctx;
    const ev = floor.event;
    if (action === "enter" || !run.awaiting) {
        // A resolved floor has nothing left to ask. Without this, a second `choose` arriving after the first
        // one cleared `awaiting` falls into this branch and builds a FRESH offer on a floor that has already
        // paid out — a free re-roll, and a stale offer left sitting on the run.
        if (floor.done) return { ok: true, ...(await state(buyerId)) };
        const built = buildOffer(run, d, ev);
        run.awaiting = built.offer;
        run.rolls = built.rolls;
        await saveRun(buyerId, run);
        return { ok: true, ...(await state(buyerId)) };
    }
    const offer = run.awaiting;
    const opt = (offer.options || []).find((o) => o.key === choice);
    if (!opt) return { ok: false, error: "bad_choice", ...(await state(buyerId)) };

    const parts = [];
    // Gold is spent from your REAL balance, atomically — a merchant that cannot take the money cannot sell.
    if (opt.cost) {
        const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, opt.cost]).catch(() => null);
        if (!paid) return { ok: false, error: "not_enough_gold", ...(await state(buyerId)) };
        await logCoin(buyerId, -opt.cost, "delve_merchant", { balanceAfter: paid.gold, meta: { dungeon: d.id } }).catch(() => {});
        parts.push(`-${opt.cost} gold`);
    }
    // A potion is a price too, and a sharper one than coin: you are spending the thing that keeps you alive.
    if (opt.potionCost) {
        if ((run.potions || 0) < opt.potionCost) return { ok: false, error: "no_potions", ...(await state(buyerId)) };
        run.potions -= opt.potionCost;
        parts.push(`-${opt.potionCost} potion`);
    }
    if (opt.hpCost) {
        const took = hurt(run, opt.hpCost);
        parts.push(`${took} health`);
        if (run.hp <= 0) { run.awaiting = null; run.rolls = null; floor.done = true; return finishRun(buyerId, run, { died: true }); }
    }

    const res = rollOutcome((run.rolls || {})[opt.key]);

    let healed = 0; let damage = 0;
    if (res?.heal) { healed = Math.min(run.maxHp - run.hp, Math.round(run.maxHp * res.heal)); run.hp += healed; parts.push(`+${healed} health`); }
    if (res?.damage) { damage = hurt(run, Math.round(run.maxHp * res.damage)); parts.push(`-${damage} health`); }
    if (res?.gold) { bank(run, { gold: res.gold }); parts.push(`+${res.gold} gold`); }
    if (res?.xp) { bank(run, { xp: res.xp }); parts.push(`+${res.xp} XP`); }
    if (res?.chest) { bank(run, { chest: res.chest }); parts.push(`a ${res.chest} chest`); }
    if (res?.potion) { run.potions += res.potion; parts.push(`+${res.potion} potion${res.potion === 1 ? "" : "s"}`); }

    run.awaiting = null;
    run.rolls = null;
    floor.done = true;
    run.log.push({ floor: run.floor, kind: ev.kind, text: `${opt.label} — ${parts.length ? parts.join(", ") : "nothing comes of it"}.` });
    if (run.hp <= 0) return finishRun(buyerId, run, { died: true });

    // The outcome gets its own beat, with the flavour line the roll carried. That line is the payoff of the
    // whole design: it is where you find out whether the posture you picked was the right one this time.
    const tone = damage ? "hurt" : (res?.chest || res?.gold) ? "loot" : res?.potion ? "gain" : healed ? "heal" : res?.xp ? "gain" : "none";
    return settle(buyerId, run, {
        tone, title: res?.title || (parts.length ? "Done" : "Nothing"),
        line: res?.line || "Nothing comes of it.",
        art: encounterArt(d.id, ev),
        gold: res?.gold || 0, xp: res?.xp || 0, chest: res?.chest || null,
        healed, damage, potion: res?.potion || 0,
    });
}

// ── THE OUTCOME TABLES ───────────────────────────────────────────────────────────────────────────────────────
// `O(weight, effects, line)` is one possible result of one option. An option's table always spreads: nothing in
// here is a certainty, which is exactly what stops a floor becoming a lever you pull for a known payout.
const O = (weight, effects, line) => ({ weight, ...effects, line });
function rollOutcome(table) {
    if (!Array.isArray(table) || !table.length) return null;
    const total = table.reduce((n, o) => n + (o.weight || 1), 0);
    let r = Math.random() * total;
    for (const o of table) { r -= o.weight || 1; if (r < 0) return o; }
    return table[table.length - 1];
}
const shuffled = (a) => { const c = [...a]; for (let i = c.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; } return c; };

// The offer itself. Costs and payouts scale off the dungeon, so a Spire merchant is not selling Warren prices.
// VARIANTS, not one offer per kind — otherwise one run teaches you every floor of this type forever.
function buildOffer(run, d, ev) {
    const g = (mult) => Math.round(((d.goldPer[0] + d.goldPer[1]) / 2) * mult);
    const x = (mult) => Math.round(((d.xpPer[0] + d.xpPer[1]) / 2) * mult);
    const big = d.minLevel >= 30 ? "gold" : "iron";
    const small = d.minLevel >= 30 ? "iron" : "wooden";
    const hp = (frac) => Math.round(run.maxHp * frac);

    const POOLS = {
        [KIND.merchant]: [
            {
                options: [
                    { key: "flask", label: "Buy the flask he swears by", cost: g(2), roll: [
                        O(58, { potion: 1 }, "It is what he said it was."),
                        O(22, { potion: 2 }, "He throws in a second one. He is in a mood."),
                        O(20, { xp: x(1) }, "Coloured water. You learn something about him, at least."),
                    ] },
                    { key: "cloth", label: "Buy whatever is under the cloth", cost: g(4), roll: [
                        O(40, { chest: big, xp: x(2) }, "He would not look at you while he took the money. Now you know why."),
                        O(32, { gold: g(5) }, "Someone else's takings, and he was glad to be rid of them."),
                        O(28, { xp: x(2) }, "A dead man's journal. Interesting. Not valuable."),
                    ] },
                    { key: "leave", label: "Keep your coin", roll: [
                        O(70, {}, "You walk past. He does not call after you."),
                        O(30, { xp: x(1) }, "He talks anyway, all the way down the passage. Some of it is useful."),
                    ] },
                ],
            },
            {
                options: [
                    { key: "two", label: "Take both flasks — cheaper together", cost: g(3.4), roll: [
                        O(70, { potion: 2 }, "Two, as agreed."),
                        O(18, { potion: 3 }, "He miscounts in your favour and does not correct it."),
                        O(12, { potion: 1, gold: g(1) }, "One is cracked. He gives some of it back."),
                    ] },
                    { key: "map", label: "Buy the torn map page", cost: g(2), roll: [
                        O(45, { gold: g(5) }, "It marks a cache two floors back. It was still there."),
                        O(33, { xp: x(3) }, "Half a map is still half a map."),
                        O(22, {}, "It is a map of somewhere else entirely."),
                    ] },
                    { key: "leave", label: "Keep your coin", roll: [O(100, {}, "You keep walking.")] },
                ],
            },
            {
                options: [
                    { key: "blood", label: "Pay the way he'd rather be paid", hpFrac: 0.12, roll: [
                        O(50, { potion: 2, xp: x(2) }, "He takes it, and he is generous about it."),
                        O(28, { chest: small, potion: 1 }, "He decides you have earned more than you asked for."),
                        O(22, { potion: 1 }, "He takes rather more than he gives."),
                    ] },
                    { key: "gold", label: "Insist on paying in coin", cost: g(5), roll: [
                        O(75, { potion: 2, xp: x(1) }, "He is disappointed, but he trades."),
                        O(25, { potion: 2, gold: g(1) }, "He haggles himself down out of habit."),
                    ] },
                    { key: "leave", label: "Back away slowly", roll: [O(100, {}, "He watches you the whole way out.")] },
                ],
            },
            {
                options: [
                    { key: "box", label: "Buy the sealed box", cost: g(3), roll: [
                        O(30, { chest: big, xp: x(2) }, "Whatever is in here, he did not know."),
                        O(28, { gold: g(4) }, "Coin, in a box, sold to you for less than the coin."),
                        O(42, { xp: x(1) }, "Sand and a note that says SORRY."),
                    ] },
                    { key: "flask", label: "Buy a flask instead", cost: g(2), roll: [
                        O(80, { potion: 1 }, "Straightforward, for once."),
                        O(20, { potion: 2 }, "He is trying to make up for the box."),
                    ] },
                    { key: "leave", label: "Keep your coin", roll: [O(100, {}, "The box is still there when you look back. So is he.")] },
                ],
            },
        ],

        [KIND.well]: [
            {
                options: [
                    { key: "toss", label: "Toss a coin in and listen", cost: g(1), roll: [
                        O(45, { gold: g(4), xp: x(1) }, "Something down there throws four back."),
                        O(25, { xp: x(2) }, "No splash. You think about that for a while."),
                        O(30, {}, "A splash. That is all."),
                    ] },
                    { key: "drink", label: "Cup your hands and drink", roll: [
                        O(42, { heal: 0.34 }, "Cold, clean, and better than it has any right to be."),
                        O(28, { heal: 0.14 }, "Brackish, but it does something."),
                        O(30, { damage: 0.13 }, "It goes down wrong and keeps going wrong."),
                    ] },
                    { key: "reach", label: "Lower yourself in after it", roll: [
                        O(28, { chest: big, gold: g(3) }, "Everything anyone ever threw in here, and nobody ever came for it."),
                        O(26, { gold: g(3) }, "A handful of coin and a very cold arm."),
                        O(46, { damage: 0.19 }, "The wall gives. You get out. Slowly."),
                    ] },
                ],
            },
            {
                options: [
                    { key: "deep", label: "Reach down as far as your arm goes", roll: [
                        O(33, { chest: big, xp: x(2) }, "Your fingers close on a handle. It comes up."),
                        O(25, { gold: g(4) }, "Coin, silt, and something with too many legs. You keep the coin."),
                        O(42, { damage: 0.17 }, "Something closes on your wrist first."),
                    ] },
                    { key: "look", label: "Just look for a while", roll: [
                        O(48, { xp: x(2) }, "You work out what this shaft was for. It was not water."),
                        O(22, { gold: g(2) }, "There is a coin on the ledge. Right there. At eye level."),
                        O(30, {}, "You look. It looks back. Nothing happens."),
                    ] },
                ],
            },
            {
                options: [
                    { key: "wish", label: "Make a wish and pay for it", cost: g(2), roll: [
                        O(40, { potion: 2 }, "Two full flasks come up on the rope. Nobody put them there."),
                        O(28, { heal: 0.3 }, "Nothing comes up. You feel better anyway."),
                        O(32, { damage: 0.1 }, "Something answers, and you wish it had not."),
                    ] },
                    { key: "listen", label: "Put your ear to the rim", roll: [
                        O(45, { xp: x(2) }, "Water, a long way down, and under it something counting."),
                        O(25, { heal: 0.12 }, "It is the first quiet you have had all run."),
                        O(30, {}, "Nothing. Which is its own kind of answer."),
                    ] },
                    { key: "leave", label: "Leave it alone", roll: [O(100, {}, "You leave it alone. It is a well.")] },
                ],
            },
        ],

        [KIND.shrine]: [
            {
                options: [
                    { key: "blood", label: "Open your hand over the basin", hpFrac: 0.15, roll: [
                        O(46, { gold: g(4), xp: x(3) }, "It takes it, and it pays."),
                        O(30, { gold: g(2), xp: x(2) }, "It takes it, and it pays a little."),
                        O(24, { chest: small, gold: g(3) }, "Something surfaces in the basin that was not in the basin."),
                    ] },
                    { key: "pray", label: "Kneel and say nothing", roll: [
                        O(52, { heal: 0.22 }, "The ache goes out of you."),
                        O(26, { xp: x(2) }, "You understand what this was built for. It is not comforting."),
                        O(22, {}, "You kneel. Nothing happens. You get up."),
                    ] },
                ],
            },
            {
                options: [
                    { key: "more", label: "Give it more than it asked for", hpFrac: 0.25, roll: [
                        O(44, { gold: g(6), xp: x(4), chest: small }, "It is not used to that. It overpays."),
                        O(34, { gold: g(3), xp: x(3) }, "It takes what you offered and settles up fairly."),
                        O(22, { potion: 2 }, "Two flasks are sitting in the basin when you look up."),
                    ] },
                    { key: "coin", label: "Leave a coin on the step instead", cost: g(2), roll: [
                        O(62, { heal: 0.25 }, "Accepted, apparently."),
                        O(38, { xp: x(2) }, "The coin is gone. Nothing else is different."),
                    ] },
                ],
            },
            {
                options: [
                    { key: "deep", label: "Drink until you have had enough", roll: [
                        O(48, { heal: 0.42 }, "You could stand up through a wall right now."),
                        O(28, { heal: 0.2 }, "Good, then abruptly not."),
                        O(24, { damage: 0.1 }, "You drink too much of it and it drinks some of you."),
                    ] },
                    { key: "fill", label: "Fill a flask and leave the rest", roll: [
                        O(58, { potion: 1 }, "It corks well and it is still warm."),
                        O(24, { potion: 1, heal: 0.12 }, "Enough for the flask and a mouthful."),
                        O(18, { heal: 0.16 }, "It will not keep. You drink what you can."),
                    ] },
                ],
            },
            {
                options: [
                    { key: "bathe", label: "Get all the way in", roll: [
                        O(46, { heal: 0.55 }, "You come out new."),
                        O(24, { heal: 0.24 }, "Cold enough to hurt, warm enough to help."),
                        O(30, { damage: 0.12 }, "Something in it does not want to be swum in."),
                    ] },
                    { key: "sip", label: "A careful mouthful", roll: [
                        O(66, { heal: 0.18 }, "Small, and it works."),
                        O(34, { xp: x(2) }, "You taste what is in it and understand this place a little better."),
                    ] },
                ],
            },
        ],

        [KIND.puzzle]: [
            // ── THE FORK. Three ways on, and NOTHING distinguishes them but a smell. The outcome tables are
            // SHUFFLED across the three doors every time, so there is no door that is always the good one and
            // no amount of play teaches you which to take. This is the only place the game hands you a flat
            // gamble, and it is deliberate: the fiction promises you cannot know, so the code must not either.
            {
                shuffle: true,
                options: [
                    { key: "a", label: "The one that smells of animal" },
                    { key: "b", label: "The one that smells of rain" },
                    { key: "c", label: "The one that smells of nothing at all" },
                ],
                rolls: [
                    [O(55, { gold: g(4), xp: x(2) }, "It opens into somewhere nobody has been."),
                     O(45, { chest: small, gold: g(2) }, "There is a body, and it is still carrying its pack.")],
                    [O(60, { heal: 0.25 }, "Clean air and running water. You rest a minute."),
                     O(40, { potion: 1, xp: x(1) }, "A dropped flask, unbroken, and a way through.")],
                    [O(58, { damage: 0.17, xp: x(2) }, "It narrows. Then it closes. You get out the hard way."),
                     O(42, { damage: 0.11 }, "It goes nowhere, and it takes a while to find that out.")],
                ],
            },
            {
                options: [
                    { key: "force", label: "Put your shoulder into it", roll: [
                        O(38, { chest: small, gold: g(2) }, "It gives all at once and so does what was behind it."),
                        O(24, { gold: g(3) }, "It gives. There is coin on the other side."),
                        O(38, { damage: 0.18 }, "It gives. So does something in your shoulder."),
                    ] },
                    { key: "study", label: "Sit with it a while first", roll: [
                        O(52, { xp: x(3) }, "You work out how it was meant to be opened, and open it."),
                        O(24, { xp: x(5), gold: g(2) }, "You work out what it was FOR, which is worth more."),
                        O(24, { xp: x(1) }, "You do not solve it. You learn something anyway."),
                    ] },
                ],
            },
            {
                options: [
                    { key: "answer", label: "Answer it", roll: [
                        O(55, { xp: x(4), gold: g(2) }, "Correct, apparently."),
                        O(22, { xp: x(2) }, "Close enough that it lets you through."),
                        O(23, { damage: 0.12 }, "Wrong, and it was listening carefully."),
                    ] },
                    { key: "silent", label: "Say nothing and keep walking", roll: [
                        O(55, {}, "It does not stop you. It does not help either."),
                        O(25, { xp: x(2) }, "You work out the answer three rooms later. Still counts."),
                        O(20, { gold: g(2) }, "Whatever asked it leaves something on the step for you."),
                    ] },
                ],
            },
            {
                options: [
                    { key: "feed", label: "Put a full flask into the slot", potionCost: 1, roll: [
                        O(45, { potion: 2, xp: x(2) }, "Two come back. It was a fair machine."),
                        O(28, { potion: 1, gold: g(4) }, "One flask and a great deal of coin."),
                        O(27, { xp: x(2) }, "It keeps the flask. You keep the lesson."),
                    ] },
                    { key: "buy", label: "Pay it in coin instead", cost: g(2), roll: [
                        O(72, { potion: 1 }, "A flask drops into the tray."),
                        O(28, { potion: 1, xp: x(1) }, "A flask, and the mechanism shows you how it works."),
                    ] },
                    { key: "walk", label: "Leave it running and walk on", roll: [
                        O(80, {}, "It is still going when the sound fades."),
                        O(20, { xp: x(1) }, "You look back once and understand it."),
                    ] },
                ],
            },
        ],
    };

    const kind = POOLS[ev.kind] ? ev.kind : KIND.puzzle;
    const pool = POOLS[kind];
    // A shrine flagged `bargain` in the catalog should read as one — bias it to the blood-price variants.
    const variant = ev.kind === KIND.shrine && ev.bargain
        ? pool[Math.floor(Math.random() * 2)]
        : pool[Math.floor(Math.random() * pool.length)];

    // Tables are assigned to buttons here, once, and stored. For a `shuffle` variant that assignment is random,
    // which is the entire point of the fork; for everything else each option keeps its own table.
    const tables = variant.shuffle ? shuffled(variant.rolls) : variant.options.map((o) => o.roll);
    const rolls = {};
    const options = variant.options.map((o, i) => {
        rolls[o.key] = tables[i];
        return {
            key: o.key,
            label: o.label,
            ...(o.cost ? { cost: o.cost } : {}),
            ...(o.potionCost ? { potionCost: o.potionCost } : {}),
            // A blood price is quoted in real health, so you can weigh it against the bar in front of you.
            ...(o.hpFrac ? { hpCost: hp(o.hpFrac) } : {}),
        };
    });
    const offer = { kind: ev.kind, title: ev.title, text: ev.text, art: encounterArt(d.id, ev), options };
    return { offer, rolls };
}

// ── ADVANCE ──────────────────────────────────────────────────────────────────────────────────────────────────
export async function advanceFloor(ctx, run, { outcome = null } = {}) {
    const { buyerId, saveRun, finishRun, state } = ctx;
    const floor = run.floors[run.floor - 1];
    if (floor) { floor.done = true; if (outcome) floor.outcome = outcome; }
    const wasBoss = floor?.event?.kind === KIND.boss;
    if (wasBoss || run.floor >= DELVE_FLOORS) return finishRun(buyerId, run, { cleared: wasBoss });
    run.floor += 1;
    // Everything that belonged to the floor you just left dies with it. `awaiting` used to survive the walk:
    // an unresolved merchant offer from floor three was still on the run when floor four dealt a fight, and the
    // client — which checks `awaiting` before `foe` — drew the Bloated Grub on the stage and the trapper's
    // prices in the card underneath. Two floors on screen at once.
    run.foe = null;
    run.awaiting = null;
    run.rolls = null;
    await saveRun(buyerId, run);
    return { ok: true, ...(await state(buyerId)) };
}

// ── FINISH ───────────────────────────────────────────────────────────────────────────────────────────────────
// Dying KEEPS everything banked so far. That was the brief, and it is what makes "one more floor" a real
// decision rather than an all-or-nothing gamble. Payout happens here and only here, and the run is stamped
// over:true in the same write, so a run can never pay twice.
export async function finishDelveRun(ctx, run, { died = false, cleared = false, fled = false } = {}) {
    const { buyerId, state } = ctx;
    const d = dungeonById(run.dungeonId);
    const gold = Math.max(0, Math.round(run.banked.gold || 0));
    const xp = Math.max(0, Math.round(run.banked.xp || 0));
    const chests = run.banked.chests || [];

    // Clearing pays a completion purse on top of what you carried out — the reason to risk the last floor.
    const bonusGold = cleared ? Math.round(((d.goldPer[0] + d.goldPer[1]) / 2) * 6) : 0;
    const bonusXp = cleared ? Math.round(((d.xpPer[0] + d.xpPer[1]) / 2) * 6) : 0;
    const totalGold = gold + bonusGold;
    const totalXp = xp + bonusXp;

    if (totalGold > 0) {
        const g = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, totalGold]).catch(() => null);
        await logCoin(buyerId, totalGold, "delve", { balanceAfter: g?.gold, meta: { dungeon: run.dungeonId, cleared } }).catch(() => {});
    }
    // gold: 0 is load-bearing — awardXp pays gold 1:1 with points otherwise, and the purse above IS the gold.
    if (totalXp > 0) await awardXp(buyerId, "delve_run", { points: totalXp, gold: 0 }).catch(() => {});
    if (chests.length) {
        const counts = {};
        for (const t of chests) counts[t] = (counts[t] || 0) + 1;
        await addChests(buyerId, counts, { source: "delve" }).catch(() => {});
    }

    const floorsDone = run.floors.filter((f) => f.done).length;
    const stats = await db.queryOne(
        `UPDATE mkt_delve
            SET run_json = $2::jsonb,
                runs_cleared = runs_cleared + $3,
                runs_died = runs_died + $4,
                floors_cleared = floors_cleared + $5,
                bosses_felled = bosses_felled + $3,
                deepest_floor = GREATEST(deepest_floor, $6),
                updated_at = NOW()
          WHERE buyer_id = $1
          RETURNING floors_cleared, bosses_felled`,
        [buyerId, JSON.stringify({ ...run, over: true, died, cleared, fled, foe: null, awaiting: null }),
            cleared ? 1 : 0, died ? 1 : 0, floorsDone, run.floor]
    ).catch(() => null);

    if (cleared) await grantEventBadge(buyerId, "delve_first_boss").catch(() => {});
    if ((Number(stats?.floors_cleared) || 0) >= 100) await grantEventBadge(buyerId, "delve_floors_100").catch(() => {});
    if ((Number(stats?.floors_cleared) || 0) >= 500) await grantEventBadge(buyerId, "delve_floors_500").catch(() => {});
    if ((Number(stats?.bosses_felled) || 0) >= 25) await grantEventBadge(buyerId, "delve_bosses_25").catch(() => {});
    if (cleared && (run.lowestHpFrac ?? 1) >= 0.5) await grantEventBadge(buyerId, "delve_flawless").catch(() => {});
    if (cleared && (run.potionsUsed || 0) === 0) await grantEventBadge(buyerId, "delve_no_potion").catch(() => {});
    // "All four" reads the activity log rather than adding a fifth counter — one query, no new column.
    if (cleared) {
        const beaten = await db.query(
            `SELECT DISTINCT meta->>'dungeon' AS d FROM mkt_activity_event WHERE buyer_id = $1 AND event = 'delve_clear'`, [buyerId]
        ).catch(() => []);
        const set = new Set(beaten.map((r) => r.d).filter(Boolean));
        set.add(run.dungeonId);
        if (set.size >= DUNGEONS.length) await grantEventBadge(buyerId, "delve_all_four").catch(() => {});
    }

    await trackActivity(buyerId, cleared ? "delve_clear" : "delve_end", {
        dungeon: run.dungeonId, floor: run.floor, died, fled, gold: totalGold, xp: totalXp, chests: chests.length,
    }).catch(() => {});
    await bumpQuestProgress(buyerId, "delve_floor", floorsDone).catch(() => {});
    await bumpTownQuest(buyerId, "delver_deep", floorsDone).catch(() => {});
    if (cleared) await bumpQuestProgress(buyerId, "delve_clear", 1).catch(() => {});

    return {
        ok: true,
        finished: { died, cleared, fled, floor: run.floor, gold: totalGold, xp: totalXp, bonusGold, bonusXp, chests },
        ...(await state(buyerId)),
    };
}
