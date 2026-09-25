// ── WHICH PRODUCTS ARE FILED UNDER THE WRONG FRANCHISE ───────────────────────────────────────────────────
//   node scripts/catalog-category-audit.mjs            list the suspects, change nothing
//   node scripts/catalog-category-audit.mjs --fix      move the unambiguous ones
//
// Luke spotted "one piece illustration" sitting in Pokemon Sealed on the Today screen. A miscategorised item
// is invisible on every report until somebody happens to recognise a product name in the wrong group, and by
// then it has been quietly distorting that category's revenue and margin for as long as it has been selling.
// 2,553 items is too many to read, so this reads them.
//
// ⚠️ IT ONLY FLAGS A NAME-VS-CATEGORY FRANCHISE CONFLICT, which is the one kind of mistake that can be
// judged from the outside. It says nothing about sealed-vs-single, booster-vs-deck, or whether something
// belongs in Accessories — those need a human who knows the stock, and a script guessing at them would bury
// the real findings under noise nobody reads twice.
//
// ⚠️ AND IT IGNORES CATEGORIES THAT ARE NOT FRANCHISES. Consignor names (Adam, Eric D, Scott's cards),
// Bulk Cards, Mystery Bag, Accessories, Store Credit: a Pokemon card legitimately lives in any of them.
// Flagging those would be flagging the shop's own filing system as an error.
import fs from "node:fs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const TOKEN = props.match(/SQUARE_ACCESS_TOKEN=(.+)/)?.[1]?.trim();
if (!TOKEN) throw new Error("no SQUARE_ACCESS_TOKEN in local.properties");
const FIX = process.argv.includes("--fix");

const call = async (path, init) => {
    const r = await fetch("https://connect.squareup.com/v2" + path, {
        ...init,
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            "Square-Version": "2024-10-17",
            "Content-Type": "application/json",
        },
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
};

// A franchise is recognised the same way in a product name and in a category name, so the two are comparable.
// Order matters: "one piece" is checked before the generic single-word matches so a card called
// "One Piece Pokemon crossover" is not claimed by the wrong side.
const FRANCHISES = [
    ["one piece", /\bone\s*piece\b|\bop-\d|\bopcg\b/i],
    ["pokemon", /\bpok[eé]mon\b|\bpokemon\b|\bptcg\b/i],
    ["magic", /\bmagic\b|\bmtg\b|\bmagic:?\s*the\s*gathering\b/i],
    ["yugioh", /\byu-?gi-?oh\b|\bygo\b/i],
    ["dragon ball", /\bdragon\s*ball\b|\bdbz\b|\bdbs\b/i],
    ["lorcana", /\blorcana\b/i],
    ["naruto", /\bnaruto\b/i],
    ["final fantasy", /\bfinal\s*fantasy\b|\bfftcg\b/i],
    ["my little pony", /\bmy\s*little\s*pony\b|\bmlp\b/i],
];

// Categories that are not about a franchise at all — anything may sit in them.
const NEUTRAL = /^(accessories|action figures|bulk cards|creation tokens|drinks food|mystery bag|mystery pack|store credit|plush|sports sealed)$/i;

const franchiseOf = (text) => FRANCHISES.find(([, re]) => re.test(String(text || "")))?.[0] || null;

const cats = (await call("/catalog/list?types=CATEGORY")).body.objects || [];
const catName = Object.fromEntries(cats.map((o) => [o.id, o.category_data?.name || o.id]));

let cursor = null;
const items = [];
do {
    const r = await call("/catalog/list?types=ITEM" + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""));
    items.push(...(r.body.objects || []));
    cursor = r.body.cursor || null;
} while (cursor);

