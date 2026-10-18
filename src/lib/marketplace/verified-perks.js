import "server-only";

import { db } from "@/lib/db";
import { mintRate } from "@/lib/marketplace/gold-rate.js";

// ── WHAT VERIFYING YOUR EMAIL IS WORTH ───────────────────────────────────────────────────────────────────────
// Two perks, and they are the answer to a promise counter-claim.js already made. That file deliberately
// stopped asking for a six-digit code at the till — "31 of those 80 walked away" — and signed people in on an
// unverified, passwordless account instead, with this note:
//
//     "The account is unverified and stays that way until they verify — which is now a thing they can be asked
//      at leisure, from the couch, instead of at the till."
//
// Nothing ever asked them. Measured 2026-10-18: 35 of 173 accounts are unverified, EVERY ONE of them
// passwordless — so every one is a till scan, exactly as designed, and none of them was ever given a reason
// to finish. Several are real players: 40,394 XP, 29,507 XP, 12,829 XP on accounts whose only key is a cookie
// in whichever browser the camera app opened. See [[qr-scan-safari-cookie-purge]] — Safari's ITP deletes that
// cookie after seven days of not visiting, and a passwordless account with an unverified address has no other
// door. The perks are the carrot; not losing the account is the part that actually matters to them.
//
// It also buys the shop a reachable member: recap-digest, push-winback, the boss broadcast and the sailing
// broadcast all filter on `email_verified = TRUE`, so an unverified member hears from us never.
//
// ── THE TWO PERKS, AND WHY THESE TWO ─────────────────────────────────────────────────────────────────────────
//   THE BOOST    +5% XP on everything you earn, for as long as the address stays verified. XP ONLY.
//   THE PASSIVE   a standing trickle of gold + XP that accrues while you are away and banks until you check
//                 in, settled on the same clock and the same offline cap as pet income.
//
// XP ONLY on the boost, deliberately, and the reason is written down in xp.js beside the curator's bonus: gold
// is the tighter of the two economies and "a permanent multiplier on every gold award in the game is exactly
// the shape of thing that gets discovered three weeks later in a balance pass." Levels are the safe place to
// be generous. The passive pays real gold, but it is a FLAT rate rather than a multiplier — a number that can
// be read off this file and multiplied by the member count, which a percentage cannot.
export const VERIFIED_XP_BONUS_PCT = 5;

// ── THE PASSIVE, SIZED OFF THE LEDGER ────────────────────────────────────────────────────────────────────────
// Measured over the 7 days to 2026-10-18, per member-day of actual earning:
//
//     gold   median 246    mean 3,705    p90 10,544
//     XP     median  51    mean 3,330    p90 10,519
//
// The mean and the median are a factor of fifteen apart because a handful of members play all day. A FLAT
// trickle is progressive against that spread on purpose: 72 gold a day is a third again on top of a median
// day and rounding error to the p90 player — and the members this perk is aimed at (a till scan who has
// played twice) are at the median end. Tuning it to feel significant to the top of that table would mint a
// fortune at the bottom.
//
// WHAT IT COSTS, AS A DAILY TOTAL (the rule is [[economy-nerf-measure-daily-total]] — judge a faucet on the
// day's total, never on one event): 138 verified accounts x 72 gold is 9,936 gold a day as an absolute
// ceiling, and only 81 members have been seen in the last fortnight, so the real figure is ~5,800. Against
// 208,538 gold a day credited across the pack that is +2.8%, in a week that minted 1,459,767 and burned
// 1,487,331. It does not move the supply.
//
// GROSS, because it goes out through mint(): the constant below is the pre-rate number and
// `verifiedIncomeRate()` is the only thing that reports what actually lands. At today's GOLD_MINT_RATE of 0.4
// a full day accrues 180 gross and banks 72. Quoting the gross anywhere a member can read it is the
// delve-merchant bug in gold-rate.js all over again — "It told me I should be getting 178, it only gave me
// 34" — which is why the rate function exists and nothing else does this arithmetic.
//
// 7.5 rather than a whole number so that a capped day lands on 72 exactly: the accrual multiplies the gross
// by the hours and mints the TOTAL, so the figure on the card is the figure in the balance with no rounding
// slack between them.
export const VERIFIED_GOLD_PER_HOUR_GROSS = 7.5;
export const VERIFIED_XP_PER_HOUR = 3; // XP has no mint rate; this is what lands (before the earn-rate buffs)
export const VERIFIED_INCOME_REASON = "verified_income";

// ── THE OFFLINE CAP, SHARED WITH PET INCOME ──────────────────────────────────────────────────────────────────
// Idle income has two sources now, one clock (mkt_buyer.pet_income_at) and one cap, and this is the cap.
// It lives here rather than in pet-income.js only because a client has to be able to say "banked up to 24
// hours" in the offer copy, and the copy and the accrual must be the same number or the card is lying. See
// settleIdleIncome in pet-income.js, which imports it.
export const IDLE_CAP_HOURS = 24;

/**
 * The passive's rate — the ONE place the payout and every screen ask.
 *
 * `goldPerHourGross` is what the accrual multiplies by the hours before minting the total; `goldPerDay` is
 * what a capped day actually banks, netted through `mintRate` here. Moving GOLD_MINT_RATE moves the number
 * on the card and the number in the member's balance in the same commit, which is the whole point of asking
 * one function instead of doing the arithmetic twice.
 */
export function verifiedIncomeRate() {
    return {
        xpPerHour: VERIFIED_XP_PER_HOUR,
        goldPerHourGross: VERIFIED_GOLD_PER_HOUR_GROSS,
        xpPerDay: VERIFIED_XP_PER_HOUR * IDLE_CAP_HOURS,
        goldPerDay: Math.round(VERIFIED_GOLD_PER_HOUR_GROSS * IDLE_CAP_HOURS * mintRate(VERIFIED_INCOME_REASON)),
    };
}

/**
 * The offer (or the standing perk, once taken) for one member.
 *
 * ONE indexed read. It is called from /api/marketplace/nudges, which is mounted in the root layout on every
 * page of the site — see the note on that route about four watchers sharing one request — so it must stay a
 * single-row lookup and never grow into a feature build. [[chrome-fanout-bills-every-page]]
 *
 * `show` is the offer: signed in, not verified, and we have an address to send a code to. A member who has
 * already verified gets `verified: true` and the same numbers, because the track page shows what they have.
 */
export async function verifyOffer(buyerId) {
    const rate = verifiedIncomeRate();
    const perks = {
        xpPct: VERIFIED_XP_BONUS_PCT,
        goldPerDay: rate.goldPerDay,
        xpPerDay: rate.xpPerDay,
        capHours: IDLE_CAP_HOURS,
    };
    if (!buyerId) return { show: false, verified: false, email: null, perks };
    const row = await db
        .queryOne(`SELECT email, email_verified FROM mkt_buyer WHERE id = $1`, [buyerId])
        .catch(() => null);
    if (!row) return { show: false, verified: false, email: null, perks };
    const verified = Boolean(row.email_verified);
    return {
        show: !verified && Boolean(row.email),
        verified,
        // Shown back to the member on the card ("we'll send a code to…"), because a till scan typed this
        // address once, at speed, with a queue behind them — a typo is the likeliest reason a code never
        // arrives, and they cannot fix what they cannot see.
        email: row.email || null,
        perks,
    };
}
