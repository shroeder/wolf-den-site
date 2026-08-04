import "server-only";

import { db } from "@/lib/db";
import { awardXp } from "@/lib/marketplace/xp.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { addChests } from "@/lib/marketplace/chests.js";
import { grantEventBadge } from "@/lib/marketplace/badges.js";
import { bumpQuestProgress } from "@/lib/marketplace/quests.js";
import { bumpTownQuest } from "@/lib/marketplace/town-quests.js";
import { DELVE_FLOORS, DUNGEONS, KIND, dungeonById } from "@/lib/marketplace/delve-catalog.js";

// ── DELVE: CHOICES, ADVANCING AND THE PAYOUT ─────────────────────────────────────────────────────────────────
// Split out of delves.js purely for size: that file owns the run (start, state, strike, potion) and this one
// owns what happens when a floor asks you a question, and what happens when the run ends. They share the run
// object and nothing else.

// ── CHOICE FLOORS ────────────────────────────────────────────────────────────────────────────────────────────
// Merchants, wells, shrines and puzzles ask a question and wait. The offer is generated ONCE and stored on the
// run — regenerating it per render would let you reload until the well offered a better deal.
export async function offerChoice(ctx, run, d, floor, action, choice) {
    const { buyerId, saveRun, hurt, bank, finishRun, advance, state } = ctx;
    const ev = floor.event;
    if (action === "enter" || !run.awaiting) {
        run.awaiting = buildOffer(run, d, ev);
        await saveRun(buyerId, run);
        return { ok: true, ...(await state(buyerId)) };
    }
    const offer = run.awaiting;
    const opt = (offer.options || []).find((o) => o.key === choice);
    if (!opt) return { ok: false, error: "bad_choice", ...(await state(buyerId)) };

    let line = opt.label;
    // Gold is spent from your REAL balance, atomically — a merchant that cannot take the money cannot sell.
    if (opt.cost) {
        const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, opt.cost]).catch(() => null);
        if (!paid) return { ok: false, error: "not_enough_gold", ...(await state(buyerId)) };
        await logCoin(buyerId, -opt.cost, "delve_merchant", { balanceAfter: paid.gold, meta: { dungeon: d.id } }).catch(() => {});
        line = `${opt.label} (-${opt.cost} gold)`;
    }
    if (opt.hpCost) {
        const took = hurt(run, opt.hpCost);
        line += ` - it takes ${took} health`;
        if (run.hp <= 0) { run.awaiting = null; floor.done = true; return finishRun(buyerId, run, { died: true }); }
    }
    // A gamble resolves HERE, on the server, so the reload button is worthless.
    let res = opt.result;
    if (opt.gamble) res = Math.random() < opt.gamble.chance ? opt.gamble.win : opt.gamble.lose;

    if (res?.heal) { const h = Math.min(run.maxHp - run.hp, Math.round(run.maxHp * res.heal)); run.hp += h; line += ` - recovered ${h} health`; }
    if (res?.damage) { const t = hurt(run, Math.round(run.maxHp * res.damage)); line += ` - ${t} damage`; }
    if (res?.gold) { bank(run, { gold: res.gold }); line += ` - +${res.gold} gold`; }
    if (res?.xp) { bank(run, { xp: res.xp }); line += ` - +${res.xp} XP`; }
    if (res?.chest) { bank(run, { chest: res.chest }); line += ` - a ${res.chest} chest`; }
    if (res?.potion) { run.potions += res.potion; line += ` - +${res.potion} potion`; }
    if (res?.nothing) line += " - nothing comes of it";

    run.awaiting = null;
    floor.done = true;
    run.log.push({ floor: run.floor, kind: ev.kind, text: line });
    if (run.hp <= 0) return finishRun(buyerId, run, { died: true });
    return advance(buyerId, run, { outcome: res || {} });
}

