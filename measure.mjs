import { SLOTS5, playSpin } from "@/lib/marketplace/casino-slot5.js";
const N = Number(process.argv[2] || 1500000);
const BET = 100;
for (const [id, m] of Object.entries(SLOTS5)) {
  let staked = 0, paid = 0, meter = [];
  for (let i = 0; i < N; i++) {
    const r = playSpin(m, { bet: BET, meter });
    meter = r.meter || [];
    staked += BET; paid += r.total || 0;
  }
  const rtp = paid/staked;
  console.log("M " + id.padEnd(7) + (m.label||"").padEnd(15) + (100*rtp).toFixed(2) + "%   off target by " + ((100*(rtp-0.95))).toFixed(2) + " pts");
}
