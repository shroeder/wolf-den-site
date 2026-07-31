import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL || (readFileSync("../accounting_app/.env","utf8").match(/^DATABASE_URL=(.+)$/m)||[])[1].trim());
const c = await sql.query(`SELECT column_name FROM information_schema.columns WHERE table_name='mkt_town_art' ORDER BY ordinal_position`);
console.log("mkt_town_art cols:", c.map(x=>x.column_name).join(", "));
const k = c.find(x=>/key|id|name/.test(x.column_name))?.column_name;
const t = await sql.query(`SELECT ${k} AS k FROM mkt_town_art ORDER BY 1`);
console.log("\nkeys:", t.map(x=>x.k).join(", "));
