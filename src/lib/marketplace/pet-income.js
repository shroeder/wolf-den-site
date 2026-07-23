import "server-only";

import { db } from "@/lib/db";
import { getPetCombatBonus } from "@/lib/marketplace/pet-combat.js";
import { awardXp } from "@/lib/marketplace/xp.js";
import { logCoin } from "@/lib/marketplace/coins.js";

// ===== Pet passive income =====
// "Earner" pets carry xp_gain / gold_find affinity (and fortune → boss-raffle luck). Those used to be dead
// stats nothing read. Now the equipped-active + all owned-passive earner points convert to a real per-hour
// income the player accrues while their menagerie is working, plus raffle tickets from fortune (spent in
// boss.js). Income is settled LAZILY on game reads — no cron — with an offline cap so leaving a pet equipped
// for a week doesn't dump a lump sum (encourages checking in).

const XP_PER_POINT = 1; // each xp_gain point → +1 XP / hour
const GOLD_PER_POINT = 2; // each gold_find point → +2 gold / hour
const MAX_ACCRUE_HOURS = 24; // offline accrual cap

// The player's current pet income rate (for display + settling). rafflePerDay is consumed by boss.js, not here.
export async function petIncomeRate(buyerId) {
    if (!buyerId) return { xpPerHour: 0, goldPerHour: 0, raffleTickets: 0 };
    const bonus = await getPetCombatBonus(buyerId).catch(() => ({ economy: {}, stats: {} }));
    return {
        xpPerHour: Math.round((bonus.economy?.xp_gain || 0) * XP_PER_POINT),
        goldPerHour: Math.round((bonus.economy?.gold_find || 0) * GOLD_PER_POINT),
        raffleTickets: Math.round(bonus.stats?.fortune || 0),
    };
}

// Credit whatever pet income has accrued since the last settle. Best-effort + race-safe (the clock advance is
// a conditional UPDATE keyed to the timestamp we read, so a concurrent settle can't double-pay). Safe to call
// on any authed game read; returns what was just credited so the UI can show a "your pets earned X" nudge.
export async function settlePetIncome(buyerId) {
    if (!buyerId) return { xp: 0, gold: 0 };
    const row = await db.queryOne(`SELECT pet_income_at FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    if (!row) return { xp: 0, gold: 0 };
    // First ever call just starts the clock — don't back-pay from account creation.
    if (!row.pet_income_at) {
        await db.query(`UPDATE mkt_buyer SET pet_income_at = NOW() WHERE id = $1`, [buyerId]).catch(() => {});
        return { xp: 0, gold: 0 };
    }
    const hours = Math.min(MAX_ACCRUE_HOURS, Math.max(0, (Date.now() - new Date(row.pet_income_at).getTime()) / 3600000));
    if (hours < 0.02) return { xp: 0, gold: 0 }; // <~1 min — nothing meaningful; leave the clock so fractions build
    const { xpPerHour, goldPerHour } = await petIncomeRate(buyerId);
    const xp = Math.floor(xpPerHour * hours);
    const gold = Math.floor(goldPerHour * hours);
    if (xp <= 0 && gold <= 0) {
        // No earners → advance the clock so idle time doesn't bank against a future earner pet.
        await db.query(`UPDATE mkt_buyer SET pet_income_at = NOW() WHERE id = $1`, [buyerId]).catch(() => {});
        return { xp: 0, gold: 0 };
    }
    // Advance the clock by only the WHOLE-unit time we're paying out (sub-unit remainder carries over), and do
    // it as a guarded UPDATE so only one concurrent caller claims this window.
    const consumedHours = Math.max(xpPerHour > 0 ? xp / xpPerHour : 0, goldPerHour > 0 ? gold / goldPerHour : 0);
    const claim = await db
        .queryOne(
            `UPDATE mkt_buyer SET pet_income_at = pet_income_at + ($2 || ' hours')::interval
              WHERE id = $1 AND pet_income_at = $3 RETURNING id`,
            [buyerId, consumedHours, row.pet_income_at]
        )
        .catch(() => null);
    if (!claim) return { xp: 0, gold: 0 }; // lost the race — the other caller credited it
    if (xp > 0) await awardXp(buyerId, "pet_income", { points: xp, gold: 0 }).catch(() => {}); // XP only; gold below
    if (gold > 0) {
        const g = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, gold]).catch(() => null);
        await logCoin(buyerId, gold, "pet_income", { balanceAfter: g?.gold }).catch(() => {});
    }
    return { xp, gold };
}
