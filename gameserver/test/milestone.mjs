import { WebSocket } from "ws";

import { loadLocalEnv } from "./_env.mjs";

loadLocalEnv();

import { EVENT, FLAG, TICK_MS } from "../sim/protocol.js";
import { createClient } from "../client/net.js";
import { devTicket } from "./_ticket.mjs";

// ─────────────────────────────────────────────────────────────────────────
// THE MILESTONE, AS ASSERTIONS
//
//     node gameserver/test/milestone.mjs        (server must be running)
//
// The decision record states the test in human terms: "If both windows show
// the same damage numbers on the same enemy at the same moment, and your own
// swings feel instant, every remaining question is content and tuning."
//
// ⚠️ "BOTH WINDOWS SHOW THE SAME NUMBER" IS CHECKABLE. "FEELS INSTANT" IS
//    NOT -- so it is converted into the thing that actually causes it: a
//    prediction that the server does not contradict. If reconciliation
//    never has to move you, your own movement never rubber-bands, and that
//    IS the feeling. A number for it beats my opinion of a video.
//
// Five assertions, and the defect each one would catch:
//
//   AGREEMENT   two clients disagree on enemy hp  -> damage computed twice
//   EVENTS      the hit numbers differ per client -> not broadcast as result
//   PREDICTION  large corrections                 -> sim drift, or dt abuse
//   INTERPOLATION a remote player teleports       -> drawing latest, not past
//   DELTA       bytes/snapshot ~ full state       -> baseline never advancing
// ─────────────────────────────────────────────────────────────────────────

const URL = process.env.RT_URL || "ws://127.0.0.1:8090/ws";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now();

function connect(name) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(URL);
        ws.binaryType = "arraybuffer";
        const client = createClient({ send: (d) => ws.send(d), now });
        client.name = name;
        ws.on("message", (data, isBinary) => client.onMessage(data, isBinary));
        ws.on("open", () => {
            ws.send(JSON.stringify({ type: "ticket", ticket: devTicket("test-" + name) }));
            const t = setInterval(() => {
                if (client.state.connected) { clearInterval(t); resolve({ ws, client }); }
            }, 10);
            setTimeout(() => { clearInterval(t); reject(new Error("no welcome")); }, 4000);
        });
        ws.on("error", reject);
    });
}

const results = [];
const check = (name, pass, detail) => {
    results.push({ name, pass, detail });
    console.log(`  ${pass ? "ok  " : "FAIL"}  ${name.padEnd(34)} ${detail}`);
};

const a = await connect("A");
const b = await connect("B");
console.log(`\nconnected: A=player ${a.client.state.playerId}  B=player ${b.client.state.playerId}\n`);

// ⚠️ THE NEAREST ENEMY, NOT A HARDCODED ONE. Pinning the test to id 47
//    meant A happened to spawn 32 m from it and spent the entire six second
//    run jogging -- zero swings, four failures, and nothing wrong with the
//    server. A player walks to the closest thing they can see, so the test
//    does too, and it keeps working when the spawn ring is rearranged.
function nearestEnemy(c) {
    const me = c.renderPosition(c.state.playerId);
    let best = null;
    let bestD = Infinity;
    for (const [id, ent] of c.state.authoritative) {
        if (!(ent.flags & FLAG.IS_ENEMY) || ent.hp <= 0) continue;
        const d = Math.hypot(ent.x - me.x, ent.y - me.y);
        if (d < bestD) { bestD = d; best = id; }
    }
    return best;
}

// Let both settle and gather a baseline of snapshots.
await sleep(600);

