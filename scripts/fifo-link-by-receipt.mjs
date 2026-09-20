// ── LINK RESTOCKS TO ITEMS FROM THE RECORDS, NOT FROM A PERSON'S MEMORY ──────────────────────────────────────
// Luke: "I don't plan on doing any manual labor. I wouldn't remember. But we have all the data. We restocked.
// It has all unit prices, and that feeds all our square inventory, in order."
//
// Right on both counts, and the way to use it is to stop treating the product NAME as the key. Three records
// describe the same physical event from different angles, and none of them is a spelling:
//
//   RECEIPT  Square logs a NONE -> IN_STOCK inventory change when stock arrives, carrying the variation, the
//            quantity and the timestamp. Our ledger row carries the date and the same quantity.
//   PRICE    wolfden_item_cost holds what we recorded paying per variation. The ledger row holds paid_each.
//            Two independent recordings of the same number.
//   NAME     the typed product against the catalog name — supporting evidence only, never decisive.
//
// ⚠️ NO SINGLE SIGNAL IS SELECTIVE ENOUGH AND THE NUMBERS SAY SO. Measured on the real backlog: quantity+date
// alone leaves 109 of 161 rows ambiguous, because most restocks are 1, 2, 3 or 12 units and several items
// arrive the same day. Price alone uniquely identifies 43. So a link is only written where TWO INDEPENDENT
// signals agree on one variation and no rival comes close — and everything else is reported, because a wrong
// cost on a report stock gets priced from is worse than a missing one.
//
// ⚠️ RECEIPTS ARE EVIDENCE, NOT A RESOURCE TO HAND OUT. The first version consumed each receipt as it matched,
// which made the result depend on the order rows were considered: widening the date window from 0 to 1 day
// found FEWER matches, because richer rows upstream ate the receipts poorer rows needed. A variation can be
// received many times; nothing is claimed here.
//
//   node scripts/fifo-link-by-receipt.mjs [--days N] [--apply]
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const TOKEN = props.match(/SQUARE_ACCESS_TOKEN=(.+)/)?.[1]?.trim();
const DB = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8").match(/DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/)?.[1];
if (!TOKEN || !DB) throw new Error("missing SQUARE_ACCESS_TOKEN or DATABASE_URL");
const sql = neon(DB);
const H = { "Square-Version": "2025-01-23", Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

const APPLY = process.argv.includes("--apply");
const i = process.argv.indexOf("--days");
const DAYS = i > -1 ? Number(process.argv[i + 1]) : 3;
const day = (d) => new Date(d).toISOString().slice(0, 10);
const apart = (a, b) => Math.abs((new Date(a + "T00:00:00Z") - new Date(b + "T00:00:00Z")) / 86400000);

const STOP = new Set(["pokemon", "pokmon", "the", "and", "tcg", "a", "of", "trading", "card", "game", "box"]);
const toks = (s) => new Set(String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    .split(" ").filter((t) => t.length > 1 && !STOP.has(t)));
const overlap = (a, b) => {
    if (!a.size || !b.size) return 0;
    let hit = 0;
    for (const t of a) if (b.has(t)) hit += 1;
    return hit / Math.min(a.size, b.size);
};

// ── EVERY RECEIPT SQUARE STILL HOLDS ─────────────────────────────────────────────────────────────────────────
const locs = await (await fetch("https://connect.squareup.com/v2/locations", { headers: H })).json();
const location_ids = (locs.locations || []).map((l) => l.id);
const receipts = [];
let cursor = null;
do {
    const res = await fetch("https://connect.squareup.com/v2/inventory/changes/batch-retrieve", {
        method: "POST", headers: H,
        body: JSON.stringify({ location_ids, updated_after: "2026-01-01T00:00:00Z", cursor: cursor || undefined }),
    });
    const j = await res.json();
    if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 300));
    for (const c of j.changes || []) {
        const a = c.type === "ADJUSTMENT" ? c.adjustment : null;
        // Stock ARRIVING. A physical count sets an absolute number and cannot say how many came in without the
        // count before it, so only true receipts are used as evidence.
        if (!a || a.from_state !== "NONE" || a.to_state !== "IN_STOCK") continue;
        receipts.push({ v: a.catalog_object_id, qty: Number(a.quantity), on: day(a.occurred_at) });
    }
    cursor = j.cursor || null;
} while (cursor);

