import "server-only";

import { db } from "@/lib/db";
import { itemById } from "@/lib/marketplace/items.js";

// Admin telemetry for The Forge off mkt_craft_event: raw usage (per action, item, timestamp), the mini-game
// grade distribution, a 30-day activity trend, top items, an adoption/abandonment funnel, and a recent feed.
export async function getCraftingAdmin() {
    const [totals, dailyRows, itemRows, gradeRows, recentRows, funnel] = await Promise.all([
        db.queryOne(
            `SELECT COUNT(*) FILTER (WHERE action='salvage')::int AS salvages,
                    COUNT(*) FILTER (WHERE action='combine')::int AS combines,
                    COUNT(*) FILTER (WHERE action='enhance')::int AS enhances,
                    COUNT(*) FILTER (WHERE action='upgrade')::int  AS upgrades,
                    COUNT(DISTINCT buyer_id)::int AS crafters
               FROM mkt_craft_event`
        ).catch(() => null),
        db.query(
            `SELECT (created_at AT TIME ZONE 'America/Chicago')::date::text AS day,
                    COUNT(*) FILTER (WHERE action='salvage')::int AS salvages,
                    COUNT(*) FILTER (WHERE action='enhance')::int AS enhances,
                    COUNT(*) FILTER (WHERE action='combine')::int AS combines
               FROM mkt_craft_event WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY day ORDER BY day`
        ).catch(() => []),
        db.query(`SELECT item_id, action, COUNT(*)::int AS n FROM mkt_craft_event WHERE item_id IS NOT NULL AND action IN ('salvage','enhance') GROUP BY item_id, action ORDER BY n DESC LIMIT 60`).catch(() => []),
        db.query(`SELECT grade, COUNT(*)::int AS n, COALESCE(AVG(score),0)::int AS avg_score FROM mkt_craft_event WHERE action='enhance' AND grade IS NOT NULL GROUP BY grade`).catch(() => []),
        db.query(
            `SELECT e.action, e.item_id, e.tier, e.score, e.grade, e.meta, e.created_at, b.display_name, b.alias
               FROM mkt_craft_event e JOIN mkt_buyer b ON b.id = e.buyer_id
              ORDER BY e.created_at DESC LIMIT 60`
        ).catch(() => []),
        db.queryOne(
            `SELECT COUNT(DISTINCT buyer_id) FILTER (WHERE action='open_forge')::int AS opened,
                    COUNT(DISTINCT buyer_id) FILTER (WHERE action IN ('salvage','enhance','combine','upgrade'))::int AS acted,
                    COUNT(DISTINCT buyer_id) FILTER (WHERE action='enhance')::int AS enhanced
               FROM mkt_craft_event`
        ).catch(() => null),
    ]);

    const gradeMap = {};
    for (const r of gradeRows || []) gradeMap[r.grade] = { n: r.n, avgScore: r.avg_score };
    const byItem = {};
    for (const r of itemRows || []) {
        const it = itemById(r.item_id);
        if (!byItem[r.item_id]) byItem[r.item_id] = { id: r.item_id, name: it?.name || r.item_id, rarity: it?.rarity || null, salvage: 0, enhance: 0 };
        byItem[r.item_id][r.action] = r.n;
    }
    const items = Object.values(byItem).sort((a, b) => b.salvage + b.enhance - (a.salvage + a.enhance)).slice(0, 24);
    const meta = (m) => (typeof m === "string" ? (() => { try { return JSON.parse(m); } catch { return {}; } })() : m || {});
    const recent = (recentRows || []).map((r) => ({
        action: r.action, item: itemById(r.item_id)?.name || r.item_id || null, tier: r.tier, score: r.score, grade: r.grade,
        level: meta(r.meta)?.level ?? null, name: r.display_name || (r.alias ? `@${r.alias}` : "Member"), at: r.created_at,
    }));
    const opened = funnel?.opened || 0;
    const acted = funnel?.acted || 0;
    return {
        totals: { salvages: totals?.salvages || 0, combines: totals?.combines || 0, enhances: totals?.enhances || 0, upgrades: totals?.upgrades || 0, crafters: totals?.crafters || 0 },
        daily: (dailyRows || []).map((r) => ({ date: r.day, salvages: r.salvages, enhances: r.enhances, combines: r.combines })),
        items,
        grades: ["good", "great", "perfect", "pixel"].map((g) => ({ grade: g, n: gradeMap[g]?.n || 0, avgScore: gradeMap[g]?.avgScore || 0 })),
        funnel: { opened, acted, enhanced: funnel?.enhanced || 0, abandonRate: opened > 0 ? Math.round((1 - acted / opened) * 100) : 0 },
        recent,
    };
}
