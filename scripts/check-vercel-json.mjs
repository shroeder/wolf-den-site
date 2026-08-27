// ── DOES vercel.json ACTUALLY DEPLOY? ────────────────────────────────────────────────────────────────────────
// `npm run build` never looks at vercel.json. Vercel validates it BEFORE the build starts, so an illegal key
// there fails the deployment with no build log at all — `vercel logs` answers "logs are unavailable because
// the deployment never reached READY", which is the least helpful failure in the system.
//
// That is exactly what happened on 2026-08-27: a `_comment` array was added inside a headers entry to explain
// the new Cache-Control rule. JSON has no comments, headers entries take four keys and that is not one of
// them, and TWO deployments failed in a row — the explanation and the arena work behind it — while the local
// build stayed green at 132/132 the whole time.
//
// So the shape is checked here, where it costs nothing, against the keys Vercel actually accepts.
//
//   node scripts/check-vercel-json.mjs     (or npm run check:vercel)
import { readFileSync } from "node:fs";

const raw = readFileSync("vercel.json", "utf8");
let cfg;
try {
    cfg = JSON.parse(raw);
} catch (e) {
    console.error(`check:vercel — vercel.json is not valid JSON: ${e.message}`);
    process.exit(1);
}

const problems = [];

// The keys each rule kind accepts. Anything else is rejected at deploy time.
const ALLOWED = {
    headers: new Set(["source", "headers", "has", "missing"]),
    rewrites: new Set(["source", "destination", "has", "missing", "statusCode"]),
    redirects: new Set(["source", "destination", "permanent", "statusCode", "has", "missing"]),
    crons: new Set(["path", "schedule"]),
};

for (const [kind, allowed] of Object.entries(ALLOWED)) {
    const rules = cfg[kind];
    if (rules == null) continue;
    if (!Array.isArray(rules)) { problems.push(`${kind} must be an array`); continue; }
    rules.forEach((rule, i) => {
        if (!rule || typeof rule !== "object") { problems.push(`${kind}[${i}] is not an object`); return; }
        for (const key of Object.keys(rule)) {
            if (!allowed.has(key)) {
                problems.push(`${kind}[${i}] has "${key}" — Vercel accepts only ${[...allowed].join(", ")}`
                    + (key.startsWith("_") ? ". JSON has no comments; put the explanation in the code or the commit." : ""));
            }
        }
    });
}

// A headers rule's own entries are {key, value} and nothing else.
for (const [i, rule] of (Array.isArray(cfg.headers) ? cfg.headers : []).entries()) {
    if (!Array.isArray(rule?.headers)) { problems.push(`headers[${i}].headers must be an array`); continue; }
    rule.headers.forEach((h, j) => {
        const keys = Object.keys(h || {});
        const bad = keys.filter((k) => k !== "key" && k !== "value");
        if (bad.length) problems.push(`headers[${i}].headers[${j}] has ${bad.join(", ")} — only key and value`);
        if (!h?.key || typeof h.value !== "string") problems.push(`headers[${i}].headers[${j}] needs a key and a string value`);
    });
}

// Every cron must name a path that exists, or it fires into a 404 forever and nothing says so.
for (const [i, c] of (Array.isArray(cfg.crons) ? cfg.crons : []).entries()) {
    if (typeof c?.path !== "string" || !c.path.startsWith("/")) { problems.push(`crons[${i}].path must start with /`); continue; }
    if (typeof c?.schedule !== "string" || c.schedule.trim().split(/\s+/).length !== 5) {
        problems.push(`crons[${i}].schedule "${c?.schedule}" is not five cron fields`);
    }
}

if (problems.length) {
    console.error(`check:vercel — ${problems.length} problem(s); Vercel would reject this BEFORE the build runs:\n`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
}
const n = (k) => (Array.isArray(cfg[k]) ? cfg[k].length : 0);
console.log(`check:vercel — ${n("headers")} header rules, ${n("rewrites")} rewrites, ${n("crons")} crons; every key is one Vercel accepts.`);
