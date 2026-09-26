// ── LINK THE PURCHASES FIFO CANNOT SEE ───────────────────────────────────────────────────────────────────
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/cogs-link-backfill.mjs          # plan
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/cogs-link-backfill.mjs --apply  # write
//
// FIFO can only stack purchases that are linked to a Square variation. 91 of 225 purchase rows — $13,295 of
// buying — had no link, so every sale of those items priced at whatever restock was typed most recently.
// That is the same "last price wins" defect the FIFO table was built to kill, hiding on the items where
// there is no second price to contradict it.
//
// ⚠️ WHY link-variation.js WAS NOT ENOUGH. It matches on a normalised EXACT name and resolves about a
// quarter of them, deliberately: its note is right that a fuzzy matcher which attaches a wrong cost to a
// real product is worse than no cost at all, because no cost is a gap you can chase and a wrong cost looks
// exactly like an answer.
//
// So this does not go fuzzy. It strips the three kinds of NOISE that the intake form's hand-typed names
// carry and Square's do not, and then still demands an exact, unique hit on what is left:
//
//   · the brand prefix           "Pokémon " / "Pokemon " — present on the receipt, absent from the catalog
//   · a set code                 "SV10 ", "XY07 ", "SV03 " — a buyer's shorthand, never in the item name
//   · accents and punctuation    é vs e, colons, double spaces
//
// Everything else — "Coke 16.9oz", "Binder", "Ascended Heroes EX Box (Break to Singles)" — resolves to
// nothing and stays unlinked, which is correct: they are not catalog items, and bulk broken into singles
// never exists as one. An unresolved row is a gap somebody can chase.
//
// ⚠️ AND A MATCH MUST BE UNIQUE. A name that hits two variations is ambiguous and is left alone; picking one
// would be a coin flip written into the cost of a sale.
import { readFileSync } from "node:fs";

const env = readFileSync("../accounting_app/.env", "utf8");
// ⚠️ BOTH FILES. The Square token lives in local.properties, not .env — .env carries one that authenticates
// for /v2/orders and 401s on /v2/catalog, which reads as "the script is broken" rather than "wrong key".
const props = readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const pick = (s, k) => s.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim().replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = pick(env, "DATABASE_URL");
process.env.SQUARE_ACCESS_TOKEN = pick(props, "SQUARE_ACCESS_TOKEN") || pick(env, "SQUARE_ACCESS_TOKEN");
if (!process.env.SQUARE_ACCESS_TOKEN) throw new Error("no SQUARE_ACCESS_TOKEN");

const APPLY = process.argv.includes("--apply");
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);

// Strip accents, punctuation and doubled spaces. Shared by both sides so they are compared like for like.
const base = (s) => String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// The buyer's shorthand, which Square never carries: a brand prefix and a set code.
const SET_CODE = /^(?:sv|xy|swsh|sm|bw|hgss|dp|ex)\d{1,3}\b\s*/;
// ⚠️ A SET CODE AND A SERIES NAME ARE THE SAME FACT WRITTEN TWO WAYS, and that was the single biggest miss:
// the buyer types "Pokémon SV10 Destined Rivals Elite Trainer Box" and Square calls it "Pokémon Scarlet &
// Violet Destined Rivals Elite Trainer Box". $1,140 of buying sat unlinked on that one difference alone.
//
// So stripping "sv10" from one side is only half a rule — the other half is stripping "scarlet violet" from
// the other. They are dropped as a PAIR, which is why this stays exact rather than fuzzy: SV means Scarlet &
// Violet, SWSH means Sword & Shield, and once both are gone the remaining words still have to match exactly
// and uniquely. Anything that does not is left alone.
const SERIES = /\b(scarlet violet|sword shield|sun moon|black white|diamond pearl|heartgold soulsilver)\b/g;
const strip = (s) => {
    let t = base(s);
    t = t.replace(/^(pokemon|pokémon)\s+/, "");
    t = t.replace(SET_CODE, "");
    t = t.replace(/^(pokemon|pokémon)\s+/, "");   // "SV10 Pokemon ..." puts the brand second
    t = t.replace(SERIES, " ");
    // ⚠️ AND THE TRADE'S OWN ABBREVIATIONS. Square's item is literally "Destined rivals etb"; the receipt
    // says "Elite Trainer Box". $1,140 of buying sat unlinked on those three letters. Collapsing the long
    // form to the short one on BOTH sides makes the two spellings one key — this is a rename, not a guess:
    // ETB has exactly one meaning in this shop and no other product expands to it.
    t = t.replace(/\belite trainer box\b/g, "etb");
    return t.replace(/^tcg\s+/, "").replace(/\s+/g, " ").trim();
};

