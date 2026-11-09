import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { WebSocketServer } from "ws";

import {
    EVENT, FLAG, HISTORY_TICKS, MSG, PLAYER, TICK_MS,
} from "./sim/protocol.js";
import {
    applyToBaseline, decodeInput, encodeEvent, encodeSnapshot,
} from "./sim/codec.js";
import {
    beginSwing, canSwing, makePlayer, makeRng, makeWorld,
    resolveSwing, snapshotWorld, stepEnemy, stepPlayer,
} from "./sim/world.js";

// ─────────────────────────────────────────────────────────────────────────
// THE AUTHORITATIVE SERVER
//
// The milestone this exists to prove, from the decision record: "One zone,
// two browsers, one enemy, authoritative HP, with prediction and
// interpolation. If both windows show the same damage numbers on the same
// enemy at the same moment, and your own swings feel instant, every
// remaining question is content and tuning."
//
// ⚠️ THE TICK LOOP NEVER AWAITS. 66 ms per tick at 15 Hz; one query per
//    player per tick at 100 players blows the entire budget even at 1 ms
//    each. There is no database in this file at all yet, and when there is,
//    it will be load-on-join and write-behind -- never inside step().
//
// ⚠️ DAMAGE IS COMPUTED ONCE, HERE, AND BROADCAST AS A RESULT. Never
//    computed on a client. The client plays its swing animation
//    immediately, which is what makes it feel instant; the authoritative
//    answer lands during the windup. That is the whole trick and it is not
//    the same thing as predicting the consequence.
//
// ⚠️ AND IT RUNS ON AN ACCUMULATOR, NOT setInterval(step, 66). setInterval
//    drifts and coalesces under load, and a sim whose step size wanders is
//    a sim whose clients diverge.
// ─────────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT || 8080);
// Long enough that a 5-second test never sees a respawn mid-run.
const RESPAWN_MS = 8000;
// ⚠️ fileURLToPath, NOT new URL(...).pathname. A URL pathname is
// percent-encoded, and this repo lives in "wolf den site" -- the space
// comes back as %20 and every static file 404s while the socket, the tick
// and the health endpoint all work perfectly. It reads as a routing bug.
const ROOT = path.dirname(fileURLToPath(import.meta.url));

const world = makeWorld();
const rng = makeRng(0xBEEF);
const history = [];          // ring of past worlds, newest last
const clients = new Map();   // ws -> client record
let nextPlayerId = 1;

// ── HTTP: health, and the two-browser test page ──────────────────────────
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

const http = createServer(async (req, res) => {
    const url = (req.url || "/").split("?")[0];
    if (url === "/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({
            ok: true,
            tick: world.tick,
            players: world.players.size,
            clients: clients.size,
            region: process.env.FLY_REGION || "local",
            machine: process.env.FLY_MACHINE_ID || "local",
        }));
        return;
    }
    // The client is served by the game server itself so that opening two
    // windows is one URL and no second process.
    const file = url === "/" ? "/client/index.html" : url;
    // ⚠️ THE ALLOW-LIST IS CHECKED ON THE URL, THE PATH IS BUILT AFTERWARDS.
    // path.normalize returns BACKSLASHES on Windows, so a check for
    // startsWith("/client") against a normalized path is always false and
    // every static file 404s -- while /health and the socket work, which is
    // what makes it read as a routing bug rather than a separator bug.
    // Decide on the URL, which has one separator everywhere, then resolve
    // and re-check that the result is still inside ROOT.
    if (!/^\/(client|sim)\/[\w.\/-]+$/.test(file) || file.includes("..")) {
        res.writeHead(404).end();
        return;
    }
    const full = path.resolve(ROOT, "." + file);
    if (!full.startsWith(ROOT)) { res.writeHead(404).end(); return; }
    try {
        const body = await readFile(full);
        res.writeHead(200, { "content-type": MIME[path.extname(full)] || "application/octet-stream" });
        res.end(body);
    } catch {
        res.writeHead(404).end();
    }
});

const wss = new WebSocketServer({ server: http, path: "/ws" });

