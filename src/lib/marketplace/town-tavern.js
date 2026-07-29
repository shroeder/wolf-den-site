import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";
import { bumpTownQuest } from "@/lib/marketplace/town-quests.js";
import { awardXp } from "@/lib/marketplace/xp.js";
import { getPetSpriteData } from "@/lib/marketplace/pet-sprite.js";
import { getTownBonuses } from "@/lib/marketplace/town-projects.js";

const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(Number(v)) ? Number(v) : lo));

// Mark you as walking around INSIDE the tavern (presence zone = 'tavern') at x,y so other patrons see you live.
export async function moveTavern(buyerId, { x, y, facing } = {}) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const cx = clampN(x, 4, 96), cy = clampN(y, 55, 90), f = facing === -1 ? -1 : 1;
    await db.query(
        `INSERT INTO mkt_town_presence (buyer_id, x, y, facing, zone, updated_at) VALUES ($1, $2, $3, $4, 'tavern', NOW())
         ON CONFLICT (buyer_id) DO UPDATE SET x = $2, y = $3, facing = $4, zone = 'tavern', updated_at = NOW()`,
        [buyerId, cx, cy, f]
    ).catch(() => {});
    return { ok: true };
}

// Everyone ELSE currently inside the tavern (live), as avatar data for the walkable room — with their recent
// chat bubble / emote (reuses the shared mkt_town_chat store) so social banter shows up in real time.
async function tavernOccupants(selfId) {
    const rows = await db.query(
        `SELECT p.buyer_id, p.x, p.y, p.facing, b.display_name, b.alias, b.avatar_sprite_url, b.featured_collectible
           FROM mkt_town_presence p JOIN mkt_buyer b ON b.id = p.buyer_id
          WHERE p.zone = 'tavern' AND p.updated_at > NOW() - INTERVAL '90 seconds' AND p.buyer_id <> $1`,
        [selfId]
    ).catch(() => []);
    if (!rows.length) return [];
    const ids = rows.map((r) => r.buyer_id);
    const [petSprites, chats] = await Promise.all([
        getPetSpriteData().catch(() => ({})),
        db.query(`SELECT DISTINCT ON (buyer_id) buyer_id, body FROM mkt_town_chat WHERE buyer_id = ANY($1) AND created_at > NOW() - INTERVAL '8 seconds' ORDER BY buyer_id, created_at DESC`, [ids]).catch(() => []),
    ]);
    const chatBy = Object.fromEntries((chats || []).map((c) => [c.buyer_id, c.body]));
    return rows.map((r) => ({
        id: r.buyer_id, name: r.display_name || (r.alias ? `@${r.alias}` : "a wolf"), alias: r.alias || null,
        sprite: r.avatar_sprite_url || null, x: Number(r.x), y: Number(r.y), facing: Number(r.facing) === -1 ? -1 : 1,
        pet: petSprites[r.featured_collectible] || null, chat: chatBy[r.buyer_id] || null,
    }));
}

const PINT_XP = 40, PINT_GOLD = 15;   // the daily Hearty Pint reward
const ROUND_COST = 400;               // "buy a round" gold sink
const ROUND_GIFT_XP = 15;             // each patron currently around gets a small cheers
const ROUND_HOST_XP = 60;             // the buyer's own toast

// ── THE TAVERN ──────────────────────────────────────────────────────────────────────────────────────────────
// A cozy, rowdy room you step INTO from the plaza. The barkeep runs three things: live RUMORS (in-character game
// news), a press-your-luck DICE game (gold gamble — opt-in, capped, server-authoritative), and a DAILY PINT
// (once/day, cosmetic cheer). All gold moves go through the guarded spend/credit + coin ledger.

// ── Wolf's Gambit: 3-dice poker vs the house Gambler. Ante → roll 3 → hold/reroll once → best hand wins. ──
const GAMBIT_MIN_BET = 50;
const GAMBIT_MAX_BET = 2000;
const GAMBIT_DAILY_CAP = 5; // most Wolf's Gambit rounds a member can START per store-local (Chicago) day
const d6 = () => 1 + Math.floor(Math.random() * 6);
const rollThree = () => [d6(), d6(), d6()];

