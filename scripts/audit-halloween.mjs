// ── IS THE HALLOWE'EN EVENT ACTUALLY FINISHED? ───────────────────────────────────────────────────────────────
//   node --import ./scripts/lib/register-loader.mjs scripts/audit-halloween.mjs
//
// The event is spread across chests, items, pets, decorations, consumables, sets and town art, and each of
// those keeps its art in a DIFFERENT table — mkt_item_sprite, mkt_pet_sprite, mkt_deco_sprite,
// mkt_consumable_sprite, mkt_town_art. A thing with no row in its own table does not error; it renders as a
// fallback glyph, and the first person to notice is a member opening the chest they were saving.
//
// So this walks every catalogue the event touches and says what is missing, in one list.
import fs from "node:fs";

process.env.DATABASE_URL = process.env.DATABASE_URL
    || fs.readFileSync(".env.local", "utf8").match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)[1];

const { db } = await import("@/lib/db");
const { ITEMS, isHalloweenItem } = await import("@/lib/marketplace/items.js");
const { CONSUMABLES } = await import("@/lib/marketplace/consumables.js");
const { DECORATIONS } = await import("@/lib/marketplace/decorations.js");
const { COLLECTIBLES } = await import("@/lib/marketplace/collectibles.js");
const { HALLOWEEN_CHESTS } = await import("@/lib/marketplace/halloween.js");

const have = async (sqlText, col) => new Set((await db.query(sqlText, []).catch(() => [])).map((r) => r[col]));

const itemArt = await have(`SELECT item_id FROM mkt_item_sprite`, "item_id");
const conArt = await have(`SELECT consumable_id FROM mkt_consumable_sprite`, "consumable_id");
const decoArt = await have(`SELECT deco_id FROM mkt_deco_sprite`, "deco_id");
const petArt = await have(`SELECT pet_id FROM mkt_pet_sprite`, "pet_id");
const townArt = await have(`SELECT art_key FROM mkt_town_art`, "art_key");
const chestArtRow = await db.queryOne(`SELECT value FROM mkt_setting WHERE key = 'chest_art'`).catch(() => null);
const chestArt = new Set(Object.keys((() => {
    const v = chestArtRow?.value;
    try { return typeof v === "string" ? JSON.parse(v) : (v || {}); } catch { return {}; }
})()));

const groups = [
    ["gear items", ITEMS.filter(isHalloweenItem).map((i) => i.id), itemArt],
    ["consumables (candy + relics)", Object.keys(CONSUMABLES).filter((id) => CONSUMABLES[id].kind === "candy" || id.startsWith("hw_")), conArt],
    ["decorations", DECORATIONS.filter((d) => d.source === "halloween").map((d) => d.id), decoArt],
    ["pets", COLLECTIBLES.filter((c) => String(c.id).startsWith("hw_")).map((c) => c.id), petArt],
    ["chest icons", HALLOWEEN_CHESTS, chestArt],
    ["town props", [...townArt].filter((k) => k.startsWith("hw_")), townArt],
];

let missing = 0;
for (const [label, ids, art] of groups) {
    const gaps = ids.filter((id) => !art.has(id));
    missing += gaps.length;
    console.log(`\n${label}: ${ids.length - gaps.length}/${ids.length} have art`);
    if (gaps.length) console.log(`   MISSING: ${gaps.join(", ")}`);
}
console.log(`\n${missing} Hallowe'en asset(s) with no art.\n`);
process.exit(0);
