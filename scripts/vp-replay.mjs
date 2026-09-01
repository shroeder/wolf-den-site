// Replays every real member-vs-member bout under candidate (SCALE, K). Each bout is PREDICTED from the
// ratings as they stood before it and only then applied, so every number here is out-of-sample.
//   log-loss  how surprised the ladder was by what happened — is it meaningful?
//   churn     mean |rank change| per bout among ranked players — does it swing?
import { db } from "@/lib/db.js";
const rows = await db.query(
  `SELECT challenger_id c, defender_id d, challenger_won w FROM mkt_arena_bout
    WHERE defender_id IS NOT NULL AND COALESCE(rung,0)=0 AND COALESCE(npc_tier,0)=0
    ORDER BY created_at ASC, id ASC`);
const SEED = 1200;
function run(SCALE, K) {
  const vp = new Map(); const get = (i) => (vp.has(i) ? vp.get(i) : SEED);
  let ll = 0, hits = 0, n = 0, churn = 0, cn = 0;
  const rankOf = () => { const a=[...vp.entries()].sort((x,y)=>y[1]-x[1]); const m=new Map(); a.forEach(([id],i)=>m.set(id,i)); return m; };
  for (let i = 0; i < rows.length; i++) {
    const b = rows[i]; const a = get(b.c), e = get(b.d);
    const exp = 1/(1+Math.pow(10,(e-a)/SCALE)); const won = b.w?1:0;
    const p = Math.min(1-1e-9, Math.max(1e-9, exp));
    ll += -(won*Math.log(p)+(1-won)*Math.log(1-p)); if ((p>=0.5)===(won===1)) hits++; n++;
    const before = vp.size > 8 ? rankOf() : null;
    let move = Math.max(1, Math.round(won ? K*(1-exp) : K*exp));
    move = Math.min(move, won ? get(b.d) : get(b.c));
    vp.set(b.c, Math.max(0, a + (won?move:-move))); vp.set(b.d, Math.max(0, e + (won?-move:move)));
    if (before) { const after = rankOf(); let s=0; for (const id of vp.keys()) s += Math.abs((after.get(id)??0)-(before.get(id)??0)); churn += s; cn++; }
  }
  return { ll: ll/n, acc: hits/n, churn: churn/cn, vp };
}
console.log("SCALE     K   log-loss  accuracy   churn (ranks moved per bout)");
for (const [S,K] of [[3000,300],[3000,32],[800,300],[800,64],[600,48],[500,40],[400,32],[400,24],[300,32],[250,24],[200,32]]) {
  const r = run(S,K);
  console.log(String(S).padStart(5), String(K).padStart(5), r.ll.toFixed(4).padStart(10), (r.acc*100).toFixed(1).padStart(8)+"%", r.churn.toFixed(2).padStart(12));
}

// ── THE BOARD, REPLAYED ──────────────────────────────────────────────────────────────────────────────────────
const names = new Map((await db.query(`SELECT id, display_name FROM mkt_buyer`)).map(r => [r.id, r.display_name]));
const wl = new Map();
for (const b of rows) {
  for (const [id, won] of [[b.c, b.w], [b.d, !b.w]]) {
    const x = wl.get(id) || { w: 0, g: 0 }; x.g++; if (won) x.w++; wl.set(id, x);
  }
}
const live = new Map((await db.query(`SELECT buyer_id, vp FROM mkt_arena`)).map(r => [r.buyer_id, Number(r.vp)]));
const r = run(400, 32);
const board = [...r.vp.entries()].map(([id, vp]) => ({
  name: names.get(id) || "?", vp: Math.round(vp), now: live.get(id) ?? 1200,
  g: wl.get(id)?.g || 0, pct: Math.round((wl.get(id)?.w || 0) / (wl.get(id)?.g || 1) * 100),
})).sort((a, b2) => b2.vp - a.vp);
const nowOrder = [...board].sort((a, b2) => b2.now - a.now);
console.log("\n=== THE BOARD IF IT HAD ALWAYS BEEN SCALE=400 K=32 (players only) ===");
console.log("     replayed          VP   win%  bouts   | today's board");
board.slice(0, 18).forEach((x, i) => {
  const t = nowOrder[i];
  console.log(String(i + 1).padStart(3), String(x.name).padEnd(18), String(x.vp).padStart(5),
    String(x.pct + "%").padStart(6), String(x.g).padStart(6), "  |", String(t.name).padEnd(18), String(t.now).padStart(5));
});
