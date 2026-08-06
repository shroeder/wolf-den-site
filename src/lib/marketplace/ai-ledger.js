import "server-only";

import { db } from "@/lib/db";

// ── The AI generation ledger ──────────────────────────────────────────────────────────────────────────────
// One row per image we ask OpenAI to draw: what it was, what it cost, and what caused it. See migration 293.
//
// Writes are ALWAYS best-effort. Bookkeeping must never be the reason a sprite fails to save — a lost ledger
// row is an accounting gap, a thrown error would be a broken feature.

// gpt-image-1 output-token counts per image, times $40/1M output tokens. These are the real billed numbers,
// not list-price guesses: a 1024x1024 is 272 tokens at low, 1,056 at medium, 4,160 at high, which is why
// "high" costs ~4x "medium" and dominates the bill.
const TOKENS = {
    "1024x1024": { low: 272, medium: 1056, high: 4160 },
    "1024x1536": { low: 408, medium: 1584, high: 6240 },
    "1536x1024": { low: 400, medium: 1568, high: 6208 },
};
// Output-token price per model, $/1M. gpt-image-1-mini bills output at a fifth of gpt-image-1 for the same
// token counts, which is what makes a medium-quality mini draw cheaper than a LOW-quality full-model one —
// measured at $0.0099 vs $0.0171 on the same prompt and reference.
const OUT_PER_M = { "gpt-image-1": 40, "gpt-image-1-mini": 8 };
const IN_PER_M = { "gpt-image-1": 10, "gpt-image-1-mini": 2.5 };
// The reference image fed back in on an edit/outpaint pass. Measured at 625 input tokens, and it does NOT
// scale with the reference we send — a 512px and a 1024px reference both bill 625, so shrinking it saves
// nothing.
const EDIT_INPUT_TOKENS = 625;

export function estimateImageCost({ size = "1024x1024", quality = "low", edit = false, model = "gpt-image-1" } = {}) {
    const row = TOKENS[size] || TOKENS["1024x1024"];
    const tokens = row[quality] ?? row.medium;
    const out = (OUT_PER_M[model] ?? OUT_PER_M["gpt-image-1"]) / 1_000_000;
    const inp = (IN_PER_M[model] ?? IN_PER_M["gpt-image-1"]) / 1_000_000;
    return Math.round((tokens * out + (edit ? EDIT_INPUT_TOKENS * inp : 0)) * 100000) / 100000;
}

// Text/vision pricing, $ per 1M tokens {in, out}. Priced from the token counts OpenAI returns on every
// response, so these are measured, not guessed.
const TEXT_PRICES = {
    "gpt-4o-mini": { in: 0.15, out: 0.60 },
    "gpt-4o": { in: 2.50, out: 10.00 },
    "gpt-4.1-mini": { in: 0.40, out: 1.60 },
    "gpt-4.1": { in: 2.00, out: 8.00 },
};
const textPrice = (model) => {
    const m = String(model || "");
    for (const k of Object.keys(TEXT_PRICES)) if (m.startsWith(k)) return TEXT_PRICES[k];
    return TEXT_PRICES["gpt-4o-mini"];
};
export function estimateTextCost({ model, tokensIn = 0, tokensOut = 0 } = {}) {
    const p = textPrice(model);
    return Math.round(((tokensIn / 1e6) * p.in + (tokensOut / 1e6) * p.out) * 1e6) / 1e6;
}

/**
 * Record a text/vision call. Same ledger, kind='text'. Never throws.
 * `usage` is OpenAI's own usage object off the response — pass it straight through.
 */
