import { readFileSync } from "node:fs";
import path from "node:path";
function secret(name){ if(process.env[name]) return process.env[name]; try{const e=readFileSync(path.resolve("../accounting_app/.env"),"utf8");const m=e.match(new RegExp(`^${name}=(.+)$`,"m"));if(m)return m[1].trim().replace(/^["']|["']$/g,"");}catch{} return null; }
const { Pool } = await import("@neondatabase/serverless");
const pool = new Pool({ connectionString: secret("DATABASE_URL") });
const r = await pool.query("SELECT COUNT(*)::int n FROM mkt_pet_sprite_level WHERE url IS NOT NULL");
const b = await pool.query("SELECT COUNT(*)::int n FROM mkt_pet_sprite WHERE url IS NOT NULL");
console.log(`${new Date().toISOString()} evolved=${r.rows[0].n} wanted=${b.rows[0].n*4}`);
await pool.end();
