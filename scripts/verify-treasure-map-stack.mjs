// Does a Treasure Map BANK now? Sunflower Jinxx: "I used 3 yesterday... the one today did not [have him]."
//
// Runs against the live row for one member (default: the owner), and puts force_merchant / merchant_json back
// exactly as it found them. The thing being proved is arithmetic on one column, so there is nothing to mock.
import "./lib/register-loader.mjs";
import fs from "fs";

const env = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
process.env.DATABASE_URL ||= env.match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)[1];

const { db } = await import("../src/lib/db.js");
const sailing = await import("../src/lib/marketplace/sailing.js");
const { applyTreasureMap } = sailing;

const who = process.argv[2] || "The Wolf Den";
const b = await db.queryOne(`SELECT id, display_name FROM mkt_buyer WHERE display_name = $1`, [who]);
if (!b) { console.error("no such member:", who); process.exit(1); }

// ⚠️ EVERY COLUMN THIS SCRIPT WRITES IS READ HERE AND PUT BACK IN restore(). It drives a LIVE sailing row
// through four landings; a restore that covers less than it wrote leaves a member mid-voyage somewhere
// they never sailed to.
const before = await db.queryOne(`SELECT force_merchant, merchant_json, dig_state, departed_at, returns_at, encounter_paused_at, merchant_encounters FROM mkt_sailing WHERE buyer_id = $1`, [b.id]);
console.log(`${b.display_name}: force_merchant=${before?.force_merchant} merchant_json=${before?.merchant_json === null ? "NULL" : "set"} dig_state=${before?.dig_state ? "digging" : "none"}`);

const restore = async () => {
  await db.query(
    `UPDATE mkt_sailing SET force_merchant = $2, merchant_json = $3::jsonb, dig_state = $4::jsonb,
            departed_at = $5, returns_at = $6, encounter_paused_at = $7, merchant_encounters = $8
      WHERE buyer_id = $1`,
    [b.id, before?.force_merchant ?? 0,
     before?.merchant_json == null ? null : JSON.stringify(before.merchant_json),
     before?.dig_state == null ? null : JSON.stringify(before.dig_state),
     before?.departed_at ?? null, before?.returns_at ?? null, before?.encounter_paused_at ?? null,
     // ⚠️ AND THE ENCOUNTER COUNT. Every forced landing in here is a real merchant meeting, so four runs of
     // this script is four meetings towards the elephant pet that nobody sailed for.
     before?.merchant_encounters ?? 0]);
};

