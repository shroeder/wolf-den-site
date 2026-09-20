// THE RESTOCKS FIFO STILL CANNOT SEE, AND THE CATALOG ITEMS THEY MIGHT BE.
//
// fifo-link-backfill.mjs links only exact, unambiguous name matches, because a wrong cost on a report stock
// gets priced from is worse than a missing one. This is the other half: everything it refused, ranked by how
// much money is sitting behind it, with the catalog items it MIGHT be — for a person to confirm.
//
// ⚠️ THE CANDIDATES ARE SUGGESTIONS AND NOTHING MORE. Nothing here writes a link. The whole reason the
// backfill refuses fuzzy matches is that "Pitch Black Booster Bundle" (paid $40) and "Pitch Black Booster Box"
// (sells $223) score alike on any token measure, and attaching the first to the second invents a $183 margin.
// A person recognising their own stock is the only thing that can tell them apart.
//
// Run:  node scripts/fifo-review-list.mjs [--json out.json]
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const TOKEN = props.match(/SQUARE_ACCESS_TOKEN=(.+)/)?.[1]?.trim();
const DB = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8").match(/DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/)?.[1];
const sql = neon(DB);
const H = { "Square-Version": "2025-01-23", Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const OUT = process.argv.includes("--json") ? process.argv[process.argv.indexOf("--json") + 1] : null;

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// Noise words that appear in almost every product name and so carry no signal about WHICH product it is.
const STOP = new Set(["pokemon", "pokmon", "the", "and", "tcg", "a", "of", "trading", "card", "game"]);
const toks = (s) => new Set(norm(s).split(" ").filter((t) => t.length > 1 && !STOP.has(t)));

async function sweep(type) {
    const out = []; let cursor = null;
    do {
        const r = await fetch("https://connect.squareup.com/v2/catalog/search", {
            method: "POST", headers: H,
            body: JSON.stringify({ object_types: [type], include_deleted_objects: true, limit: 200, ...(cursor ? { cursor } : {}) }),
        });
        const j = await r.json();
        if (j.errors) throw new Error(JSON.stringify(j.errors));
        out.push(...(j.objects || [])); cursor = j.cursor || null;
    } while (cursor);
    return out;
}

const items = await sweep("ITEM");
const variations = await sweep("ITEM_VARIATION");
const nameOf = new Map(items.map((i) => [i.id, i.item_data?.name || ""]));

const catalog = [];
for (const v of variations) {
    const name = nameOf.get(v.item_variation_data?.item_id);
    if (!name) continue;
    catalog.push({
        variationId: v.id,
        name,
        priceCents: v.item_variation_data?.price_money?.amount ?? null,
        tokens: toks(name),
    });
}

const rows = await sql`
    SELECT product, SUM(quantity) units, SUM(paid_total) paid, MAX(occurred_on) last_bought, COUNT(*) n
      FROM cogs_ledger
     WHERE variation_id IS NULL AND quantity > 0
     GROUP BY product ORDER BY SUM(paid_total) DESC`;

const report = rows.map((r) => {
    const t = toks(r.product);
    const scored = catalog
        .map((c) => {
            let hit = 0;
            for (const x of t) if (c.tokens.has(x)) hit += 1;
            // Both directions matter: a candidate that contains every word of the purchase but adds five of
            // its own ("Booster Box" vs "Booster Bundle") is not the same product.
            const cover = t.size ? hit / t.size : 0;
            const tight = c.tokens.size ? hit / c.tokens.size : 0;
            return { ...c, score: cover * tight };
        })
        .filter((c) => c.score > 0.2)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

    // Collapse candidates that are the same item under several variations.
    const seen = new Set();
    const candidates = scored.filter((c) => !seen.has(c.name) && seen.add(c.name)).map((c) => ({
        variationId: c.variationId,
        name: c.name,
        price: c.priceCents != null ? c.priceCents / 100 : null,
        confidence: Math.round(c.score * 100),
    }));

    return {
        product: r.product,
        units: Number(r.units),
        paid: Number(r.paid),
        paidEach: Number(r.paid) / Math.max(1, Number(r.units)),
        lastBought: (r.last_bought instanceof Date ? r.last_bought : new Date(r.last_bought)).toISOString().slice(0, 10),
        rows: Number(r.n),
        candidates,
    };
});

const withCand = report.filter((r) => r.candidates.length);
const without = report.filter((r) => !r.candidates.length);
const sum = (a) => a.reduce((s, r) => s + r.paid, 0);

console.log(`${report.length} unlinked product names, $${sum(report).toFixed(2)} of purchases\n`);
console.log(`── ${withCand.length} have a plausible catalog item — $${sum(withCand).toFixed(2)} ──`);
for (const r of withCand.slice(0, 25)) {
    console.log(`\n  $${r.paid.toFixed(2)}  ${r.units}u @ $${r.paidEach.toFixed(2)}  last ${r.lastBought}`);
    console.log(`  LEDGER:  ${r.product}`);
    for (const c of r.candidates) {
        console.log(`   maybe:  ${c.name}${c.price != null ? `  (sells $${c.price.toFixed(2)})` : ""}  ${c.confidence}%`);
    }
}
console.log(`\n── ${without.length} match nothing in the catalog — $${sum(without).toFixed(2)} ──`);
console.log("   (bulk broken to singles, snacks, supplies, or product long gone)");
for (const r of without.slice(0, 15)) console.log(`   $${r.paid.toFixed(2).padStart(9)}  ${r.product}`);

if (OUT) { fs.writeFileSync(OUT, JSON.stringify(report, null, 1)); console.log(`\nwrote ${OUT}`); }
