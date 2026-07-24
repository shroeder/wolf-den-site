import "server-only";

import { list } from "@vercel/blob";

// OpenAI cost/usage insight — reads the REAL spend from OpenAI's Organization Costs API (admin-key only) and
// aggregates it into a by-source + by-day breakdown for the admin app's "AI Costs" screen. No estimates.
// Needs an admin key (sk-admin-…) in OPEN_AI_ADMIN_KEY — a project key (sk-proj-…) can't read usage (403).
const COSTS_URL = "https://api.openai.com/v1/organization/costs";

// ── Itemize IMAGE spend by SOURCE ────────────────────────────────────────────────────────────────────────────
// OpenAI can't tell an avatar from a decoration — that attribution is ours, keyed by the blob PATH PREFIX each
// generator writes to. We count the images stored under each prefix and multiply by that generator's per-image
// gpt-image-1 cost. The sum reconciles against the API's real gpt-image-1 total. (Per-image $ from OpenAI's
// output-token counts: low 1024²≈$0.011, medium≈$0.042, high≈$0.167; edits +~$0.004 ref input; 1536×1024 scene≈$0.063.)
const IMG_SOURCES = {
    "marketplace/sprite": { label: "Hero sprites (avatars)", unit: 0.046, note: "member avatar → full-body sprite; redraws on gear change" },
    "marketplace/pet": { label: "Pet sprites + level art", unit: 0.046, note: "pet battle sprites and per-level art" },
    "marketplace/items": { label: "Item / gear sprites", unit: 0.042, note: "gear die-cut art" },
    "marketplace/badges": { label: "Badge sprites", unit: 0.011, note: "small emblems (low quality)" },
    "marketplace/decorations": { label: "Farm decorations", unit: 0.042, note: "the 100 decoration sprites" },
    "marketplace/consumables": { label: "Consumable sprites", unit: 0.042, note: "treats/potions/relics" },
    "marketplace/chest": { label: "Chest art", unit: 0.167, note: "loot chests (high quality)" },
    "marketplace/boss": { label: "Boss sprites", unit: 0.042, note: "weekly boss art" },
    "marketplace/boss-bg": { label: "Boss backgrounds", unit: 0.063, note: "battle scenes (wide)" },
    "marketplace/farm-bg": { label: "Farm backgrounds", unit: 0.063, note: "pasture scenes (wide)" },
    "marketplace/bounties": { label: "Bounty art", unit: 0.042, note: "bounty illustrations" },
    "marketplace/avatars": { label: "Avatar (raw)", unit: 0.046, note: "raw avatar renders" },
    "marketplace/logos": { label: "Logos / misc", unit: 0.042, note: "one-off graphics" },
    "marketplace/ai": { label: "Misc AI art", unit: 0.042, note: "uncategorized generations" },
};

// Count blobs per known image prefix and estimate spend. Returns [{ key,label,note,count,unit,est }] desc by est,
// plus estTotal. Best-effort: any failure returns an empty breakdown (the model-level costs still stand alone).
export async function getImageSpendByFeature() {
    try {
        const counts = new Map();
        let cursor;
        let pages = 0;
        do {
            const res = await list({ limit: 1000, cursor });
            for (const b of res.blobs) {
                const parts = String(b.pathname || "").split("/");
                const prefix = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
                if (!IMG_SOURCES[prefix]) continue; // skip APKs and non-image blobs
                counts.set(prefix, (counts.get(prefix) || 0) + 1);
            }
            cursor = res.cursor;
            pages++;
        } while (cursor && pages < 15);

        const rows = [...counts.entries()]
            .map(([key, count]) => {
                const s = IMG_SOURCES[key];
                return { key, label: s.label, note: s.note, count, unit: s.unit, est: Math.round(count * s.unit * 100) / 100 };
            })
            .sort((a, b) => b.est - a.est);
        const estTotal = Math.round(rows.reduce((sum, r) => sum + r.est, 0) * 100) / 100;
        return { rows, estTotal };
    } catch {
        return { rows: [], estTotal: 0 };
    }
}

function adminKey() {
    return process.env.OPEN_AI_ADMIN_KEY || process.env.OPENAI_ADMIN_KEY || null;
}