export async function logText({ model, usage, label, source, origin = "unknown", buyerId, buyerLabel, subject, ok = true, error } = {}) {
    try {
        const tokensIn = Number(usage?.prompt_tokens ?? usage?.input_tokens ?? 0) || 0;
        const tokensOut = Number(usage?.completion_tokens ?? usage?.output_tokens ?? 0) || 0;
        const cost = estimateTextCost({ model, tokensIn, tokensOut });
        await db.query(
            `INSERT INTO mkt_ai_generation
                (kind, model, source, label, subject, origin, buyer_id, buyer_label, ok, error,
                 tokens_in, tokens_out, cost_usd, cost_basis)
             VALUES ('text',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'measured')`,
            [model || "unknown", source || null, label || null, subject || null, origin,
                buyerId || null, buyerLabel || null, Boolean(ok), error ? String(error).slice(0, 600) : null,
                tokensIn, tokensOut, cost],
        );
    } catch { /* bookkeeping must never break the caller */ }
}

// Human label for a blob path prefix, so the history reads as features rather than folder names.
export const SOURCE_LABELS = {
    "marketplace/sprite": "Hero sprite",
    "marketplace/pet": "Pet sprite",
    "marketplace/items": "Gear sprite",
    "marketplace/badges": "Badge",
    "marketplace/decorations": "Farm decoration",
    "marketplace/decorations/custom": "Member creation",
    "marketplace/consumables": "Consumable",
    "marketplace/chest": "Chest art",
    "marketplace/boss": "Boss sprite",
    "marketplace/boss-bg": "Boss background",
    "marketplace/farm-bg": "Farm background",
    "marketplace/town": "Town art",
    "marketplace/bounties": "Bounty art",
    "marketplace/avatars": "Avatar render",
    "marketplace/logos": "Logo / misc",
    "marketplace/ai": "Misc AI art",
};
export const sourceLabel = (s) => SOURCE_LABELS[s] || SOURCE_LABELS[String(s || "").split("/").slice(0, 2).join("/")] || s || "Unknown";

/**
 * Record one generation. Never throws.
 *
 * meta.origin says HOW it happened, which is the question the screen exists to answer:
 *   batch    — a `scripts/gen-*.mjs` run (carry batchId + batchLabel so the run groups)
 *   creation — a member spent a Creation token (carry buyerId + buyerLabel: WHO)
 *   member   — member-triggered but not token-paid (avatar redraw on a gear change)
 *   cron     — a scheduled backfill job drew it unattended
 *   admin    — someone hit a Generate button in the admin app
 */
// EVERY attempt is a row, kept or thrown away. The bill doesn't care whether we liked the sprite, and a ledger
// that only counts the ones we shipped shows roughly half the real spend — which is exactly what it was doing.
export async function logGeneration({
    model = "gpt-image-1", size, quality, edit = false,
    source, label, subject, prompt, url, bytes,
    origin = "unknown", batchId, batchLabel, buyerId, buyerLabel,
    ok = true, error, costUsd, costBasis = "measured",
} = {}) {
    try {
        // Pass the model through — mini bills at a fifth, and pricing it as gpt-image-1 would overstate the
        // sprite line on the AI Costs screen by ~5x.
        const cost = costUsd != null ? costUsd : estimateImageCost({ size, quality, edit, model });
        await db.query(
            `INSERT INTO mkt_ai_generation
                (model, size, quality, edit, source, label, subject, prompt, url, bytes,
                 origin, batch_id, batch_label, buyer_id, buyer_label, ok, error, cost_usd, cost_basis)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
             ON CONFLICT (url) WHERE url IS NOT NULL DO NOTHING`,
            [model, size || null, quality || null, Boolean(edit), source || null, label || null, subject || null,
                (prompt || "").slice(0, 4000) || null, url || null, bytes ?? null,
                origin, batchId || null, batchLabel || null, buyerId || null, buyerLabel || null,
                Boolean(ok), error ? String(error).slice(0, 600) : null, cost, costBasis],
        );
    } catch { /* bookkeeping must never break art generation */ }
}


// Disk art is stored as `file:public/images/...` because it never went to blob. The same bytes are served by
// the site, so turn it into something the admin app can actually display rather than showing a dead path.
const thumbFor = (u) => {
    if (!u) return null;
    if (u.startsWith("file:public/")) return `https://www.wolfdengamingmn.com/${u.replace("file:public/", "")}`;
    if (u.startsWith("file:")) return null;
    return u;
};