// ⚠️ THE ENEMY'S STARTING HP IS READ, NOT ASSUMED TO BE 400 -- AND THE RUN
//    WAITS FOR IT TO BE ALIVE. The server respawns on an 8 second timer, so
//    a run that starts inside that window baselines at hp 0, cannot damage
//    anything, and reports four failures that are entirely the clock. The
//    test must not depend on when it happened to be launched.
let ENEMY_ID = nearestEnemy(a.client);
let START_HP = ENEMY_ID ? a.client.state.hp.get(ENEMY_ID) : undefined;
{
    const waitUntil = now() + 12000;
    while ((START_HP === undefined || START_HP <= 0) && now() < waitUntil) {
        await sleep(200);
        ENEMY_ID = nearestEnemy(a.client) || ENEMY_ID;
        START_HP = ENEMY_ID ? a.client.state.hp.get(ENEMY_ID) : undefined;
    }
}
if (!START_HP) {
    console.log("CANNOT RUN - no living enemy after 12s. Is the server up?");
    process.exit(1);
}
console.log("enemy " + ENEMY_ID + " alive at " + START_HP + " hp");

// ── DRIVE ────────────────────────────────────────────────────────────────
// A walks right and swings on a fixed cadence; B walks left. Inputs go at
// ~60 Hz, which is the realistic case: four inputs per server tick.
//
// ⚠️ THE INTERPOLATION SAMPLES ARE TAKEN *DURING* THE MOTION, NOT AFTER IT.
//    The first version of this file sampled once the drive loop had ended,
//    when B was standing still -- so the worst frame-to-frame jump was
//    0.00 units and the assertion passed against a stationary dot. It would
//    have passed with interpolation deleted. A smoothness check that never
//    observes movement is not a check, which is why `observedTravel` below
//    is asserted before the smoothness number is trusted at all.
const FRAME = 16;
const DURATION = 9000;
const REACH = a.client.state.welcome.player.reach;
const SPEED = a.client.state.welcome.player.speed;
const start = now();
let lastA = now();
let lastB = now();
let swings = 0;
let frames = 0;
const samples = [];

// A drives at the enemy and swings; B circles so there is motion to watch.
while (now() - start < DURATION) {
    const t = now();
    frames += 1;

    const enemy = a.client.renderPosition(ENEMY_ID);
    const me = a.client.renderPosition(a.client.state.playerId);
    const dx = enemy && me ? enemy.x - me.x : 0;
    const dy = enemy && me ? enemy.y - me.y : 0;
    const dist = Math.hypot(dx, dy);
    const inRange = dist < REACH * 0.7;
    const attack = inRange && (t - start) > 300 && frames % 10 === 0;
    if (attack) swings += 1;
    a.client.sendInput({
        left: !inRange && dx < -0.3, right: !inRange && dx > 0.3,
        forward: !inRange && dy < -0.3, back: !inRange && dy > 0.3,
        attack, dtMs: t - lastA,
    });
    lastA = t;

    // ⚠️ B WALKS A SQUARE, NOT A STRAIGHT LINE. One direction for six
    //    seconds crosses most of the world and ends against a wall, where
    //    the smoothness probe watches a stationary dot and passes with
    //    interpolation deleted. A circuit keeps it moving the whole run.
    const leg = Math.floor((t - start) / 900) % 4;
    b.client.sendInput({
        left: leg === 0, back: leg === 1, right: leg === 2, forward: leg === 3,
        attack: false, dtMs: t - lastB,
    });
    lastB = t;

    const seen = a.client.renderPosition(b.client.state.playerId);
    if (seen) samples.push({ x: seen.x, y: seen.y, t });
    await sleep(FRAME);
}
await sleep(400);

// ── 1. AGREEMENT ─────────────────────────────────────────────────────────

const hpA = a.client.state.hp.get(ENEMY_ID);
const hpB = b.client.state.hp.get(ENEMY_ID);
// ⚠️ DAMAGE IS ASSERTED BEFORE AGREEMENT, and agreement is conditioned on
// it. Two clients that both show 400 because nothing ever hit agree
// perfectly and prove nothing -- that is exactly what the first run of this
// file reported as a pass.
check("the enemy actually took damage", hpA !== undefined && hpA < START_HP,
    `${START_HP} -> ${hpA} over ${swings} swing inputs`);

check("both clients agree on enemy hp", hpA === hpB && hpA !== undefined && hpA < START_HP,
    `A=${hpA} B=${hpB}`);

