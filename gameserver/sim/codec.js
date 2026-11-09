import { ENTITY_FIELDS, MSG, dequantize, quantize } from "./protocol.js";

// ─────────────────────────────────────────────────────────────────────────
// THE CODEC — GENERATED FROM THE SCHEMA, BOTH DIRECTIONS, ONE FILE
//
// ⚠️ THE FIELD LIST IS READ, NEVER RETYPED. Every loop below walks
//    ENTITY_FIELDS. Adding a field to protocol.js changes the writer and
//    the reader together, which is the only reason a binary format is safe
//    to evolve. The moment someone writes `view.setUint16(6, hp)` with a
//    literal offset, the two sides can drift and the symptom is a plausible
//    wrong number rather than a crash.
//
// ⚠️ DELTA IS AGAINST WHAT THAT CLIENT LAST ACKED, NOT AGAINST LAST TICK.
//    This is the piece the decision record calls "the hard part", and the
//    reason is packet loss: if the baseline were simply the previous tick,
//    one dropped snapshot leaves the client decoding every later delta
//    against a state it never received, and it is silently wrong forever
//    rather than briefly behind. Each client carries its own baseline and
//    the server only advances it when the client says it arrived.
//
// Layout of a snapshot:
//   u8   type
//   u32  serverTick
//   u32  lastProcessedInputSeq   (for the receiving client; 0 if none)
//   u16  entityCount
//   per entity:
//     u16  id
//     u8   fieldMask     -- which fields follow; absent means unchanged
//     ...  each present field at its declared width
//   u16  removedCount, then u16 id each
// ─────────────────────────────────────────────────────────────────────────

const FIELD_BYTES = ENTITY_FIELDS.reduce((n, f) => n + f.bits / 8, 0);
// id + mask + worst-case fields, plus header and removal slack.
const MAX_PER_ENTITY = 3 + FIELD_BYTES;

export function encodeSnapshot({ tick, lastSeq, entities, baseline, removed = [] }) {
    const buf = new ArrayBuffer(11 + entities.length * MAX_PER_ENTITY + 2 + removed.length * 2);
    const view = new DataView(buf);
    let o = 0;

    view.setUint8(o, MSG.SNAPSHOT); o += 1;
    view.setUint32(o, tick); o += 4;
    view.setUint32(o, lastSeq >>> 0); o += 4;
    const countAt = o; o += 2;

    let written = 0;
    for (const ent of entities) {
        const prev = baseline.get(ent.id);
        let mask = 0;
        const values = [];
        for (let i = 0; i < ENTITY_FIELDS.length; i += 1) {
            const field = ENTITY_FIELDS[i];
            const q = quantize(ent[field.name], field);
            // A field is sent when it CHANGED, or when this client has no
            // baseline for the entity at all (it is new to them).
            if (prev === undefined || prev[i] !== q) {
                mask |= 1 << i;
                values.push([i, q]);
            }
        }
        // An entity with nothing to say costs nothing. This is where most
        // of the saving actually comes from: a standing player is absent.
        if (mask === 0) continue;

        view.setUint16(o, ent.id); o += 2;
        view.setUint8(o, mask); o += 1;
        for (const [i, q] of values) {
            const field = ENTITY_FIELDS[i];
            if (field.bits === 16) { view.setUint16(o, q); o += 2; }
            else if (field.bits === 8) { view.setUint8(o, q); o += 1; }
            else { view.setUint32(o, q); o += 4; }
        }
        written += 1;
    }
    view.setUint16(countAt, written);

    view.setUint16(o, removed.length); o += 2;
    for (const id of removed) { view.setUint16(o, id); o += 2; }

    return new Uint8Array(buf, 0, o);
}

/** Advance a baseline to exactly what `encodeSnapshot` just described. The
 *  server calls this only when the client ACKS the tick, never at send. */
export function applyToBaseline(baseline, entities, removed = []) {
    for (const ent of entities) {
        const q = ENTITY_FIELDS.map((f) => quantize(ent[f.name], f));
        baseline.set(ent.id, q);
    }
    for (const id of removed) baseline.delete(id);
}

export function decodeSnapshot(bytes, baseline) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let o = 1; // type already read by the caller
    const tick = view.getUint32(o); o += 4;
    const lastSeq = view.getUint32(o); o += 4;
    const count = view.getUint16(o); o += 2;

    for (let n = 0; n < count; n += 1) {
        const id = view.getUint16(o); o += 2;
        const mask = view.getUint8(o); o += 1;
        const prev = baseline.get(id) || ENTITY_FIELDS.map(() => 0);
        const next = prev.slice();
        for (let i = 0; i < ENTITY_FIELDS.length; i += 1) {
            if (!(mask & (1 << i))) continue;
            const field = ENTITY_FIELDS[i];
            if (field.bits === 16) { next[i] = view.getUint16(o); o += 2; }
            else if (field.bits === 8) { next[i] = view.getUint8(o); o += 1; }
            else { next[i] = view.getUint32(o); o += 4; }
        }
        baseline.set(id, next);
    }
    const removedCount = view.getUint16(o); o += 2;
    const removed = [];
    for (let n = 0; n < removedCount; n += 1) { removed.push(view.getUint16(o)); o += 2; }
    for (const id of removed) baseline.delete(id);

    // Hand back decoded values, not raw ones: nothing above this layer
    // should know that x is a 16-bit fixed point.
    const entities = new Map();
    for (const [id, raw] of baseline) {
        const out = { id };
        ENTITY_FIELDS.forEach((f, i) => { out[f.name] = dequantize(raw[i], f); });
        entities.set(id, out);
    }
    return { tick, lastSeq, entities, bytes: o };
}

// ── INPUT, UPSTREAM ──────────────────────────────────────────────────────
//   u8 type · u32 seq · u16 dtMs · u8 buttons · u32 ackTick
export function encodeInput({ seq, dtMs, buttons, ackTick }) {
    const buf = new ArrayBuffer(12);
    const view = new DataView(buf);
    view.setUint8(0, MSG.INPUT);
    view.setUint32(1, seq >>> 0);
    view.setUint16(5, Math.min(65535, Math.round(dtMs)));
    view.setUint8(7, buttons & 0xff);
    view.setUint32(8, ackTick >>> 0);
    return new Uint8Array(buf);
}

export function decodeInput(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
        seq: view.getUint32(1),
        dtMs: view.getUint16(5),
        buttons: view.getUint8(7),
        ackTick: view.getUint32(8),
    };
}

// ── EVENTS, DOWNSTREAM ───────────────────────────────────────────────────
//   u8 type · u8 event · u16 actorId · u16 targetId · u16 amount · u8 crit
export function encodeEvent({ event, actorId, targetId, amount, crit }) {
    const buf = new ArrayBuffer(9);
    const view = new DataView(buf);
    view.setUint8(0, MSG.EVENT);
    view.setUint8(1, event);
    view.setUint16(2, actorId);
    view.setUint16(4, targetId);
    view.setUint16(6, amount);
    view.setUint8(8, crit ? 1 : 0);
    return new Uint8Array(buf);
}

export function decodeEvent(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
        event: view.getUint8(1),
        actorId: view.getUint16(2),
        targetId: view.getUint16(4),
        amount: view.getUint16(6),
        crit: view.getUint8(8) === 1,
    };
}
