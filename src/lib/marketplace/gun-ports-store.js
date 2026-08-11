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

/** Every saved placement, as { art: [{x,y}] }. One query — there are twenty-six hulls, not twenty-six thousand. */
export async function getSavedPorts() {
    const rows = await db.query(`SELECT art, ports FROM mkt_gun_port`).catch(() => []);
    const out = {};
    for (const r of rows) {
        const ports = sanitizePorts(typeof r.ports === "string" ? JSON.parse(r.ports || "[]") : r.ports);
        if (ports.length) out[r.art] = ports;
    }
    return out;
}

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

/** Write one hull's whole battery. An empty array clears the row back to the fallback, which is a real edit. */
export async function savePorts(art, ports, buyerId = null) {
    const clean = sanitizePorts(ports);
    if (!art) return { ok: false, error: "bad_art" };
    if (!clean.length) {
        await db.query(`DELETE FROM mkt_gun_port WHERE art = $1`, [String(art)]).catch(() => {});
        return { ok: true, art, ports: [], cleared: true };
    }
    await db.query(
        `INSERT INTO mkt_gun_port (art, ports, updated_by, updated_at) VALUES ($1, $2::jsonb, $3, NOW())
         ON CONFLICT (art) DO UPDATE SET ports = EXCLUDED.ports, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
        [String(art), JSON.stringify(clean), buyerId]
    ).catch(() => {});
    return { ok: true, art, ports: clean };
}

/** The source-of-truth table, for the lab's "promote to source" copy box. */
export const sourcePorts = () => GUN_PORTS;
