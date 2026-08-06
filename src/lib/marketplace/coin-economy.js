import "server-only";

import { db } from "@/lib/db";

// Admin coin-economy analytics off the mkt_coin_event ledger: the circulating supply over time (inflation),
// minting vs burning per day, coin gain/usage by source, and the biggest holders + growers. Read-only.

const COIN_REASON = {
    raid_win: "⚔️ Raid win", ship_battle: "🚢 Ship battle", raid_loss: "🛡️ Raid loss", spin_prize: "🎡 Spin prize", boss_reward: "🐉 Boss reward",
    quest_reward: "📜 Quest reward", badge_reward: "🎖️ Badge reward", chest_reward: "🧰 Chest reward",
    checkin: "📅 Daily check-in", bounty: "🎯 Bounty", giveaway: "🎁 Giveaway", sell_gear: "💰 Sold gear",
    xp_accrual: "✨ XP accrual", coin_purchase: "🪙 Bought coins", admin_grant: "⚙️ Admin grant",
    buy_gear: "🛒 Bought gear", buy_pet: "🐾 Bought pet", buy_badge: "🎖️ Bought badge", buy_cosmetic: "🎨 Bought cosmetic",
    buy_consumable: "🧪 Bought supply", buy_daily_deal: "🔥 Daily deal", upgrade: "⬆️ Upgrade", cooldown_skip: "⏩ Cooldown skip",
    buy_digs: "⛏️ Bought digs", buy_spin: "🎟️ Bought spin", merchant_buy: "⛵ Merchant buy", happy_hour: "🍻 Happy hour",
    trade: "🤝 Trade", trade_escrow: "🤝 Trade escrow", harvest: "🌾 Harvest", harvest_loot: "🎁 Harvest loot",
    farm_upgrade: "🌱 Farm upgrade", loot_pig: "🐷 Loot pig", cheer: "📣 Cheer", seed_buy: "🌱 Seed",
};
const coinLabel = (r) => COIN_REASON[r] || String(r || "coins").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export async function getCoinEconomy({ days = 30 } = {}) {
    const d = Math.max(1, Math.min(365, Number(days) || 30));
    const win = `NOW() - ($1 || ' days')::interval`;
    const [startRow, dailyRows, sourceRows, holderRows, moverRows, totals] = await Promise.all([
        // Circulating supply (per the ledger) at the START of the window = sum of every delta before it.
        db.queryOne(`SELECT COALESCE(SUM(delta), 0)::bigint AS s FROM mkt_coin_event WHERE created_at < ${win}`, [d]).catch(() => null),
        // Minted (earned) vs burned (spent) per store-local day within the window.
        db.query(
            `SELECT (created_at AT TIME ZONE 'America/Chicago')::date::text AS day,
                    COALESCE(SUM(delta) FILTER (WHERE delta > 0), 0)::bigint AS earned,
                    COALESCE(-SUM(delta) FILTER (WHERE delta < 0), 0)::bigint AS spent
               FROM mkt_coin_event WHERE created_at >= ${win}
              GROUP BY day ORDER BY day`,
            [d]
        ).catch(() => []),
        // Coin gain / usage by source (reason) over the window.
        db.query(
            `SELECT reason,
                    COALESCE(SUM(delta) FILTER (WHERE delta > 0), 0)::bigint AS earned,
                    COALESCE(-SUM(delta) FILTER (WHERE delta < 0), 0)::bigint AS spent,
                    COUNT(*)::int AS n
               FROM mkt_coin_event WHERE created_at >= ${win}
              GROUP BY reason ORDER BY earned DESC, spent DESC`,
            [d]
        ).catch(() => []),
        // Biggest current holders.
        db.query(`SELECT id, display_name, alias, COALESCE(gold, 0)::bigint AS gold FROM mkt_buyer WHERE COALESCE(gold, 0) > 0 ORDER BY gold DESC LIMIT 20`).catch(() => []),
        // Biggest movers: net coin growth over the window (earned − spent).
        db.query(
            `SELECT e.buyer_id, b.display_name, b.alias,
                    COALESCE(SUM(e.delta) FILTER (WHERE e.delta > 0), 0)::bigint AS earned,
                    COALESCE(-SUM(e.delta) FILTER (WHERE e.delta < 0), 0)::bigint AS spent
               FROM mkt_coin_event e JOIN mkt_buyer b ON b.id = e.buyer_id
              WHERE e.created_at >= ${win}
              GROUP BY e.buyer_id, b.display_name, b.alias
              ORDER BY COALESCE(SUM(e.delta), 0) DESC
              LIMIT 20`,
            [d]
        ).catch(() => []),
        // Current circulating supply = every member's gold, and how many hold any.
        db.queryOne(`SELECT COALESCE(SUM(gold), 0)::bigint AS supply, COUNT(*) FILTER (WHERE COALESCE(gold, 0) > 0)::int AS holders FROM mkt_buyer`).catch(() => null),
    ]);

    let running = Number(startRow?.s) || 0;
    const daily = (dailyRows || []).map((r) => {
        const minted = Number(r.earned) || 0;
        const burned = Number(r.spent) || 0;
        running += minted - burned;
        return { date: r.day, minted, burned, net: minted - burned, supply: running };
    });
    const bySource = (sourceRows || []).map((r) => ({
        reason: r.reason, label: coinLabel(r.reason), earned: Number(r.earned) || 0, spent: Number(r.spent) || 0,
        net: (Number(r.earned) || 0) - (Number(r.spent) || 0), n: Number(r.n) || 0,
    }));
    const windowMinted = bySource.reduce((s, x) => s + x.earned, 0);
    const windowBurned = bySource.reduce((s, x) => s + x.spent, 0);
    const nameOf = (r) => r.display_name || (r.alias ? `@${r.alias}` : "Member");

    return {
        days: d,
        supply: Number(totals?.supply) || 0, // current circulating coins (sum of everyone's gold)
        holders: totals?.holders || 0,
        windowMinted, windowBurned, windowNet: windowMinted - windowBurned,
        // Inflation = how much the ledger supply grew over the window (from the earliest daily point).
        inflation: daily.length ? daily[daily.length - 1].supply - (daily[0].supply - daily[0].net) : 0,
        daily, // [{ date, minted, burned, net, supply }] — supply is the inflation curve
        bySource, // [{ reason, label, earned, spent, net, n }]
        topHolders: (holderRows || []).map((h) => ({ id: h.id, name: nameOf(h), alias: h.alias || null, gold: Number(h.gold) || 0 })),
        topGrowers: (moverRows || []).map((m) => ({ id: m.buyer_id, name: nameOf(m), alias: m.alias || null, earned: Number(m.earned) || 0, spent: Number(m.spent) || 0, net: (Number(m.earned) || 0) - (Number(m.spent) || 0) })),
    };
}
