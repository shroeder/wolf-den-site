import "server-only";

import { db } from "@/lib/db";

// Admin lever: RESET a member's (or everyone's) daily usage so a capped action is available again, or GRANT a
// number of free uses. Powers the "Resets & Free Uses" admin screen. buyerId null = the whole server.
const TODAY = "(NOW() AT TIME ZONE 'America/Chicago')::date";
const NEXT_MIDNIGHT = "((date_trunc('day', NOW() AT TIME ZONE 'America/Chicago') + interval '1 day') AT TIME ZONE 'America/Chicago')";

// The catalog the admin screen renders. `can`: which operations apply. `unit`: label for grant amounts.
export const RESET_CATALOG = [
    { key: "boss_strikes",   label: "Boss attacks",           icon: "⚔️", can: ["grant"],          unit: "attacks", note: "Bonus boss attacks today (expire at midnight)." },
    { key: "cheers",         label: "Boss cheers",            icon: "📣", can: ["reset"],           note: "Refreshes today's 3 cheers." },
    { key: "spin",           label: "Daily spin",             icon: "🎡", can: ["reset"],           note: "Free daily wheel spin available again." },
    { key: "spin_tokens",    label: "Spin tokens",            icon: "🎟️", can: ["grant"],          unit: "spins",   note: "Extra wheel spins (bankable)." },
    { key: "checkin",        label: "Daily check-in",         icon: "📅", can: ["reset"],           note: "Streak check-in claimable again today." },
    { key: "quests",         label: "Daily quests",           icon: "📜", can: ["reset"],           note: "Wipes today's quests → a fresh set of 3." },
    { key: "quest_reroll",   label: "Quest re-roll",          icon: "🔀", can: ["reset"],           note: "Free daily quest re-roll available again." },
    { key: "raid",           label: "Sailing — raid",         icon: "🏴‍☠️", can: ["reset", "grant"], unit: "raids", note: "Daily raid available again / grant extra raids." },
    { key: "waves",          label: "Sailing — waves",        icon: "👋", can: ["reset"],           note: "Refreshes today's waves." },
    { key: "wind",           label: "Sailing — tailwind",     icon: "🌬️", can: ["reset"],          note: "Free daily tailwind available again." },
    { key: "gear_cooldowns", label: "Charged-gear cooldowns", icon: "⏳", can: ["reset"],           note: "Clears the cooldown on charged gear items." },
];

// Clear today's usage so the capped/daily action is available again. buyerId null = everyone.
export async function resetSystem(key, buyerId = null) {
    const one = Boolean(buyerId);
    const p = one ? [buyerId] : [];
    switch (key) {
        case "spin":         await db.query(`UPDATE mkt_buyer SET free_spin_day = NULL WHERE ${one ? "id = $1" : "alias IS NOT NULL"}`, p); break;
        case "checkin":      await db.query(`UPDATE mkt_buyer SET streak_claimed_day = NULL WHERE ${one ? "id = $1" : "alias IS NOT NULL"}`, p); break;
        case "quest_reroll": await db.query(`UPDATE mkt_buyer SET quest_reset_day = NULL WHERE ${one ? "id = $1" : "alias IS NOT NULL"}`, p); break;
        case "quests":       await db.query(`DELETE FROM mkt_daily_quest WHERE day = ${TODAY}${one ? " AND buyer_id = $1" : ""}`, p); break;
        case "cheers":       await db.query(`DELETE FROM mkt_cheer WHERE day = ${TODAY}${one ? " AND giver_id = $1" : ""}`, p); break;
        case "raid":         await db.query(`UPDATE mkt_sailing SET raid_count = 0${one ? " WHERE buyer_id = $1" : ""}`, p); break;
        case "waves":        await db.query(`UPDATE mkt_sailing SET wave_count = 0${one ? " WHERE buyer_id = $1" : ""}`, p); break;
        case "wind":         await db.query(`UPDATE mkt_sailing SET wind_day = NULL${one ? " WHERE buyer_id = $1" : ""}`, p); break;
        case "gear_cooldowns": await db.query(`UPDATE mkt_user_item SET last_charge_at = NULL${one ? " WHERE buyer_id = $1" : ""}`, p); break;
        default: return { ok: false, error: "bad_key" };
    }
    return { ok: true, scope: one ? "member" : "everyone" };
}

// Grant N free uses. buyerId null = everyone.
export async function grantUses(key, n = 1, buyerId = null) {
    const amt = Math.max(1, Math.min(50, Math.round(Number(n) || 0)));
    const one = Boolean(buyerId);
    switch (key) {
        case "spin_tokens":
            await db.query(`UPDATE mkt_buyer SET spin_tokens = spin_tokens + $${one ? 2 : 1} WHERE ${one ? "id = $1" : "alias IS NOT NULL"}`, one ? [buyerId, amt] : [amt]);
            break;
        case "raid": // give back N daily raids (never below 0)
            await db.query(`UPDATE mkt_sailing SET raid_count = GREATEST(0, raid_count - $${one ? 2 : 1})${one ? " WHERE buyer_id = $1" : ""}`, one ? [buyerId, amt] : [amt]);
            break;
        case "boss_strikes": // bonus boss attacks that expire at store-midnight (same mechanism as consumables)
            if (one) await db.query(`INSERT INTO mkt_user_boost (buyer_id, kind, magnitude, expires_at) VALUES ($1, 'strikes', $2, ${NEXT_MIDNIGHT})`, [buyerId, amt]);
            else await db.query(`INSERT INTO mkt_user_boost (buyer_id, kind, magnitude, expires_at) SELECT id, 'strikes', $1, ${NEXT_MIDNIGHT} FROM mkt_buyer WHERE alias IS NOT NULL`, [amt]);
            break;
        default: return { ok: false, error: "bad_key" };
    }
    return { ok: true, amount: amt, scope: one ? "member" : "everyone" };
}
