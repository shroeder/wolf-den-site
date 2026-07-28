import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";

// ── THE TAVERN ──────────────────────────────────────────────────────────────────────────────────────────────
// A cozy, rowdy room you step INTO from the plaza. The barkeep runs three things: live RUMORS (in-character game
// news), a press-your-luck DICE game (gold gamble — opt-in, capped, server-authoritative), and a DAILY PINT
// (once/day, cosmetic cheer). All gold moves go through the guarded spend/credit + coin ledger.

const DICE_MIN_BET = 10;
const DICE_MAX_BET = 1000;
const DICE_MULT = 1.18;      // pot grows this much per surviving roll (~gentle house edge from busts)
const DICE_BUST_MAX = 1;     // a die roll of 1 busts you
const DICE_MAX_ROLLS = 8;    // auto-cash after this many survives

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
            `SELECT dice_pot, dice_rolls, dice_active,
                    (last_drink_day = (NOW() AT TIME ZONE 'America/Chicago')::date) AS drank_today, drinks
               FROM mkt_tavern WHERE buyer_id = $1`, [buyerId]
        ).catch(() => null),
        db.queryOne(`SELECT gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        getRumors().catch(() => []),
    ]);
    return {
        gold: Number(gold?.gold || 0),
        dice: { active: Boolean(row?.dice_active), pot: row?.dice_pot || 0, rolls: row?.dice_rolls || 0, minBet: DICE_MIN_BET, maxBet: DICE_MAX_BET, mult: DICE_MULT },
        dailyPint: { available: !row?.drank_today, drinks: row?.drinks || 0 },
        rumors,
    };
}

// Place a bet: guarded gold spend, open a dice session with the bet as the starting pot.
export async function startDice(buyerId, bet) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const b = Math.floor(Number(bet) || 0);
    if (b < DICE_MIN_BET || b > DICE_MAX_BET) return { ok: false, error: "bad_bet" };
    const cur = await db.queryOne(`SELECT dice_active FROM mkt_tavern WHERE buyer_id = $1`, [buyerId]).catch(() => null);
    if (cur?.dice_active) return { ok: false, error: "already_playing" };
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, b]).catch(() => null);
    if (!paid) return { ok: false, error: "insufficient_gold" };
    await logCoin(buyerId, -b, "tavern_dice_bet", { balanceAfter: paid.gold }).catch(() => {});
    await db.query(
        `INSERT INTO mkt_tavern (buyer_id, dice_pot, dice_rolls, dice_active, updated_at) VALUES ($1, $2, 0, TRUE, NOW())
         ON CONFLICT (buyer_id) DO UPDATE SET dice_pot = $2, dice_rolls = 0, dice_active = TRUE, updated_at = NOW()`,
        [buyerId, b]
    );
    return { ok: true, pot: b, rolls: 0, gold: Number(paid.gold) };
}

// Atomically claim + pay out the current pot (guards against double-cashout).
async function payoutDice(buyerId) {
    const claimed = await db.queryOne(`UPDATE mkt_tavern SET dice_active = FALSE, updated_at = NOW() WHERE buyer_id = $1 AND dice_active = TRUE RETURNING dice_pot`, [buyerId]).catch(() => null);
    if (!claimed) return null;
    const amount = claimed.dice_pot;
    await db.query(`UPDATE mkt_tavern SET dice_pot = 0 WHERE buyer_id = $1`, [buyerId]).catch(() => {});
    const paid = amount > 0 ? await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, amount]).catch(() => null) : null;
    if (amount > 0) await logCoin(buyerId, amount, "tavern_dice_win", { balanceAfter: paid?.gold }).catch(() => {});
    return { amount, gold: paid?.gold };
}

// Roll the die: 1 = bust (lose the pot); else the pot grows. Auto-cashes at DICE_MAX_ROLLS.
export async function rollDice(buyerId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const s = await db.queryOne(`SELECT dice_pot, dice_rolls, dice_active FROM mkt_tavern WHERE buyer_id = $1`, [buyerId]).catch(() => null);
    if (!s?.dice_active) return { ok: false, error: "no_game" };
    const roll = 1 + Math.floor(Math.random() * 6);
    if (roll <= DICE_BUST_MAX) {
        await db.query(`UPDATE mkt_tavern SET dice_active = FALSE, dice_pot = 0, updated_at = NOW() WHERE buyer_id = $1`, [buyerId]);
        return { ok: true, roll, bust: true, pot: 0 };
    }
    const newPot = Math.round(s.dice_pot * DICE_MULT);
    const rolls = s.dice_rolls + 1;
    await db.query(`UPDATE mkt_tavern SET dice_pot = $2, dice_rolls = $3, updated_at = NOW() WHERE buyer_id = $1`, [buyerId, newPot, rolls]);
    if (rolls >= DICE_MAX_ROLLS) {
        const c = await payoutDice(buyerId);
        return { ok: true, roll, bust: false, pot: newPot, rolls, forcedCashOut: true, won: c?.amount || newPot, gold: c?.gold };
    }
    return { ok: true, roll, bust: false, pot: newPot, rolls };
}

// Walk away with the pot.
export async function cashOutDice(buyerId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const c = await payoutDice(buyerId);
    if (!c) return { ok: false, error: "no_game" };
    return { ok: true, won: c.amount, gold: c.gold };
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
    const drinks = (await db.queryOne(`SELECT drinks FROM mkt_tavern WHERE buyer_id = $1`, [buyerId]).catch(() => null))?.drinks || 1;
    return { ok: true, drinks };
}
