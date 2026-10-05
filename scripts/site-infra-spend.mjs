// ── WHAT THE SITE COSTS TO RUN, MONTH BY MONTH ───────────────────────────────────────────────────────────
// Luke: "give me the amount and breakdown on infrastructure spend for our site month by month."
//
// TWO SOURCES, AND THEY ANSWER DIFFERENT QUESTIONS.
//
//   ledger_entry is what was actually CHARGED — the business books, which the bank feed imports into. It is
//   the only honest answer to "what did I pay", and it is the one that has to be reconciled against.
//   mkt_ai_generation is what the site's own art pipeline BILLED ITSELF, logged per image at the moment of
//   the call. It is finer-grained than any invoice (per feature, per batch) and it is the only place the
//   OpenAI spend can be attributed to a thing rather than a month.
//
// ⚠️ THE TWO WILL NOT MATCH EXACTLY AND THAT IS NOT AN ERROR. OpenAI bills on its own cycle and the card
// charge lands days later, so a month's logged generations and a month's invoiced dollars straddle different
// boundaries. The ledger is the one to trust for a total; this file is the one to read for WHY.
//
//   node scripts/site-infra-spend.mjs
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";

const env = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
const sql = neon(env.match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)[1]);

// Every vendor that is infrastructure for the SITE rather than for the shop. Matched on the description the
// bank gives, which is why the list is spellings rather than names.
const VENDORS = ["vercel", "neon", "openai", "anthropic", "claude", "resend", "namecheap", "cloudflare",
    "github", "supabase", "upstash", "twilio", "stripe"];

const money = (n) => `$${Number(n).toFixed(2)}`;

console.log("── WHAT THE BOOKS SAY WAS CHARGED ───────────────────────────────────────────");
// ⚠️ entry_id IS LOAD-BEARING IN THE SELECT BELOW. The duplicate check keys on it; without it every row's
// id is undefined, one add(undefined) fires and has(undefined) is then true for all of them — which reported
// every charge in the books as a duplicate and the real spend as $0.00.
//
// ⚠️ AND THIS NOTE LIVES HERE RATHER THAN IN THE QUERY. A backtick inside a SQL comment inside a template
// literal ENDS the template, exactly the way one inside a styled-jsx CSS comment ends that one.
const like = VENDORS.map((v) => `%${v}%`);
const rows = await sql`
  SELECT entry_id, date_ms, description, category, amount, type
    FROM ledger_entry
   WHERE LOWER(description) ILIKE ANY(${like})
   ORDER BY date_ms`;
if (!rows.length) {
    console.log("  Nothing in ledger_entry matches any infrastructure vendor.");
    console.log("  Vendors searched:", VENDORS.join(", "));
} else {
    // ── ⚠️ EVERY SUBSCRIPTION IS IN THE BOOKS TWICE ──────────────────────────────────────────────────
    // Vercel bills once a cycle. The ledger has it twice every cycle — same amount, one to three days
    // apart, four cycles running. Namecheap the same. That is a pending authorisation and its settled
    // charge both landing as entries, which is a double-count.
    //
    // ⚠️ FLAGGED, NEVER DELETED. These are Luke's books and a script that silently drops rows out of them
    // is not a report, it is an edit. The same shape appears on things like CVS, where two charges of the
    // same amount in one week are perfectly real — which is exactly why a human has to look at it.
    const kept = [];
    const dupe = new Set();
    for (const r of rows) {
        // ⚠️ PUNCTUATION-INSENSITIVE. "Vercel Inc" and "Vercel Inc." are the same charge on consecutive days
        // and an exact match let that pair through — the bank's description is whatever the processor sent
        // that day, and a full stop is not a different vendor.
        const norm = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const hit = kept.find((p2) => norm(p2.description) === norm(r.description)
            && Number(p2.amount) === Number(r.amount)
            && Math.abs(Number(p2.date_ms) - Number(r.date_ms)) <= 4 * 86400000);
        if (hit) dupe.add(r.entry_id); else kept.push(r);
    }
    const byMonth = {};
    for (const r of rows) {
        const m = new Date(Number(r.date_ms)).toISOString().slice(0, 7);
        (byMonth[m] ||= []).push(r);
    }
    let gross = 0; let net = 0;
    for (const [m, list] of Object.entries(byMonth).sort()) {
        const g = list.reduce((s2, r) => s2 + Math.abs(Number(r.amount)), 0);
        const nt = list.filter((r) => !dupe.has(r.entry_id)).reduce((s2, r) => s2 + Math.abs(Number(r.amount)), 0);
        gross += g; net += nt;
        console.log(`
  ${m}   ${money(nt)}${g !== nt ? `    (books say ${money(g)})` : ""}`);
        for (const r of list) {
            console.log(`    ${money(Math.abs(r.amount)).padStart(9)}  ${r.description}${dupe.has(r.entry_id) ? "   <- DUPLICATE of the line above" : ""}`);
        }
    }
    console.log(`
  real infrastructure spend to date: ${money(net)}`);
    if (gross !== net) console.log(`  the books say ${money(gross)} — ${money(gross - net)} of that is one charge entered twice.`);
}


console.log("\n── WHAT THE ART PIPELINE BILLED ITSELF ──────────────────────────────────────");
const ai = await sql`
  SELECT TO_CHAR(created_at AT TIME ZONE 'America/Chicago', 'YYYY-MM') AS m,
         COUNT(*)::int AS n, COALESCE(SUM(cost_usd), 0)::numeric AS usd
    FROM mkt_ai_generation WHERE ok IS NOT FALSE
   GROUP BY 1 ORDER BY 1`;
let aiTotal = 0;
for (const r of ai) {
    aiTotal += Number(r.usd);
    console.log(`  ${r.m}  ${money(r.usd).padStart(9)}   ${String(r.n).padStart(5)} images`);
}
console.log(`  ${"TOTAL".padEnd(7)} ${money(aiTotal).padStart(9)}`);

// ⚠️ AND WHERE IT WENT, because a monthly figure cannot be argued with and a per-feature one can. This is the
// number to look at before commissioning the next set.
console.log("\n  the ten most expensive things ever drawn:");
const top = await sql`
  SELECT COALESCE(batch_label, label, 'unlabelled') AS what, COUNT(*)::int AS n,
         COALESCE(SUM(cost_usd), 0)::numeric AS usd
    FROM mkt_ai_generation WHERE ok IS NOT FALSE
   GROUP BY 1 ORDER BY 3 DESC LIMIT 10`;
for (const r of top) console.log(`    ${money(r.usd).padStart(9)}  ${String(r.n).padStart(4)} imgs  ${r.what}`);

console.log("\n── WHAT IS BEING STORED ─────────────────────────────────────────────────────");
const blob = await sql`SELECT COUNT(*)::int n, COALESCE(SUM(bytes), 0)::bigint b FROM mkt_ai_generation WHERE url IS NOT NULL`;
const gb = Number(blob[0].b) / 1e9;
console.log(`  ${blob[0].n} generated files in Blob, ${gb.toFixed(2)} GB`);
console.log(`  at Vercel Blob's $0.023/GB-month that is about ${money(gb * 0.023)} a month, and it only goes up.`);
