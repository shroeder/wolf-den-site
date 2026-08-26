import "server-only";

import { db } from "@/lib/db";

// ── WHAT CHIPS BUY THAT DOES NOT GO AWAY ─────────────────────────────────────────────────────────────────────
// Luke: "let's allow buying permanent upgrades to core stats... starts at 250, cost goes up by 250 each time,
// can go infinitely." Plus five one-off unlocks: unique pets, a golden daily wheel, extra fish, a new tier of
// recipes, and another hundred rungs of the Road.
//
// The Counter used to sell CONSUMPTION — a chest you open and it is gone. This is the other half: things you
// own afterwards. Both live in `mkt_casino_perk` (mig406) as one table, because a stat track is a perk you can
// buy again and a feature unlock is a perk with a maximum of one. See the note on the migration.
//
// ── AND THE UNLOCKS ARE SECRET UNTIL THEY ARE OWNED ──────────────────────────────────────────────────────────
// Luke: "these are locked features and completely secret from all areas of the game until you unlock them.
// There should be no accidental ability to see or get these hidden things without having these unlocks."
//
// That is a stronger rule than "hidden in the UI" and it is the reason every gate below is a SERVER read. A
// locked feature must not appear in a list, must not be reachable by guessing an id, and must not be produced
// by any roll — the golden wheel's rewards are not in the ordinary wheel's table, the deep fish are not in the
// ordinary pool, the master recipes are not in the ordinary book, and the Road's second hundred does not
// resolve. Each owning feature asks `hasUnlock` and builds its own list from the answer; nothing filters a
// full list down for display, because a filtered list is one forgotten `.filter()` away from a leak.

// ── THE FOUR YOU BUILD ───────────────────────────────────────────────────────────────────────────────────────
// Might, Vitality, Tenacity, Ferocity — and deliberately not Crit Chance or Crit Power. Luke: "primary stats
// only, not crit chance or power." items.js already draws that exact line ("THE FOUR YOU BUILD" against "THE
// CRITS"), which is the right one: the four are linear and always useful, and the crits multiply everything
// else, so an infinite track on one of those compounds against every other source in the game.
export const STAT_TRACKS = [
    { perk: "might", stat: "might", name: "Whetstone", per: 2,
        blurb: "Multiplies your weapon's damage. The whole of what you hit for." },
    { perk: "vitality", stat: "vitality", name: "Constitution", per: 2,
        blurb: "How much punishment you can take before somebody takes it off you." },
    { perk: "tenacity", stat: "tenacity", name: "Bulwark", per: 2,
        blurb: "Multiplies the armour you are wearing. 500 tenacity doubles it." },
    { perk: "ferocity", stat: "ferocity", name: "Bloodrush", per: 2,
        blurb: "Chance to take another turn immediately. One percent for every five points." },
];

// ── THE PRICE LADDER ─────────────────────────────────────────────────────────────────────────────────────────
// 250 for the first, +250 every time, for ever. LINEAR growth against a linear benefit, which is what makes it
// safe to leave uncapped: the tenth point costs 2,500 and the hundredth costs 25,000, so the cost of the NEXT
// point rises exactly as fast as the number of points you have. A member who has bought a hundred has paid
// 12.6 million chips for +200 of one stat, and the same again buys only +200 more.
//
// That is the whole reason there is no ceiling. An exponential ladder would need one (it becomes unreachable
// and the track is a lie); a flat one would need one (it becomes the only thing worth buying). Linear needs
// nothing: it is self-limiting and it stays honest at every level.
export const STAT_STEP = 250;
export const statCost = (level = 0) => STAT_STEP * (Math.max(0, Math.floor(level)) + 1);

// ── THE FIVE DOORS ───────────────────────────────────────────────────────────────────────────────────────────
// One-off, and each one opens a body of content that does not exist for anybody who has not bought it.
export const UNLOCKS = [
    { perk: "wheel_gold", price: 20000, name: "The Golden Wheel",
        blurb: "The daily wheel, recut. Nothing on it is small." },
    { perk: "fish_deep", price: 15000, name: "The Deep Water Charts",
        blurb: "Six fish that are not in any water you can currently reach." },
    { perk: "recipe_master", price: 25000, name: "The Master's Book",
        blurb: "A tier of recipes above anything the kitchen has now." },
    { perk: "road_long", price: 100000, name: "The Long Road",
        blurb: "A hundred more rungs, and ten houses nobody has fought." },
];

export const unlockByPerk = (perk) => UNLOCKS.find((u) => u.perk === perk) || null;
export const trackByPerk = (perk) => STAT_TRACKS.find((t) => t.perk === perk) || null;

/** Every perk this member holds, as `{ perk: level }`. Empty object for a signed-out or perk-less member. */
export async function getCasinoPerks(buyerId) {
    if (!buyerId) return {};
    const rows = await db.query(
        `SELECT perk, level FROM mkt_casino_perk WHERE buyer_id = $1 AND level > 0`, [buyerId],
    ).catch(() => []);
    const out = {};
    for (const r of rows) out[r.perk] = Number(r.level) || 0;
    return out;
}

/**
 * Does this member own a one-off unlock?
 *
 * The single question every gated feature asks. Kept as its own function rather than letting callers read the
 * map, so there is one spelling of the answer and a feature cannot accidentally treat `0` as owned.
 */
export async function hasUnlock(buyerId, perk) {
    if (!buyerId || !perk) return false;
    const row = await db.queryOne(
        `SELECT 1 FROM mkt_casino_perk WHERE buyer_id = $1 AND perk = $2 AND level > 0 LIMIT 1`,
        [buyerId, perk],
    ).catch(() => null);
    return Boolean(row);
}

/**
 * What the stat tracks are worth, in the shape combatStats already sums.
 *
 * Returns only non-zero stats, so a member who has bought nothing contributes nothing to the loop rather than
 * four zeroes that every downstream `if (total)` has to skip.
 */
export async function casinoStatBonus(buyerId) {
    const perks = await getCasinoPerks(buyerId);
    const out = {};
    for (const t of STAT_TRACKS) {
        const level = Number(perks[t.perk]) || 0;
        if (level > 0) out[t.stat] = level * t.per;
    }
    return out;
}

/**
 * Buy one level of a perk. Returns the new level, or null if the chips could not be taken.
 *
 * THE PRICE IS READ FROM THE ROW, NOT FROM THE CALLER. `buyWithChips` quotes a price to the screen and this
 * charges one; both compute it from the same function given the same level, which is the only arrangement
 * where the two cannot disagree. See the note in chip-store.js.
 */
export async function grantCasinoPerk(buyerId, perk) {
    const row = await db.queryOne(
        `INSERT INTO mkt_casino_perk (buyer_id, perk, level) VALUES ($1, $2, 1)
         ON CONFLICT (buyer_id, perk) DO UPDATE SET level = mkt_casino_perk.level + 1, updated_at = NOW()
         RETURNING level`,
        [buyerId, perk],
    ).catch(() => null);
    return row ? Number(row.level) : null;
}

/** Undo one level. Only ever called to refund a purchase whose delivery failed. */
export async function revokeCasinoPerk(buyerId, perk) {
    await db.query(
        `UPDATE mkt_casino_perk SET level = GREATEST(0, level - 1), updated_at = NOW()
          WHERE buyer_id = $1 AND perk = $2`,
        [buyerId, perk],
    ).catch(() => {});
}
