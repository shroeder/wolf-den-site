import { SLOTS5, playSpin } from "@/lib/marketplace/casino-slot5.js";
const N = Number(process.argv[2] || 6000000);
const only = (process.argv[3] || "").split(",").filter(Boolean);
const BET = 100;
for (const [id, m] of Object.entries(SLOTS5)) {
  if (only.length && !only.includes(id)) continue;
  let staked = 0, paid = 0, meter = [];
  for (let i = 0; i < N; i++) {
    const r = playSpin(m, { bet: BET, meter });
    meter = r.meter || [];
    staked += BET; paid += r.total || 0;
  }
  const rtp = paid/staked;
  console.log("M " + id.padEnd(7) + (m.label||"").padEnd(15) + (100*rtp).toFixed(2) + "%  next factor x" + (0.95/rtp).toFixed(4));
}