let fails = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fails++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${got}${ok ? "" : ` (expected ${want})`}`);
};

try {
  // ── 1. three maps bank as three ──────────────────────────────────────────────────────────────────────
  // AT SEA. The ashore path spends a map on the spot (that is applyTreasureMap's whole point), so banking is
  // only observable while the voyage is still running — which is also how Sunflower used hers.
  await db.query(`UPDATE mkt_sailing SET force_merchant = 0, merchant_json = NULL, dig_state = NULL,
                    departed_at = NOW() - interval '1 hour', returns_at = NOW() + interval '5 hours',
                    encounter_paused_at = NULL WHERE buyer_id = $1`, [b.id]);
  for (let i = 0; i < 3; i++) await applyTreasureMap(b.id).catch(() => {});
  let r = await db.queryOne(`SELECT force_merchant FROM mkt_sailing WHERE buyer_id = $1`, [b.id]);
  check("three maps bank while at sea", r.force_merchant, 3);

  // ── 2. the landing spends exactly ONE ────────────────────────────────────────────────────────────────
  await db.query(`UPDATE mkt_sailing SET merchant_json = NULL, returns_at = NOW() - interval '1 hour' WHERE buyer_id = $1`, [b.id]);
  await sailing.getSailingState(b.id).catch(() => {});   // the real path: rolls at the arrival interstitial
  r = await db.queryOne(`SELECT force_merchant, merchant_json FROM mkt_sailing WHERE buyer_id = $1`, [b.id]);
  check("landing spends one, not all three", r.force_merchant, 2);
  check("and the merchant is actually there", r.merchant_json && !r.merchant_json.none ? "yes" : "no", "yes");

  // ── 3. and the next landing spends the next ──────────────────────────────────────────────────────────
  // This is the bug: before mig460 the second and third landings met nobody.
  await db.query(`UPDATE mkt_sailing SET merchant_json = NULL WHERE buyer_id = $1`, [b.id]);
  await sailing.getSailingState(b.id).catch(() => {});
  r = await db.queryOne(`SELECT force_merchant, merchant_json FROM mkt_sailing WHERE buyer_id = $1`, [b.id]);
  check("second landing spends the second", r.force_merchant, 1);
  check("merchant on the second landing too", r.merchant_json && !r.merchant_json.none ? "yes" : "no", "yes");

  await db.query(`UPDATE mkt_sailing SET merchant_json = NULL WHERE buyer_id = $1`, [b.id]);
  await sailing.getSailingState(b.id).catch(() => {});
  r = await db.queryOne(`SELECT force_merchant, merchant_json FROM mkt_sailing WHERE buyer_id = $1`, [b.id]);
  check("third landing spends the third", r.force_merchant, 0);
  check("merchant on the third landing too", r.merchant_json && !r.merchant_json.none ? "yes" : "no", "yes");

  // ── 4. and a fourth landing is back to a dice roll, not a free merchant ──────────────────────────────
  // The bank is empty; the guarantee must be gone with it.
  await db.query(`UPDATE mkt_sailing SET merchant_json = NULL WHERE buyer_id = $1`, [b.id]);
  await sailing.getSailingState(b.id).catch(() => {});
  r = await db.queryOne(`SELECT force_merchant, merchant_json FROM mkt_sailing WHERE buyer_id = $1`, [b.id]);
  check("empty bank stays empty", r.force_merchant, 0);
  check("fourth landing rolled (merchant not forced)", r.merchant_json == null ? "unrolled" : "rolled", "rolled");

  // ── 5. Market Day cannot eat a banked map ────────────────────────────────────────────────────────────
  // rollMerchant is module-private and marketDay needs the power equipped, so this one is a SOURCE check on
  // the exact invariant that would silently steal maps: the restock must force the shelf by passing the
  // guarantee, never by writing the column a Treasure Map now lives in.
  const src = fs.readFileSync("src/lib/marketplace/sailing.js", "utf8");
  const md = src.slice(src.indexOf("export async function marketDay"), src.indexOf("export async function marketDay") + 1600);
  check("Market Day does not write force_merchant", /force_merchant\s*=/.test(md) ? "writes it" : "no", "no");
  check("Market Day passes the free guarantee", /rollMerchant\(buyerId, 0, \{ guarantee: true \}\)/.test(md) ? "yes" : "no", "yes");

  // ── 5. the shelf pill reports the bank ───────────────────────────────────────────────────────────────
  await db.query(`UPDATE mkt_sailing SET force_merchant = 3 WHERE buyer_id = $1`, [b.id]);
  const { consumablesFor } = await import("../src/lib/marketplace/consumables.js");
  const shelf = await consumablesFor(b.id, "sail").catch((e) => { console.log("  shelf read failed:", e.message); return null; });
  const pill = (shelf?.active || []).find((a) => a.kind === "sail_merchant");
  check("shelf pill says the count", pill?.label, "3 merchant marks banked");
} finally {
  await restore();
  const after = await db.queryOne(`SELECT force_merchant, merchant_json FROM mkt_sailing WHERE buyer_id = $1`, [b.id]);
  console.log(`restored: force_merchant=${after.force_merchant} merchant_json=${after.merchant_json === null ? "NULL" : "set"}`);
}
process.exit(fails ? 1 : 0);
