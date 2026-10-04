import "server-only";

import { db } from "@/lib/db";
import { halloweenOn } from "@/lib/marketplace/owner.js";
import { storeDay } from "@/lib/marketplace/store-day.js";

// ── CANDY: THE EVENT CURRENCY ────────────────────────────────────────────────────────────────────────────
// Luke: "lets make a special currency. Candy. Yiu get it from most activities."
//
// ⚠️ "MOST ACTIVITIES" IS A WRITTEN LIST, NOT A HOOK ON trackActivity. The tempting shortcut is to hang this
// off the telemetry choke point every action already calls — one line, every activity, done. It would also
// pay candy for LOOKING at pages: trackActivity's CLIENT_EVENTS includes page_view, view_shop and
// view_leaderboard, all firable from the browser. The first member to hold F5 would out-earn the whole Den.
//
// So the faucets are named here, one line each, and a caller has to opt in. That is more typing and it is the
// entire security model: a currency you can mint by refreshing is not a currency.
//
// ⚠️ AND IT IS CAPPED BY DAILY TOTAL, WHICH IS THE ONLY CAP THAT WORKS. Per-action limits are what the
// economy notes call the wrong lever — they change how a feature FEELS and a determined farmer just moves to
// the next action. A ceiling on the day's earnings leaves every rate alone, lets somebody play whatever they
// enjoy, and still bounds the event's total mint. Nobody playing normally will reach it; see the note on
// DAILY_CANDY_CAP for the arithmetic.
//
// ⚠️ NOT THE SAME THING AS A `kind: "candy"` CONSUMABLE. Those are the six sweets a Hallowe'en chest pays —
// Candy Corn, the Sour Worm — which are items you USE. This is a balance you SPEND. They share a word and
// nothing else, and the one place that could confuse them is the chest, which filters consumables by kind and
// never touches mkt_buyer.candy.

// What each activity pays. Sized so a member doing the daily rounds — a spin, their boss strikes, a dungeon,
// some fishing and a harvest — comes away with roughly 60-90 a day, and the vendor's cheapest thing is 150.
// So: a couple of days of ordinary play for the first trinket, a fortnight of it for the headline pet.
//
// ⚠️ THE NUMBERS ARE PER-EVENT AND THE EVENTS ARE NOT EQUALLY COMMON. A boss strike happens a handful of
// times a day and a harvest can happen thirty times, which is why they are not both worth 2. Anything a
// member can repeat freely is worth 1 and leans on the cap; anything rate-limited by the game itself can
// afford to pay properly.
export const CANDY_RATES = {
    // Rate-limited by the game, so these can pay real amounts.
    boss_strike: 3,         // a handful a day, and the cap is the backstop
    daily_spin: 5,          // once a day free
    delve_clear: 25,        // a whole ten-floor run
    delve_boss: 10,         // the tenth floor specifically
    raid: 8,                // a daily allowance
    arena_win: 4,
    chest_open: 2,
    cook: 2,
    // Freely repeatable, so each one is small and the day's total is what bounds them.
    fish: 1,
    harvest: 1,
    mine: 1,
    // ── THE EVENT'S OWN FAUCET ───────────────────────────────────────────────────────────────────────
    // Rated 1 because the DOOR decides the amount, not the table: trick-or-treat.js calls
    // grantCandy(id, "trick_or_treat_door", n) and the multiplier carries the payout. It still goes through
    // this function rather than writing the balance directly, because the daily cap lives here and a faucet
    // outside the only ceiling the event has is not a faucet, it is a leak.
    trick_or_treat_door: 1,
};

// ── THE CEILING ──────────────────────────────────────────────────────────────────────────────────────────
// 250 a day. The arithmetic: the richest HONEST day is roughly a dungeon clear (25) + its boss (10) + a spin
// (5) + six boss strikes (18) + a raid (8) + a dozen harvests and casts (12) + the eighteen-door
// trick-or-treat round (~99) — about 120 before the doors and about 220 with them. So the ceiling is
// REACHABLE by somebody who does genuinely everything, and only by them, while a member grinding one
// repeatable action in a loop hits it inside an hour and stops. It bounds the event's mint at 250 a member a
// day whatever anybody does.
export const DAILY_CANDY_CAP = 250;