const suspects = [];
for (const o of items) {
    const name = o.item_data?.name || "";
    const catId = o.item_data?.reporting_category?.id || o.item_data?.category_id || null;
    if (!catId) continue;                       // uncategorised is a different problem, and a noisy one
    const cName = catName[catId] || "";
    if (NEUTRAL.test(cName.trim())) continue;

    const nameFr = franchiseOf(name);
    const catFr = franchiseOf(cName);
    // Both sides have to be confident AND disagree. A name with no franchise in it is unjudgeable, and a
    // category with none is somebody's own shelf.
    if (!nameFr || !catFr || nameFr === catFr) continue;

    // Where it should go: a category of the right franchise whose "shape" matches.
    //
    // ⚠️ THE SHAPE COMES FROM THE PRODUCT NAME, NOT THE CURRENT CATEGORY. Reading it off the category it is
    // sitting in takes its cue from the very thing that is wrong: three Lorcana boosters filed under
    // "Pokemon Sealed" were read as SEALED, so the audit went looking for a "Lorcana sealed" category that
    // does not exist and reported all three as unfixable. The name says what the product IS.
    const shapeOf = (t) => /\bsingle\b/i.test(t) ? "single"
        : /\bbooster\b/i.test(t) ? "booster"
        : /\b(sealed|starter\s*deck|elite\s*trainer|etb|bundle|collection|tin|box)\b/i.test(t) ? "sealed"
        : null;
    const shape = shapeOf(name) || shapeOf(cName);
    const candidates = cats
        .map((c) => ({ id: c.id, name: c.category_data?.name || "" }))
        .filter((c) => franchiseOf(c.name) === nameFr);
    const best = candidates.find((c) => shape && new RegExp(shape, "i").test(c.name)) || null;

    suspects.push({ id: o.id, version: o.version, name, from: cName, fromId: catId, toName: best?.name || null, toId: best?.id || null, nameFr, shape });
}

console.log(`${items.length} items · ${cats.length} categories`);
console.log(`${suspects.length} name/category franchise conflicts\n`);

const fixable = suspects.filter((s) => s.toId);
const manual = suspects.filter((s) => !s.toId);

for (const s of suspects) {
    const arrow = s.toName ? `-> ${s.toName}` : "-> ?? no matching category for this franchise + shape";
    console.log(`  ${s.name.slice(0, 52).padEnd(54)} ${s.from.padEnd(24)} ${arrow}`);
}

if (!FIX) {
    console.log(`\n${fixable.length} can be moved automatically, ${manual.length} need a human.`);
    console.log("Re-run with --fix to move the automatic ones. Nothing has been changed.");
    process.exit(0);
}

console.log("");
for (const s of fixable) {
    const cur = (await call(`/catalog/object/${s.id}`)).body.object;
    if (!cur) { console.log(`  SKIP  ${s.name} — could not re-read`); continue; }
    // ⚠️ KEEP THE EXISTING ORDINAL, DO NOT SET 0. Square stores these as large sentinel values
    // (-2251798052078080 on a real item here), and forcing 0 collides with whatever already holds 0 in that
    // account — it comes back as "duplicate int value 0 with string value <category id>", which reads like
    // the CATEGORY is bad and is really about the ordinal. Only the id is being changed, so only the id
    // should change.
    //
    // ⚠️ AND DO NOT WRITE THE LEGACY category_id ALONGSIDE `categories`. It is deprecated, and setting both
    // is a second way to trip the same duplicate check.
    const ordinal = cur.item_data.reporting_category?.ordinal ?? cur.item_data.categories?.[0]?.ordinal ?? 0;
    cur.item_data.reporting_category = { id: s.toId, ordinal };
    cur.item_data.categories = [{ id: s.toId, ordinal }];
    delete cur.item_data.category_id;
    const res = await call("/catalog/object", {
        method: "POST",
        // Keyed on the version so a re-run after a change is a new write, and a re-run without one is a no-op.
        body: JSON.stringify({ idempotency_key: `recat-${s.id}-${cur.version}`, object: cur }),
    });
    console.log(res.status === 200
        ? `  moved ${s.name.slice(0, 46).padEnd(48)} -> ${s.toName}`
        : `  FAIL  ${s.name.slice(0, 46).padEnd(48)} ${res.status} ${JSON.stringify(res.body).slice(0, 140)}`);
}
console.log(`\n${manual.length} left for a human — listed above with "??".`);
