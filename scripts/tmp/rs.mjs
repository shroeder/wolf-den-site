import { readFileSync } from "node:fs";
const env = readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
for (const l of env.split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
const { primaryOwnerId } = await import("@/lib/marketplace/owner.js");
const r = (await sql`SELECT state FROM mkt_cards_run WHERE buyer_id = ${primaryOwnerId()}::uuid`)[0];
const st = r?.state || {};
console.log(`act ${st.act} stop ${st.stop} hp ${st.hp}/${st.hpMax} deck ${(st.deck||[]).length} perks ${(st.perks||[]).length}`);
