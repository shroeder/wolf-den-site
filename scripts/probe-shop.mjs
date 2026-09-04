// ── STAND THE OWNER'S RUN IN FRONT OF THE MERCHANT, SO THE ROOM CAN BE LOOKED AT ─────────────────────────────
// The shop only renders for a signed-in buyer whose run is parked on a merchant node, which is a state you
// normally reach by playing to it. A screen nobody can get a picture of is a screen that ships on faith, and
// this one has already shipped on faith once.
//
// ⚠️ IT PUTS THE RUN BACK. The owner's real run is written to a backup file BEFORE anything is touched and
// restored by `--restore`, because a rig that eats somebody's in-progress game to take a screenshot is a
// worse bug than the one it was photographing.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/probe-shop.mjs           → backs up, parks the run at a merchant, prints a SHOT_COOKIE
//   ...same, with --restore                                                                  → puts the run back and revokes the session
import fs from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";

const env = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
const DB = env.match(/^DATABASE_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, "");
// ⚠️ SET IT BEFORE THE APP MODULES LOAD. src/lib/db.js reads process.env at call time and swallows its own
// failures, so without this every write below returns quietly and the rig prints a shelf it never saved —
// which is exactly what the first run of this script did.
process.env.DATABASE_URL = DB;
const sql = neon(DB);

const OWNER = "6857d67e-3dd0-46b6-aad7-b91699155ff6";
const BACKUP = "C:/Users/Luke/AppData/Local/Temp/claude/shop-probe-run.json";
const TOKENFILE = "C:/Users/Luke/AppData/Local/Temp/claude/shop-probe-token.txt";

if (process.argv.includes("--restore")) {
    if (fs.existsSync(BACKUP)) {
        const saved = JSON.parse(fs.readFileSync(BACKUP, "utf8"));
        if (saved === null) {
            await sql`DELETE FROM mkt_cards_run WHERE buyer_id = ${OWNER}`;
            console.log("no run existed before — row removed");
        } else {
            await sql`UPDATE mkt_cards_run SET state = ${JSON.stringify(saved)}, updated_at = NOW() WHERE buyer_id = ${OWNER}`;
            console.log("run restored");
        }
        fs.unlinkSync(BACKUP);
    } else {
        console.log("no backup to restore");
    }
    if (fs.existsSync(TOKENFILE)) {
        const token = fs.readFileSync(TOKENFILE, "utf8").trim();
        await sql`DELETE FROM mkt_buyer_session WHERE token_hash = ${createHash("sha256").update(token).digest("hex")}`;
        fs.unlinkSync(TOKENFILE);
        console.log("probe session revoked");
    }
    process.exit(0);
}

// ── 1. BACK THE RUN UP FIRST, before anything is written ─────────────────────────────────────────────────
const row = await sql`SELECT state FROM mkt_cards_run WHERE buyer_id = ${OWNER}`;
fs.writeFileSync(BACKUP, JSON.stringify(row[0]?.state ?? null));
console.log("backed up:", row[0]?.state ? "existing run" : "no run");

// ── 2. PARK IT AT A MERCHANT ─────────────────────────────────────────────────────────────────────────────
// The stock is rolled by the same functions the route uses, imported rather than reimplemented — a rig that
// invents its own shelf is a rig that photographs a screen the game cannot produce.
const { loadRun, saveRun, shopStock } = await import("../src/lib/marketplace/cards.js");
const run = await loadRun(OWNER, { create: true });
run.done = null;
run.at = { row: 4, lane: 1, kind: "merchant" };
run.hp = 44;
run.embers = 260;                       // enough that nothing on the shelf is greyed out for the picture
run.shop = { stock: await shopStock(OWNER, run, (run.seed >>> 0) + 4 * 131), bought: [], removed: false };
await saveRun(OWNER, run);
console.log("parked at merchant —", run.shop.stock.length, "on the shelf:",
    run.shop.stock.map((s) => `${s.kind}:${s.ref}@${s.price}${s.sale ? "*" : ""}`).join("  "));

// ── 3. A SESSION THE RIG CAN WEAR ────────────────────────────────────────────────────────────────────────
const token = randomBytes(32).toString("hex");
await sql`INSERT INTO mkt_buyer_session (buyer_id, token_hash, device_label, expires_at)
          VALUES (${OWNER}, ${createHash("sha256").update(token).digest("hex")}, 'shop probe', NOW() + INTERVAL '2 hours')`;
fs.writeFileSync(TOKENFILE, token);
console.log("SHOT_COOKIE=" + token);
