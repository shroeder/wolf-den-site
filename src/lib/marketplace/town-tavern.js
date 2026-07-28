import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";
import { bumpTownQuest } from "@/lib/marketplace/town-quests.js";

// ── THE TAVERN ──────────────────────────────────────────────────────────────────────────────────────────────
// A cozy, rowdy room you step INTO from the plaza. The barkeep runs three things: live RUMORS (in-character game
// news), a press-your-luck DICE game (gold gamble — opt-in, capped, server-authoritative), and a DAILY PINT
// (once/day, cosmetic cheer). All gold moves go through the guarded spend/credit + coin ledger.

// ── Wolf's Gambit: 3-dice poker vs the house Gambler. Ante → roll 3 → hold/reroll once → best hand wins. ──
const GAMBIT_MIN_BET = 50;
const GAMBIT_MAX_BET = 2000;
const d6 = () => 1 + Math.floor(Math.random() * 6);
const rollThree = () => [d6(), d6(), d6()];

// Rank a 3-die hand → { rank, tie[], label }. rank: 4 three-of-a-kind > 3 straight > 2 pair > 1 high roll.
function scoreHand(dice) {
    const desc = [...dice].sort((a, b) => b - a);
    const counts = {};
    for (const d of dice) counts[d] = (counts[d] || 0) + 1;
    const trip = Object.keys(counts).find((k) => counts[k] === 3);
    if (trip) return { rank: 4, tie: [Number(trip)], label: `Three ${trip}s!` };
    const uniq = new Set(dice);
    if (uniq.size === 3 && Math.max(...dice) - Math.min(...dice) === 2) return { rank: 3, tie: [Math.max(...dice)], label: `Straight ${[...dice].sort((a, b) => a - b).join("-")}` };
    const pair = Object.keys(counts).find((k) => counts[k] === 2);
    if (pair) { const kicker = dice.find((d) => d !== Number(pair)); return { rank: 2, tie: [Number(pair), kicker], label: `Pair of ${pair}s` }; }
    return { rank: 1, tie: desc, label: `High roll (${desc[0]})` };
}
function cmpHand(a, b) {
    if (a.rank !== b.rank) return a.rank - b.rank;
    for (let i = 0; i < 3; i += 1) { const d = (a.tie[i] || 0) - (b.tie[i] || 0); if (d) return d; }
    return 0;
}
// The Gambler plays too: rolls 3, then rerolls anything ≤2 once (a simple greedy AI) — balances the reroll
// the player gets, so the table isn't wildly player-favored.
function gamblerRoll() { return rollThree().map((d) => (d <= 2 ? d6() : d)); }

// Rotating tavern flavor + a couple of cheap live nuggets — the barkeep's gossip.
const FLAVOR = [
    "🎵 \"The bard's in fine voice tonight — mind the rowdy lot in the corner.\"",
    "🍺 \"First round's always the best round,\" the keeper says with a wink.",
    "🌙 \"Bandits have been bold of late... keep your gold close, friend.\"",
    "🎲 \"Feeling lucky? The dice have been running hot at that table.\"",
    "🔥 \"Pull up a stool by the fire, you look half-frozen.\"",
    "🗺️ \"Heard tell of treasure out past the docks. Rumors, mostly.\"",
];

async function getRumors() {
    const lines = [];
    const [ev, top] = await Promise.all([
        db.queryOne(`SELECT name FROM mkt_town_event WHERE status = 'active' LIMIT 1`).catch(() => null),
        db.queryOne(`SELECT display_name, alias FROM mkt_buyer WHERE alias IS NOT NULL AND COALESCE(xp,0) > 0 ORDER BY xp DESC LIMIT 1`).catch(() => null),
    ]);
    if (ev) lines.push(`🗡️ \"Grab your blade — a ${ev.name} is tearing through the plaza RIGHT NOW!\"`);
    if (top) lines.push(`🏆 \"They say ${top.display_name || (top.alias ? `@${top.alias}` : "some wolf")} is the strongest in the whole pack these days.\"`);
    lines.push(FLAVOR[Math.floor(Math.random() * FLAVOR.length)]);
    return lines;
}

