import { db } from "../src/lib/db.js";
const { resolveSquareAccessToken } = await import("../src/lib/admin-app/integrations.js");
const stores = await db.query(`SELECT id, name, uses_env_credentials FROM stores`).catch(() => []);
for (const s of stores) {
    const t = await resolveSquareAccessToken(s.id).catch((e) => `ERR ${e.message}`);
    console.log(`  store ${s.id}  ${String(s.name).slice(0,24).padEnd(26)} env=${s.uses_env_credentials}  token=${t ? (String(t).startsWith("ERR") ? t : `${String(t).slice(0,6)}...${String(t).slice(-4)} (len ${String(t).length})`) : "none"}`);
}
process.exit(0);
