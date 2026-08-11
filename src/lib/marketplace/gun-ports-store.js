import "server-only";

import { db } from "@/lib/db";
import { GUN_PORTS, gunPortsFor } from "@/lib/marketplace/gun-ports.js";

// ── SAVED GUN PLACEMENTS ─────────────────────────────────────────────────────────────────────────────────────
// The DB half of gun-ports.js. Placements are authored on a phone against the real art (the gun lab), stored
// here, and read back by the battle's server-side meta so the deck shows barrels on the rail rather than the
// generic even spread.
//
// Order of preference, most specific first:
//   1. a saved row for this hull   — someone looked at this ship and placed its guns
//   2. the hand-authored table     — settled values promoted into source
//   3. the even spread             — never gunless, just imprecise
//
// Cached per request rather than per process: a placement edited on the phone has to show up on the next
// battle, and a five-minute process cache would make the lab feel broken.

// Seven was the cap the Cannons track enforces — right for a PLAYER'S boat, and two short for the enemy.
// Encounter ships field up to nine (the Dread Corsair and the Drowned Admiral both do), so a saved battery
// was silently truncated and the last two barrels could never be placed at all.
const MAX_PORTS = 9;

/** Trim anything the lab sends to the shape the renderer needs: {x,y} in 0-1, at most one battery's worth. */
export function sanitizePorts(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const p of raw) {
        const x = Number(p?.x);
        const y = Number(p?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        // Clamped rather than rejected — a port a hair off the sprite box is a slip of the thumb, not an
        // attack, and silently dropping it would make the lab feel like it lost a tap.
        out.push({ x: Math.min(1, Math.max(0, Math.round(x * 1000) / 1000)), y: Math.min(1, Math.max(0, Math.round(y * 1000) / 1000)) });
        if (out.length >= MAX_PORTS) break;
    }
    return out;
}

/**
 * Everything saved about every hull, in ONE query — there are thirty-six hulls, not thirty-six thousand.
 *
 * Two maps rather than one, because they answer different questions and a hull can have either without the
 * other: `ports` is where its cannons sit, `flip` is whether its art was drawn facing the wrong way. A hull
 * marked as flipped with no guns placed is a real and expected row.
 */
export async function getSavedHulls() {
    const rows = await db.query(`SELECT art, ports, flipped FROM mkt_gun_port`).catch(() => []);
    const ports = {};
    const flip = {};
    for (const r of rows) {
        const p = sanitizePorts(typeof r.ports === "string" ? JSON.parse(r.ports || "[]") : r.ports);
        if (p.length) ports[r.art] = p;
        if (r.flipped === true) flip[r.art] = true;
    }
    return { ports, flip };
}

/** Every saved placement, as { art: [{x,y}] }. For callers that only draw guns and never a whole hull. */
export async function getSavedPorts() {
    return (await getSavedHulls()).ports;
}

/**
 * Which way a hull is drawn, folded into the facing the scene was already going to use.
 *
 * `base` is what the fight wants — a rival captain is mirrored so the two ships face each other, an encounter
 * is not. A flipped SPRITE is the opposite question, about the drawing rather than the fight, so the two
 * compose with XOR: an already-mirrored ship whose art is backwards ends up drawn the right way round.
 */
export const facing = (flip, art, base = false) => Boolean(base) !== Boolean(flip?.[art]);

/**
 * The ports to draw for one hull, saved placements taking precedence.
 *
 * `saved` is the map from getSavedPorts() — passed in rather than fetched here so building both ships in a
 * battle is one query rather than two, and so a caller with no database (the lab's preview) can pass {}.
 */
export function portsWithSaved(saved, art, deckPct, n) {
    const count = Math.max(0, Math.min(MAX_PORTS, Math.floor(n) || 0));
    if (!count) return [];
    const placed = saved?.[art];
    if (placed?.length) return placed.slice(0, count);
    return gunPortsFor(art, deckPct, count);
}

/**
 * Write one hull: its whole battery and which way its art faces.
 *
 * Clearing the guns no longer deletes the row outright — a hull can be marked as flipped and have no cannons
 * placed, and dropping the row would silently throw the facing away the next time someone hit Clear. The row
 * only goes when there is genuinely nothing left to remember about the hull.
 */
export async function savePorts(art, ports, buyerId = null, flipped = false) {
    const clean = sanitizePorts(ports);
    const flip = flipped === true;
    if (!art) return { ok: false, error: "bad_art" };
    if (!clean.length && !flip) {
        await db.query(`DELETE FROM mkt_gun_port WHERE art = $1`, [String(art)]).catch(() => {});
        return { ok: true, art, ports: [], flipped: false, cleared: true };
    }
    await db.query(
        `INSERT INTO mkt_gun_port (art, ports, flipped, updated_by, updated_at) VALUES ($1, $2::jsonb, $3, $4, NOW())
         ON CONFLICT (art) DO UPDATE SET ports = EXCLUDED.ports, flipped = EXCLUDED.flipped,
                                         updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
        [String(art), JSON.stringify(clean), flip, buyerId]
    ).catch(() => {});
    return { ok: true, art, ports: clean, flipped: flip };
}

/** The source-of-truth table, for the lab's "promote to source" copy box. */
export const sourcePorts = () => GUN_PORTS;
