// Re-measure recipe acquisition against real 7-day volumes, the same way BACKLOG item 1 did.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
const sql = neon(readFileSync("../accounting_app/.env","utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim());
const src = readFileSync("src/lib/marketplace/cooking.js","utf8");
const block = src.match(/RECIPE_SOURCES = \{([\s\S]*?)\n\};/)[1];
const rates = {};
for (const m of block.matchAll(/(\w+):\s*\{[^}]*chance:\s*([0-9.]+)/g)) rates[m[1]] = Number(m[2]);

// Map each source to the activity events that actually fire it.
const EV = {
  harvest:["harvest_crop"], fish:["fish_caught"], dig:["sail_dig"], dig_deep:["sail_dig_deep"],
  spin:["daily_spin"], salvage:["craft_salvage"], forge:["craft_enhance"],
  pet_bond:["feed_pet","pet_farm","pet_other"], gamble:["tavern_gamble"], cook:["cook"],
  barkeep:["tavern_barkeep"], crier:["town_crier"], daily_deal:["buy_daily_deal"],
  town_merchant:["town_merchant"], raid_win:["sail_raid"], town_raid:["town_skirmish"],
  boss_kill:["boss_kill"],
};
const rows = await sql`
  SELECT event, COUNT(*)::int n FROM mkt_activity_event
   WHERE created_at > NOW() - INTERVAL '7 days' GROUP BY 1`;
const cnt = Object.fromEntries(rows.map(r=>[r.event, r.n]));
const chestRows = await sql`
  SELECT COUNT(*)::int n FROM mkt_activity_event WHERE event = 'open_chest' AND created_at > NOW() - INTERVAL '7 days'`;

const out = [];
for (const [k, ch] of Object.entries(rates)) {
  let n = 0;
  if (k.startsWith("chest_")) n = Math.round((chestRows[0]?.n||0) * (k==="chest_wooden"?0.5:k==="chest_iron"?0.3:k==="chest_gold"?0.15:0.05));
  else n = (EV[k]||[]).reduce((s,e)=>s+(cnt[e]||0),0);
  out.push({ source:k, events:n, rate:(ch*100).toFixed(1)+"%", perWk:+(n*ch).toFixed(1) });
}
out.sort((a,b)=>b.perWk-a.perWk);
console.table(out);
const total = out.reduce((s,r)=>s+r.perWk,0);
const members = (await sql`SELECT COUNT(DISTINCT buyer_id)::int n FROM mkt_activity_event WHERE created_at > NOW() - INTERVAL '7 days'`)[0].n;
const top2 = out.slice(0,2).reduce((s,r)=>s+r.perWk,0);
console.log(`\ntotal ${total.toFixed(1)} recipes/wk across ${members} active members = ${(total/members).toFixed(2)} per member per week`);
console.log(`64-recipe book in ~${(64/(total/members)).toFixed(0)} weeks · top two sources = ${(top2/total*100).toFixed(0)}% of all drops`);