// ── WHAT WE RECORDED PAYING, PER VARIATION, AND WHAT THE ITEM IS CALLED ──────────────────────────────────────
const costRows = await sql`SELECT variation_id, unit_cost_cents, item_name FROM wolfden_item_cost`;
const costOf = new Map(), nameOf = new Map();
for (const r of costRows) {
    costOf.set(r.variation_id, Number(r.unit_cost_cents));
    nameOf.set(r.variation_id, r.item_name || "");
}
const byPrice = new Map();
for (const [v, cents] of costOf) {
    if (!byPrice.has(cents)) byPrice.set(cents, []);
    byPrice.get(cents).push(v);
}

const rows = await sql`SELECT id, product, occurred_on, quantity, paid_each, source
                         FROM cogs_ledger WHERE variation_id IS NULL AND quantity > 0`;
console.log(`Square receipts: ${receipts.length}   variations with a recorded cost: ${costOf.size}   unlinked rows: ${rows.length}\n`);

const matched = [], unsure = [];
for (const r of rows) {
    const on = day(r.occurred_on), qty = Number(r.quantity);
    const cents = Math.round(Number(r.paid_each) * 100);
    const want = toks(r.product);

    const score = new Map();   // variationId -> { pts, why[] }
    const bump = (v, pts, why) => {
        if (!v) return;
        const s = score.get(v) || { pts: 0, why: [] };
        s.pts += pts; s.why.push(why); score.set(v, s);
    };
    for (const v of new Set(receipts.filter((x) => x.qty === qty && apart(x.on, on) <= DAYS).map((x) => x.v))) {
        bump(v, 2, "receipt");
    }
    for (const v of byPrice.get(cents) || []) bump(v, 2, "price");
    // ⚠️ A SHORT NAME MATCHES TOO EASILY TO BE DECISIVE. The overlap is scored against the SMALLER token set,
    // which is right for "Ascended Heroes Booster Pack" inside a long catalog title and badly wrong for
    // "Binder Collection": two tokens, so every binder collection in the catalog scores a perfect 1.0. A name
    // only carries full weight when there is enough of it to be about one product, and never reaches the
    // threshold on its own either way.
    for (const [v, nm] of nameOf) {
        const o = overlap(want, toks(nm));
        const meaty = want.size >= 3;
        if (o >= 0.7 && meaty) bump(v, 2, "name");
        else if (o >= 0.4) bump(v, 1, "name~");
    }

    const ranked = [...score.entries()].map(([v, s]) => ({ v, ...s })).sort((a, b) => b.pts - a.pts);
    const top = ranked[0], second = ranked[1];
    // TWO INDEPENDENT SIGNALS, AND A CLEAR WINNER. Name on its own never reaches 4, by design.
    const distinctSignals = new Set((top?.why || []).map((w) => w.replace("~", ""))).size;
    if (top && top.pts >= 4 && distinctSignals >= 2 && (!second || top.pts - second.pts >= 2)) {
        matched.push({ ...r, variationId: top.v, why: [...new Set(top.why)].join("+"), name: nameOf.get(top.v) });
    } else {
        unsure.push({ ...r, best: top ? `${top.pts}pts ${[...new Set(top.why)].join("+")}` : "no candidate",
            rivals: ranked.filter((x) => x.pts === top?.pts).length });
    }
}

const money = (r) => Number(r.quantity) * Number(r.paid_each);
const sum = (a) => a.reduce((t, r) => t + money(r), 0);
console.log(`within ${DAYS} day(s):`);
console.log(`  confidently linked  ${String(matched.length).padStart(3)} rows   $${sum(matched).toFixed(2)}`);
console.log(`  left for a person   ${String(unsure.length).padStart(3)} rows   $${sum(unsure).toFixed(2)}\n`);
console.log(`  a sample of what it linked, and on what evidence:`);
for (const m of matched.sort((a, b) => money(b) - money(a)).slice(0, 10)) {
    console.log(`    $${money(m).toFixed(2).padStart(9)}  ${String(m.quantity).padStart(4)}u  ${m.why.padEnd(20)} ${String(m.product).slice(0, 34).padEnd(35)} -> ${String(m.name).slice(0, 40)}`);
}
console.log(`\n  biggest left over:`);
for (const u of unsure.sort((a, b) => money(b) - money(a)).slice(0, 8)) {
    console.log(`    $${money(u).toFixed(2).padStart(9)}  ${String(u.quantity).padStart(4)}u  ${String(u.best).padEnd(22)} ${u.rivals > 1 ? `${u.rivals} tied  ` : "        "}${String(u.product).slice(0, 44)}`);
}

