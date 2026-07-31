// Import this ONCE at the top of any generator and every OpenAI call it makes lands in the ledger:
//
//     import "./lib/ai-trace.mjs";
//
// That is the entire integration. It wraps globalThis.fetch and watches for api.openai.com, reading the model,
// size and quality out of the request the script was going to send anyway. Nothing at the call sites changes.
//
// Doing it this way is deliberate. The alternative — editing the fetch in each of a dozen generators, each with
// its own loop shape and variable names — is exactly how five of them got left unparseable earlier in the day.
// One import line can't break a script, and it can't be forgotten halfway through a file either: retries,
// refusals and calls added later are all captured automatically.
//
// The run groups under the script's own filename, so `node scripts/gen-foe-sprites.mjs` shows up as one
// "gen-foe-sprites" batch in the AI Costs history.
import { basename } from "node:path";
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

const IMG_TOKENS = {
    "1024x1024": { low: 272, medium: 1056, high: 4160 },
    "1024x1536": { low: 408, medium: 1584, high: 6240 },
    "1536x1024": { low: 400, medium: 1568, high: 6208 },
};
const TEXT_PRICES = { "gpt-4o-mini": { in: 0.15, out: 0.60 }, "gpt-4o": { in: 2.50, out: 10.00 }, "gpt-4.1-mini": { in: 0.40, out: 1.60 }, "gpt-4.1": { in: 2.00, out: 8.00 } };

const scriptName = basename(process.argv[1] || "script", ".mjs");
const batchId = `${scriptName}-${Date.now()}`;
const pending = [];
let sql = null;
let ready = null;

function connect() {
    if (ready) return ready;
    ready = (async () => {
        const url = dbUrl();
        if (!url) return null;
        try {
            const { neon } = await import("@neondatabase/serverless");
            sql = neon(url);
        } catch { sql = null; }
        return sql;
    })();
    return ready;
}

async function record(row) {
    pending.push(row);
    await connect();
    if (!sql) return;
    try {
        await sql.query(
            `INSERT INTO mkt_ai_generation
                (kind, model, size, quality, source, label, subject, prompt, origin, batch_id, batch_label,
                 ok, error, tokens_in, tokens_out, cost_usd, cost_basis)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'batch',$9,$10,$11,$12,$13,$14,$15,'measured')`,
            [row.kind, row.model, row.size || null, row.quality || null, row.source, row.label || null,
                row.subject || null, (row.prompt || "").slice(0, 4000) || null, batchId, scriptName,
                row.ok, row.error || null, row.tokensIn ?? null, row.tokensOut ?? null, row.cost],
        );
    } catch { /* bookkeeping must never break a generator */ }
}

const realFetch = globalThis.fetch;
globalThis.fetch = async function tracedFetch(input, init) {
    const url = typeof input === "string" ? input : (input?.url || String(input));
    if (!url.includes("api.openai.com")) return realFetch(input, init);

    // Read what the script was already sending; never mutate it.
    let body = null;
    try { body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : null; } catch { body = null; }
    const isImage = url.includes("/images/");
    const res = await realFetch(input, init);

    try {
        if (!res.ok) {
            const clone = res.clone();
            const text = await clone.text().catch(() => "");
            await record({
                kind: isImage ? "image" : "text", model: body?.model || "gpt-image-1",
                size: body?.size, quality: body?.quality, source: `script/${scriptName}`,
                label: `${scriptName} (failed)`, prompt: body?.prompt,
                ok: false, error: text.slice(0, 300),
                // A refusal still bills input; recording it as free would understate the run.
                cost: 0,
            });
            return res;
        }
        if (isImage) {
            const size = body?.size || "1024x1024";
            const quality = body?.quality || "medium";
            const tokens = (IMG_TOKENS[size] || IMG_TOKENS["1024x1024"])[quality] ?? 1056;
            await record({
                kind: "image", model: body?.model || "gpt-image-1", size, quality,
                source: `script/${scriptName}`, label: scriptName, prompt: body?.prompt,
                ok: true, cost: Math.round(tokens * (40 / 1e6) * 1e5) / 1e5,
            });
        } else {
            // Text/vision: OpenAI reports exact token counts, so this is measured rather than inferred.
            const clone = res.clone();
            const j = await clone.json().catch(() => null);
            const model = j?.model || body?.model || "gpt-4o-mini";
            const p = Object.entries(TEXT_PRICES).find(([k]) => String(model).startsWith(k))?.[1] || TEXT_PRICES["gpt-4o-mini"];
            const tin = Number(j?.usage?.prompt_tokens || 0);
            const tout = Number(j?.usage?.completion_tokens || 0);
            await record({
                kind: "text", model, source: `script/${scriptName}`, label: scriptName,
                ok: true, tokensIn: tin, tokensOut: tout,
                cost: Math.round(((tin / 1e6) * p.in + (tout / 1e6) * p.out) * 1e6) / 1e6,
            });
        }
    } catch { /* never let tracing change what the generator sees */ }
    return res;
};

process.on("exit", () => {
    if (!pending.length) return;
    const total = pending.reduce((s, r) => s + (r.cost || 0), 0);
    const failed = pending.filter((r) => !r.ok).length;
    process.stdout.write(`[ai-trace] ${scriptName}: ${pending.length} OpenAI calls, ~$${total.toFixed(2)}${failed ? `, ${failed} failed` : ""}${sql ? "" : "  (NOT recorded — no DATABASE_URL)"}\n`);
});