wss.on("connection", (ws) => {
    const id = nextPlayerId++;
    // Spawn them apart so two windows are visibly two players.
    const player = makePlayer(id, 180 + (id % 4) * 70);
    world.players.set(id, player);

    const client = {
        id,
        ws,
        // ⚠️ PER-CLIENT BASELINE, advanced only on ack. See codec.js.
        baseline: new Map(),
        pendingAcks: new Map(),   // tick -> entities snapshotted at that tick
        lastAckTick: 0,
        lastSeq: 0,
        inputQueue: [],
        rttMs: 0,
        lastPingAt: 0,
    };
    clients.set(ws, client);

    ws.binaryType = "nodebuffer";
    ws.send(JSON.stringify({
        type: "welcome",
        playerId: id,
        tickHz: 1000 / TICK_MS,
        player: { speed: PLAYER.speed, reach: PLAYER.reach, maxHp: PLAYER.maxHp },
        enemies: [...world.enemies.values()].map((e) => ({ id: e.id, maxHp: e.maxHp })),
    }));
    console.log(JSON.stringify({ event: "join", id, players: world.players.size }));

    ws.on("message", (data, isBinary) => {
        if (!isBinary) {
            // JSON path is for the latency probe only; everything that runs
            // every tick is binary.
            try {
                const msg = JSON.parse(String(data));
                if (msg.type === "pong" && client.lastPingAt) {
                    client.rttMs = Date.now() - client.lastPingAt;
                }
            } catch { /* ignore */ }
            return;
        }
        const bytes = new Uint8Array(data);
        if (bytes[0] !== MSG.INPUT) return;
        const input = decodeInput(bytes);

        // ⚠️ OLD OR REPLAYED INPUT IS DROPPED, NOT APPLIED. Sequence numbers
        //    are what make an unreliable, reorderable channel safe: without
        //    this check a duplicated packet moves a player twice.
        if (input.seq <= client.lastSeq) return;
        client.lastSeq = input.seq;

        // ⚠️ AND dt IS CLAMPED BY THE SERVER. The client states how long its
        //    frame was, and a client that claims 5000 ms teleports across
        //    the map. Trust the ORDER a client sends, never the magnitude.
        input.dtMs = Math.min(input.dtMs, TICK_MS * 3);
        client.inputQueue.push(input);
        if (input.ackTick > client.lastAckTick) {
            const acked = client.pendingAcks.get(input.ackTick);
            if (acked) applyToBaseline(client.baseline, acked.entities, acked.removed);
            client.lastAckTick = input.ackTick;
            for (const t of client.pendingAcks.keys()) {
                if (t <= input.ackTick) client.pendingAcks.delete(t);
            }
        }
    });

    ws.on("close", () => {
        clients.delete(ws);
        world.players.delete(id);
        console.log(JSON.stringify({ event: "leave", id, players: world.players.size }));
    });
    ws.on("error", () => { clients.delete(ws); world.players.delete(id); });
});

// ── REWIND ───────────────────────────────────────────────────────────────
/**
 * The world as this client saw it when they pressed the button.
 *
 * ⚠️ HALF THE ROUND TRIP, NOT THE WHOLE ONE. What the player saw was the
 *    last snapshot that reached them, which left here rtt/2 ago. Rewinding
 *    a full rtt over-corrects and starts crediting hits on an enemy that
 *    had already moved on screen.
 */
function worldAsSeenBy(client) {
    const lagMs = Math.min(client.rttMs / 2, HISTORY_TICKS * TICK_MS);
    const targetMs = world.simMs - lagMs;
    let best = history.length ? history[0] : world;
    for (const past of history) {
        if (past.simMs <= targetMs) best = past; else break;
    }
    return best;
}