// ── A LAST LOOK BEFORE ANY OF IT IS BELIEVED ─────────────────────────────────────────────────────────────────
// Confidence is not correctness. Where a link was made WITHOUT the price signal, the cost already on file for
// that variation is an INDEPENDENT opinion about the same item — and if it disagrees badly with what the
// ledger says we paid, the match is more likely the wrong product wearing a similar name. Flagged, not written.
const suspect = matched.filter((m) => {
    if (m.why.includes("price")) return false;
    const known = costOf.get(m.variationId);
    if (!known) return false;
    const paid = Math.round(Number(m.paid_each) * 100);
    return Math.abs(known - paid) / Math.max(known, paid) > 0.25;
});
console.log(`\n  cross-check against the cost already on file: ${suspect.length} disagreement(s)`);
for (const m of suspect) {
    console.log(`    ledger $${Number(m.paid_each).toFixed(2).padStart(8)}  vs on file $${(costOf.get(m.variationId) / 100).toFixed(2).padStart(8)}   ${String(m.product).slice(0, 38).padEnd(39)} -> ${String(m.name).slice(0, 44)}`);
}

if (process.argv.includes("--list")) {
    console.log(`\n  every proposed link:`);
    for (const m of [...matched].sort((a, b) => money(b) - money(a))) {
        console.log(`    ${String(m.quantity).padStart(5)}u @ $${Number(m.paid_each).toFixed(2).padStart(8)}  ${m.why.padEnd(20)} ${String(m.product).slice(0, 42).padEnd(43)} -> ${String(m.name).slice(0, 50)}`);
    }
}

// A flagged row is held back rather than written. It is still a candidate — it just needs the one glance the
// cross-check could not do for it — so `--include-suspect` puts them back deliberately.
const suspectIds = new Set(suspect.map((m) => m.id));
const toWrite = process.argv.includes("--include-suspect") ? matched : matched.filter((m) => !suspectIds.has(m.id));
if (toWrite.length !== matched.length) {
    console.log(`\n  holding back ${matched.length - toWrite.length} flagged link(s); pass --include-suspect to write them anyway`);
}

if (!APPLY) { console.log(`\nnothing written. re-run with --apply to write ${toWrite.length} links.\n`); process.exit(0); }

// ⚠️ EVERY WRITE IS REVERSIBLE, AND THE UNDO IS WRITTEN BEFORE THE CHANGE. These links decide which batch a
// sale draws from, so one wrong link moves real money on a real report. The file below sets exactly these rows
// back to NULL and touches nothing else — in particular not the rows that were already linked before this ran.
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
fs.mkdirSync("scripts/out", { recursive: true });
const undoPath = `scripts/out/fifo-link-undo-${stamp}.sql`;
fs.writeFileSync(undoPath, `-- undo fifo-link-by-receipt ${stamp}\nUPDATE cogs_ledger SET variation_id = NULL WHERE id IN (\n${
    toWrite.map((m) => `  '${m.id}'`).join(",\n")}\n);\n`);
console.log(`\nundo written first: ${undoPath}`);

let wrote = 0;
for (const m of toWrite) {
    const r = await sql`UPDATE cogs_ledger SET variation_id = ${m.variationId}
                         WHERE id = ${m.id} AND variation_id IS NULL RETURNING id`;
    wrote += r.length;
}
console.log(`wrote ${wrote} links (of ${toWrite.length} intended).`);
console.log(`\nNOTHING IS COSTED YET — linking a purchase changes no report until the reconciler runs. Next:`);
console.log(`  node --experimental-loader ./scripts/lib/app-loader.mjs scripts/fifo-plan.mjs --full\n`);
