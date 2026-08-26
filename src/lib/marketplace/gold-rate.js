import "server-only";

// ── THE MINT RATE ────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "we need an across the board nerf on gold given out by 50 percent." Then, the next day, twice: "did we
// nerf all sources of coin today?" and "nerf."
//
// One number, one place. Every source that CREATES gold runs its reward through `mint()` on the way out, so the
// whole economy's faucet is this constant and re-tuning it later is a one-line change rather than another sweep
// of thirty features. 91.4% of a day's minting goes through it — the rest is transfers, returns and casino
// payouts, none of which may be rated (see MINT_REASONS below for why).
//
// ── 0.5 -> 0.4, AND WHAT THE LEDGER SAID FIRST ───────────────────────────────────────────────────────────────
// Worth writing down because the measurement disagreed with the instruction and the instruction won, which is
// the right outcome but only if the next person can see both halves.
//
//   30 days   minted 7,593,504   burned 7,150,941   net +442,563   sink  94.2%
//    7 days   minted 2,084,881   burned 2,105,717   net  -20,836   sink 101.0%
//    3 days   minted   898,955   burned   914,685   net  -15,730   sink 101.7%
//    1 day    minted   235,541   burned   269,212   net  -33,671   sink 114.3%
//
// The 30-day figure is what the dashboard shows and it says the supply is inflating. It also straddles the
// halving above. Every window since is already contracting, and the most recent is contracting hardest — so
// on the three-day rule this codebase uses to judge a faucet, a further cut was not indicated. Luke's call
// against that, and it is his to make: the number that matters to him is what a day's play is worth to a
// member, not the aggregate.
//
// WHAT 0.4 DOES, on today's traffic: rated minting falls from 215,293 to 172,234 a day, total minting to
// ~192,000 against ~269,000 burned — about -77,000 a day against a circulating supply of 393,318.
//
// THAT PROJECTS TO AN EMPTY ECONOMY IN FIVE DAYS, and it will not happen, for a reason worth being explicit
// about: spending is bounded by holdings. As members run short they stop buying upgrades — and today's burn is
// unusually upgrade-heavy (mining_upgrade 54k, upgrade 53k in one day, both one-time purchases people are
// working through right now). Burn will fall to meet the faucet on its own. What a member will actually feel
// is being poorer, which is what a nerf is.
//
// ⚠️ WATCH THE 1-DAY WINDOW rather than the 30-day one for the next few days. If supply keeps falling after
// the upgrade rush finishes, this is the line to move back up. Do not judge it on the dashboard's default
// 30-day view, which will keep showing the pre-halving era for another three weeks.
export const GOLD_MINT_RATE = 0.4;

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

// ── AND THE BIGGEST NINE PAY HALF AGAIN ──────────────────────────────────────────────────────────────────────
// Luke, looking at the by-source panel: "can you nerf the top 10 sources by half."
//
// Measured off the ledger rather than off the screenshot, so the list is what the ledger actually says rather
// than what fitted on a phone. Over thirty days these are the top ten faucets, and the top TEN are 65.5% of
// all minting — 4,975,023 of 7,594,142:
//
//     arena_win        953,417        farm_encounter    317,405
//     harvest          785,486        tavern_gambit_win 306,422   <- NOT in this set, see below
//     delve            645,418        farm_daily        294,290
//     spin_prize       627,273        sailing_daily     252,490
//     xp_accrual       542,897        quest_reward      249,925
//
// A SECOND FACTOR RATHER THAN A SECOND RATE. GOLD_MINT_RATE stays the floor under everything and this is a
// multiplier on top of it for the named few, so there is still one global lever and one explicit list of
// exceptions. The alternative — moving the global rate far enough to fix the top of the list — would drag
// every small earner down with it, and the small earners are not the problem.
//
// Effective rate for anything in here is GOLD_MINT_RATE x 0.5, which today is 0.2.
const HEAVY_FAUCET_FACTOR = 0.5;
const HEAVY_FAUCETS = new Set([
    "arena_win", "harvest", "delve", "spin_prize", "xp_accrual",
    "farm_encounter", "farm_daily", "sailing_daily", "quest_reward",
]);

// ── WHY THE TAVERN GAMBIT IS NOT IN THAT SET, THOUGH IT IS IN THE TOP TEN ────────────────────────────────────
// It is a GAMBLING PAYOUT and the same argument as the casino applies (see the note above MINT_REASONS). Over
// the same thirty days it paid out 306,422 against 247,000 staked — so as a faucet it is worth its NET, which
// is 59,422, or 0.8% of all minting. Halving the payout does not halve a faucet, it halves the return: 153,000
// paid against 247,000 staked is an RTP of 62%, which is not a nerf, it is a rigged table.
//
// It is also why it was never in MINT_REASONS to begin with, so nothing here is being carved out — it was
// already outside the faucet machinery. If the gambit needs tuning it is done in its own paytable and judged
// on the net, which is the rule this file already states for the casino.

/** Is this reason a faucet? Exported so a test — or the coin-economy screen — can ask without re-listing. */
export const mints = (reason) => MINT_REASONS.has(reason);

/** Is this one of the named heavy faucets that pays half again? Exported for the same reason as `mints`. */
export const heavy = (reason) => HEAVY_FAUCETS.has(reason);

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
    // The named heavy faucets pay half again on top of the global rate — see HEAVY_FAUCETS.
    const rate = GOLD_MINT_RATE * (HEAVY_FAUCETS.has(reason) ? HEAVY_FAUCET_FACTOR : 1);
    return Math.max(1, Math.round(n * rate));
}