/** What this member has EARNED today (spends do not refund cap room — see the note in grantCandy). */
export async function candyEarnedToday(buyerId) {
    if (!buyerId) return 0;
    const r = await db.queryOne(
        `SELECT COALESCE(SUM(delta), 0)::int AS n FROM mkt_candy_event
          WHERE buyer_id = $1 AND delta > 0
            AND (created_at AT TIME ZONE 'America/Chicago')::date = $2::date`,
        [buyerId, storeDay().dayKey],
    ).catch(() => null);
    return Number(r?.n) || 0;
}

export async function candyBalance(buyerId) {
    if (!buyerId) return 0;
    const r = await db.queryOne(`SELECT COALESCE(candy, 0)::int AS n FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    return Number(r?.n) || 0;
}

/**
 * Pay candy for an activity. Silently does nothing while the event is down, so a caller never needs to ask.
 *
 * ⚠️ EVERY CALLER PASSES A SOURCE FROM CANDY_RATES AND NOTHING ELSE. An amount passed in by the caller is how
 * a rate ends up living in six files and drifting; the source names the rate and this file owns it.
 *
 * Returns what was actually paid, which can be less than the rate (the cap) or zero (the cap, or the event
 * being off). Callers that want to tell the member use the return value rather than the rate.
 */
export async function grantCandy(buyerId, source, times = 1) {
    if (!buyerId || !halloweenOn(buyerId)) return 0;
    const rate = CANDY_RATES[source];
    if (!rate || times <= 0) return 0;

    const want = Math.round(rate * times);
    const earned = await candyEarnedToday(buyerId);
    // ⚠️ THE CAP TRIMS, IT DOES NOT REJECT. A member one candy short of the ceiling who clears a dungeon
    // should get that one candy, not nothing — a cap that refuses whole payouts reads as a broken reward.
    const give = Math.max(0, Math.min(want, DAILY_CANDY_CAP - earned));
    if (give <= 0) return 0;

    await db.query(`UPDATE mkt_buyer SET candy = COALESCE(candy, 0) + $2 WHERE id = $1`, [buyerId, give]).catch(() => {});
    await db.query(
        `INSERT INTO mkt_candy_event (buyer_id, delta, source, meta) VALUES ($1, $2, $3, $4::jsonb)`,
        [buyerId, give, source, JSON.stringify(give < want ? { want, capped: true } : {})],
    ).catch(() => {});
    return give;
}

/**
 * Spend candy. ATOMIC — the balance check and the deduction are one conditional UPDATE, so two taps on a
 * vendor button cannot both pass a "can you afford it" read and then both deduct.
 *
 * ⚠️ SPENDING DOES NOT GIVE BACK CAP ROOM. candyEarnedToday sums only positive rows on purpose: if a spend
 * refunded the day's allowance, buying something cheap would be a way to keep earning, and the cap would
 * bound your NET rather than your mint — which is not a cap at all.
 */
export async function spendCandy(buyerId, amount, reason, meta = {}) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const n = Math.round(Number(amount) || 0);
    if (n <= 0) return { ok: false, error: "bad_amount" };
    const row = await db.queryOne(
        `UPDATE mkt_buyer SET candy = candy - $2 WHERE id = $1 AND COALESCE(candy, 0) >= $2 RETURNING candy`,
        [buyerId, n],
    ).catch(() => null);
    if (!row) return { ok: false, error: "not_enough_candy" };
    await db.query(
        `INSERT INTO mkt_candy_event (buyer_id, delta, source, meta) VALUES ($1, $2, $3, $4::jsonb)`,
        [buyerId, -n, reason, JSON.stringify(meta || {})],
    ).catch(() => {});
    return { ok: true, balance: Number(row.candy) || 0 };
}
