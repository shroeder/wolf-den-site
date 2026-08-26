import { createBuyerSession } from "../src/lib/marketplace/buyer-session.js";
import { db } from "../src/lib/db.js";
const me = await db.queryOne(`SELECT id, COALESCE(NULLIF(display_name,''), alias) AS nm, gold FROM mkt_buyer WHERE email_normalized = $1`, ["deagle.shroeder@gmail.com"]);
const s = await createBuyerSession(me.id, { deviceLabel: "screenshot-rig (temporary)" });
console.log("MEMBER " + me.nm + " gold=" + me.gold);
console.log("TOKEN " + s.token);
