import "server-only";

// OpenAI cost/usage insight — reads the REAL spend from OpenAI's Organization Costs API (admin-key only) and
// aggregates it into a by-source + by-day breakdown for the admin app's "AI Costs" screen. No estimates.
// Needs an admin key (sk-admin-…) in OPEN_AI_ADMIN_KEY — a project key (sk-proj-…) can't read usage (403).
const COSTS_URL = "https://api.openai.com/v1/organization/costs";

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
    const totalToday = daily.length ? daily[daily.length - 1].cost : 0;

    return {
        ok: true,
        currency: "usd",
        windowDays: days,
        total: round2(total),
        total7d,
        totalToday,
        byModel,
        daily,
    };
}
