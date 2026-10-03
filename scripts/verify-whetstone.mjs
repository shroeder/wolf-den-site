// ── DOES THE WHETSTONE ACTUALLY DO WHAT THE LABEL SAYS? ──────────────────────────────────────────────────────
//   node --import ./scripts/lib/register-loader.mjs scripts/verify-whetstone.mjs
//
// Two claims to check, and they are the two that are easy to get wrong:
//   1. USING one writes a boost that memberEdgeMult reads back. A consumable that grants nothing is the
//      worst bug this file can have, because the item is spent either way.
//   2. It is NOT clipped by BOSS_MULT_CAP. That is the entire reason the item exists, and it is a property of
//      WHERE one multiplication sits in one line of boss.js — the kind of thing that survives a review and
//      dies in a refactor. Checked as arithmetic against the real constant rather than asserted in a comment.
//
// Everything it writes is removed again at the end: this runs against the live database, on Luke's own row,
// because that is the only place the real functions can be exercised.
import fs from "node:fs";

process.env.DATABASE_URL = process.env.DATABASE_URL
    || fs.readFileSync(".env.local", "utf8").match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)[1];

// ⚠️ RENAMED ON IMPORT, AND NOT FOR STYLE. eslint-plugin-react-hooks matches on the IDENTIFIER, so a
// plain function called `useConsumable` reads as a React hook wherever it is called — and calling it at
// the top level of a node script is then a rules-of-hooks error in a file that has never seen React.
// Binding it to a non-`use` name is the whole fix.
const { CONSUMABLES, grantConsumable, useConsumable: consume, memberEdgeMult } = await import("@/lib/marketplace/consumables.js");
const { BOSS_MULT_CAP } = await import("@/lib/marketplace/boss.js");
const { db } = await import("@/lib/db");

const ME = "6857d67e-3dd0-46b6-aad7-b91699155ff6"; // The Wolf Den (Luke)
const ID = "hw_whetstone";
const def = CONSUMABLES[ID];
let fail = 0;
const check = (label, ok, detail) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`); if (!ok) fail += 1; };

console.log(`\n${def.name}: ${JSON.stringify(def.effect)}\n`);

// ── 1. the round trip ────────────────────────────────────────────────────────────────────────────────────
const before = await memberEdgeMult(ME);
check("no edge boost running before the test", before === 1, `memberEdgeMult = ${before}`);

await grantConsumable(ME, ID, 1);
const used = await consume(ME, ID);
check("using it succeeds", used?.ok === true, used?.applied || used?.error);

const after = await memberEdgeMult(ME);
const want = 1 + def.effect.pct / 100;
check(`memberEdgeMult reads back ${want}`, Math.abs(after - want) < 1e-9, `got ${after}`);

// ── 2. the cap ───────────────────────────────────────────────────────────────────────────────────────────
// A member whose gear already stacks past the ceiling. ValkyrieSylve's is ~9.5, so a x3 potion puts her at
// 28.5 and the cap throws two thirds of it away — this is her case, exactly.
const gearStack = 9.5;
const potion = 3;
const swing = 100_000;
const cappedStack = Math.min(BOSS_MULT_CAP, gearStack * potion);
const noStone = Math.round(swing * 1 * cappedStack);
const withStone = Math.round(swing * want * cappedStack);
check(
    "the potion is clipped for a capped member",
    cappedStack === BOSS_MULT_CAP,
    `gear ${gearStack} x potion ${potion} = ${gearStack * potion}, clipped to ${BOSS_MULT_CAP}`,
);
check(
    `the whetstone still pays its full +${def.effect.pct}% at the ceiling`,
    Math.abs(withStone / noStone - want) < 1e-6,
    `${noStone.toLocaleString()} -> ${withStone.toLocaleString()} (x${(withStone / noStone).toFixed(3)})`,
);

// ── 3. a second one extends rather than sharpening further ───────────────────────────────────────────────
await grantConsumable(ME, ID, 1);
await consume(ME, ID);
const twice = await memberEdgeMult(ME);
check("a second whetstone does not raise the multiplier", Math.abs(twice - want) < 1e-9, `still ${twice}`);
const rows = await db.query(`SELECT COUNT(*)::int AS n FROM mkt_user_boost WHERE buyer_id = $1 AND kind = 'edge' AND expires_at > NOW()`, [ME]);
check("and it extended the one row rather than adding a second", rows[0].n === 1, `${rows[0].n} row(s)`);

// ── clean up: this is the live database ──────────────────────────────────────────────────────────────────
await db.query(`DELETE FROM mkt_user_boost WHERE buyer_id = $1 AND kind = 'edge'`, [ME]);
await db.query(`DELETE FROM mkt_user_consumable WHERE buyer_id = $1 AND consumable_id = $2`, [ME, ID]).catch(() => {});
const left = await memberEdgeMult(ME);
check("cleaned up", left === 1, `memberEdgeMult = ${left}`);

console.log(fail ? `\n${fail} check(s) FAILED\n` : "\nall checks passed\n");
process.exit(fail ? 1 : 0);
