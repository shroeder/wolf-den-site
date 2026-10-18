import "server-only";

import { db } from "@/lib/db";
import { getPetCombatBonus } from "@/lib/marketplace/pet-combat.js";
import { GOLD_PER_POINT } from "@/lib/marketplace/pet-perks.js";
import { awardXp } from "@/lib/marketplace/xp.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { mint, mintRate } from "@/lib/marketplace/gold-rate.js";
import { IDLE_CAP_HOURS, VERIFIED_INCOME_REASON, verifiedIncomeRate } from "@/lib/marketplace/verified-perks.js";

// ===== Pet passive income =====
// "Earner" pets carry xp_gain / gold_find affinity (and fortune → boss-raffle luck). Those used to be dead
// stats nothing read. Now the equipped-active + all owned-passive earner points convert to a real per-hour
// income the player accrues while their menagerie is working, plus raffle tickets from fortune (spent in
// boss.js). Income is settled LAZILY on game reads — no cron — with an offline cap so leaving a pet equipped
// for a week doesn't dump a lump sum (encourages checking in).

const XP_PER_POINT = 1; // each xp_gain point → +1 XP / hour
// GOLD_PER_POINT is shared from pet-perks.js so the accrued income and the on-card display never drift.
//
// ── IDLE INCOME HAS TWO SOURCES NOW ──────────────────────────────────────────────────────────────────────────
// Pets, and the verified-email passive (verified-perks.js). They share this file's clock
// (mkt_buyer.pet_income_at), its offline cap and its race-safe claim, because a second accrual system would be
// a second copy of all three — and [[atomic-split-into-steps-drops-lines]] is what happens when one payout
// grows two implementations. What they do NOT share is the ledger reason: each source books its own gold under
// its own name, so the coin-economy screen can still tell them apart.
//
// MAX_ACCRUE_HOURS moved to verified-perks.js as IDLE_CAP_HOURS, because the offer card has to be able to say
// "banked up to 24 hours" and a client cannot import a server-only module. Same number, one definition.

// The player's current pet income rate (for display + settling).
//
// It used to report `raffleTickets` alongside these two, on the reasoning that a fortune pet banked entries
// every day whether you played or not. Fortune is luck now (see fortune.js) and buys no entries, so the field
// is gone rather than left reporting a number nothing pays out — which is what it had become.
export async function petIncomeRate(buyerId) {
    if (!buyerId) return { xpPerHour: 0, goldPerHour: 0, xpPerDay: 0, goldPerDay: 0 };
    const bonus = await getPetCombatBonus(buyerId).catch(() => ({ economy: {}, stats: {} }));
    const xpPerHour = Math.round((bonus.economy?.xp_gain || 0) * XP_PER_POINT);
    const goldPerHour = Math.round((bonus.economy?.gold_find || 0) * GOLD_PER_POINT);
    return {
        xpPerHour,
        // ⚠️ GROSS. This is the pre-mint number the accrual multiplies by the hours; it is NOT what lands.
        goldPerHour,
        xpPerDay: xpPerHour * IDLE_CAP_HOURS,
        // ── AND THIS IS WHAT LANDS, WHICH IS THE ONLY NUMBER A SCREEN MAY QUOTE ──────────────────────────
        // The pets page rendered `goldPerHour * 24` as "Gold per day" while settlePetIncome paid
        // `mint(gold, "pet_income")` — so the card promised 2.5x what the balance received, at today's rate.
        // Exactly the delve-merchant bug gold-rate.js warns about in capitals, sitting in the one feature
        // whose whole job is to tell you what you earn while you are away. It has never been loud because
        // this faucet paid nothing at all for weeks — see the CAS note in settleIdleIncome for why — which is
        // also why correcting it now costs nobody anything they were actually getting.
        goldPerDay: Math.round(goldPerHour * IDLE_CAP_HOURS * mintRate("pet_income")),
    };
}

/**
 * Every source of idle income for a member, and the combined per-hour rate the clock is settled against.
 *
 * `verified` is passed in by the settler (which has already read the column) so this costs no extra query on
 * that path; callers that only want to display a rate can leave it out and pay for the read.
 */
