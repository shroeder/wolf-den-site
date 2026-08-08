// ── THE THREE THINGS YOU CAN SHOOT AT ────────────────────────────────────────────────────────────────────────
// A broadside used to be one decision: fire, or fire differently. You picked an order off a card, the whole
// volley went somewhere unspecified, and a number came off a bar. The ship you were shooting at was a picture.
//
// Now you pick a PART of her, and the whole broadside goes there:
//
//   SAILS   canvas and rigging. Little damage — but she cannot dodge what she cannot out-sail, so every shot
//           you fire afterwards lands more often. The setup move.
//   HULL    timber. Straight damage, nothing clever. The honest move.
//   GUNS    one particular cannon, dismounted for good. Every barrel you take is damage she never deals again.
//
// That is the whole board, and it is deliberately the whole board. A rudder and a powder store were built and
// cut: nobody could say what a rudder did, and a magazine that ends the fight on one lucky ball is a coin toss
// wearing a target.
//
// WHERE they are is MEASURED, not drawn by hand — scripts/scan-ship-zones.mjs reads each hull's pixels and
// writes ship-zone-maps.js. Sails and hull come from the deck line; the guns need no measuring at all, because
// gun-ports.js already places every barrel on every hull.
//
// PURE and client-safe, like ship-battle.js and gun-ports.js: the scene draws its targets from these tables and
// the server re-reads the same ones, so it never trusts what the client claims it aimed at.

import { ZONE_GRID, SHIP_ZONE_MAPS } from "@/lib/marketplace/ship-zone-maps.js";

export { ZONE_GRID };

// `aim` multiplies the gun's accuracy — a cannon is a small thing on a big ship, canvas is the opposite.
// `dmg` is what a hit takes off the HULL, so the two setup shots cost you damage to buy their effect.
// `effect` is the one line the scene shows a player. It is the whole tutorial: three sentences, no manual.
export const ZONES = {
    sails: {
        id: "sails", name: "Sails", char: "s", icon: "GiSailboat", tint: "#63aeef",
        effect: "They dodge less — your shots start landing.",
        blurb: "Big, soft and barely worth damage. Shred her canvas and everything you fire afterwards hits more often.",
        aim: 0.98, dmg: 0.4, sys: "sails",
    },
    hull: {
        id: "hull", name: "Hull", char: "h", icon: "GiWoodBeam", tint: "#e0a552",
        effect: "Straight damage. Nothing clever.",
        blurb: "Timber at the waterline. Full damage and no side effect — the shot you take when you are ahead.",
        aim: 1, dmg: 1, sys: null,
    },
    guns: {
        id: "guns", name: "Cannon", char: null, icon: "GiCannon", tint: "#ffcf87",
        effect: "That gun stops firing. For good.",
        blurb: "One barrel, dismounted for the rest of the fight. Hard to hit, and it is damage she never deals again.",
        aim: 0.7, dmg: 0.5, sys: "guns",
    },
};
export const ZONE_LIST = Object.values(ZONES);
export const zoneById = (id) => ZONES[String(id || "hull")] || ZONES.hull;
export const AIMABLE = ["sails", "hull", "guns"];

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
 * A zone as ONE BOX, in percent of the sprite box: where to put the target marker.
 *
 * The first cut drew the raw 28×28 cells and it looked like what it was — a jagged stencil laid over a painting.
 * A player is choosing between three things, not painting a mask, so the marker is a single clean shape around
 * the part and the measured cells only decide where that shape goes and how big it is.
 *
 * `mirror` is whether the scene has flipped this hull: the grid was measured off the art as drawn, so a
 * mirrored ship needs its columns mirrored or the marker sits on the wrong end.
 */
export function zoneBox(key, zoneId, { mirror = false, pad = 0 } = {}) {
    const map = zoneMapFor(key);
    const want = zoneById(zoneId).char;
    if (!map || !want) return null;
    let minX = ZONE_GRID, maxX = -1, minY = ZONE_GRID, maxY = -1;
    for (let gy = 0; gy < ZONE_GRID; gy += 1) {
        for (let gx = 0; gx < ZONE_GRID; gx += 1) {
            if (map.rows[gy][gx] !== want) continue;
            if (gx < minX) minX = gx; if (gx > maxX) maxX = gx;
            if (gy < minY) minY = gy; if (gy > maxY) maxY = gy;
        }
    }
    if (maxX < 0) return null;
    const step = 100 / ZONE_GRID;
    const x = mirror ? ZONE_GRID - 1 - maxX : minX;
    const box = { x: x * step - pad, y: minY * step - pad, w: (maxX - minX + 1) * step + pad * 2, h: (maxY - minY + 1) * step + pad * 2 };
    return { ...box, cx: box.x + box.w / 2, cy: box.y + box.h / 2 };
}

/**
 * A zone as rectangles, in percent — used for the DAMAGE overlay rather than for aiming.
 *
 * Torn canvas has to sit on the actual sails and nowhere else, so this one does follow the measured cells:
 * runs are merged along each row, which turns three hundred cells into a dozen wide bars.
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

/** Whether a hull actually has this part to shoot at — a marker for a zone with no pixels would be a button
 *  that does nothing. Guns are always aimable: every ship carries at least one. */
export function hasZone(key, zoneId) {
    if (zoneId === "guns") return true;
    return Boolean(zoneBox(key, zoneId));
}
export const zonesOn = (key) => AIMABLE.filter((z) => hasZone(key, z));
