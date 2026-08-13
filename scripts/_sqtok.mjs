import { register } from "node:module";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
const env = fs.readFileSync(process.env.TEMP + "/claude/C--Users-Luke-Projects/7b08b63f-036a-496e-a99d-3261047a2989/scratchpad/prod.env", "utf8");
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/);
  if (m) process.env[m[1]] = m[2];
}
register("./scripts/lib/app-loader.mjs", pathToFileURL("./"));
const { db } = await import("../src/lib/db.js");
const stores = await db.query("SELECT id, name, uses_env_credentials FROM stores");
console.log("stores:", stores.map((s) => `${s.id}:${s.name} env=${s.uses_env_credentials}`).join(" | "));
const rows = await db.query("SELECT store_id, provider, status FROM store_integrations");
console.log("integrations:", rows.map((r) => `${r.provider}(store ${r.store_id}, ${r.status})`).join(" | "));
