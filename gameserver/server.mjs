import { createServer } from "node:http";

import { WebSocketServer } from "ws";

// ─────────────────────────────────────────────────────────────────────────
// THE PIPE TEST — NOT THE NETCODE.
//
// This exists to prove one thing before a single line of the real server is
// written: that a browser on the public internet can hold a WebSocket open
// to a Fly machine at rt.wolfdengamingmn.com, over TLS, and receive a
// steady tick.
//
// ⚠️ PROVE THE TRANSPORT BEFORE BUILDING ON IT. The decision record's own
//    milestone is "two browsers, one enemy, authoritative HP" -- but every
//    part of that assumes a socket that stays up. Finding out that the
//    CNAME, the TLS cert, the health check or the proxy's idle timeout is
//    wrong AFTER the codec exists means debugging two things at once.
//
// What it does: a fixed 15 Hz loop (the rate the doc assumes), a monotonic
// tick counter pushed to every connected client, and an echo of whatever
// you send. If the counter advances smoothly in two browsers at once, the
// transport is sound and everything above it is our problem, not Fly's.
//
// It holds no state worth keeping and no identity. The Ed25519 ticket, the
// binary codec and the sim all come later and none of them live here.
// ─────────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT || 8080);
const HZ = 15;
const STEP_MS = 1000 / HZ;

const started = Date.now();
let tick = 0;
const clients = new Set();

// ⚠️ FLY HEALTH-CHECKS OVER PLAIN HTTP ON THE SAME PORT. The machine is
// marked unhealthy and restarted if this does not answer, so the HTTP
// server is not optional scaffolding -- the WebSocket server is attached to
// it rather than listening on its own.
const http = createServer((req, res) => {
    if (req.url === "/health" || req.url === "/") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({
            ok: true,
            tick,
            clients: clients.size,
            uptimeSeconds: Math.round((Date.now() - started) / 1000),
            region: process.env.FLY_REGION || "local",
            machine: process.env.FLY_MACHINE_ID || "local",
        }));
        return;
    }
    res.writeHead(404).end();
});

const wss = new WebSocketServer({ server: http, path: "/ws" });

wss.on("connection", (ws, req) => {
    clients.add(ws);
    ws.isAlive = true;
    ws.on("pong", () => { ws.isAlive = true; });
    console.log(JSON.stringify({
        event: "connect", clients: clients.size,
        ip: req.socket.remoteAddress,
    }));

    ws.send(JSON.stringify({
        type: "hello",
        hz: HZ,
        region: process.env.FLY_REGION || "local",
        machine: process.env.FLY_MACHINE_ID || "local",
    }));

    ws.on("message", (data) => {
        ws.send(JSON.stringify({ type: "echo", tick, at: Date.now(), was: String(data).slice(0, 200) }));
    });
    ws.on("close", () => {
        clients.delete(ws);
        console.log(JSON.stringify({ event: "close", clients: clients.size }));
    });
    ws.on("error", () => clients.delete(ws));
});

// ⚠️ PING EVERY CLIENT, OR FLY'S PROXY CLOSES AN IDLE SOCKET. A connection
// with no traffic is dropped by intermediaries (proxies, phone carriers,
// home routers) somewhere around a minute. The 15 Hz tick below is enough
// traffic on its own, but the ping is what detects a HALF-OPEN socket --
// one the far end has forgotten about and will never close.
setInterval(() => {
    for (const ws of clients) {
        if (!ws.isAlive) { ws.terminate(); clients.delete(ws); continue; }
        ws.isAlive = false;
        ws.ping();
    }
}, 30000);

// ── THE LOOP ─────────────────────────────────────────────────────────────
// An accumulator, not setInterval(step, 66): setInterval drifts and skips,
// and a sim whose step size wanders is a sim whose clients diverge. This is
// the shape the real tick loop takes, at the size it is useful to prove.
let last = Date.now();
let acc = 0;
setInterval(() => {
    const now = Date.now();
    acc += now - last;
    last = now;
    while (acc >= STEP_MS) {
        acc -= STEP_MS;
        tick += 1;
        if (clients.size) {
            const frame = JSON.stringify({ type: "tick", n: tick, t: now });
            for (const ws of clients) {
                if (ws.readyState === ws.OPEN) ws.send(frame);
            }
        }
    }
}, 8);

http.listen(PORT, "0.0.0.0", () => {
    console.log(JSON.stringify({
        event: "listening", port: PORT, hz: HZ,
        region: process.env.FLY_REGION || "local",
    }));
});

for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
        for (const ws of clients) ws.close(1001, "server shutting down");
        http.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 2000);
    });
}