// ── THE CATALOG ──────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ include_deleted_objects, because a deleted Square item still has sales behind it and its cost still has
// to resolve — the same lesson the COGS reader already learned the hard way.
const byName = new Map();
let cursor = null;
let items = 0;
do {
    const res = await fetch("https://connect.squareup.com/v2/catalog/search", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ object_types: ["ITEM"], include_deleted_objects: true, limit: 200, ...(cursor ? { cursor } : {}) }),
    });
    const json = await res.json();
    if (json?.errors) throw new Error(JSON.stringify(json.errors).slice(0, 200));
    for (const item of json.objects || []) {
        items += 1;
        const name = item.item_data?.name;
        for (const key of new Set([base(name), strip(name)])) {
            if (!key) continue;
            if (!byName.has(key)) byName.set(key, new Set());
            for (const v of item.item_data?.variations || []) byName.get(key).add(v.id);
        }
    }
    cursor = json.cursor || null;
} while (cursor);
console.log(`  catalog: ${items} items, ${byName.size} distinct names\n`);

// ── THE UNLINKED PURCHASES ───────────────────────────────────────────────────────────────────────────────
const rows = await sql`
    SELECT id, product, quantity, paid_each, occurred_on
      FROM cogs_ledger
     WHERE quantity > 0 AND variation_id IS NULL
     ORDER BY quantity * paid_each DESC`;

const hits = [];
const misses = [];
for (const r of rows) {
    const ids = byName.get(strip(r.product)) || byName.get(base(r.product));
    if (ids && ids.size === 1) hits.push({ ...r, variationId: [...ids][0] });
    else misses.push({ ...r, why: ids ? `ambiguous (${ids.size} variations)` : "no catalog item" });
}

const money = (r) => Number(r.quantity) * Number(r.paid_each);
const sum = (list) => list.reduce((n, r) => n + money(r), 0);

console.log(`  RESOLVED ${hits.length} of ${rows.length} unlinked rows  ($${sum(hits).toFixed(0)} of $${sum(rows).toFixed(0)})\n`);
for (const h of hits) {
    console.log(`    $${String(money(h).toFixed(0)).padStart(5)}  ${String(h.occurred_on).slice(4, 16)}  ${h.product.slice(0, 46).padEnd(46)} -> ${h.variationId}`);
}
console.log(`\n  LEFT ALONE ${misses.length}  ($${sum(misses).toFixed(0)})`);
const byWhy = {};
for (const m of misses) byWhy[m.why] = (byWhy[m.why] || 0) + 1;
for (const [why, n] of Object.entries(byWhy)) console.log(`    ${String(n).padStart(3)}  ${why}`);
console.log("\n  biggest left alone:");
for (const m of misses.slice(0, 8)) console.log(`    $${String(money(m).toFixed(0)).padStart(5)}  ${m.product.slice(0, 50).padEnd(50)} ${m.why}`);

if (!APPLY) { console.log("\n  plan only — pass --apply to write the links.\n"); process.exit(0); }

let wrote = 0;
for (const h of hits) {
    await sql`UPDATE cogs_ledger SET variation_id = ${h.variationId} WHERE id = ${h.id} AND variation_id IS NULL`;
    wrote += 1;
}
console.log(`\n  linked ${wrote} rows. Re-run the FIFO reconciler with full=1 so every sale re-costs against them.\n`);
