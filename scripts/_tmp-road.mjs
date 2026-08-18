import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`SELECT id, kind, created_at, telemetry FROM mkt_arena_bout
  WHERE kind = 'ladder' AND telemetry IS NOT NULL ORDER BY created_at DESC LIMIT 5`;
for (const r of rows) {
  const t = r.telemetry || {};
  console.log(`\n=== bout ${r.id}  ${new Date(r.created_at).toISOString().slice(5,16)}  rung=${t.rung ?? t.tier ?? "?"}`);
  console.log("  rounds:", t.rounds, "| winner:", t.win === true ? "player" : t.win === false ? "foe" : t.winner);
  const keys = Object.keys(t);
  console.log("  keys:", keys.join(", ").slice(0, 300));
  for (const side of ["me", "you", "foe", "them", "a", "b"]) if (t[side]) console.log(`  ${side}:`, JSON.stringify(t[side]).slice(0, 400));
}
