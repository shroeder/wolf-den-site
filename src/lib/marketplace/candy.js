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
    // ⚠️ A TOWN RAID IS NOT THE SEA RAID ABOVE. `raid` is sailing's, which is a daily allowance you spend;
    // this is the plaza one — rarer, longer, and the whole Den turns out for it — so it pays the most of
    // anything on this table except a dungeon clear.
    town_raid: 20,
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
    // Same arrangement as the door: the CAPSULE decides the amount and passes it as the multiplier, so this
    // is 1 and gachapon.js carries the payout. It still comes through here because the daily ceiling lives
    // here, and a capsule that wrote the balance directly would be the biggest hole in the event.
    gacha: 1,
};

// ── THE CEILING ──────────────────────────────────────────────────────────────────────────────────────────
// 250 a day. The arithmetic: the richest HONEST day is roughly a dungeon clear (25) + its boss (10) + a spin
// (5) + six boss strikes (18) + a raid (8) + a dozen harvests and casts (12) + the eighteen-door
// trick-or-treat round (~99) — about 120 before the doors and about 220 with them. So the ceiling is
// REACHABLE by somebody who does genuinely everything, and only by them, while a member grinding one
// repeatable action in a loop hits it inside an hour and stops. It bounds the event's mint at 250 a member a
// day whatever anybody does.
export const DAILY_CANDY_CAP = 250;

// ── ⚠️ ONLY WHAT WAS PAID FOR IS BANKED ──────────────────────────────────────────────────────────────────
// A capsule and a door both cost the member something to open, and both SAY the overflow keeps. A cast, a
// harvest and a swing of the pick cost nothing and are repeatable all night — those are the exact things the
// ceiling exists to stop, and banking them would hand a grinder back every candy it just refused. So the
// deferral is a property of the faucet, not of the cap.
export const BANKABLE_SOURCES = new Set(["gacha", "trick_or_treat_door"]);

// ── ⚠️ THE ONE KIND OF PAYOUT THE CEILING DOES NOT TOUCH ─────────────────────────────────────────────────
// The cap exists to stop a member GRINDING candy: every faucet above is something you can do again, so the
// day's total is the only honest bound on it. The Candy Snatcher is the opposite shape — ONE pail in the
// whole plaza, at most one claim a day across the entire Den, and it is gone the moment somebody taps it.
// There is nothing to grind, so there is nothing for the ceiling to defend, and running it through
// grantCandy would have paid the rarest thing in the event like a harvest: trimmed to whatever was left of
// 250 (which, measured over the live table, is usually nothing by evening — members are averaging ~200 a
// day). The carry-over would not have saved it either: MAX_OWED_CANDY is one day's cap, so 1,000 would have
// arrived as 250 today and 250 tomorrow and 500 would have evaporated.
//
// ⚠️ AND IT MUST NOT EAT THE DAY'S ROOM EITHER, which is the part that is easy to miss. If a 1,000-candy row
// counted towards "earned today", winning the Snatcher would silently switch off every other faucet the
// member has until midnight — their doors, their dungeon, their spin, all paying zero for the rest of the
// day as a direct consequence of the best thing that has ever happened to them. So these sources are
// excluded from candyEarnedToday as well as from the trim.
//
// ⚠️ ONE LIST, READ TWICE — the grant and the earned-today exclusion both come from here. Two expressions is
// how a source ends up uncapped on the way in and counted on the way out, which is the worst of both.
export const UNCAPPED_CANDY_RATES = { candy_snatcher: 1000 };
export const UNCAPPED_SOURCES = Object.keys(UNCAPPED_CANDY_RATES);

/** What this member has EARNED today (spends do not refund cap room — see the note in grantCandy). */
export async function candyEarnedToday(buyerId) {
    if (!buyerId) return 0;
    const r = await db.queryOne(
        `SELECT COALESCE(SUM(delta), 0)::int AS n FROM mkt_candy_event
          WHERE buyer_id = $1 AND delta > 0
            AND source <> ALL($3::text[])
            AND (created_at AT TIME ZONE 'America/Chicago')::date = $2::date`,
        [buyerId, storeDay().dayKey, UNCAPPED_SOURCES],
    ).catch(() => null);
    return Number(r?.n) || 0;
}

/**
 * Pay a once-a-day, one-winner prize that the ceiling does not apply to. See UNCAPPED_CANDY_RATES.
 *
 * Same shape as grantCandy on purpose — the amount lives in a table in this file, the caller names a source,
 * and the ledger row is written here — so the event's mint is still measurable in one place. The ONLY
 * difference is that nothing trims it and it does not count against the day.
 */
export async function grantUncappedCandy(buyerId, source) {
    if (!buyerId || !halloweenOn(buyerId)) return 0;
    const give = UNCAPPED_CANDY_RATES[source];
    if (!give) return 0;
    await db.query(`UPDATE mkt_buyer SET candy = COALESCE(candy, 0) + $2 WHERE id = $1`, [buyerId, give]).catch(() => {});
    await db.query(
        `INSERT INTO mkt_candy_event (buyer_id, delta, source, meta) VALUES ($1, $2, $3, '{"uncapped":true}'::jsonb)`,
        [buyerId, give, source],
    ).catch(() => {});
    return give;
}

