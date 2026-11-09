import { FLAG, INPUT_BITS, MSG, TICK_MS } from "../sim/protocol.js";
import { decodeEvent, decodeSnapshot, encodeInput } from "../sim/codec.js";
import { stepPlayer } from "../sim/world.js";

// ─────────────────────────────────────────────────────────────────────────
// THE CLIENT HALF — PREDICTION, RECONCILIATION, INTERPOLATION
//
// No rendering in here on purpose: this module is driven by the browser
// page AND by the headless test with no DOM at all. A netcode bug that only
// reproduces inside a canvas is a bug nobody can write a test for.
//
// THE THREE MECHANISMS, and the symptom each one removes:
//
//   PREDICTION      Your own movement waits a round trip without it. We run
//                   the SAME stepPlayer the server runs, immediately, on
//                   our own input.
//   RECONCILIATION  The server's answer arrives for input #112 while we are
//                   already at #119. We snap to its authoritative position
//                   and REPLAY 113..119 on top. Without the replay you
//                   rubber-band on every snapshot.
//   INTERPOLATION   Remote entities arrive 15 times a second. Drawn at the
//                   latest position they teleport; drawn 100 ms in the past
//                   between the two snapshots that straddle that instant,
//                   they move smoothly.
//
// ⚠️ WE PREDICT MOVEMENT AND NOTHING ELSE. Not damage, not hit detection,
//    not death. The decision record is explicit: damage is computed once,
//    on the server, and broadcast as a result. What makes a swing FEEL
//    instant is playing its animation at once -- the authoritative number
//    lands during the windup.
// ─────────────────────────────────────────────────────────────────────────

export const INTERP_DELAY_MS = 100;   // ~1.5 ticks: enough to always have two

export function createClient({ send, now }) {
    const state = {
        playerId: null,
        serverTick: 0,
        baseline: new Map(),
        // Everything the server told us, as it told us.
        authoritative: new Map(),
        // Remote entity position history, for interpolation.
        tracks: new Map(),           // id -> [{t, x, y}]
        // Our own predicted position.
        spawned: false,
        predicted: { x: 0, y: 0, facingLeft: false },
        pendingInputs: [],
        seq: 0,
        lastAckedSeq: 0,
        events: [],
        hp: new Map(),
        connected: false,
        bytesIn: 0,
        snapshots: 0,
        corrections: 0,
        maxCorrection: 0,
    };

    function onMessage(data, isBinary) {
        if (!isBinary) {
            const msg = JSON.parse(String(data));
            if (msg.type === "welcome") {
                state.playerId = msg.playerId;
                state.connected = true;
                state.welcome = msg;
            } else if (msg.type === "ping") {
                send(JSON.stringify({ type: "pong" }));
            }
            return;
        }
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        state.bytesIn += bytes.byteLength;

        if (bytes[0] === MSG.EVENT) {
            state.events.push({ ...decodeEvent(bytes), at: now() });
            return;
        }
        if (bytes[0] !== MSG.SNAPSHOT) return;

        const snap = decodeSnapshot(bytes, state.baseline);
        state.serverTick = snap.tick;
        state.snapshots += 1;
        state.authoritative = snap.entities;

        const t = now();
        for (const [id, ent] of snap.entities) {
            state.hp.set(id, ent.hp);
            if (id === state.playerId) continue;
            let track = state.tracks.get(id);
            if (!track) { track = []; state.tracks.set(id, track); }
            track.push({ t, x: ent.x, y: ent.y, flags: ent.flags });
            while (track.length > 32) track.shift();
        }

        // ── RECONCILIATION ───────────────────────────────────────────
        const mine = snap.entities.get(state.playerId);
        if (mine) {
            state.lastAckedSeq = snap.lastSeq;
            // ⚠️ THE FIRST SNAPSHOT IS A SPAWN, NOT A CORRECTION. The
            // predictor starts at x=0 because it has never been told
            // otherwise; the server's first word is "you are at 250". That
            // is not reconciliation disagreeing with prediction, and
            // counting it as such reported a 250-unit correction on a
            // loopback connection -- a number that reads as catastrophic
            // drift and is actually an uninitialised variable.
            if (!state.spawned) {
                state.spawned = true;
                state.predicted.x = mine.x;
                state.predicted.y = mine.y;
                state.pendingInputs = [];
                return;
            }
            // Drop every input the server has already accounted for.
            state.pendingInputs = state.pendingInputs.filter((i) => i.seq > snap.lastSeq);
            const before = state.predicted.x;
            // Snap to truth...
            state.predicted.x = mine.x;
            state.predicted.y = mine.y;
            // ...then replay what it has not seen yet.
            for (const input of state.pendingInputs) {
                stepPlayer(state.predicted, input, input.dtMs);
            }
            const correction = Math.abs(state.predicted.x - before);
            if (correction > 0.5) {
                state.corrections += 1;
                state.maxCorrection = Math.max(state.maxCorrection, correction);
            }
        }
    }

    /** Called every animation frame. Returns the input it sent, if any. */
    function sendInput({ left, right, attack, dtMs }) {
        if (!state.connected) return null;
        state.seq += 1;
        const buttons = (left ? INPUT_BITS.LEFT : 0)
            | (right ? INPUT_BITS.RIGHT : 0)
            | (attack ? INPUT_BITS.ATTACK : 0);
        const input = { seq: state.seq, dtMs: Math.min(dtMs, TICK_MS * 3), left, right, attack, buttons };

        // Predict immediately, before the packet has even left.
        stepPlayer(state.predicted, input, input.dtMs);
        state.pendingInputs.push(input);
        if (state.pendingInputs.length > 120) state.pendingInputs.shift();

        send(encodeInput({ seq: input.seq, dtMs: input.dtMs, buttons, ackTick: state.serverTick }));
        return input;
    }

    /**
     * Where to DRAW a remote entity: its position INTERP_DELAY_MS ago,
     * between the two snapshots that straddle that instant.
     *
     * ⚠️ RENDERING IN THE PAST IS NOT A COMPROMISE, IT IS THE MECHANISM.
     *    Drawing the newest snapshot means standing still between packets
     *    and jumping on arrival. Holding a fixed delay means there is
     *    always a sample on each side to interpolate between -- and the
     *    server's lag compensation is what pays the delay back.
     */
    function renderPosition(id) {
        if (id === state.playerId) return { ...state.predicted };
        const track = state.tracks.get(id);
        if (!track || !track.length) {
            const ent = state.authoritative.get(id);
            return ent ? { x: ent.x, y: ent.y } : null;
        }
        const target = now() - INTERP_DELAY_MS;
        let a = null;
        let b = null;
        for (let i = track.length - 1; i >= 0; i -= 1) {
            if (track[i].t <= target) { a = track[i]; b = track[i + 1] || null; break; }
        }
        if (!a) return { x: track[0].x, y: track[0].y, flags: track[0].flags };
        if (!b) return { x: a.x, y: a.y, flags: a.flags };
        const span = b.t - a.t;
        const f = span > 0 ? Math.min(1, Math.max(0, (target - a.t) / span)) : 0;
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, flags: a.flags };
    }

    return { state, onMessage, sendInput, renderPosition, FLAG };
}
