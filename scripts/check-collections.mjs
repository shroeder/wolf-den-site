// ── A COLLECTION PIECE IS NOT GEAR, AND THIS IS WHAT KEEPS IT THAT WAY ───────────────────────────────────────
// Luke, after the fourth separate bug caused by the same thing: "I honestly wish collectibles were just not
// mistakable for equipment because they're just not the same thing at all. And obviously it's led you to a
// place where you made this mistake again."
//
// He is right, and the fix is not another guard. Every one of those bugs — the Forge offering scrap it would
// refuse, a permanent bonus that could be sold for coins, "Borrow this one" doing nothing, Gravebound missing
// from its own panel, combat stats generated onto a thing with no combat — came from ONE authoring decision:
// three collection sets written into items.js instead of collection-pieces.js. Guards catch the symptom at
// each call site and there are at least ten call sites. This catches the cause, once.
//
// THE RULE: no set marked `collection: true` may name a piece that resolves through itemById.
//
//   npm run check:collections
import { ITEM_SETS } from "../src/lib/marketplace/sets.js";
import { itemById } from "../src/lib/marketplace/items.js";
import { isPieceId, COLLECTION_PIECES } from "../src/lib/marketplace/collection-pieces.js";

const problems = [];
const collections = ITEM_SETS.filter((s) => s.collection);

for (const set of collections) {
    for (const id of set.items || []) {
        if (itemById(id)) {
            problems.push(`${set.name} (${set.id}): "${id}" resolves as an ITEM. A collection piece must live in `
                + `collection-pieces.js — as gear it can be equipped, sold, salvaged, auctioned and traded, and `
                + `every one of those silently deletes a permanent set bonus.`);
        } else if (!isPieceId(id)) {
            problems.push(`${set.name} (${set.id}): "${id}" is neither an item nor a trophy — it resolves to `
                + `nothing at all, so the set can never be completed.`);
        }
    }
}

// The reverse: a trophy that claims a set nothing defines is a piece nobody can ever use.
const setIds = new Set(ITEM_SETS.map((s) => s.id));
const legacy = new Set(collections.flatMap((s) => s.items || []));
for (const p of COLLECTION_PIECES) {
    if (!p.set) continue;
    const owner = collections.find((s) => (s.items || []).includes(p.id));
    if (!owner && !setIds.has(p.set) && !legacy.has(p.id)) {
        problems.push(`trophy "${p.id}" names set "${p.set}", which no collection set lists it under.`);
    }
}

if (problems.length) {
    console.error(`check:collections — ${problems.length} problem${problems.length === 1 ? "" : "s"}:\n`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    console.error("");
    process.exit(1);
}

const pieces = collections.reduce((n, s) => n + (s.items || []).length, 0);
console.log(`check:collections — ${collections.length} collection sets, ${pieces} pieces, none of them gear.`);
