// ─────────────────────────────────────────────────────────────────────────
// A BOT PLAYER — a second client, held open, that chases the enemy and
// swings. Two uses:
//   - open the page at /, run this, and the browser has someone to share a
//     world with when nobody else is around
//   - soak: leave several running and watch bytes/s and the tick hold
//
//     node gameserver/test/bot.mjs
// ─────────────────────────────────────────────────────────────────────────
import { WebSocket } from "ws";
import { createClient } from "../client/net.js";
const now = () => Date.now();
const ws = new WebSocket(process.env.RT_URL || "ws://127.0.0.1:8090/ws");
ws.binaryType = "arraybuffer";
const c = createClient({ send: (d) => ws.send(d), now });
ws.on("message", (d, b) => c.onMessage(d, b));
let last = now(), frames = 0;
setInterval(() => {
  if (!c.state.connected) return;
  const t = now(); frames++;
  const enemy = c.renderPosition(47), me = c.renderPosition(c.state.playerId);
  const dx = enemy && me ? enemy.x - me.x : 0;
  const inRange = Math.abs(dx) < 54;
  c.sendInput({ left: !inRange && dx < 0, right: !inRange && dx > 0,
                attack: inRange && frames % 14 === 0, dtMs: t - last });
  last = t;
}, 16);
