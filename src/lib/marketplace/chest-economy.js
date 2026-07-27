import "server-only";

import { db } from "@/lib/db";

// Store-wide chest-drop analytics off the mkt_chest_grant ledger — which SOURCES hand out the most chests, and
// of which TIERS, so drop rates can be balanced. Read-only.

const SOURCE_LABEL = {
    boss_kill: "Boss kill", level_up: "Level-up", daily_checkin: "Daily check-in", feature_daily: "Feature daily",
    happy_hour: "Happy hour", quest: "Quest", daily_spin: "Daily spin", harvest: "Farm harvest",
    sailing: "Sailing loot", sailing_forge: "Sailing forge", referral: "Referral", giveaway: "Giveaway",
    admin_grant: "Admin gift", unknown: "Unknown",
};
export const chestSourceLabel = (s) => SOURCE_LABEL[s] || s;
const TIER_ORDER = ["wooden", "iron", "gold", "mythic", "ascendant", "eternal", "celestial", "primordial"];

export async function getChestEconomy({ days = 30 } = {}) {
    const d = Math.max(1, Math.min(365, Number(days) || 30));
    const win = `NOW() - ($1 || ' days')::interval`;
    const [rows, dailyRows, totals] = await Promise.all([
        // Chests granted by (source × tier) over the window.
        db.query(`SELECT source, tier, SUM(count)::int AS n, COUNT(*)::int AS grants FROM mkt_chest_grant WHERE created_at >= ${win} GROUP BY source, tier`, [d]).catch(() => []),
        // Per store-local day (for a trend chart).
        db.query(`SELECT (created_at AT TIME ZONE 'America/Chicago')::date::text AS day, SUM(count)::int AS n FROM mkt_chest_grant WHERE created_at >= ${win} GROUP BY day ORDER BY day`, [d]).catch(() => []),
        db.queryOne(`SELECT COALESCE(SUM(count),0)::int AS n, COUNT(DISTINCT buyer_id)::int AS members FROM mkt_chest_grant WHERE created_at >= ${win}`, [d]).catch(() => null),
    ]);

    const bySourceMap = new Map();
    const byTierMap = new Map();
    for (const r of rows || []) {
        const n = Number(r.n) || 0;
        if (!bySourceMap.has(r.source)) bySourceMap.set(r.source, { source: r.source, label: chestSourceLabel(r.source), total: 0, tiers: {} });
        const s = bySourceMap.get(r.source);
        s.total += n;
        s.tiers[r.tier] = (s.tiers[r.tier] || 0) + n;
        byTierMap.set(r.tier, (byTierMap.get(r.tier) || 0) + n);
    }
    const tierRank = (t) => { const i = TIER_ORDER.indexOf(t); return i === -1 ? 999 : i; };
    const bySource = [...bySourceMap.values()].sort((a, b) => b.total - a.total);
    const byTier = [...byTierMap.entries()].map(([tier, total]) => ({ tier, total })).sort((a, b) => tierRank(a.tier) - tierRank(b.tier));

    return {
        days: d,
        total: totals?.n || 0, // total chests granted in the window
        members: totals?.members || 0, // distinct members who got a chest
        bySource, // [{ source, label, total, tiers: { tier: n } }] — biggest source first
        byTier, // [{ tier, total }] in tier order
        daily: (dailyRows || []).map((r) => ({ date: r.day, n: Number(r.n) || 0 })),
    };
}
