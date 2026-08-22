// ── SKILLS LEFT BEHIND BY A CLASS SWITCH ─────────────────────────────────────────────────────────────────────
// respecClass emptied the passive tree and left the ACTIVE skills bag alone, so anyone who paid to change class
// kept the old class's skills: unusable, invisible in a panel that only lists the current class, and counted as
// spent points. GrayKitsune reported it as "I can't put any of my active skill points in" — his fifteen earned
// points were exactly consumed by thirteen dead Reaver nodes and two dead unlocks.
//
// The code fix makes the READ class-aware, so nobody is stranded any more. This clears the dead entries as
// well, because a bag that still holds them would count them again the day somebody switches back.
//
//   node --experimental-loader ./scripts/lib/alias-loader.mjs scripts/remediate-2026-08-22-classswitch-skills.mjs        (dry run)
//   node --experimental-loader ./scripts/lib/alias-loader.mjs scripts/remediate-2026-08-22-classswitch-skills.mjs --apply
import fs from "node:fs";
import { skillById } from "../src/lib/marketplace/arena-skills.js";

const APPLY = process.argv.includes("--apply");
const url = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const { neon } = await import("@neondatabase/serverless");
const sql = neon(url);

const rows = await sql`
  SELECT a.buyer_id, b.display_name, a.arena_class, a.skills
  FROM mkt_arena a JOIN mkt_buyer b ON b.id = a.buyer_id
  WHERE a.skills IS NOT NULL AND a.arena_class IS NOT NULL`;

let touched = 0;
for (const r of rows) {
    const bag = typeof r.skills === "string" ? JSON.parse(r.skills || "{}") : (r.skills || {});
    const keep = {};
    const drop = [];
    for (const [id, nodes] of Object.entries(bag)) {
        const sk = skillById(id);
        if (sk && sk.classId === r.arena_class) keep[id] = nodes;
        else drop.push(`${id}(${Array.isArray(nodes) ? nodes.length : 0})`);
    }
    if (!drop.length) continue;
    touched += 1;
    const freed = drop.length + drop.reduce((n, d) => n + Number(d.match(/\((\d+)\)/)?.[1] || 0), 0);
    console.log(`${String(r.display_name).padEnd(18)} is ${String(r.arena_class).padEnd(10)} — dropping ${drop.join(", ")}  (+${freed} points freed)`);
    if (APPLY) {
        await sql`UPDATE mkt_arena SET skills = ${JSON.stringify(keep)}::jsonb WHERE buyer_id = ${r.buyer_id}`;
    }
}
console.log(`\n${touched} of ${rows.length} members carrying another class's skills${APPLY ? " — cleaned" : " (dry run, nothing written)"}`);