// The offer itself. Costs and payouts scale off the dungeon, so a Spire merchant is not selling Warren prices.
//
// VARIANTS, not one offer per kind. The first cut gave every merchant the same three buttons and every well the
// same two, which meant that after one run you knew exactly what a merchant floor was worth and the choice
// stopped being a choice. Each kind now draws from a small pool, so "a merchant" is a question rather than a
// vending machine — and the pick is stored on the run, so reloading cannot shop for a better one.
//
// Every gamble is honest about its odds in the label. A blind coin flip is not an interesting decision; a
// stated 55% with a real downside is.
function buildOffer(run, d, ev) {
    const g = (mult) => Math.round(((d.goldPer[0] + d.goldPer[1]) / 2) * mult);
    const x = (mult) => Math.round(((d.xpPer[0] + d.xpPer[1]) / 2) * mult);
    const bigChest = d.minLevel >= 30 ? "gold" : "iron";
    const smallChest = d.minLevel >= 30 ? "iron" : "wooden";
    const leave = { key: "leave", label: "Walk on", result: { nothing: true } };

    const POOLS = {
        [KIND.merchant]: [
            [
                { key: "potion", label: "Buy a potion", cost: g(2), result: { potion: 1 } },
                { key: "relic", label: "Buy whatever is under the cloth", cost: g(4), result: { xp: x(3), chest: bigChest } },
                { key: "leave", label: "Keep your coin", result: { nothing: true } },
            ],
            [
                { key: "two", label: "Buy two potions, cheaper together", cost: g(3.4), result: { potion: 2 } },
                { key: "map", label: "Buy a torn map page", cost: g(2), result: { gold: g(4), xp: x(1) } },
                { key: "leave", label: "Keep your coin", result: { nothing: true } },
            ],
            [
                // A merchant who only deals in risk. The 50% is stated plainly on the button.
                { key: "gamble", label: "Buy the sealed box (50% — could be anything)", cost: g(3),
                    gamble: { chance: 0.5, win: { chest: bigChest, xp: x(3) }, lose: { nothing: true } } },
                { key: "potion", label: "Buy a potion instead", cost: g(2), result: { potion: 1 } },
                { key: "leave", label: "Keep your coin", result: { nothing: true } },
            ],
            [
                { key: "trade", label: "Trade blood for stock — he does not want coin", hpCost: Math.round(run.maxHp * 0.12), result: { potion: 2, xp: x(2) } },
                { key: "buy", label: "Insist on paying in gold", cost: g(5), result: { potion: 2, xp: x(2) } },
                { key: "leave", label: "Back away slowly", result: { nothing: true } },
            ],
        ],
        [KIND.well]: [
            [
                { key: "toss", label: "Toss in a coin (62% — a real return)", cost: g(1),
                    gamble: { chance: 0.62, win: { gold: g(4), xp: x(2) }, lose: { nothing: true } } },
                { key: "drink", label: "Drink from it (55% — heals, or hurts)",
                    gamble: { chance: 0.55, win: { heal: 0.35 }, lose: { damage: 0.14 } } },
                { key: "leave", label: "Leave it be", result: { nothing: true } },
            ],
            [
                { key: "deep", label: "Reach right down into it (40% — but it pays)",
                    gamble: { chance: 0.40, win: { chest: bigChest, gold: g(3) }, lose: { damage: 0.20 } } },
                { key: "coin", label: "Just toss a coin in (70%)", cost: g(1.5),
                    gamble: { chance: 0.70, win: { gold: g(3), xp: x(1) }, lose: { nothing: true } } },
                { key: "leave", label: "Leave it be", result: { nothing: true } },
            ],
            [
                { key: "wish", label: "Make a wish (60% — for a flask)", cost: g(2),
                    gamble: { chance: 0.60, win: { potion: 2 }, lose: { damage: 0.10 } } },
                { key: "listen", label: "Listen at the rim", result: { xp: x(1) } },
                { key: "leave", label: "Leave it be", result: { nothing: true } },
            ],
        ],
        [KIND.shrine]: [
            [
                { key: "offer", label: "Offer your blood", hpCost: Math.round(run.maxHp * 0.15), result: { gold: g(3), xp: x(3) } },
                { key: "pray", label: "Just pray", result: { heal: 0.2 } },
                leave,
            ],
            [
                { key: "bleed", label: "Give it more than it asked", hpCost: Math.round(run.maxHp * 0.25), result: { gold: g(5), xp: x(4), chest: smallChest } },
                { key: "token", label: "Leave a coin instead", cost: g(2), result: { heal: 0.25 } },
                leave,
            ],
            [
                { key: "drink", label: "Drink deep", result: { heal: 0.4 } },
                { key: "fill", label: "Fill a flask instead", result: { potion: 1 } },
                leave,
            ],
            [
                { key: "bathe", label: "Bathe in it (65% — it is very cold)",
                    gamble: { chance: 0.65, win: { heal: 0.55 }, lose: { damage: 0.12 } } },
                { key: "sip", label: "A careful sip", result: { heal: 0.18 } },
                leave,
            ],
        ],
        [KIND.puzzle]: [
            [
                { key: "bold", label: "Take the risky way (55%)",
                    gamble: { chance: 0.55, win: { gold: g(3), xp: x(2) }, lose: { damage: 0.16 } } },
                { key: "safe", label: "Take the long way", result: { xp: x(1) } },
            ],
            [
                { key: "force", label: "Force it open (45% — and it may bite)",
                    gamble: { chance: 0.45, win: { chest: smallChest, gold: g(2) }, lose: { damage: 0.18 } } },
                { key: "study", label: "Study it properly first", result: { xp: x(2) } },
            ],
            [
                { key: "answer", label: "Answer it (70%)",
                    gamble: { chance: 0.70, win: { xp: x(4), gold: g(2) }, lose: { damage: 0.10 } } },
                { key: "silent", label: "Say nothing and move on", result: { nothing: true } },
            ],
            [
                { key: "swap", label: "Take the offered trade — a potion for coin", cost: g(2), result: { potion: 1 } },
                { key: "gamble", label: "Put a potion in instead (60% — doubles it back)",
                    gamble: { chance: 0.60, win: { potion: 2, xp: x(2) }, lose: { nothing: true } } },
                { key: "safe", label: "Take the long way", result: { xp: x(1) } },
            ],
        ],
    };

    const kind = POOLS[ev.kind] ? ev.kind : KIND.puzzle;
    // A shrine flagged `bargain` in the catalog should read as one — bias it to the blood-price variants.
    const pool = POOLS[kind];
    const idx = ev.kind === KIND.shrine && ev.bargain
        ? [0, 1][Math.floor(Math.random() * 2)]
        : Math.floor(Math.random() * pool.length);
    const art = { [KIND.merchant]: "ev-merchant", [KIND.well]: "ev-well", [KIND.shrine]: "ev-shrine", [KIND.puzzle]: "ev-puzzle" }[kind];
    return { kind: ev.kind, title: ev.title, text: ev.text, art: `/images/delves/${art}.png`, options: pool[idx] };
}

// ── ADVANCE ──────────────────────────────────────────────────────────────────────────────────────────────────
export async function advanceFloor(ctx, run, { outcome = null } = {}) {
    const { buyerId, saveRun, finishRun, state } = ctx;
    const floor = run.floors[run.floor - 1];
    if (floor) { floor.done = true; if (outcome) floor.outcome = outcome; }
    const wasBoss = floor?.event?.kind === KIND.boss;
    if (wasBoss || run.floor >= DELVE_FLOORS) return finishRun(buyerId, run, { cleared: wasBoss });
    run.floor += 1;
    run.foe = null;
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
