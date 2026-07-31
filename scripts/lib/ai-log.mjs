// Ledger hook for the standalone `scripts/gen-*.mjs` generators.
//
// Those scripts call OpenAI directly (that's deliberate — see the art-generation notes), which means they never
// touch the server's openai-image.js and were completely invisible to the AI Costs screen. They are also where
// most of the image spend happens: a single sprite-set run is a few hundred images. Without this, the history
// would show member creations and crons and quietly omit the biggest line.
//
// Usage in a generator:
//     import { startBatch } from "./lib/ai-log.mjs";
//     const batch = startBatch("gen-fish-sprites");
//     …
//     await batch.log({ subject: id, label: `Fish — ${name}`, quality: "medium", url, source: "marketplace/fish" });
//     await batch.done();
//
// Every write is best-effort: a generator must never fail because bookkeeping did.
import { readFileSync } from "node:fs";

function dbUrl() {
    if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
    for (const p of ["../accounting_app/.env", ".env"]) {
        try {
            const m = readFileSync(p, "utf8").match(/^DATABASE_URL=(.+)$/m);
            if (m) return m[1].trim();
        } catch { /* try the next */ }
    }
    return null;
}

const TOKENS = {
    "1024x1024": { low: 272, medium: 1056, high: 4160 },
    "1024x1536": { low: 408, medium: 1584, high: 6240 },
    "1536x1024": { low: 400, medium: 1568, high: 6208 },
};
export const estimateCost = ({ size = "1024x1024", quality = "medium", edit = false } = {}) => {
    const t = (TOKENS[size] || TOKENS["1024x1024"])[quality] ?? TOKENS["1024x1024"].medium;
    return Math.round((t * (40 / 1e6) + (edit ? 0.004 : 0)) * 1e5) / 1e5;
};

/**
 * Open a batch. `label` should be the generator's name so the run groups under it in the history.
 * Returns { batchId, log(row), done() }. If there's no DATABASE_URL, every call is a silent no-op so the
 * generator still runs on a machine without DB access.
 */
export function startBatch(label, { origin = "batch" } = {}) {
    const url = dbUrl();
    const batchId = `${label}-${Date.now()}`;
    let sql = null;
    let rows = 0;
    let cost = 0;

    const ready = (async () => {
        if (!url) return null;
        try {
            const { neon } = await import("@neondatabase/serverless");
            sql = neon(url);
        } catch { sql = null; }
        return sql;
    })();

    return {
        batchId,
        async log({ size = "1024x1024", quality = "medium", edit = false, source = "marketplace/ai", label: line, subject, prompt, url: blobUrl, bytes, ok = true, error } = {}) {
            await ready;
            const c = estimateCost({ size, quality, edit });
            rows += 1;
            cost += c;
            if (!sql) return;
            try {
                await sql.query(
                    `INSERT INTO mkt_ai_generation
                        (model, size, quality, edit, source, label, subject, prompt, url, bytes,
                         origin, batch_id, batch_label, ok, error, cost_usd, cost_basis)
                     VALUES ('gpt-image-1',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'measured')
                     ON CONFLICT (url) DO NOTHING`,
                    [size, quality, Boolean(edit), source, line || null, subject || null,
                        (prompt || "").slice(0, 4000) || null, blobUrl || null, bytes ?? null,
                        origin, batchId, label, Boolean(ok), error ? String(error).slice(0, 600) : null, c],
                );
            } catch { /* best-effort */ }
        },
        async done() {
            await ready;
            console.log(`[ai-log] ${label}: ${rows} generations, ~$${cost.toFixed(2)}${sql ? "" : "  (NOT recorded — no DATABASE_URL)"}`);
            return { rows, cost };
        },
    };
}
