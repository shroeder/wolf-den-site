import "server-only";

import { db } from "@/lib/db";

// ── THE CHEST LEDGER, THE WAY THE COIN LEDGER IS READ ────────────────────────────────────────────────────────
// Luke: "I want chest economy to be built just like coin economy in the accounting app."
//
// The coin dashboard works because mkt_coin_event carries BOTH directions — a positive delta mints, a negative
// one burns — so supply, inflation, sink rate and gain-versus-usage by source all fall out of one table. This
// file used to answer half of that: mkt_chest_grant records every chest handed out and by which source, and
// nothing at all recorded a chest being opened. So the screen could say 7,168 were given away in thirty days
// and could not say whether a single one had been spent.
//
// mkt_chest_open (migration 407) is the other half, and this returns the same shape getCoinEconomy does so the
// two screens can be the same screen about a different thing.
//
// ── WHAT IS MEASURED AND WHAT IS DERIVED ─────────────────────────────────────────────────────────────────────
// Opens were never recorded before 407 and there is no honest way to invent them, so the per-day burn series
// starts the day it landed and is empty to the left of that. Two things rescue the dashboard from being
// useless until a month has passed:
//
//   SUPPLY is measured directly — mkt_user_chest is the real stock, right now, no reconstruction involved.
//   LIFETIME BURN is arithmetic rather than a guess: everything ever granted minus everything still held IS
//   everything ever opened, because opening is the only way a chest leaves. That gives a true lifetime sink
//   rate on day one.
//
// Both are flagged in the payload (`burnFrom`, `lifetime`) rather than blended into the window figures, because
// a dashboard that quietly mixes a measured number with a derived one is worse than one that shows neither.
const SOURCE_LABEL = {
    boss_kill: "Boss kill", level_up: "Level-up", daily_checkin: "Daily check-in", feature_daily: "Feature daily",
    happy_hour: "Happy hour", quest: "Quest", daily_spin: "Daily spin", harvest: "Farm harvest",
    sailing: "Sailing loot", sailing_forge: "Sailing forge", referral: "Referral", giveaway: "Giveaway",
    admin_grant: "Admin gift", mining: "Mining", delve: "Delve", store: "Chip store", arena: "Arena",
    open: "Opened", unknown: "Unknown",
};
export const chestSourceLabel = (s) => SOURCE_LABEL[s] || s;
const TIER_ORDER = ["wooden", "iron", "gold", "mythic", "ascendant", "eternal", "celestial", "primordial"];
const tierRank = (t) => { const i = TIER_ORDER.indexOf(t); return i === -1 ? 999 : i; };