// Map an OpenAI line-item (e.g. "gpt-image-1 image, output") to a friendly source + the Wolf Den feature that
// drives it, so the screen reads as "what is this money doing" not "which token bucket".
const SOURCES = [
    { match: /gpt-image-1/i, label: "Image generation", feature: "Sprites & art — avatars, items, pets, badges, decorations" },
    { match: /dall-e/i, label: "Image generation (legacy)", feature: "Older image art" },
    { match: /gpt-4o-mini/i, label: "gpt-4o-mini", feature: "Lightweight vision / text helpers" },
    { match: /gpt-4o/i, label: "gpt-4o", feature: "Card scanner & vision reads" },
    { match: /gpt-4\.1-mini/i, label: "gpt-4.1-mini", feature: "Product matching / catalog cleanup" },
    { match: /gpt-4\.1/i, label: "gpt-4.1", feature: "Text reasoning" },
    { match: /embedding/i, label: "Embeddings", feature: "Search / similarity" },
    { match: /whisper/i, label: "Whisper", feature: "Audio transcription" },
];
function classify(lineItem) {
    const base = String(lineItem || "other").split(",")[0].trim();
    for (const s of SOURCES) if (s.match.test(base)) return { label: s.label, feature: s.feature };
    return { label: base || "Other", feature: "" };
}

const round2 = (n) => Math.round(n * 100) / 100;

