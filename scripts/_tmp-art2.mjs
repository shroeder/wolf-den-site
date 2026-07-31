import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
function pick(t,k){for(const l of t.split(/\r?\n/)){const i=l.indexOf("=");if(i>0&&l.slice(0,i).trim()===k)return l.slice(i+1).trim();}return null;}
const sql = neon(pick(readFileSync("../accounting_app/.env","utf8"),"DATABASE_URL"));
const c = await sql.query(`SELECT count(*)::int n FROM mkt_consumable_sprite`).catch(()=>[{n:"(no table)"}]);
console.log("consumable sprites:", c[0].n);
const cols = await sql.query(`SELECT column_name FROM information_schema.columns WHERE table_name='mkt_consumable_sprite'`);
console.log("cols:", cols.map(x=>x.column_name).join(", "));
const crops = await sql.query(`SELECT art_key FROM mkt_town_art WHERE art_key LIKE 'crop_%_ripe'`);
console.log("crop ripe art:", crops.length);