// ── THE LOOP ─────────────────────────────────────────────────────────────
function step() {
    world.tick += 1;
    world.simMs += TICK_MS;
    const events = [];

    // 1. Player input. Every queued input for this tick is applied in
    //    sequence order, which is how a client that sent three frames in
    //    one tick keeps all three.
    for (const client of clients.values()) {
        const player = world.players.get(client.id);
        if (!player) continue;
        const queue = client.inputQueue;
        client.inputQueue = [];
        for (const input of queue) {
            stepPlayer(player, {
                left: Boolean(input.buttons & 1),
                right: Boolean(input.buttons & 2),
            }, input.dtMs);
            player.lastSeq = input.seq;

            if ((input.buttons & 4) && canSwing(player, world.simMs)) {
                beginSwing(player, world.simMs);
                // Resolve against the REWOUND world, not the current one.
                const past = worldAsSeenBy(client);
                for (const [, enemy] of past.enemies) {
                    const live = world.enemies.get(enemy.id);
                    if (!live || live.hp <= 0) continue;
                    const hit = resolveSwing(player, enemy, rng);
                    if (!hit) continue;
                    // The damage ACTUALLY APPLIED, not the damage rolled.
                    //
                    // ⚠️ OVERKILL MUST NOT BE BROADCAST AS A NUMBER. A
                    //    50-point crit on an enemy with 25 hp removes 25 --
                    //    and the first version still told every client
                    //    "-50". The milestone's own arithmetic check caught
                    //    it: events summed to 100 against 25 hp lost. It is
                    //    a small lie and it is the exact class the decision
                    //    record exists to prevent, because the number on
                    //    screen is the one thing a player can audit.
                    const applied = Math.min(hit.damage, live.hp);
                    live.hp -= applied;
                    events.push({
                        event: EVENT.HIT, actorId: player.id,
                        targetId: live.id, amount: applied, crit: hit.crit,
                    });
                    if (live.hp === 0) {
                        events.push({
                            event: EVENT.DEATH, actorId: player.id,
                            targetId: live.id, amount: 0, crit: false,
                        });
                    }
                    break;
                }
            }
        }
    }

    // 2. The world's own motion, and respawn.
    //
    // ⚠️ A DEAD ENEMY THAT NEVER RETURNS MAKES THE WHOLE PAGE UNTESTABLE.
    //    The first screenshot of the client showed hp 0 and nothing to do:
    //    one bot had killed it minutes earlier and the zone was permanently
    //    empty. Respawn is not content here, it is what makes the milestone
    //    re-runnable without restarting the server.
    for (const [, enemy] of world.enemies) {
        if (enemy.hp > 0) { stepEnemy(enemy, TICK_MS); continue; }
        if (!enemy.deadAtMs) { enemy.deadAtMs = world.simMs; continue; }
        if (world.simMs - enemy.deadAtMs >= RESPAWN_MS) {
            enemy.hp = enemy.maxHp;
            enemy.x = 312;
            enemy.drift = 1;
            enemy.deadAtMs = 0;
        }
    }

    // 3. History, for the next rewind.
    history.push(snapshotWorld(world));
    while (history.length > HISTORY_TICKS) history.shift();

    // 4. Broadcast. Events first -- a damage number must not arrive after
    //    the hp that it explains.
    const entities = [];
    for (const [, p] of world.players) {
        entities.push({
            id: p.id, x: p.x, y: p.y, hp: p.hp,
            flags: (world.simMs < p.swingUntilMs ? FLAG.SWINGING : 0)
                | (p.facingLeft ? FLAG.FACING_LEFT : 0)
                | (p.hp <= 0 ? FLAG.DEAD : 0),
        });
    }
    for (const [, e] of world.enemies) {
        entities.push({
            id: e.id, x: e.x, y: e.y, hp: e.hp,
            flags: FLAG.IS_ENEMY | (e.facingLeft ? FLAG.FACING_LEFT : 0)
                | (e.hp <= 0 ? FLAG.DEAD : 0),
        });
    }

    for (const client of clients.values()) {
        if (client.ws.readyState !== client.ws.OPEN) continue;
        for (const ev of events) client.ws.send(encodeEvent(ev));
        const frame = encodeSnapshot({
            tick: world.tick,
            lastSeq: client.lastSeq,
            entities,
            baseline: client.baseline,
        });
        client.pendingAcks.set(world.tick, { entities: entities.map((e) => ({ ...e })), removed: [] });
        // Bound the memory a silent client can cost us.
        if (client.pendingAcks.size > HISTORY_TICKS * 4) {
            const oldest = Math.min(...client.pendingAcks.keys());
            client.pendingAcks.delete(oldest);
        }
        client.ws.send(frame);
    }
}

let last = Date.now();
let acc = 0;
setInterval(() => {
    const now = Date.now();
    acc += now - last;
    last = now;
    let guard = 0;
    while (acc >= TICK_MS && guard < 5) { acc -= TICK_MS; guard += 1; step(); }
    if (acc > TICK_MS * 5) acc = 0;   // a long stall is dropped, never caught up
}, 4);

// Latency probe, once a second. The rewind depth depends on it, so it is
// measured rather than assumed.
setInterval(() => {
    for (const client of clients.values()) {
        if (client.ws.readyState !== client.ws.OPEN) continue;
        client.lastPingAt = Date.now();
        client.ws.send(JSON.stringify({ type: "ping" }));
    }
}, 1000);

http.listen(PORT, "0.0.0.0", () => {
    console.log(JSON.stringify({
        event: "listening", port: PORT, hz: 1000 / TICK_MS,
        region: process.env.FLY_REGION || "local",
    }));
});

for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
        for (const [ws] of clients) ws.close(1001, "shutting down");
        http.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 1500);
    });
}
