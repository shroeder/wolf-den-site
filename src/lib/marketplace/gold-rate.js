import "server-only";

// ── THE MINT RATE ────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "we need an across the board nerf on gold given out by 50 percent."
//
// One number, one place. Every source that CREATES gold runs its reward through `mint()` on the way out, so the
// whole economy's faucet is this constant and re-tuning it later is a one-line change rather than another sweep
// of thirty features.
export const GOLD_MINT_RATE = 0.5;

// ── WHAT COUNTS AS "GIVEN OUT" ───────────────────────────────────────────────────────────────────────────────
// Not every credit is a mint, and this distinction is the whole reason this file exists rather than a blanket
// multiplier at the UPDATE. Three kinds of credit look identical in SQL and are completely different things:
//
//   MINT      the game invents gold and hands it over        — harvest, arena_win, spin_prize
//   TRANSFER  gold moves from one member to another          — auction_sale, market_sale, trade
//   RETURN    gold the member already had, coming back       — a void, a refund, a returned stake
//
// Halving a TRANSFER charges the buyer full price and pays the seller half — the missing half is not saved, it
// is destroyed, and the seller is the one who paid for it. Halving a RETURN is worse: it takes gold from a
// member because an action they did not complete failed. Both are theft dressed as a nerf.
//
// So the set below is EXPLICIT and additive. A reason that is not listed is not nerfed. That is deliberately
// the safe direction to be wrong in: a new earner that nobody adds here pays full rate and shows up as an
// outlier in the coin economy screen, which is visible. The opposite default would quietly start shaving
// refunds the first time somebody invented a new one.
const MINT_REASONS = new Set([
    // -- the big earners --
    "delve", "harvest", "harvest_loot", "xp_accrual", "spin_prize", "arena_win", "arena_armoury",
    "farm_encounter", "fishing", "mining", "quest_reward", "town_quest",
    // -- dailies and streaks (farm/sailing/cooking/casino all come out of feature-dailies.js) --
    "checkin", "farm_daily", "sailing_daily", "cooking_daily", "casino_daily", "forge_daily", "wishing_well",
    // -- combat and events --
    "ship_battle", "raid_complete", "town_duel", "boss_reward",
    // -- collection and progression --
    "badge_reward", "badge_milestone", "loot_pig", "chest_reward", "pet_income",
    // -- guided play --
    "guide_step", "guide_chapter", "onboarding", "merchant_minigame",
]);

// -- AND WHY THE GAMBLING PAYOUTS ARE NOT IN THAT LIST ------------------------------------------------------
// A slot win and a blackjack win LOOK like the biggest faucets in the ledger, and they are the one place a
// blanket halving does real damage. Every one of them is a payout against a stake the member already put in,
// so the number that matters is the NET, and over the last seven days the casino's net was MINUS 75,883 gold:
// it is a sink. Halving only the wins does not halve a faucet, it halves the RTP -- the slots would pay ~46%
// against a house-edge ceiling of 95% and check:casino would fail, correctly, because that machine is a scam
// rather than a nerf. The tavern gambit is the same shape (89k paid out against 70k staked, net +14.8k).
//
// If those need tuning it is done in the paytable, where the gate can see it, and it is measured on the net.
// See the memory note: nerf by daily total, not per event.

/** Is this reason a faucet? Exported so a test — or the coin-economy screen — can ask without re-listing. */
export const mints = (reason) => MINT_REASONS.has(reason);

/**
 * Size a reward on its way out.
 *
 * `mint(120, "harvest")` → 60. `mint(120, "trade_refund")` → 120, untouched.
 *
 * Rounds to a whole coin and never rounds a real reward down to nothing: a 1-gold prize stays 1 rather than
 * becoming 0, because a reward that pays zero reads as a bug to the member receiving it. A genuine 0 stays 0.
 */
export function mint(amount, reason) {
    const n = Number(amount) || 0;
    if (!n || !MINT_REASONS.has(reason)) return n;
    if (n < 0) return n; // a negative is a spend that got mislabelled; leave it alone rather than double it
    return Math.max(1, Math.round(n * GOLD_MINT_RATE));
}