export async function idleIncomeRate(buyerId, { verified = null } = {}) {
    const pet = await petIncomeRate(buyerId);
    const isVerified = verified == null
        ? Boolean((await db.queryOne(`SELECT email_verified FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null))?.email_verified)
        : Boolean(verified);
    const v = verifiedIncomeRate();
    const ver = isVerified
        ? { xpPerHour: v.xpPerHour, goldPerHour: v.goldPerHourGross, xpPerDay: v.xpPerDay, goldPerDay: v.goldPerDay }
        : { xpPerHour: 0, goldPerHour: 0, xpPerDay: 0, goldPerDay: 0 };
    return {
        pet,
        verified: ver,
        xpPerHour: pet.xpPerHour + ver.xpPerHour,
        xpPerDay: pet.xpPerDay + ver.xpPerDay,
        goldPerDay: pet.goldPerDay + ver.goldPerDay,
    };
}

const NOTHING = { xp: 0, gold: 0, pet: { xp: 0, gold: 0 }, verified: { xp: 0, gold: 0 } };

// Credit whatever idle income has accrued since the last settle — pets, plus the verified-email passive.
// Best-effort + race-safe (the clock advance is a conditional UPDATE keyed to the timestamp we read, so a
// concurrent settle can't double-pay). Safe to call on any authed game read; returns what was just credited,
// BROKEN DOWN BY SOURCE, so a screen can say which of the two paid it rather than crediting the pets with
// somebody's mail.
export async function settleIdleIncome(buyerId) {
    if (!buyerId) return NOTHING;
    // email_verified comes down with the clock — one read, so the verified rate costs nothing on this path.
    const row = await db.queryOne(`SELECT pet_income_at, email_verified FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    if (!row) return NOTHING;
    // First ever call just starts the clock — don't back-pay from account creation.
    if (!row.pet_income_at) {
        await db.query(`UPDATE mkt_buyer SET pet_income_at = NOW() WHERE id = $1`, [buyerId]).catch(() => {});
        return NOTHING;
    }
    const elapsedHours = Math.max(0, (Date.now() - new Date(row.pet_income_at).getTime()) / 3600000);
    const hours = Math.min(IDLE_CAP_HOURS, elapsedHours);
    if (hours < 0.02) return NOTHING; // <~1 min — nothing meaningful; leave the clock so fractions build
    // ⚠️ WHAT THE CAP THREW AWAY HAS TO LEAVE THE CLOCK TOO, OR THE CAP PAYS OUT ONCE PER PAGE LOAD.
    // The cap bounds one payout; it does not bound the clock. Advancing only the hours we PAID for leaves a
    // clock that is still days in the past, so the very next settle — the next game read, seconds later —
    // measures another full capped window and pays another whole day. And settles are everywhere: the pets
    // screen and the boss page both call this, so walking between them would mint a day's income per tap
    // until the clock finally caught up to now.
    //
    // Measured on prod before this shipped: live clocks were stuck at 2026-07-23, 07-31 and 08-03 — eleven
    // WEEKS of slack, which is ~77 capped days apiece. It was never exposed because the clock had not moved
    // at all (the CAS below could not match, so nothing was ever paid OR advanced); fixing that and adding a
    // rate every verified member has would have turned eleven weeks of dormant slack into a tap.
    //
    // So the forfeited hours are added to the advance: the clock lands at now minus only the sub-unit
    // remainder we have not paid for yet. Offline accrual stays capped at a day, and it stays capped ONCE.
    const forfeitedHours = Math.max(0, elapsedHours - hours);
    const rate = await idleIncomeRate(buyerId, { verified: row.email_verified });
    // Each source is floored and minted SEPARATELY under its own reason. Splitting a single combined total
    // between them afterwards would be two numbers derived from one, and the rounding would have to be
    // allocated to one of them — so the ledger would stop adding up to the balance for one source or the other.
    const pet = {
        xp: Math.floor(rate.pet.xpPerHour * hours),
        gold: mint(Math.floor(rate.pet.goldPerHour * hours), "pet_income"),
    };
    const ver = {
        xp: Math.floor(rate.verified.xpPerHour * hours),
        gold: mint(Math.floor(rate.verified.goldPerHour * hours), VERIFIED_INCOME_REASON),
    };
    const xp = pet.xp + ver.xp;
    const gold = pet.gold + ver.gold;
    if (xp <= 0 && gold <= 0) {
        // Nothing earns → advance the clock so idle time doesn't bank against a future earner pet (or against
        // verifying tomorrow, which would pay a day's mail for the day before it was switched on).
        await db.query(`UPDATE mkt_buyer SET pet_income_at = NOW() WHERE id = $1`, [buyerId]).catch(() => {});
        return NOTHING;
    }
    // Advance the clock by only the WHOLE-unit time we're paying out (sub-unit remainder carries over), and do
    // it as a guarded UPDATE so only one concurrent caller claims this window.
    //
    // ⚠️ THE MAX ACROSS SOURCES, NOT THE MIN. Whichever source consumed the most time sets the advance, so the
    // slowest-accruing one forfeits its remainder (at these rates, under 20 minutes). Taking the min instead
    // would leave time on the clock that the faster source has ALREADY been paid for, and the next settle
    // would pay it again — a slow drip of double-paid gold that nothing would ever flag.
    const consumed = (paid, perHour) => (perHour > 0 ? paid / perHour : 0);
    const consumedHours = Math.max(
        consumed(pet.xp, rate.pet.xpPerHour), consumed(pet.gold, rate.pet.goldPerHour),
        consumed(ver.xp, rate.verified.xpPerHour), consumed(ver.gold, rate.verified.goldPerHour),
    );
    // Still a CAS on the timestamp we read, so two concurrent settles cannot both claim the window.
    //
    // ⚠️ COMPARED TO THE MILLISECOND, BECAUSE A JS Date CANNOT HOLD WHAT POSTGRES STORED.
    // `pet_income_at` is a timestamptz and Postgres keeps MICROseconds: 13:58:05.466529. The driver hands
    // JavaScript a Date, which holds milliseconds: 13:58:05.466. Handing that straight back as `= $3`
    // compares .466000 against .466529 and is false FOR EVERY ROW, FOR EVER.
    //
    // That is not a theoretical sharp edge, it is where this faucet went. Measured on prod 2026-10-18: the
    // owner's own account had an idle rate of 34 XP + 7 gold an hour and a clock frozen at 2026-07-23 — the
    // last time a code path stamped it with NOW() rather than through this CAS. Eleven weeks of settles, all
    // of which computed a payout correctly, lost the race to nobody, and returned {xp:0,gold:0}. Across the
    // whole pack, `pet_income` paid 0 gold in the 7 days to 2026-10-18, which reads exactly like "earner pets
    // are rare" and is not that at all.
    //
    // date_trunc gives the comparison the same precision the reader has. The CAS still does its job: the
    // UPDATE moves the stored value by hours, so a concurrent second settle fails the condition either way.
    const advanceHours = forfeitedHours + consumedHours;
    const claim = await db
        .queryOne(
            `UPDATE mkt_buyer SET pet_income_at = pet_income_at + ($2 || ' hours')::interval
              WHERE id = $1 AND date_trunc('milliseconds', pet_income_at) = $3 RETURNING id`,
            [buyerId, advanceHours, row.pet_income_at]
        )
        .catch(() => null);
    if (!claim) return NOTHING; // lost the race — the other caller credited it
    // XP only on these; the gold is credited below. `gold: 0` is not optional — awardXp pays gold 1:1 with
    // points unless a caller says otherwise, and this is a repeatable earner. [[awardxp-gold-tracks-xp-landmine]]
    if (pet.xp > 0) await awardXp(buyerId, "pet_income", { points: pet.xp, gold: 0 }).catch(() => {});
    if (ver.xp > 0) await awardXp(buyerId, VERIFIED_INCOME_REASON, { points: ver.xp, gold: 0 }).catch(() => {});
    if (gold > 0) {
        const g = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, gold]).catch(() => null);
        // One ledger row per SOURCE, off the one balance write — so the coin-economy screen attributes the
        // mail to the mail and the pets to the pets, and both still sum to what the balance moved by. The
        // running balance is walked forward across the two rows rather than stamped with the final figure on
        // both, which would read as the pet row having banked the mail's coins too.
        const after = Number(g?.gold);
        const petAfter = Number.isFinite(after) ? after - ver.gold : undefined;
        if (pet.gold > 0) await logCoin(buyerId, pet.gold, "pet_income", { balanceAfter: petAfter }).catch(() => {});
        if (ver.gold > 0) await logCoin(buyerId, ver.gold, VERIFIED_INCOME_REASON, { balanceAfter: Number.isFinite(after) ? after : undefined }).catch(() => {});
    }
    // Accumulate toward the daily recap ("here's what you banked while you were away").
    if (xp > 0 || gold > 0) await db.query(`UPDATE mkt_buyer SET recap_xp = recap_xp + $2, recap_gold = recap_gold + $3 WHERE id = $1`, [buyerId, xp, gold]).catch(() => {});
    return { xp, gold, pet, verified: ver };
}

// Once-a-day recap of what idle income banked. Settles first (so the tally is current), then — at most once
// per store-local day — hands back the accumulated XP/gold and resets it. Returns { show:false } the rest of
// the day.
export async function getIncomeRecap(buyerId) {
    if (!buyerId) return { show: false };
    await settleIdleIncome(buyerId).catch(() => {});
    const row = await db.queryOne(
        `SELECT recap_xp AS xp, recap_gold AS gold FROM mkt_buyer
          WHERE id = $1 AND (recap_shown_at IS NULL OR recap_shown_at < (NOW() AT TIME ZONE 'America/Chicago')::date)
            AND (recap_xp > 0 OR recap_gold > 0)`,
        [buyerId]
    ).catch(() => null);
    if (!row) return { show: false };
    // Claim atomically (guarded on the same once-a-day condition) so it shows at most once.
    const claim = await db.queryOne(
        `UPDATE mkt_buyer SET recap_xp = 0, recap_gold = 0, recap_shown_at = NOW()
          WHERE id = $1 AND (recap_shown_at IS NULL OR recap_shown_at < (NOW() AT TIME ZONE 'America/Chicago')::date) RETURNING id`,
        [buyerId]
    ).catch(() => null);
    if (!claim) return { show: false };
    return { show: true, xp: Number(row.xp) || 0, gold: Number(row.gold) || 0 };
}