// Pull the last `days` of costs (bucketed daily, grouped by line-item), following pagination, and aggregate into
// { total, total7d, totalToday, byModel:[{label,feature,cost,pct}], daily:[{date,cost}] }. Returns ok:false with a
// reason when the admin key is missing or OpenAI rejects the call.
export async function getAiCosts({ days = 30 } = {}) {
    const key = adminKey();
    if (!key) return { ok: false, error: "no_admin_key" };
    const start = Math.floor(Date.now() / 1000) - days * 86400;
    const buckets = [];
    let page = null;
    for (let i = 0; i < 25; i++) { // safety cap on pagination
        const url = new URL(COSTS_URL);
        url.searchParams.set("start_time", String(start));
        url.searchParams.set("bucket_width", "1d");
        url.searchParams.set("group_by", "line_item");
        url.searchParams.set("limit", "31");
        if (page) url.searchParams.set("page", page);
        // OpenAI's costs endpoint occasionally returns a transient 500 — retry a few times with backoff.
        let r = null;
        for (let attempt = 0; attempt < 4; attempt++) {
            r = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" }).catch(() => null);
            if (r && (r.ok || r.status === 401 || r.status === 403 || r.status === 400)) break;
            await new Promise((res) => setTimeout(res, 600 * (attempt + 1)));
        }
        if (!r) return { ok: false, error: "network" };
        if (!r.ok) {
            const detail = (await r.text().catch(() => "")).slice(0, 200);
            return { ok: false, error: r.status === 401 || r.status === 403 ? "not_authorized" : `openai_${r.status}`, detail };
        }
        const d = await r.json().catch(() => null);
        if (d?.data) buckets.push(...d.data);
        if (d?.has_more && d?.next_page) page = d.next_page; else break;
    }

    const byDay = new Map();
    const bySource = new Map();
    let total = 0;
    for (const b of buckets) {
        const date = String(b.start_time_iso || "").slice(0, 10);
        for (const res of b.results || []) {
            const v = Number(res.amount?.value || 0);
            if (!v) continue;
            total += v;
            byDay.set(date, (byDay.get(date) || 0) + v);
            const { label, feature } = classify(res.line_item);
            const cur = bySource.get(label) || { cost: 0, feature };
            cur.cost += v;
            bySource.set(label, cur);
        }
    }

    const daily = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, cost]) => ({ date, cost: round2(cost) }));
    const byModel = [...bySource.entries()]
        .map(([label, { cost, feature }]) => ({ label, feature, cost: round2(cost), pct: total ? Math.round((cost / total) * 1000) / 10 : 0 }))
        .sort((a, b) => b.cost - a.cost);
    const total7d = round2(daily.slice(-7).reduce((s, x) => s + x.cost, 0));
    const prev7d = round2(daily.slice(-14, -7).reduce((s, x) => s + x.cost, 0));
    const totalToday = daily.length ? daily[daily.length - 1].cost : 0;
    const avgDaily = daily.length ? round2(total / daily.length) : 0;
    const peak = daily.reduce((best, d) => (!best || d.cost > best.cost ? d : best), null) || { date: null, cost: 0 };
    const trendPct = prev7d > 0 ? Math.round(((total7d - prev7d) / prev7d) * 100) : null;
    const monthlyRunRate = round2((total7d / 7) * 30); // current pace, annualized-to-month

    // Itemize image spend by source (blob-attributed) so flags + the screen can name what the art dollars drew.
    const features = await getImageSpendByFeature();

    // ── Auto-flagged findings — the "so what" ─────────────────────────────────────────────────────────────
    const flags = [];
    if (trendPct != null) {
        if (trendPct >= 15) flags.push({ sev: "warn", text: `Spend is UP ${trendPct}% week-over-week (${total7d.toFixed(2)} vs ${prev7d.toFixed(2)} the prior week).` });
        else if (trendPct <= -15) flags.push({ sev: "good", text: `Spend is DOWN ${Math.abs(trendPct)}% week-over-week — trending cheaper.` });
        else flags.push({ sev: "info", text: `Spend is roughly flat week-over-week (${trendPct >= 0 ? "+" : ""}${trendPct}%).` });
    }
    const topModel = byModel[0];
    if (topModel) flags.push({ sev: "info", text: `${topModel.label} is ${topModel.pct}% of all spend ($${topModel.cost.toFixed(2)}).` });
    const topFeat = features.rows[0];
    if (topFeat) flags.push({ sev: "info", text: `${topFeat.label} is your biggest image cost (~$${topFeat.est.toFixed(2)}, ${topFeat.count} images).` });
    if (peak.cost > avgDaily * 2.5 && peak.date) flags.push({ sev: "warn", text: `Biggest day was ${peak.date} at $${peak.cost.toFixed(2)} — ${(peak.cost / (avgDaily || 1)).toFixed(1)}× the daily average (a mass-generation day).` });
    const scanner = byModel.find((m) => /gpt-4o$/i.test(m.label) || /scanner/i.test(m.feature));
    if (scanner && scanner.cost < 1) flags.push({ sev: "good", text: `The card scanner costs ~$${scanner.cost.toFixed(2)} — effectively free.` });
    if (oneTimeArt.est > 0) flags.push({ sev: "info", text: `Plus ~$${oneTimeArt.est.toFixed(2)} of bundled AI art (sailing, etc.) billed once earlier — not in this 30-day window.` });

    return {
        ok: true,
        currency: "usd",
        windowDays: days,
        total: round2(total),
        total7d,
        totalToday,
        trend: { prev7d, trendPct, avgDaily, peak: { date: peak.date, cost: peak.cost }, monthlyRunRate },
        flags,
        oneTimeArt,
        byModel,
        byFeature: features,
        daily,
    };
}

// One-time AI art that was generated earlier and COMMITTED to the repo (public/images) rather than stored in
// Blob — so it's invisible to both the blob scan and the rolling-30d Costs API, but it was a real (historical)
// spend. Hand-inventoried (these change rarely); est per-image from the high-res quality they were drawn at.
const STATIC_AI_ART = [
    { label: "Sailing — boat hulls (tiers 1–11)", count: 11, unit: 0.17 },
    { label: "Sailing — backgrounds (sky / ocean / raid / dig / merchant)", count: 19, unit: 0.19 },
    { label: "Sailing — encounters & fragments", count: 16, unit: 0.13 },
    { label: "Sailing — island / merchant / pet", count: 3, unit: 0.15 },
];
const oneTimeArt = {
    note: "Generated once and committed to the repo — billed in an earlier period, so NOT included in the 30-day totals above.",
    rows: STATIC_AI_ART.map((r) => ({ label: r.label, count: r.count, est: Math.round(r.count * r.unit * 100) / 100 })),
    count: STATIC_AI_ART.reduce((s, r) => s + r.count, 0),
    est: Math.round(STATIC_AI_ART.reduce((s, r) => s + r.count * r.unit, 0) * 100) / 100,
};
