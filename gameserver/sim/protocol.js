// ─────────────────────────────────────────────────────────────────────────
// THE PROTOCOL — ONE SCHEMA, AND THE CODEC IS GENERATED FROM IT
//
// ⚠️ NOTHING HERE IS HAND-SERIALIZED, AND THAT IS THE ONE IDEA WORTH
//    STEALING FROM COLYSEUS. The decision record says it plainly: declare
//    state as a schema -- field names, bit widths, quantization ranges --
//    and generate the codec from it. Hand-writing a reader and a writer per
//    entity type is the most error-prone code in the whole system, because
//    the two drift by one field and the symptom is garbage values rather
//    than an exception. Here there is one list, and both directions are
//    built from it, so client and server cannot disagree about byte layout.
//
// ⚠️ AND THIS FILE IS IMPORTED BY BOTH SIDES, UNCHANGED. No node builtins,
//    no browser globals. If it cannot run in both, it does not belong here.
//
// Quantization: a float is sent as an integer count of steps across a known
// range. x over [0, 2048] in 16 bits is a step of 0.031 -- three centimetres
// at this scale, far below what anyone can see, for half the bytes of a
// float32.
// ─────────────────────────────────────────────────────────────────────────

export const TICK_HZ = 15;
export const TICK_MS = 1000 / TICK_HZ;

// One second of history, which is what lag compensation rewinds through.
// A player on a 250 ms round trip is rewound 125 ms; 15 ticks is six times
// that, and the buffer is the cheapest thing in the system.
export const HISTORY_TICKS = TICK_HZ;

// ⚠️ THE WORLD IS A SQUARE ON THE GROUND PLANE, AND THE WIRE ALREADY
//    CARRIED IT. The sim started as a side-scroller: x was travel and y was
//    height, pinned at 0. Going 3D did not need a new field -- it needed
//    the SECOND field to mean the second ground axis instead of a height
//    nothing used. So sim (x, y) is the ground, and the renderer maps it to
//    three.js (x, z). Height is not simulated at all: there is no jumping,
//    no terrain, and inventing a third axis before anything needs one is
//    how a prototype grows a physics engine.
export const WORLD = {
    min: 0,
    max: 1024,
    // Where everyone arrives. Near the middle, so the first thing a new
    // player sees is other players rather than a boundary.
    spawn: { x: 512, y: 560 },
    spawnSpread: 26,
};

// One world unit is one metre, the same scale the low-poly models are built
// at -- the player model is 1.85 units tall. A 1024-unit world is a square
// kilometre, which is far more than a prototype needs and costs nothing.
export const PLAYER = {
    speed: 5.2,            // m/s -- a fast jog; a prototype is not a walking simulator
    reach: 2.4,            // melee range in metres, about an arm and a weapon
    swingCooldownMs: 500,
    hitDamage: 25,
    maxHp: 100,
    respawnMs: 4000,
};

export const ENEMY = {
    speed: 3.1,            // slower than you, so disengaging always works
    reach: 2.0,
    hitDamage: 7,
    attackCooldownMs: 1200,
    aggroRange: 14,
};

// ── THE WIRE SCHEMA ──────────────────────────────────────────────────────
// `bits` is the width on the wire. `min`/`max` give the quantization range
// for a quantized field; an integer field states `int: true` and is sent
// as-is.
//
// ⚠️ hp IS 16 BITS, NOT THE DOC'S 8. The decision record's packet budget
//    estimates 8 bytes an entity with an 8-bit hp, which would mean sending
//    health as a fraction of max. The milestone this is built for is
//    literally "both windows show the SAME DAMAGE NUMBERS" -- a quantized
//    fraction shows 399 on one client and 400 on the other and the test
//    becomes unrunnable. One extra byte per entity, and the number is the
//    number. Revisit when a real entity count makes it matter.
export const ENTITY_FIELDS = [
    { name: "x", bits: 16, min: WORLD.min, max: WORLD.max },
    { name: "y", bits: 16, min: WORLD.min, max: WORLD.max },
    { name: "hp", bits: 16, int: true },
    { name: "facing", bits: 8, int: true },
    { name: "flags", bits: 8, int: true },
];

export const FLAG = {
    SWINGING: 1 << 0,
    DEAD: 1 << 2,
    IS_ENEMY: 1 << 3,
};

// ⚠️ FACING IS ITS OWN FIELD NOW, NOT A FLAG. A side-scroller only ever
//    needed "left or right" and a single bit carried it. On a ground plane
//    a character faces any of 360 degrees, and a renderer that cannot turn
//    a model to face where it is walking produces people who moonwalk.
//    8 bits is 1.4 degrees, which nobody can see.
export const FACING_STEPS = 256;

// ── MESSAGE TYPES ────────────────────────────────────────────────────────
export const MSG = {
    // server -> client
    WELCOME: 1,
    SNAPSHOT: 2,
    EVENT: 3,
    // client -> server
    INPUT: 10,
    PING: 11,
};

// ── EVENTS ───────────────────────────────────────────────────────────────
// ⚠️ DAMAGE IS AN EVENT, NOT A STATE DIFF, AND THAT IS DELIBERATE. A client
//    can see hp fall out of a snapshot, but it cannot see WHO hit, for HOW
//    MUCH, or whether it was the swing it just played. The milestone needs
//    both windows to show the same number at the same moment; a number has
//    to be sent as a number, once, by the one process entitled to compute
//    it.
export const EVENT = {
    HIT: 1,
    DEATH: 2,
};

export const INPUT_BITS = {
    LEFT: 1 << 0,
    RIGHT: 1 << 1,
    FORWARD: 1 << 3,
    BACK: 1 << 4,
    ATTACK: 1 << 2,
};

export function quantize(value, field) {
    if (field.int) return Math.max(0, Math.round(value)) & ((1 << field.bits) - 1);
    const steps = (1 << field.bits) - 1;
    const clamped = Math.min(field.max, Math.max(field.min, value));
    return Math.round(((clamped - field.min) / (field.max - field.min)) * steps);
}

export function dequantize(raw, field) {
    if (field.int) return raw;
    const steps = (1 << field.bits) - 1;
    return field.min + (raw / steps) * (field.max - field.min);
}
