// Does the Aurora Orb actually reach Kaishiern's decoration drawer?
//   Kaishiern: "I recieved an aura orb decoration but it's not showing anywhere on my decoration list
//   even after refreshing"
// He owns deco_glint_aurora_orb x2 in mkt_deco_owned, so the grant worked. This runs the REAL state
// builder the farm UI reads and asks what it hands back.
//   node --import ./scripts/lib/register-loader.mjs scripts/deco-missing.mjs
import fs from "node:fs";
process.env.DATABASE_URL = process.env.DATABASE_URL
    || fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8")
        .match(/^DATABASE_URL=(.+)$/m)[1].trim().replace(/^"|"$/g, "");

const { decoState } = await import("@/lib/marketplace/farm-decorations.js");
const ID = "226a71e0-3969-45fc-b0f0-c762d6f5b355";
const st = await decoState(ID);
const find = (list) => (list || []).filter((d) => String(d.id).includes("glint"));
console.log(`owned entries: ${st.owned?.length}`);
for (const d of find(st.owned)) console.log(`  OWNED  ${d.id}  "${d.name}"  sprite=${d.spriteUrl ? "yes" : "NO"}  placed=${d.placed}`);
console.log(`\ncatalog entries: ${st.catalog?.length}`);
for (const d of find(st.catalog)) console.log(`  CAT    ${d.id}  owned=${d.owned}  buyable=${d.buyable}  sprite=${d.spriteUrl ? "yes" : "NO"}`);
