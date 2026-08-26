import "server-only";

import { db } from "@/lib/db";
import { STAT_META } from "@/lib/marketplace/items.js";

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
// ── AND EACH ONE IS CALLED AFTER THE STAT IT BUYS, BY THE TABLE THAT NAMES IT ────────────────────────────────
// Luke: "just list the stat it upgrades, you are confusing me because it's not the stat name and description."
//
// They were Whetstone, Constitution, Bulwark and Bloodrush — four invented names for four stats that already
// have names, printed above four sentences that never said which stat was underneath. Nothing on the card
// answered the only question a buyer has, which is "what does this raise". The flavour was costing more than
// it was worth, so the title is the stat and the sentence under it says what that stat does.
//
// AND BOTH ARE READ, NOT RETYPED. Luke, next: "are those descriptions of what stats do accurate?" They were —
// I checked all four against the engine — but only because they had been copied correctly, and a copy is only
// ever accurate until somebody retunes the thing it describes. STAT_META in items.js is where the game says
// what a stat does; every other screen that prints a stat reads it from there, and now so does this one. The
// four sentences it hands back are true of this code today:
//
//   MIGHT      swingFrom() = (weapon base / divisor) x (might / MIGHT_MAX) x DAMAGE_MAX — arena-kit.js.
//              A pure multiplier on the weapon, which is what "the whole of what you hit for" means.
//   VITALITY   healthFrom() = HEALTH_BASE + (vitality / VITALITY_MAX) x HEALTH_MAX — 200 + 10 a point.
//   TENACITY   armor x (1 + tenacity / 500) in arena.js, so 500 does double the plate exactly as stated.
//   FEROCITY   speedOf() adds ferocity / FEROCITY_PER_SPEED (500) to attack speed and extraTurnFrom() reads
//              that straight off as a chance — 5 points is 1%, and it stops at EXTRA_TURN_MAX (50%).
//
// The art keeps its old filenames: they are the same four drawings, and renaming four webps to rename four
// labels is a migration for nothing.
const TRACK_ART = { might: "whetstone", vitality: "constitution", tenacity: "bulwark", ferocity: "bloodrush" };
export const STAT_TRACKS = ["might", "vitality", "tenacity", "ferocity"].map((stat) => ({
    perk: stat,
    stat,
    art: `/images/casino/perks/${TRACK_ART[stat]}.webp`,
    name: STAT_META[stat].label,
    blurb: STAT_META[stat].desc,
    per: 1,
}));

// ── THE PRICE LADDER ─────────────────────────────────────────────────────────────────────────────────────────
// Luke: "make it 500 and it goes up 500 each time." 500 for the first, +500 every time, for ever. LINEAR
// growth against a linear benefit, which is what makes it safe to leave uncapped: the tenth point costs 5,000
// and the hundredth costs 50,000, so the cost of the NEXT point rises exactly as fast as the number of points
// you have. A member who has bought a hundred has paid 25.25 million chips for +100 of one stat, and the same
// again buys only +100 more.
//
// That is the whole reason there is no ceiling. An exponential ladder would need one (it becomes unreachable
// and the track is a lie); a flat one would need one (it becomes the only thing worth buying). Linear needs
// nothing: it is self-limiting and it stays honest at every level.
//
// PRICED AGAINST A POINT, NOT AGAINST A PURCHASE. The step doubled at the same time `per` halved from 2 to 1,
// so a point of a stat costs four times what it did. That is deliberate: at 250 for +2 the four tracks were
// the cheapest stats in the game by a wide margin — 644 of gear is the best-in-slot ceiling (see the note in
// items.js) and 80,000 chips would have bought that much Might outright.
export const STAT_STEP = 500;
export const statCost = (level = 0) => STAT_STEP * (Math.max(0, Math.floor(level)) + 1);

// ── THE FIVE DOORS ───────────────────────────────────────────────────────────────────────────────────────────
// One-off, and each one opens a body of content that does not exist for anybody who has not bought it.
// ── AND EACH ONE SAYS WHAT IT UNLOCKS ────────────────────────────────────────────────────────────────────────
// Two problems with the copy these carried, both Luke's.
//
// THE FIRST: "not clear it unlocks vs gives, especially for recipes. I'd prefer telling them it unlocks a new
// tier." Every line described the CONTENTS — "a tier of recipes above anything the kitchen has now" — which
// reads like a bundle of recipes you are handed. It is not: it is a permanent unlock that puts a new tier in
// a feature you already use, and which tier it opens is the thing worth knowing before you spend a hundred
// thousand chips. So each one now begins with the verb.
//
// THE SECOND: "you are leaking our old convo in these descriptions." They were written out of the planning
// conversation and still had its numbers in them — six fish, a hundred rungs, ten houses — counts that came
// from deciding what to build rather than from playing it. That is both a leak of how the sausage is made and
// a promise the code has to keep for ever. Member-facing copy says what the unlock DOES; what is actually
// behind it is found by opening it.
export const UNLOCKS = [
    { perk: "wheel_gold", art: "/images/casino/perks/wheel-gold.webp", price: 20000, name: "The Golden Wheel",
        blurb: "Unlocks a higher tier of the daily wheel — richer prizes on every slice of it." },
    { perk: "fish_deep", art: "/images/casino/perks/charts.webp", price: 15000, name: "The Deep Water Charts",
        blurb: "Unlocks a new tier of fishing water, and the species that only live down there." },
    { perk: "recipe_master", art: "/images/casino/perks/book.webp", price: 25000, name: "The Master's Book",
        blurb: "Unlocks a new tier of recipes in your kitchen, above anything it can cook today." },
    { perk: "road_long", art: "/images/casino/perks/road.webp", price: 100000, name: "The Long Road",
        blurb: "Unlocks a new stretch of the Road, and the houses waiting further up it." },
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
