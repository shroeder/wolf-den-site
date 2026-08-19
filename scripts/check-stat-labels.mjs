// ── CAN EVERY STAT IN THE GAME BE NAMED? ─────────────────────────────────────────────────────────────────────
// A stat added to an item, a pet, a badge, a set or a gem and NOT added to the table its screen reads renders as
// its own database key — "+2 tenacity", "+9 base_damage" — under whatever generic blurb the fallback supplies.
// That is not an error in any language and the build is perfectly happy with it, which is why it happened to
// vitality, tenacity and pierce on the pets screen and to eleven stats in the mine.
//
// So: gather every stat key any source can actually grant, and check each of the tables that has to name it.
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/check-stat-labels.mjs
import { ITEMS, STAT_META } from "../src/lib/marketplace/items.js";
import * as C from "../src/lib/marketplace/collectibles.js";
import { ITEM_SETS } from "../src/lib/marketplace/sets.js";
import { GEMS } from "../src/lib/marketplace/gems.js";
import { BADGE_BONUSES } from "../src/lib/marketplace/badges.js";
import { WORDS as BADGE_WORDS } from "../src/lib/marketplace/badge-pop.js";

const sources = {};
const note = (where, k) => { (sources[where] ||= new Set()).add(k); };

for (const it of Object.values(ITEMS)) for (const k of Object.keys(it.stats || {})) note("items", k);
for (const k of Object.values(C.PET_PASSIVE_STAT || {})) note("pets", k);
const walkStats = (o) => { if (!o || typeof o !== "object") return; if (o.stats && typeof o.stats === "object") for (const k of Object.keys(o.stats)) note("sets", k); for (const v of Object.values(o)) if (v && typeof v === "object") walkStats(v); };
for (const s of ITEM_SETS || []) walkStats(s);
for (const g of Object.values(GEMS || {})) for (const k of Object.keys(g.stats || {})) note("gems", k);
for (const b of Object.values(BADGE_BONUSES || {})) for (const dom of Object.values(b || {})) for (const k of Object.keys(dom || {})) note("badges", k);

// Which table has to name it, per source.
const TABLES = {
    items: ["STAT_META", STAT_META],
    sets: ["STAT_META", STAT_META],
    gems: ["STAT_META", STAT_META],
    pets: ["PET_STAT_META", C.PET_STAT_META],
    badges: ["badge-pop WORDS", BADGE_WORDS],
};
let bad = 0;
for (const [where, keys] of Object.entries(sources)) {
    const t = TABLES[where];
    const label = t ? t[0] : "(no table)";
    const missing = t ? [...keys].filter((k) => !t[1][k]) : [];
    console.log(`  ${where.padEnd(8)} ${String(keys.size).padStart(2)} stats  →  ${label}${missing.length ? `   MISSING: ${missing.join(", ")}` : "   all named"}`);
    bad += missing.length;
}
console.log(bad ? `\n${bad} stat(s) will render as a raw key.` : "\nEvery stat any source can grant has a name on the screen that shows it.");
process.exit(bad ? 1 : 0);
