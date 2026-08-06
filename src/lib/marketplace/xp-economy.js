import "server-only";

import { db } from "@/lib/db";

// Admin XP-economy analytics off the mkt_xp_event ledger: how much XP the pack earns, by source, per day,
// and who's earning the most. XP is award-only (no sinks), so this is a pure "gain by source" view — the
// sibling of coin-economy.js. Read-only.

const XP_ACTION = {
    spin_reward: "🎡 Spin reward", boss_attack: "⚔️ Boss strike", boss_participated: "🐉 Boss joined", boss_won: "🏆 Boss win",
    purchase_spend: "🛒 In-store spend", purchase_flat: "🛒 In-store visit", first_purchase: "✨ First purchase",
    donate_event: "🎁 Event donation", donation: "🎁 Donation", badge_earned: "🎖️ Badge earned",
    harvest: "🌾 Harvest", farm_daily: "🌱 Farm daily", farm_rate_get: "⭐ Farm rated", farm_rate_give: "👍 Rated a farm",
    pet_farm: "🐾 Pet petted", pet_farm_other: "🐾 Petted a friend's", sail_wave: "🌊 Sailing wave", sail_encounter: "🦑 Sea encounter",
    sail_raid_win: "🏴‍☠️ Raid win", ship_battle: "🚢 Ship battle", sailing_daily: "⛵ Sailing daily", cheer: "📣 Cheer", quests_cleared: "📜 Quests cleared",
    consumable: "🧪 Consumable", craft_enhance: "⚒️ Forge enhance", craft_salvage: "🔨 Forge salvage", craft_combine: "🧩 Forge combine",
    forge_daily: "🔥 Forge daily", daily_active: "📅 Daily active", first_friend: "👥 First friend", first_message: "✉️ First message",
    message: "✉️ Message", discord_link: "🔗 Discord linked", trade: "🤝 Trade", first_wishlist: "📝 First wishlist",
    profile_complete: "🧑 Profile done", first_equip: "🛡️ First equip", bounty_post: "🎯 Bounty posted", bounty_win: "🎯 Bounty won",
    bounty_complete: "🎯 Bounty done", referral: "🎁 Referral", admin_correction: "⚙️ Admin correction",
};
const xpLabel = (a) => XP_ACTION[a] || String(a || "xp").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export async function getXpEconomy({ days = 30 } = {}) {
    const d = Math.max(1, Math.min(365, Number(days) || 30));
    const win = `NOW() - make_interval(days => $1::int)`;
    const [dailyRows, sourceRows, earnerRows, totals] = await Promise.all([
        // XP earned per store-local day within the window.
        db.query(
            `SELECT (created_at AT TIME ZONE 'America/Chicago')::date::text AS day,
                    COALESCE(SUM(points), 0)::bigint AS points, COUNT(*)::int AS n
               FROM mkt_xp_event WHERE created_at >= ${win}
              GROUP BY day ORDER BY day`,
            [d]
        ).catch(() => []),
        // XP gained by source (action) over the window.
        db.query(
            `SELECT action, COALESCE(SUM(points), 0)::bigint AS points, COUNT(*)::int AS n
               FROM mkt_xp_event WHERE created_at >= ${win}
              GROUP BY action ORDER BY points DESC`,
            [d]
        ).catch(() => []),
        // Biggest XP earners over the window.
        db.query(
            `SELECT e.buyer_id, b.display_name, b.alias,
                    COALESCE(SUM(e.points), 0)::bigint AS points, COUNT(*)::int AS n
               FROM mkt_xp_event e JOIN mkt_buyer b ON b.id = e.buyer_id
              WHERE e.created_at >= ${win}
              GROUP BY e.buyer_id, b.display_name, b.alias
              ORDER BY points DESC LIMIT 20`,
            [d]
        ).catch(() => []),
        // Window total + all-time XP on the books.
        db.queryOne(
            `SELECT COALESCE(SUM(points) FILTER (WHERE created_at >= ${win}), 0)::bigint AS win_points,
                    COALESCE(SUM(points), 0)::bigint AS all_points,
                    COUNT(*) FILTER (WHERE created_at >= ${win})::int AS win_events
               FROM mkt_xp_event`,
            [d]
        ).catch(() => null),
    ]);

    const nameOf = (r) => r.display_name || (r.alias ? `@${r.alias}` : "Member");
    return {
        days: d,
        windowPoints: Number(totals?.win_points) || 0,
        windowEvents: Number(totals?.win_events) || 0,
        allTimePoints: Number(totals?.all_points) || 0,
        daily: (dailyRows || []).map((r) => ({ date: r.day, points: Number(r.points) || 0, n: Number(r.n) || 0 })),
        bySource: (sourceRows || []).map((r) => ({ action: r.action, label: xpLabel(r.action), points: Number(r.points) || 0, n: Number(r.n) || 0 })),
        topEarners: (earnerRows || []).map((r) => ({ id: r.buyer_id, name: nameOf(r), alias: r.alias || null, points: Number(r.points) || 0, n: Number(r.n) || 0 })),
    };
}