// ── ⚠️ WHAT THE CAP TRIMMED, HELD FOR TOMORROW ───────────────────────────────────────────────────────────
// Eric D: "any candy we get from the gachapon after our daily 250 limit is hit is not carrying over to the
// next day like the text says it will."
//
// He was reading the screen correctly. The capsule says, in as many words, "that's your 250 candy for today,
// so this one keeps until tomorrow's allowance" — and nothing kept it. The cap trimmed the grant to zero and
// the candy was gone, after a ticket had been spent on it.
//
// ⚠️ THE TEXT IS THE PROMISE AND THE PROMISE IS THE RIGHT ONE, so the code moves rather than the words. A
// capsule is PAID FOR; paying nothing for it is the actual harm, and deleting the sentence would have left
// that harm in place and merely stopped admitting to it. This banks the untrimmed remainder and pays it down
// out of the next day's allowance.
//
// ⚠️ AND IT IS BOUNDED AT ONE DAY'S CAP, which is what keeps it a deferral rather than a second faucet. A
// member who spends a fortnight capped cannot bank 3,000 candy and dump it — the owed pile stops at 250, the
// same ceiling as a day. The event's mint is still DAILY_CANDY_CAP a member a day, every day, which is the
// only property the cap was ever defending.
export const MAX_OWED_CANDY = DAILY_CANDY_CAP;

/**
 * Pay down anything the cap held back on earlier days, out of today's room. Returns what it settled.
 *
 * ⚠️ CALLED BEFORE THE CAP MATH IN grantCandy AND ON READING THE BALANCE, so owed candy arrives whether or
 * not the member earns anything new. Without the read path a member who banked some and then stopped playing
 * would never see it — "tomorrow's allowance" has to arrive on its own.
 */
export async function settleOwedCandy(buyerId) {
    if (!buyerId || !halloweenOn(buyerId)) return 0;
    const row = await db.queryOne(`SELECT COALESCE(candy_owed, 0)::int AS owed FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const owed = Number(row?.owed) || 0;
    if (owed <= 0) return 0;
    const room = DAILY_CANDY_CAP - (await candyEarnedToday(buyerId));
    const pay = Math.min(owed, Math.max(0, room));
    if (pay <= 0) return 0;
    // ⚠️ ONE CONDITIONAL UPDATE, LIKE THE SPEND. Two tabs settling at once must not both read the same owed
    // pile and both pay it — the WHERE clause is what makes the second one a no-op instead of a duplicate.
    const done = await db.queryOne(
        `UPDATE mkt_buyer SET candy = COALESCE(candy, 0) + $2, candy_owed = COALESCE(candy_owed, 0) - $2
          WHERE id = $1 AND COALESCE(candy_owed, 0) >= $2 RETURNING id`,
        [buyerId, pay],
    ).catch(() => null);
    if (!done) return 0;
    await db.query(
        `INSERT INTO mkt_candy_event (buyer_id, delta, source, meta) VALUES ($1, $2, 'carried', '{"carried":true}'::jsonb)`,
        [buyerId, pay],
    ).catch(() => {});
    return pay;
}

export async function candyBalance(buyerId) {
    if (!buyerId) return 0;
    // Settle first, so the balance a member reads the morning after being capped is the one they were
    // promised rather than the one they went to bed with.
    await settleOwedCandy(buyerId).catch(() => {});
    const r = await db.queryOne(`SELECT COALESCE(candy, 0)::int AS n FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    return Number(r?.n) || 0;
}

/** What the cap is still holding for this member. Shown at the stall so the promise is visible, not implied. */
export async function candyOwed(buyerId) {
    if (!buyerId) return 0;
    const r = await db.queryOne(`SELECT COALESCE(candy_owed, 0)::int AS n FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
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
    // Yesterday's held-back candy is paid out of today's room BEFORE anything new is earned, so a member
    // who was capped gets what they were owed first rather than having it pushed back another day.
    await settleOwedCandy(buyerId).catch(() => {});
    const earned = await candyEarnedToday(buyerId);
    // ⚠️ THE CAP TRIMS, IT DOES NOT REJECT. A member one candy short of the ceiling who clears a dungeon
    // should get that one candy, not nothing — a cap that refuses whole payouts reads as a broken reward.
    const give = Math.max(0, Math.min(want, DAILY_CANDY_CAP - earned));

    // ── ⚠️ WHAT THE CAP TOOK IS HELD, NOT DESTROYED, FOR THE SOURCES THAT WERE PAID FOR ──────────────
    // A gachapon capsule and a trick-or-treat door both cost something to open, and the screen tells the
    // member the remainder keeps until tomorrow. The freely repeatable faucets — a cast, a harvest, a swing
    // of the pick — do NOT bank, because the cap exists precisely to stop those running all night, and
    // banking them would hand the grinder back every candy the ceiling just refused.
    const held = want - give;
    if (held > 0 && BANKABLE_SOURCES.has(source)) {
        await db.query(
            `UPDATE mkt_buyer SET candy_owed = LEAST($3, COALESCE(candy_owed, 0) + $2) WHERE id = $1`,
            [buyerId, held, MAX_OWED_CANDY],
        ).catch(() => {});
    }
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