// ── Reading it back ───────────────────────────────────────────────────────────────────────────────────────

const num = (v) => (v == null ? 0 : Number(v));

/**
 * The history, newest first, with batches COLLAPSED into a single row.
 *
 * A generator run can be 200 sprites; listing them individually would bury the two member creations you
 * actually wanted to see. Each batch comes back as one entry carrying its count, total cost and time span,
 * with `batchId` so the screen can expand it via listBatch().
 */
/** Per-day totals for the history headers. `costUsd` is what the LEDGER can name; the API pairs it with what
 *  OpenAI actually charged that day, because the question is what we spent, not what survived. */
export async function dailyTotals({ days = 30 } = {}) {
    const rows = await db.query(
        `SELECT to_char(created_at, 'YYYY-MM-DD') AS day, count(*)::int n, sum(cost_usd) cost,
                count(*) FILTER (WHERE NOT ok)::int AS failed,
                bool_and(cost_basis = 'estimated') AS estimated
         FROM mkt_ai_generation
         WHERE created_at > now() - $1::interval AND date_known
         GROUP BY 1 ORDER BY 1 DESC`,
        [`${Math.max(1, Math.min(365, days))} days`],
    ).catch(() => []);
    return (rows || []).map((r) => ({
        day: r.day, count: r.n, failed: r.failed,
        costUsd: Math.round(num(r.cost) * 100) / 100,
        estimated: Boolean(r.estimated),
    }));
}

export async function listGenerations({ days = 30, limit = 200, origin = null } = {}) {
    const since = `${Math.max(1, Math.min(365, days))} days`;
    const rows = await db.query(
        `SELECT
             COALESCE(batch_id, 'single:' || id::text) AS group_key,
             batch_id,
             MIN(created_at) AS started_at,
             MAX(created_at) AS ended_at,
             to_char(MAX(created_at), 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS n,
             SUM(cost_usd) AS cost,
             COUNT(*) FILTER (WHERE NOT ok)::int AS failed,
             BOOL_AND(ok) AS all_ok,
             BOOL_AND(date_known) AS date_known,
             MIN(kind) AS kind,
             MIN(origin) AS origin,
             MIN(batch_label) AS batch_label,
             MIN(source) AS source,
             MIN(label) AS label,
             MIN(quality) AS quality,
             MIN(size) AS size,
             MIN(buyer_label) AS buyer_label,
             MIN(buyer_id::text) AS buyer_id,
             MIN(url) AS url,
             BOOL_AND(cost_basis = 'estimated') AS estimated,
             COUNT(DISTINCT source)::int AS source_count
         FROM mkt_ai_generation
         WHERE created_at > now() - $1::interval
           AND ($2::text IS NULL OR origin = $2)
         GROUP BY COALESCE(batch_id, 'single:' || id::text), batch_id
         ORDER BY MAX(created_at) DESC
         LIMIT $3`,
        [since, origin, Math.max(1, Math.min(500, limit))],
    ).catch(() => []);

    return (rows || []).map((r) => ({
        groupKey: r.group_key,
        batchId: r.batch_id || null,
        isBatch: Boolean(r.batch_id) && r.n > 1,
        count: r.n,
        failed: r.failed,
        ok: r.all_ok !== false,
        costUsd: Math.round(num(r.cost) * 100000) / 100000,
        startedAt: r.started_at,
        endedAt: r.ended_at,
        dateKnown: r.date_known !== false,
        day: r.date_known === false ? null : r.day,
        kind: r.kind,
        origin: r.origin,
        batchLabel: r.batch_label,
        source: r.source,
        sourceLabel: r.source_count > 1 ? "Mixed" : sourceLabel(r.source),
        label: r.label,
        quality: r.quality,
        size: r.size,
        buyerId: r.buyer_id,
        buyerLabel: r.buyer_label,
        url: r.n === 1 ? r.url : null,
        thumbUrl: r.n === 1 ? thumbFor(r.url) : null,
        estimated: Boolean(r.estimated),
    }));
}