export async function getChestEconomy({ days = 30 } = {}) {
    const d = Math.max(1, Math.min(365, Number(days) || 30));
    const win = `NOW() - ($1 || ' days')::interval`;
    // Store-local days, like every other daily rollup in this codebase — a UTC day boundary falls at 7pm in
    // Montgomery and would split every evening's activity across two bars.
    const DAY = `(created_at AT TIME ZONE 'America/Chicago')::date::text`;

    const [grantRows, openRows, grantDaily, openDaily, stock, holders, lifetime, holderRows, moverRows] = await Promise.all([
        db.query(`SELECT source, tier, SUM(count)::int AS n, COUNT(*)::int AS grants FROM mkt_chest_grant WHERE created_at >= ${win} GROUP BY source, tier`, [d]).catch(() => []),
        db.query(`SELECT tier, SUM(count)::int AS n, COUNT(*)::int AS opens FROM mkt_chest_open WHERE created_at >= ${win} GROUP BY tier`, [d]).catch(() => []),
        db.query(`SELECT ${DAY} AS day, SUM(count)::int AS n FROM mkt_chest_grant WHERE created_at >= ${win} GROUP BY day ORDER BY day`, [d]).catch(() => []),
        db.query(`SELECT ${DAY} AS day, SUM(count)::int AS n FROM mkt_chest_open WHERE created_at >= ${win} GROUP BY day ORDER BY day`, [d]).catch(() => []),
        // The real pile, right now. Not reconstructed from anything.
        db.queryOne(`SELECT COALESCE(SUM(count),0)::int AS n FROM mkt_user_chest WHERE count > 0`, []).catch(() => null),
        db.queryOne(`SELECT COUNT(DISTINCT buyer_id)::int AS n FROM mkt_user_chest WHERE count > 0`, []).catch(() => null),
        db.queryOne(`SELECT COALESCE((SELECT SUM(count) FROM mkt_chest_grant),0)::bigint AS granted,
                            COALESCE((SELECT SUM(count) FROM mkt_chest_open),0)::bigint AS opened`, []).catch(() => null),
        db.query(`SELECT c.buyer_id, SUM(c.count)::int AS held, b.display_name, b.alias
                    FROM mkt_user_chest c JOIN mkt_buyer b ON b.id = c.buyer_id
                   WHERE c.count > 0 GROUP BY c.buyer_id, b.display_name, b.alias
                   ORDER BY held DESC LIMIT 10`, []).catch(() => []),
        db.query(`SELECT g.buyer_id, SUM(g.count)::int AS got, b.display_name, b.alias
                    FROM mkt_chest_grant g JOIN mkt_buyer b ON b.id = g.buyer_id
                   WHERE g.created_at >= ${win} GROUP BY g.buyer_id, b.display_name, b.alias
                   ORDER BY got DESC LIMIT 10`, [d]).catch(() => []),
    ]);

    // ── BY SOURCE, BOTH DIRECTIONS ───────────────────────────────────────────────────────────────────────
    // Same row shape the coin screen renders: what a source PUT IN and what it TOOK OUT. Only one thing takes
    // chests out today — opening them — so it is one red row against many green ones, which is exactly the
    // picture worth looking at.
    const bySourceMap = new Map();
    const byTierMap = new Map();
    for (const r of grantRows || []) {
        const n = Number(r.n) || 0;
        if (!bySourceMap.has(r.source)) bySourceMap.set(r.source, { source: r.source, label: chestSourceLabel(r.source), earned: 0, spent: 0, n: 0, tiers: {} });
        const s = bySourceMap.get(r.source);
        s.earned += n; s.n += Number(r.grants) || 0;
        s.tiers[r.tier] = (s.tiers[r.tier] || 0) + n;
        byTierMap.set(r.tier, (byTierMap.get(r.tier) || 0) + n);
    }
    const openedTotal = (openRows || []).reduce((t, r) => t + (Number(r.n) || 0), 0);
    if (openedTotal > 0) {
        const tiers = {};
        for (const r of openRows || []) tiers[r.tier] = Number(r.n) || 0;
        bySourceMap.set("open", {
            source: "open", label: chestSourceLabel("open"), earned: 0, spent: openedTotal,
            n: (openRows || []).reduce((t, r) => t + (Number(r.opens) || 0), 0), tiers,
        });
    }
    const bySource = [...bySourceMap.values()]
        .map((s) => ({ ...s, net: s.earned - s.spent }))
        .sort((a, b) => (b.earned + b.spent) - (a.earned + a.spent));

    // ── THE DAILY SERIES, AND THE SUPPLY CURVE ───────────────────────────────────────────────────────────
    // The mint and burn lines are straight counts and always honest. The SUPPLY curve is not something this
    // can compute for a day before opens were being recorded, and the first attempt proved it: walking
    // backwards from today's real pile and subtracting only the grants drove the line to MINUS 6,893, because
    // for those days it believed nobody had ever opened anything.
    //
    // A negative pile is not an approximation, it is a wrong answer drawn confidently. So the curve exists
    // only over the stretch where both halves of the ledger are real — from the first recorded open onward —
    // and is null before that. The screen draws nothing there and says why, which is the honest shape of
    // "we did not measure this yet".
    //
    // Within that stretch it is still walked BACKWARDS from the pile we can actually measure, so the
    // right-hand end is anchored to a real number rather than to a reconstruction.
    const mintByDay = new Map((grantDaily || []).map((r) => [r.day, Number(r.n) || 0]));
    const burnByDay = new Map((openDaily || []).map((r) => [r.day, Number(r.n) || 0]));
    // `dayKeys`, not `days` — that name is already the window size on this function, and two meanings
    // for one short name in one scope is how the wrong one gets used.
    const dayKeys = [...new Set([...mintByDay.keys(), ...burnByDay.keys()])].sort();
    const supplyNow = Number(stock?.n) || 0;
    const firstOpenDay = (openDaily || [])[0]?.day || null;
    const daily = [];
    let running = supplyNow;
    for (let i = dayKeys.length - 1; i >= 0; i -= 1) {
        const date = dayKeys[i];
        const minted = mintByDay.get(date) || 0;
        const burned = burnByDay.get(date) || 0;
        // Only days at or after the first recorded open carry a supply figure.
        const known = firstOpenDay != null && date >= firstOpenDay;
        daily.unshift({ date, minted, burned, net: minted - burned, supply: known ? Math.max(0, running) : null });
        running = running - minted + burned;
    }

    const windowMinted = daily.reduce((t, x) => t + x.minted, 0);
    const windowBurned = daily.reduce((t, x) => t + x.burned, 0);
    const nameOf = (r) => r.display_name || (r.alias ? `@${r.alias}` : "Member");
    const everGranted = Number(lifetime?.granted) || 0;

    return {
        days: d,
        supply: supplyNow,                     // chests sitting unopened right now — measured
        holders: Number(holders?.n) || 0,
        windowMinted, windowBurned, windowNet: windowMinted - windowBurned,
        // Only meaningful over the measured stretch; zero until there is one.
        inflation: (() => {
            const known = daily.filter((x) => x.supply != null);
            return known.length ? known[known.length - 1].supply - (known[0].supply - known[0].net) : 0;
        })(),
        daily,                                 // [{ date, minted, burned, net, supply }]
        bySource,                              // [{ source, label, earned, spent, net, n, tiers }]
        byTier: [...byTierMap.entries()].map(([tier, total]) => ({ tier, total })).sort((a, b) => tierRank(a.tier) - tierRank(b.tier)),
        topHolders: (holderRows || []).map((h) => ({ id: h.buyer_id, name: nameOf(h), alias: h.alias || null, chests: Number(h.held) || 0 })),
        topGrowers: (moverRows || []).map((m) => ({ id: m.buyer_id, name: nameOf(m), alias: m.alias || null, earned: Number(m.got) || 0, spent: 0, net: Number(m.got) || 0 })),
        // ── THE HONEST FOOTNOTES ─────────────────────────────────────────────────────────────────────
        // The screen prints these rather than pretending the window figures are the whole story.
        lifetime: {
            granted: everGranted,
            // Everything ever granted, minus everything still held. Opening is the only way a chest leaves,
            // so this is exact even for the years before anything was logging opens.
            opened: Math.max(0, everGranted - supplyNow),
            sinkRate: everGranted ? Math.round(((everGranted - supplyNow) / everGranted) * 1000) / 10 : 0,
        },
        // The day the burn series becomes real. Anything left of this on the chart is mint-only.
        burnFrom: (openDaily || [])[0]?.day || null,
        // Kept so the existing screen keeps working while the new one ships.
        total: windowMinted,
        members: (moverRows || []).length,
    };
}
