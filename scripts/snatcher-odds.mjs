// ── HOW OFTEN DOES THE CANDY SNATCHER TURN UP? ───────────────────────────────────────────────────────────────
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/snatcher-odds.mjs [days]
//
// SNATCHER_CHANCE is a per-member, per-door, per-DAY roll — so the number in the file is not the number anyone
// experiences. What a member feels is "how often do I find one", and what the economy feels is "how much candy
// does this mint a day", and both of those are the constant multiplied by how many pails actually get knocked.
// Raising 0.003 to 0.01 does not make it three times more common on a given night; it makes it three times more
// common across ~360 pail-knocks a day, which is ten skeletons a day. Run this before moving it.
//
// It asks the REAL snatcherDoors, not a copy of the hash, over the REAL membership — so what it reports is what
// ships, including the owner-gated door being excluded from the draw.
import fs from "node:fs";

const pick = (text, key) => {
    for (const line of text.split(/\r?\n/)) {
        const i = line.indexOf("=");
        if (i > 0 && line.slice(0, i).trim() === key) return line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
    return null;
};
process.env.DATABASE_URL ||= pick(fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8"), "DATABASE_URL") || "";
if (!process.env.DATABASE_URL) throw new Error("no DATABASE_URL in accounting_app/.env");

const { db } = await import("@/lib/db");
const { DOOR_IDS, SNATCHER_CANDY, SNATCHER_CHANCE, snatcherDoors } = await import("@/lib/marketplace/trick-or-treat.js");
// ⚠️ THE DRAW IS NOT EVERY DOOR. snatcherDoors drops the owner-gated one, because a skeleton nobody can see
// is a find that never happens — so a projection over all 19 reports a rate 5% higher than the one that
// ships. Same exclusion, same source.
const { GATED_BUILDINGS } = await import("@/lib/marketplace/town.js");
const gated = new Set(GATED_BUILDINGS.filter((b) => b.gate).map((b) => b.id));
const POOL = DOOR_IDS.filter((id) => !gated.has(id));

const DAYS = Number(process.argv[2]) || 365;

// Who actually plays — everyone who has earned candy this week. The event's own population, not the mailing list.
const members = await db.query(
    `SELECT DISTINCT buyer_id FROM mkt_candy_event WHERE buyer_id IS NOT NULL AND created_at > NOW() - INTERVAL '7 days'`
).catch(() => []);
const ids = (members || []).map((m) => m.buyer_id);
if (!ids.length) throw new Error("nobody has earned candy in the last week — is the event on?");

// ⚠️ snatcherDoors reads the date from storeDay(), which has no override — so the real function can only ever
// answer for TODAY. That is still the reading that matters most (it is the shipped code path, gated doors and
// all); the multi-day projection below re-derives the hash to walk forward.
const { storeDay } = await import("@/lib/marketplace/store-day.js");
const today = storeDay().dayKey;

// One real reading, to prove the wiring: what does the live function say about right now?
const live = (await Promise.all(ids.map((id) => snatcherDoors(id).catch(() => [])))).flat();
console.log(`TODAY (${today}): ${live.length} kicking pail(s) among ${ids.length} members x ${POOL.length} doors`);

// ── AND THE LONG RUN ─────────────────────────────────────────────────────────────────────────────────────
// pailHash01 stays module-private, so the projection re-derives it here rather than widening the module's
// export surface for a script. That is a copy, and copies drift — which is what TODAY above is for: it is the
// REAL function, on the real ids, for the real day. If the two ever stop agreeing, this line stops matching
// the projection for day 0 and that is the tell.
function hash01(buyerId, door, dayKey) {
    const s = `${buyerId}|${door}|${dayKey}|snatcher`;
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h / 4294967296;
}
const base = Date.parse(`${today}T12:00:00Z`);
let hits = 0;
const found = new Map();
const byDoor = new Map();
for (let d = 0; d < DAYS; d++) {
    const key = new Date(base + d * 86400000).toISOString().slice(0, 10);
    for (const id of ids) {
        for (const door of POOL) {
            if (hash01(id, door, key) < SNATCHER_CHANCE) {
                hits += 1;
                found.set(id, (found.get(id) || 0) + 1);
                byDoor.set(door, (byDoor.get(door) || 0) + 1);
            }
        }
    }
}
const counts = POOL.map((d) => byDoor.get(d) || 0);
console.log(`\nSNATCHER_CHANCE ${SNATCHER_CHANCE} over ${DAYS} days, ${ids.length} members, ${POOL.length} doors each`);
console.log(`  ${(hits / DAYS).toFixed(2)} a day across the whole Den, IF everyone walks every door`);
console.log(`  one find per member every ${(DAYS / (hits / ids.length)).toFixed(0)} days`);
console.log(`  ${ids.length - found.size} member(s) would never find one in ${DAYS} days`);
console.log(`  mints ${Math.round((hits / DAYS) * SNATCHER_CANDY).toLocaleString()} candy a day at ${SNATCHER_CANDY} a find`);
console.log(`  per-door spread ${Math.min(...counts)}-${Math.max(...counts)} (lopsided here means the hash is clustering)`);
process.exit(0);
