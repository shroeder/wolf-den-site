// ── WHAT THE LADDER WOULD HAND OUT ON DAY ONE ────────────────────────────────────────────────────────────
// The casino stopped being a shop and became a ladder: everything is claimed off lifetime gold won rather
// than bought. Which means the moment it ships, every member is owed every rung they have already passed —
// all at once, for play they did months ago.
//
// ⚠️ THAT NUMBER HAS TO BE LOOKED AT BEFORE IT SHIPS, NOT AFTER. It is the single biggest one-off injection
// the economy has ever had, it lands in one day, and the intervals in casino-milestones.js are the only dial.
// The first draft of them owed one member sixteen Mythic chests.
//
//   node scripts/casino-ladder.mjs
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";

import {
    CHEST_EVERY, PET_AT, STAT_EVERY, UNLOCK_AT, VIP_EVERY, VIP_PET_AT, entitlements,
} from "../src/lib/marketplace/casino-milestones.js";

const env = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
const sql = neon(env.match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)[1]);
const OWNER = (await sql`SELECT id FROM mkt_buyer WHERE display_name='The Wolf Den'`)[0].id;

// Lifetime gold won, which for everything before the rework IS the chips they were paid: a chip was minted at
// CHIP_RATE 1 per gold of a machine's own payout, so the two columns are the same quantity under two names.
const rows = await sql`
  SELECT b.display_name AS who, b.id, SUM(GREATEST(t.delta,0))::bigint AS won
    FROM mkt_token_event t JOIN mkt_buyer b ON b.id=t.buyer_id
   WHERE t.buyer_id <> ${OWNER} AND t.delta > 0
   GROUP BY b.display_name, b.id ORDER BY won DESC`;

// What they already hold, because the ladder is a FLOOR and never takes anything away.
const held = {};
for (const r of await sql`SELECT buyer_id, perk, level FROM mkt_casino_perk WHERE level > 0`) {
    (held[r.buyer_id] ||= {})[r.perk] = r.level;
}

console.log("── THE LADDER ───────────────────────────────────────────────────────────────");
console.log("  stat levels, every:", Object.entries(STAT_EVERY).map(([k, v]) => `${k} ${v / 1000}k`).join("  "));
console.log("  pets at:          ", Object.entries(PET_AT).map(([k, v]) => `${v / 1000}k`).join("  "));
console.log("  VIP pets at:      ", Object.entries(VIP_PET_AT).map(([k, v]) => `${v / 1000}k`).join("  "));
console.log("  unlocks at:       ", Object.entries(UNLOCK_AT).map(([k, v]) => `${k} ${v / 1000}k`).join("  "));
console.log("  chests, every:    ", Object.entries(CHEST_EVERY).map(([k, v]) => `${k} ${v / 1000}k`).join("  "));
console.log("  VIP, every:       ", Object.entries(VIP_EVERY).map(([k, v]) => `${k} ${v / 1000}k`).join("  "));

console.log("\n── WHAT EACH MEMBER IS OWED THE MOMENT IT SHIPS ─────────────────────────────");
const tally = {};
let statNew = 0;
for (const r of rows.slice(0, 12)) {
    const won = Number(r.won);
    const ent = entitlements(won).filter((e) => e.n > 0);
    const bits = [];
    for (const e of ent) {
        if (e.kind === "stat") {
            // ⚠️ ONLY THE DIFFERENCE. Somebody who bought seven levels and is entitled to eight gets ONE.
            const have = held[r.id]?.[e.ref] || 0;
            const gain = Math.max(0, e.n - have);
            if (gain) { bits.push(`${e.ref}+${gain}`); statNew += gain; }
        } else {
            const have = e.kind === "unlock" ? (held[r.id]?.[e.ref] || 0) : 0;
            const gain = Math.max(0, e.n - have);
            if (gain) bits.push(`${e.ref}${gain > 1 ? `x${gain}` : ""}`);
            tally[`${e.kind}:${e.ref}`] = (tally[`${e.kind}:${e.ref}`] || 0) + gain;
        }
    }
    console.log(`  ${String(r.who).padEnd(18)} ${won.toLocaleString().padStart(9)}  ${bits.join(" ") || "(nothing yet)"}`);
}

console.log("\n── THE WHOLE DEN'S FIRST DAY ────────────────────────────────────────────────");
for (const r of rows.slice(12)) {
    const won = Number(r.won);
    for (const e of entitlements(won).filter((x) => x.n > 0)) {
        if (e.kind === "stat") { statNew += Math.max(0, e.n - (held[r.id]?.[e.ref] || 0)); continue; }
        const have = e.kind === "unlock" ? (held[r.id]?.[e.ref] || 0) : 0;
        tally[`${e.kind}:${e.ref}`] = (tally[`${e.kind}:${e.ref}`] || 0) + Math.max(0, e.n - have);
    }
}
for (const [k, n] of Object.entries(tally).sort((a, z) => z[1] - a[1])) if (n) console.log(`  ${k.padEnd(26)} ${n}`);
console.log(`  ${"stat levels (net new)".padEnd(26)} ${statNew}`);

// ⚠️ AND THE CHIPS NOBODY CAN SPEND ANY MORE. The shelf they were for is gone, so an unspent balance is a
// dead currency sitting in 29 accounts. Converted 1:1 to gold at the migration, because that is what they
// were minted against — not written off, which would be taking something somebody won.
const chips = await sql`SELECT COUNT(*)::int n, COALESCE(SUM(chips),0)::bigint s, COALESCE(MAX(chips),0)::bigint m
                          FROM mkt_buyer WHERE chips > 0 AND id <> ${OWNER}`;
console.log(`\n── THE STRANDED CHIPS ───────────────────────────────────────────────────────`);
console.log(`  ${chips[0].n} members hold ${Number(chips[0].s).toLocaleString()} chips (most ${Number(chips[0].m).toLocaleString()}) — converted to gold 1:1`);