// Full tavern state for the interior screen: your gold, dice session, daily-pint availability, rumors.
export async function getTavernState(buyerId) {
    if (!buyerId) return null;
    const [row, gold, rumors] = await Promise.all([
        db.queryOne(
            `SELECT dice_active, dice_state,
                    (last_drink_day = (NOW() AT TIME ZONE 'America/Chicago')::date) AS drank_today, drinks
               FROM mkt_tavern WHERE buyer_id = $1`, [buyerId]
        ).catch(() => null),
        db.queryOne(`SELECT gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        getRumors().catch(() => []),
    ]);
    const st = row?.dice_active ? row.dice_state : null;
    return {
        gold: Number(gold?.gold || 0),
        dice: st
            ? { active: true, bet: st.bet, dice: st.dice, rerolled: Boolean(st.rerolled), hand: scoreHand(st.dice).label, minBet: GAMBIT_MIN_BET, maxBet: GAMBIT_MAX_BET }
            : { active: false, minBet: GAMBIT_MIN_BET, maxBet: GAMBIT_MAX_BET },
        dailyPint: { available: !row?.drank_today, drinks: row?.drinks || 0 },
        rumors,
    };
}

// Ante up: guarded gold spend, roll your opening 3 dice, open a hand. Returns your dice (reroll not yet used).
export async function gambitStart(buyerId, bet) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const b = Math.floor(Number(bet) || 0);
    if (b < GAMBIT_MIN_BET || b > GAMBIT_MAX_BET) return { ok: false, error: "bad_bet" };
    const cur = await db.queryOne(`SELECT dice_active FROM mkt_tavern WHERE buyer_id = $1`, [buyerId]).catch(() => null);
    if (cur?.dice_active) return { ok: false, error: "already_playing" };
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, b]).catch(() => null);
    if (!paid) return { ok: false, error: "insufficient_gold" };
    await logCoin(buyerId, -b, "tavern_gambit_bet", { balanceAfter: paid.gold }).catch(() => {});
    const dice = rollThree();
    const state = { bet: b, dice, rerolled: false };
    await db.query(
        `INSERT INTO mkt_tavern (buyer_id, dice_active, dice_state, updated_at) VALUES ($1, TRUE, $2::jsonb, NOW())
         ON CONFLICT (buyer_id) DO UPDATE SET dice_active = TRUE, dice_state = $2::jsonb, updated_at = NOW()`,
        [buyerId, JSON.stringify(state)]
    );
    return { ok: true, bet: b, dice, hand: scoreHand(dice).label, gold: Number(paid.gold) };
}

// Use your ONE reroll: keep the dice flagged in `hold` (3 booleans), reroll the rest. Returns the new dice.
export async function gambitReroll(buyerId, hold) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const row = await db.queryOne(`SELECT dice_active, dice_state FROM mkt_tavern WHERE buyer_id = $1`, [buyerId]).catch(() => null);
    const st = row?.dice_active ? row.dice_state : null;
    if (!st) return { ok: false, error: "no_game" };
    if (st.rerolled) return { ok: false, error: "already_rerolled" };
    const keep = Array.isArray(hold) ? hold : [false, false, false];
    const dice = st.dice.map((d, i) => (keep[i] ? d : d6()));
    await db.query(`UPDATE mkt_tavern SET dice_state = $2::jsonb, updated_at = NOW() WHERE buyer_id = $1`, [buyerId, JSON.stringify({ ...st, dice, rerolled: true })]);
    return { ok: true, dice, hand: scoreHand(dice).label };
}

// Lay it down: the Gambler rolls his hand, compare, pay out. Win = 2× bet (3× on three-of-a-kind), push = bet
// back, lose = nothing. Atomic claim so a hand pays at most once.
export async function gambitResolve(buyerId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    // Claim the hand by flipping dice_active (RETURNING still hands back the state row we're resolving), then
    // clear dice_state afterward.
    const row = await db.queryOne(`UPDATE mkt_tavern SET dice_active = FALSE, updated_at = NOW() WHERE buyer_id = $1 AND dice_active = TRUE RETURNING dice_state`, [buyerId]).catch(() => null);
    const st = row?.dice_state;
    if (!st) return { ok: false, error: "no_game" };
    await db.query(`UPDATE mkt_tavern SET dice_state = NULL WHERE buyer_id = $1`, [buyerId]).catch(() => {});
    const bet = st.bet;
    const playerDice = st.dice;
    const gamblerDice = gamblerRoll();
    const ph = scoreHand(playerDice), gh = scoreHand(gamblerDice);
    const c = cmpHand(ph, gh);
    const jackpot = c > 0 && ph.rank === 4;
    const outcome = c > 0 ? "win" : c === 0 ? "push" : "lose";
    const payout = outcome === "win" ? (jackpot ? bet * 3 : bet * 2) : outcome === "push" ? bet : 0;
    let gold = null;
    if (payout > 0) {
        const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, payout]).catch(() => null);
        await logCoin(buyerId, payout, "tavern_gambit_win", { balanceAfter: paid?.gold, meta: { outcome, bet } }).catch(() => {});
        gold = Number(paid?.gold ?? 0);
    }
    if (outcome === "win") bumpTownQuest(buyerId, "patron", 1).catch(() => {});
    return { ok: true, outcome, bet, payout, jackpot, player: { dice: playerDice, hand: ph.label }, gambler: { dice: gamblerDice, hand: gh.label }, gold };
}

// The daily pint — once per store-local day. Cosmetic cheer (tracks a lifetime count for a future badge).
export async function claimDailyPint(buyerId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const row = await db.queryOne(`SELECT (last_drink_day = (NOW() AT TIME ZONE 'America/Chicago')::date) AS today FROM mkt_tavern WHERE buyer_id = $1`, [buyerId]).catch(() => null);
    if (row?.today) return { ok: false, error: "already" };
    await db.query(
        `INSERT INTO mkt_tavern (buyer_id, last_drink_day, drinks, updated_at)
         VALUES ($1, (NOW() AT TIME ZONE 'America/Chicago')::date, 1, NOW())
         ON CONFLICT (buyer_id) DO UPDATE SET last_drink_day = (NOW() AT TIME ZONE 'America/Chicago')::date, drinks = mkt_tavern.drinks + 1, updated_at = NOW()`,
        [buyerId]
    );
    bumpTownQuest(buyerId, "patron", 1).catch(() => {});
    const drinks = (await db.queryOne(`SELECT drinks FROM mkt_tavern WHERE buyer_id = $1`, [buyerId]).catch(() => null))?.drinks || 1;
    return { ok: true, drinks };
}
