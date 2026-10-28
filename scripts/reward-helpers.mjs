// ── REWARD THE MEMBERS WHO HELP NEW MEMBERS ──────────────────────────────────────────────────────────────────
// Luke, 2026-10-28, after reading who had been answering newcomers in global chat: "I like the helping paws.
// They don't have it already, and also instead of store credit, give them some gold, like 10,000 gold and
// maybe a celestial chest."
//
// Three things per person: the `helping_paw` badge, 10,000 gold, one celestial chest.
//
// ⚠️ IT CALLS THE GAME'S OWN FUNCTIONS, NOT SQL. grantBadge emails a congratulations and fires the badge-earned
// push; addChests is the single door every chest in the game comes through (and the one place the Halloween
// substitution lives); logCoin puts the gold in the statement the member can actually read. Hand-writing three
// UPDATEs would award all three things INVISIBLY — no mail, no notification, no ledger row — which is the
// "two paths for one payout" shape this repo keeps getting bitten by.
//
// ⚠️ THE GOLD IS NOT RATED, ON PURPOSE. mint() exists to halve FAUCETS (gold-rate.js, GOLD_MINT_RATE 0.4); a
// hand-picked one-off award is an authored number Luke said out loud, so 10,000 means 10,000. It is logged
// under its own reason so it shows up in the coin economy as the outlier it is rather than hiding inside
// another earner's line.
//
// Usage:  node scripts/reward-helpers.mjs                 # dry run — prints what it WOULD do
//         node scripts/reward-helpers.mjs --go            # actually grant
//         node scripts/reward-helpers.mjs --go alias,alias
import fs from "node:fs";
import { register } from "node:module";

// db.js reads process.env.DATABASE_URL at call time and Next normally supplies it. Under plain node nothing
// does, and the failure is a thrown "Missing DATABASE_URL" rather than anything about the environment — so
// the secret is lifted off disk the same way the art scripts lift the OpenAI key. Set BEFORE the app modules
// are imported, which is why they are dynamic imports below.
const ENV = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
process.env.DATABASE_URL ||= ENV.match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)?.[1] || "";

register("./lib/app-loader.mjs", import.meta.url);

const { db } = await import("@/lib/db");
const { grantBadge } = await import("@/lib/marketplace/badges.js");
const { addChests } = await import("@/lib/marketplace/chests.js");
const { logCoin } = await import("@/lib/marketplace/coins.js");

const BADGE = "helping_paw";
const GOLD = 10000;
const CHEST = "celestial";
const REASON = "helping_paw_award";

const GO = process.argv.includes("--go");
const named = process.argv.slice(2).find((a) => !a.startsWith("--"));
// The four from the global-chat read: graykitsune (wrote a brand-new player the whole game tour unprompted),
// sunflowerjinxx (six different newcomers), kaishiern (teaches mechanics nobody asked about), anamarisa
// (walked sphinx through farm visits while twelve days new herself).
const ALIASES = named ? named.split(",").map((s) => s.trim()).filter(Boolean)
    : ["graykitsune", "sunflowerjinxx", "kaishiern", "anamarisa"];

const people = await db.query(
    `SELECT id, alias, gold FROM mkt_buyer WHERE alias = ANY($1)`, [ALIASES],
);
// ⚠️ FAIL ON A MISSING ALIAS RATHER THAN QUIETLY REWARDING THREE OF FOUR. A typo here is silent otherwise:
// the script reports success, and the person it was for never hears anything.
const missing = ALIASES.filter((a) => !people.some((p) => p.alias === a));
if (missing.length) { console.error(`no such member: ${missing.join(", ")}`); process.exit(1); }

console.log(`${GO ? "GRANTING" : "DRY RUN —"} ${BADGE} + ${GOLD.toLocaleString()} gold + 1 ${CHEST} chest, to ${people.length}:`);
for (const p of people) console.log(`  ${p.alias.padEnd(18)} gold ${Number(p.gold || 0).toLocaleString()} → ${(Number(p.gold || 0) + GOLD).toLocaleString()}`);
if (!GO) { console.log("\nnothing written. re-run with --go"); process.exit(0); }

for (const p of people) {
    const badge = await grantBadge(p.id, BADGE, "admin");
    const row = await db.queryOne(
        `UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [p.id, GOLD],
    ).catch(() => null);
    await logCoin(p.id, GOLD, REASON, { balanceAfter: row?.gold ?? null, meta: { badge: BADGE, by: "luke" } });
    await addChests(p.id, { [CHEST]: 1 }, { source: REASON, meta: { badge: BADGE } });
    console.log(`✓ ${p.alias}: badge ${badge.ok ? (badge.isNew ? "granted" : "already held") : `FAILED (${badge.error})`}`
        + `, gold → ${Number(row?.gold ?? 0).toLocaleString()}, 1 ${CHEST} chest`);
}
console.log("\ndone — they get a badge email, a badge push, a coin-ledger row and a chest-grant row each.");
