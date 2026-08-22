import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
const url = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env","utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const { neon } = await import("@neondatabase/serverless");
const sql = neon(url);
const t = randomBytes(32).toString("hex");
await sql`INSERT INTO mkt_buyer_session (buyer_id, token_hash, device_label, expires_at)
  VALUES ('6857d67e-3dd0-46b6-aad7-b91699155ff6', ${createHash("sha256").update(t).digest("hex")}, 'shot-rig', NOW() + INTERVAL '3 hours')`;
console.log(t);