/** Every individual generation inside one batch, oldest first — the order they were drawn. */
export async function listBatch(batchId, { limit = 500 } = {}) {
    const rows = await db.query(
        `SELECT id, created_at, date_known, label, subject, source, quality, size, url, ok, error, cost_usd, cost_basis,
                buyer_label, prompt
         FROM mkt_ai_generation WHERE batch_id = $1 ORDER BY created_at ASC, id ASC LIMIT $2`,
        [batchId, Math.max(1, Math.min(2000, limit))],
    ).catch(() => []);
    return (rows || []).map((r) => ({
        id: Number(r.id), createdAt: r.created_at, label: r.label, subject: r.subject,
        source: r.source, sourceLabel: sourceLabel(r.source), quality: r.quality, size: r.size,
        url: r.url, thumbUrl: thumbFor(r.url), ok: r.ok, error: r.error, dateKnown: r.date_known !== false,
        costUsd: Math.round(num(r.cost_usd) * 100000) / 100000, estimated: r.cost_basis === "estimated",
        buyerLabel: r.buyer_label, prompt: r.prompt,
    }));
}

/** Totals for the range: overall, split by how it was caused, and split by what it was for. */
export async function generationSummary({ days = 30 } = {}) {
    const since = `${Math.max(1, Math.min(365, days))} days`;
    const [totals, byOrigin, bySource, byMember] = await Promise.all([
        db.query(
            `SELECT COUNT(*)::int n, SUM(cost_usd) cost, COUNT(*) FILTER (WHERE NOT ok)::int failed,
                    SUM(cost_usd) FILTER (WHERE cost_basis = 'estimated') est_cost,
                    COUNT(*) FILTER (WHERE kind = 'text')::int text_n,
                    SUM(cost_usd) FILTER (WHERE kind = 'text') text_cost
             FROM mkt_ai_generation WHERE created_at > now() - $1::interval`, [since]).catch(() => []),
        db.query(
            `SELECT origin, COUNT(*)::int n, SUM(cost_usd) cost FROM mkt_ai_generation
             WHERE created_at > now() - $1::interval GROUP BY origin ORDER BY 3 DESC NULLS LAST`, [since]).catch(() => []),
        db.query(
            `SELECT source, COUNT(*)::int n, SUM(cost_usd) cost FROM mkt_ai_generation
             WHERE created_at > now() - $1::interval GROUP BY source ORDER BY 3 DESC NULLS LAST LIMIT 20`, [since]).catch(() => []),
        // Creation tokens are the one place a MEMBER spends our money, so they get their own tally.
        db.query(
            `SELECT buyer_label, buyer_id::text AS buyer_id, COUNT(*)::int n, SUM(cost_usd) cost
             FROM mkt_ai_generation
             WHERE created_at > now() - $1::interval AND buyer_id IS NOT NULL
             GROUP BY buyer_label, buyer_id ORDER BY 4 DESC NULLS LAST LIMIT 25`, [since]).catch(() => []),
    ]);
    const t = totals?.[0] || {};
    return {
        count: t.n || 0,
        failed: t.failed || 0,
        costUsd: Math.round(num(t.cost) * 100) / 100,
        estimatedCostUsd: Math.round(num(t.est_cost) * 100) / 100,
        textCount: t.text_n || 0,
        textCostUsd: Math.round(num(t.text_cost) * 100) / 100,
        byOrigin: (byOrigin || []).map((r) => ({ origin: r.origin, count: r.n, costUsd: Math.round(num(r.cost) * 100) / 100 })),
        bySource: (bySource || []).map((r) => ({ source: r.source, label: sourceLabel(r.source), count: r.n, costUsd: Math.round(num(r.cost) * 100) / 100 })),
        byMember: (byMember || []).map((r) => ({ buyerId: r.buyer_id, label: r.buyer_label || "(unknown)", count: r.n, costUsd: Math.round(num(r.cost) * 100) / 100 })),
    };
}
