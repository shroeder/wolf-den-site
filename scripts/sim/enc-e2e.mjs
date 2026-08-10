// END TO END against the REAL server code and the REAL row: force a due encounter on the owner's own sailing
// row, let resolveDueEncounter open it, fight it to a finish, and check the voyage clock was made whole.
const { db } = await import("@/lib/db");
const S = await import("@/lib/marketplace/sailing.js");
const ID = "6857d67e-3dd0-46b6-aad7-b91699155ff6";

const snap = async () => db.queryOne(
  `SELECT departed_at, returns_at, encounter_marks, encounter_paused_at, encounter_active,
          encounters_fought, encounters_won, encounters_beaten, doubloons, battle_state IS NOT NULL AS has_battle
     FROM mkt_sailing WHERE buyer_id = $1`, [ID]);

const before = await snap();
console.log("BEFORE:", JSON.stringify({ ...before, encounters_beaten: (before.encounters_beaten||[]).length }));

// Put a voyage on the water with a mark that is already due.
await db.query(
  `UPDATE mkt_sailing SET departed_at = NOW() - interval '10 minutes', returns_at = NOW() + interval '50 minutes',
       voyage_ms = 3600000, dig_state = NULL, battle_state = NULL,
       encounter_paused_at = NULL, encounter_active = NULL,
       encounter_marks = $2::jsonb WHERE buyer_id = $1`,
  [ID, JSON.stringify([{ at: new Date(Date.now() - 60000).toISOString(), enc: "tidewatch", done: false }])]);
const returnsWas = (await snap()).returns_at;

const st1 = await S.getSailingState(ID);
console.log("\nafter one state read:");
console.log("  status:", st1.status, "| progress:", st1.progress?.toFixed?.(3));
console.log("  encounter:", st1.encounter ? `${st1.encounter.name} (${st1.encounter.kind}) t${st1.encounter.tier}` : "none");
console.log("  loot shown:", JSON.stringify((st1.encounter?.loot||[]).map(l => `${l.n}x ${l.name||l.id}`)));
console.log("  battle open:", Boolean(st1.encounter?.battle), "| foe zones:", JSON.stringify(st1.encounter?.battle?.zones?.foe));
const paused = (await snap()).encounter_paused_at;
console.log("  clock stopped:", Boolean(paused));

// Progress must not move while stopped.
await new Promise(r => setTimeout(r, 2500));
const st2 = await S.getSailingState(ID);
console.log("  progress 2.5s later:", st2.progress?.toFixed?.(3), st1.progress === st2.progress ? "(frozen ✓)" : "(MOVED ✗)");

// Fight it out.
let round = 0, out = null;
while (round++ < 40) {
  const d = await S.shipBattleVolley(ID, [{ gun: 0, zone: "sails" }, { gun: 1, zone: "guns" }, { gun: 2, zone: "hull" }]);
  if (!d.ok) { console.log("  volley refused:", d.error); break; }
  if (d.battle?.over || d.over) { out = d; break; }
}
console.log("\nfight finished in", round, "rounds | win:", out?.win ?? out?.battle?.win);
console.log("  spoils:", JSON.stringify(out?.reward || out?.battle?.reward || []));

const after = await snap();
const pushedMs = new Date(after.returns_at) - new Date(returnsWas);
console.log("\nAFTER:");
console.log("  returns_at pushed by:", Math.round(pushedMs / 1000), "s (should be ~the time the fight took)");
console.log("  paused cleared:", after.encounter_paused_at === null, "| active cleared:", after.encounter_active === null);
console.log("  mark done:", JSON.stringify(after.encounter_marks));
console.log("  fought:", after.encounters_fought, "won:", after.encounters_won, "beaten:", JSON.stringify(after.encounters_beaten));
console.log("  doubloons:", before.doubloons, "→", after.doubloons);

// Put the row back the way it was found.
await db.query(
  `UPDATE mkt_sailing SET departed_at = $2, returns_at = $3, encounter_marks = $4::jsonb,
       encounter_paused_at = NULL, encounter_active = NULL, battle_state = NULL
     WHERE buyer_id = $1`,
  [ID, before.departed_at, before.returns_at, JSON.stringify(before.encounter_marks ?? [])]);
console.log("\nrow restored.");
