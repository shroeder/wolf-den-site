// ── AIMING AT A PART OF A SHIP ───────────────────────────────────────────────────────────────────────────────
// A broadside used to be one decision: fire, or fire differently. You picked an order, the whole volley went
// somewhere unspecified, and a number came off a bar. The ship you were shooting at was a picture of a ship.
//
// Now every gun is laid at a PART of her, the way FTL lets you pick a room: her sails, her hull, her rudder,
// her guns, or the powder store if you like the odds. That turns one choice a round into as many choices as you
// have barrels, and it makes the two ships on screen the board you are playing on rather than the scenery.
//
// The areas themselves are MEASURED, not drawn by hand — scripts/scan-ship-zones.mjs reads each hull's pixels
// and writes ship-zone-maps.js. This file is the part the game plays with: what each zone is worth, how hard it
// is to hit, and how a tap at (u,v) on a sprite becomes one of them.
//
// PURE and client-safe, like ship-battle.js and gun-ports.js: the scene hit-tests locally so aiming is instant,
// and the server re-reads the same tables so it never trusts what the client claims it aimed at.

import { ZONE_GRID, SHIP_ZONE_MAPS } from "@/lib/marketplace/ship-zone-maps.js";

export { ZONE_GRID };

// ── WHAT EACH PART IS WORTH ──────────────────────────────────────────────────────────────────────────────────
// Every zone is a real trade, the same rule the orders used to follow: nothing here is strictly better than
// anything else, or there would be one correct place to aim and no decision to make.
//
//   aim    multiplies the gun's accuracy — a rudder is a small thing at the back of a moving ship
//   dmg    what a hit takes off the HULL. Hitting the sails does little to the ship and a lot to her handling
//   sys    the system it wrecks, which is where the actual value of the shot usually is
export const ZONES = {
    hull: {
        id: "hull", name: "Hull", char: "h", icon: "GiWoodBeam", tint: "#e0a552",
        blurb: "Timber and waterline. The honest shot — full damage, and the only one that opens holes.",
        aim: 1, dmg: 1, sys: null, leak: 0.1,
    },
    sails: {
        id: "sails", name: "Sails & rigging", char: "s", icon: "GiSailboat", tint: "#63aeef",
        blurb: "Canvas is a big target and a soft one. Shred it and she cannot dodge — every later shot lands truer.",
        aim: 0.98, dmg: 0.4, sys: "sails", leak: 0,
    },
    rudder: {
        id: "rudder", name: "Rudder", char: "r", icon: "GiShipWheel", tint: "#69d68a",
        blurb: "Small, low, and at the back. Wreck it and she loses the weather gauge — you fire first, every round.",
        aim: 0.6, dmg: 0.5, sys: "rudder", leak: 0.04,
    },
    guns: {
        id: "guns", name: "Gun deck", char: null, icon: "GiCannon", tint: "#ffcf87",
        blurb: "Dismount a cannon and it stays dismounted. Every one you take is a gun that never answers.",
        aim: 0.72, dmg: 0.55, sys: "guns", leak: 0,
    },
    powder: {
        id: "powder", name: "Powder store", char: "p", icon: "GiPowderBag", tint: "#f05c5c",
        blurb: "Two cells of magazine, buried in the hold. Almost nobody hits it. It ends fights that are not close.",
        aim: 0.1, dmg: 1, sys: "powder", leak: 0.16,
    },
};
export const ZONE_LIST = Object.values(ZONES);
export const zoneById = (id) => ZONES[String(id || "hull")] || ZONES.hull;
const BY_CHAR = Object.fromEntries(ZONE_LIST.filter((z) => z.char).map((z) => [z.char, z]));

// ── WHICH GRID BELONGS TO WHICH SHIP ─────────────────────────────────────────────────────────────────────────
// The battle meta carries an art URL, not a key, and it has carried three different shapes over the feature's
// life. Everything funnels through here so a stored fight from before this existed still resolves to a hull.
export function zoneKeyFromArt(art, level = 1) {
    const src = String(art || "");
    if (src.includes("/fleet/")) return src.split("/").pop().replace(/\.png$/, "");
    const tier = src.match(/boat-tier(\d+)/)?.[1];
    return `boat:${tier || Math.max(1, Math.min(11, Number(level) || 1))}`;
}
export const zoneMapFor = (key) => SHIP_ZONE_MAPS[key] || null;