// How many Gambit rounds you've STARTED today (store-local day) — counted off the ante ledger entries so no
// extra column is needed. Powers the 5/day cap.
async function gambitPlaysToday(buyerId) {
    const row = await db.queryOne(
        `SELECT COUNT(*)::int AS n FROM mkt_coin_event
          WHERE buyer_id = $1 AND reason = 'tavern_gambit_bet'
            AND (created_at AT TIME ZONE 'America/Chicago')::date = (NOW() AT TIME ZONE 'America/Chicago')::date`,
        [buyerId]
    ).catch(() => null);
    return Number(row?.n || 0);
}

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
    const [row, gold, rumors, playsToday] = await Promise.all([
        db.queryOne(
            `SELECT dice_active, dice_state, rounds,
                    (last_drink_day = (NOW() AT TIME ZONE 'America/Chicago')::date) AS drank_today, drinks
               FROM mkt_tavern WHERE buyer_id = $1`, [buyerId]
        ).catch(() => null),
        db.queryOne(`SELECT gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        getRumors().catch(() => []),
        gambitPlaysToday(buyerId).catch(() => 0),
    ]);
    const st = row?.dice_active ? row.dice_state : null;
    const playsLeft = Math.max(0, GAMBIT_DAILY_CAP - playsToday);
    return {
        gold: Number(gold?.gold || 0),
        dice: st
            ? { active: true, bet: st.bet, dice: st.dice, rerolled: Boolean(st.rerolled), hand: scoreHand(st.dice).label, minBet: GAMBIT_MIN_BET, maxBet: GAMBIT_MAX_BET, playsLeft, dailyCap: GAMBIT_DAILY_CAP }
            : { active: false, minBet: GAMBIT_MIN_BET, maxBet: GAMBIT_MAX_BET, playsLeft, dailyCap: GAMBIT_DAILY_CAP },
        dailyPint: { available: !row?.drank_today, drinks: row?.drinks || 0, xp: PINT_XP, gold: PINT_GOLD },
        round: { cost: ROUND_COST, bought: row?.rounds || 0, hostXp: ROUND_HOST_XP, giftXp: ROUND_GIFT_XP },
        occupants: await tavernOccupants(buyerId).catch(() => []),
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
    // Cap: at most GAMBIT_DAILY_CAP new rounds per store-local day (an in-progress hand can still be resolved).
    if ((await gambitPlaysToday(buyerId)) >= GAMBIT_DAILY_CAP) return { ok: false, error: "daily_limit" };
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
    let payout = outcome === "win" ? (jackpot ? bet * 3 : bet * 2) : outcome === "push" ? bet : 0;
    // The Tavern town-upgrade pours extra gold into a WIN (+5% per level); a push just returns the ante.
    if (outcome === "win") {
        const diceGoldPct = (await getTownBonuses(Date.now()).catch(() => ({}))).diceGoldPct || 0;
        if (diceGoldPct) payout = Math.round(payout * (1 + diceGoldPct / 100));
    }
    let gold = null;
    if (payout > 0) {
        const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, payout]).catch(() => null);
        await logCoin(buyerId, payout, "tavern_gambit_win", { balanceAfter: paid?.gold, meta: { outcome, bet } }).catch(() => {});
        gold = Number(paid?.gold ?? 0);
    }
    if (outcome === "win") bumpTownQuest(buyerId, "patron", 1).catch(() => {});
    return { ok: true, outcome, bet, payout, jackpot, player: { dice: playerDice, hand: ph.label }, gambler: { dice: gamblerDice, hand: gh.label }, gold };
}

// The daily Hearty Pint — once per store-local day. Now a REAL reward (XP + a little gold), not just cosmetic.
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
    await awardXp(buyerId, "tavern_pint", { points: PINT_XP, gold: PINT_GOLD, dedupeKey: `pint:${buyerId}:${Date.now()}` }).catch(() => {});
    bumpTownQuest(buyerId, "patron", 1).catch(() => {});
    const drinks = (await db.queryOne(`SELECT drinks FROM mkt_tavern WHERE buyer_id = $1`, [buyerId]).catch(() => null))?.drinks || 1;
    return { ok: true, drinks, xp: PINT_XP, gold: PINT_GOLD };
}

// Buy a round for the house: a gold sink that spreads a little cheer. Every patron who's been around the Den
// lately gets a small XP toast, you get a bigger one + a lifetime rounds count (for a future "Generous Soul"
// badge). (Recipients = recently-present members; scopes to just-the-tavern once presence lands.)
export async function buyRound(buyerId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, ROUND_COST]).catch(() => null);
    if (!paid) return { ok: false, error: "insufficient_gold" };
    await logCoin(buyerId, -ROUND_COST, "tavern_round", { balanceAfter: paid.gold }).catch(() => {});
    const rows = await db.query(`SELECT buyer_id FROM mkt_town_presence WHERE updated_at > NOW() - INTERVAL '5 minutes' AND buyer_id <> $1 LIMIT 25`, [buyerId]).catch(() => []);
    for (const r of rows) await awardXp(r.buyer_id, "tavern_cheers", { points: ROUND_GIFT_XP, gold: 0, dedupeKey: `cheers:${r.buyer_id}:${Date.now()}` }).catch(() => {});
    await awardXp(buyerId, "tavern_host", { points: ROUND_HOST_XP, gold: 0 }).catch(() => {});
    bumpTownQuest(buyerId, "patron", 1).catch(() => {});
    const row = await db.queryOne(
        `INSERT INTO mkt_tavern (buyer_id, rounds, updated_at) VALUES ($1, 1, NOW())
         ON CONFLICT (buyer_id) DO UPDATE SET rounds = COALESCE(mkt_tavern.rounds, 0) + 1, updated_at = NOW() RETURNING rounds`,
        [buyerId]
    ).catch(() => null);
    return { ok: true, recipients: rows.length, cost: ROUND_COST, hostXp: ROUND_HOST_XP, giftXp: ROUND_GIFT_XP, rounds: row?.rounds || 1, gold: Number(paid.gold) };
}