// ── 2. EVENTS ────────────────────────────────────────────────────────────
const hitsA = a.client.state.events.filter((e) => e.event === EVENT.HIT);
const hitsB = b.client.state.events.filter((e) => e.event === EVENT.HIT);
const sameCount = hitsA.length === hitsB.length;
const sameNumbers = sameCount && hitsA.every((h, i) =>
    h.amount === hitsB[i].amount && h.targetId === hitsB[i].targetId
    && h.actorId === hitsB[i].actorId && h.crit === hitsB[i].crit);
check("both clients got identical hit events", hitsA.length > 0 && sameCount && sameNumbers,
    `${hitsA.length} hits, amounts ${[...new Set(hitsA.map((h) => h.amount))].join("/") || "-"}`);

// The sum of the damage numbers must equal the hp that actually left the
// enemy -- otherwise a client could be shown numbers that do not add up.
//
// ⚠️ ONLY HITS ON THIS ENEMY. Goblins hit back now, so the event stream
//    carries their damage on the PLAYER too, and summing everything made
//    141 points of damage out of a 120 hp enemy. The assertion was wrong,
//    not the server -- which the amounts said plainly: 25 is a swing, 20 is
//    a swing clamped to the last of the hp, and 7 is a goblin.
const dealt = hitsA.filter((h) => h.targetId === ENEMY_ID).reduce((n, h) => n + h.amount, 0);
check("hit numbers account for the hp lost", hitsA.length > 0 && START_HP - hpA === dealt,
    `${START_HP}-${hpA}=${START_HP - hpA} vs events sum ${dealt}`);

// ── 3. PREDICTION ────────────────────────────────────────────────────────
// A correction is reconciliation disagreeing with what we predicted. On a
// loopback with no loss it should essentially never have to move us.
const corr = a.client.state.maxCorrection;
check("prediction is not contradicted", corr < 2.0,
    `${a.client.state.corrections} corrections, worst ${corr.toFixed(2)} units`);

// ── 4. INTERPOLATION ─────────────────────────────────────────────────────
// Where A drew B, sampled every frame while B was actually walking.
let observedTravel = 0;
for (let i = 1; i < samples.length; i += 1) {
    observedTravel += Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y);
}
check("the smoothness probe saw real motion", observedTravel > 8,
    `B travelled ${observedTravel.toFixed(1)} m across ${samples.length} samples`);

// ⚠️ NORMALISED BY ELAPSED TIME, NOT AN ABSOLUTE UNIT THRESHOLD. The first
//    version failed on an 8.8-unit frame-to-frame jump against a limit of
//    8 -- but the harness's own frame was 40 ms that iteration, and 40 ms
//    at 220 units/second IS 8.8 units. It was measuring the test's
//    scheduling jitter and calling it a teleport. What a teleport actually
//    looks like is travel with no time passing, so the quantity that means
//    something is units per millisecond against the known speed.
let worstRate = 0;
let moved = 0;
for (let i = 1; i < samples.length; i += 1) {
    const dxs = Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y);
    const dt = Math.max(1, samples[i].t - samples[i - 1].t);
    if (dxs > 0.01) moved += 1;
    worstRate = Math.max(worstRate, dxs / dt);
}
const limit = (SPEED / 1000) * 2.2;   // 60% headroom over the sim's own top speed
check("remote motion is smooth, not stepped", worstRate < limit && observedTravel > 8,
    `worst ${worstRate.toFixed(3)} u/ms vs limit ${limit.toFixed(3)}, moved on ${moved}/${samples.length - 1} frames`);

// ── 5. DELTA ─────────────────────────────────────────────────────────────
const perSnapshot = a.client.state.bytesIn / Math.max(1, a.client.state.snapshots);
check("snapshots are delta-sized", perSnapshot < 60,
    `${perSnapshot.toFixed(1)} bytes/snapshot over ${a.client.state.snapshots}`);

// ── VERDICT ──────────────────────────────────────────────────────────────
a.ws.close();
b.ws.close();

const failed = results.filter((r) => !r.pass);
console.log("");
if (failed.length) {
    console.log(`MILESTONE FAILED — ${failed.length} of ${results.length}`);
    process.exit(1);
}
console.log(`MILESTONE PASSED — ${results.length} assertions, two clients, one enemy`);
process.exit(0);