/**
 * The zone at a point on a sprite — `u`/`v` are fractions of the sprite box, x from the left and y from the top.
 *
 * `mirror` is whether the scene has flipped this hull horizontally: the grid was measured off the art as drawn,
 * so a mirrored ship needs its columns mirrored with it or the rudder would answer taps at the bow.
 */
export function zoneAt(key, u, v, { mirror = false } = {}) {
    const map = zoneMapFor(key);
    if (!map) return null;
    const x = mirror ? 1 - u : u;
    if (x < 0 || x > 1 || v < 0 || v > 1) return null;
    const gx = Math.max(0, Math.min(ZONE_GRID - 1, Math.floor(x * ZONE_GRID)));
    const gy = Math.max(0, Math.min(ZONE_GRID - 1, Math.floor(v * ZONE_GRID)));
    return BY_CHAR[map.rows[gy][gx]]?.id || null;
}

/**
 * The zone at a point, but forgiving — a thumb is wider than a cell.
 *
 * A tap that lands one cell off the rudder should hit the rudder, not the sea, and a strict lookup made the
 * small zones feel broken on a phone. Rings outward until it finds something, preferring the SMALLEST zone
 * found in the closest ring: if a tap is on the edge between hull and rudder, you meant the rudder — nobody
 * aims for a rudder by accident, and the hull is three hundred cells wide either way.
 */
const PRIORITY = { powder: 0, rudder: 1, sails: 2, hull: 3 };
export function zoneNear(key, u, v, { mirror = false, rings = 2 } = {}) {
    const direct = zoneAt(key, u, v, { mirror });
    if (direct && direct !== "hull") return direct;
    const map = zoneMapFor(key);
    if (!map) return direct;
    const x = mirror ? 1 - u : u;
    const gx = Math.floor(x * ZONE_GRID), gy = Math.floor(v * ZONE_GRID);
    for (let r = 1; r <= rings; r += 1) {
        let best = null;
        for (let dy = -r; dy <= r; dy += 1) {
            for (let dx = -r; dx <= r; dx += 1) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                const cy = gy + dy, cx = gx + dx;
                if (cy < 0 || cy >= ZONE_GRID || cx < 0 || cx >= ZONE_GRID) continue;
                const z = BY_CHAR[map.rows[cy][cx]]?.id;
                if (!z) continue;
                if (!best || PRIORITY[z] < PRIORITY[best]) best = z;
            }
        }
        // A direct hit on the hull only loses to something genuinely smaller nearby.
        if (best && (!direct || PRIORITY[best] < PRIORITY[direct])) return best;
    }
    return direct;
}

/**
 * A zone as rectangles to draw, in PERCENT of the sprite box.
 *
 * Runs of cells are merged along each row, so a hull is a dozen wide bars rather than three hundred divs — the
 * outline is drawn every frame a target is highlighted and this is the difference between that being free and
 * being a phone's whole frame budget.
 */
export function zoneRects(key, zoneId, { mirror = false } = {}) {
    const map = zoneMapFor(key);
    const want = zoneById(zoneId).char;
    if (!map || !want) return [];
    const step = 100 / ZONE_GRID;
    const out = [];
    for (let gy = 0; gy < ZONE_GRID; gy += 1) {
        const row = map.rows[gy];
        let start = -1;
        for (let gx = 0; gx <= ZONE_GRID; gx += 1) {
            const on = gx < ZONE_GRID && row[gx] === want;
            if (on && start < 0) start = gx;
            if (!on && start >= 0) {
                const left = mirror ? ZONE_GRID - gx : start;
                out.push({ x: left * step, y: gy * step, w: (gx - start) * step, h: step });
                start = -1;
            }
        }
    }
    return out;
}

/** Every zone a hull actually has, in the order they are offered. Guns are appended by the caller: they are not
 *  in the grid at all, because a ship's battery is placed at runtime by gun-ports.js. */
export function zonesOn(key) {
    const map = zoneMapFor(key);
    if (!map) return ["hull"];
    const present = new Set();
    for (const row of map.rows) for (const c of row) if (BY_CHAR[c]) present.add(BY_CHAR[c].id);
    return ZONE_LIST.filter((z) => z.char && present.has(z.id)).map((z) => z.id);
}
