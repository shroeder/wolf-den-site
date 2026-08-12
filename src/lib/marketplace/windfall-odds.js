// ── THE WINDFALL: THE ODDS ───────────────────────────────────────────────────────────────────────────────────
// PURE. No DB, no server-only — deliberately, so scripts/check-windfall.mjs can measure what the SERVER will
// actually pay rather than a second copy of these numbers that agrees with them today. A lottery whose odds
// are only checkable by reading them is a lottery that drifts.
//
// ── THE FOUR RAREST CHESTS ARE A DROP, NOT A LOTTERY ─────────────────────────────────────────────────────────
// The first pass hung a roll on the gold ledger, so anything that paid a coin rolled for a chest. It worked,
// and it was the wrong shape: it made the rarest object in the game a thing that happened NEXT TO what you
// were doing rather than a thing that came OUT of it, and it tied the drop to gold — so a system that pays in
// fish or ore or a floor cleared was worth nothing.
//
// Luke: *"we have a bunch of systems — fishing farming Arena sailing digging etc etc — and all of these
// systems have Rewards and so across all those different systems and all the rewards we can tie our new
// chests in to those as long as they're super duper rare."*
//
// So every source below is a REAL CALL in the system that owns it: fishing rolls when you land a fish, the
// farm when you pull a crop, the arena when you win a bout, the boss when you strike it. Nothing rolls by
// accident and nothing rolls because gold moved.
//
// ── THE NAMES ARE THE LEDGER'S NAMES, ON PURPOSE ─────────────────────────────────────────────────────────────
// Every source key is exactly the coin reason that system already writes. That is what lets check-windfall.mjs
// measure the live volume of each source without a second lookup table sitting between the two — and a table
// like that is precisely how the odds and the reality drift apart.
//
// ── WHAT A TICKET IS WORTH ───────────────────────────────────────────────────────────────────────────────────
// A flat rate per drop would make this a farming feature and nothing else: crops, fish and ore alone are 42% of
// every reward event in the game. A drop is worth tickets in proportion to what it cost you.
//
//   1   a tap on a timer — a crop, a fish, a seam, a dig. You will do thousands of these.
//   4   a real action with a cooldown or a stake behind it — a duel, a bout, a voyage, a delve, a spin.
//   5   something finished — a daily, a quest, a badge, a chapter of the guide.
//  40   the big ones. A boss, a raid, a town event: the things a whole town turns up for.
//
// UNLISTED IS ZERO. There is no default: a source that is not in this table does not roll, and a typo in a
// call site is a source that silently never pays rather than one that silently always does. Wiring a new
// system is two lines — a key here, and the call in the system.
export const WINDFALL_SOURCES = {
    // ── TAPS ── the high-frequency ones. Thousands of these a month between everybody.
    harvest: 1,          // a crop pulled
    harvest_loot: 1,     // what the crop was hiding
    fishing: 1,          // a fish landed
    mining: 1,           // a node broken
    farm_encounter: 1,   // whatever wandered onto the farm
    loot_pig: 1,
    wishing_well: 1,
    chest_reward: 1,     // a chest opened. Bounded by chests owned, and a nice thing to find inside one.
    // ── ACTIONS ── something with a cooldown, a stake or a real chance of losing.
    town_duel: 4,        // a raider put down in the plaza
    arena_win: 4,        // a bout won, ladder included
    ship_battle: 4,
    delve: 4,            // a floor of the dungeon
    merchant_minigame: 4,
    spin_prize: 4,
    tavern_gambit_win: 4,
    cooking: 4,          // a dish that came out right
    sailing: 4,          // what a dig turned up. NOT a ledger reason — sailing pays in loot, so this one
                         // source is invisible to check-windfall.mjs, which prints it as unmeasured.
    // ── COMPLETIONS ── a thing you finished rather than a thing you did.
    farm_daily: 5, sailing_daily: 5, forge_daily: 5, cooking_daily: 5,
    checkin: 5, quest_reward: 5, town_quest: 5, bounty_win: 5,
    guide_step: 5, guide_chapter: 5, badge_reward: 5, badge_milestone: 5,
    onboarding: 5, giveaway: 5,
    // ── THE BIG ONES ──
    // raid_loss / town_event are ledger reasons written by awardXp rather than by a payout of their own, so
    // there is no moment to hang a roll on and they are deliberately absent. boss_reward is the boss's gold
    // line; the strike itself already rolls once as boss_raid, and rolling on both would pay a strike twice.
    boss_raid: 40, raid_complete: 40,
    raid_defense: 4,     // somebody raided YOU and you held. The one reward you never chose to go and get.
};

// ── WHAT DELIBERATELY DOES NOT ROLL ──────────────────────────────────────────────────────────────────────────
// Kept even though the table above is now an allow-list, because this is the REASONING and the balance script
// reads it to leave these out of the measured volume. Every one is a hole if it is ever added by mistake:
//
//   IDLE INCOME       xp_accrual, pet_income, checkin_interest. Earner pets ticking over while the app is shut
//                     and interest on a balance are not drops. xp_accrual alone is 10,669 events a month, and
//                     rewarding a bank statement with the rarest object in the game is the exact opposite of
//                     "it drops out of what you were doing".
//   GOLD THAT MOVED   trade, trade_escrow, trade_refund, auction_sale, auction_buy, sell_gear. Two accounts
//                     passing one coin back and forth would otherwise be the best farm in the game, and it
//                     costs nothing and leaves no trace.
//   MONEY COMING BACK refund, bounty_refund, merchant_gamble_refund, arena_armoury, rate_doubling_backpay. A
//                     refund is the reversal of a spend; pay a ticket for one and every cancelled trade is a
//                     free roll.
//   HANDED OVER       admin_grant, coin_grant, referral_bonus, referral_joined. A support correction must
//                     never roll a lottery.
export const WINDFALL_DENY = new Set([
    "xp_accrual", "pet_income", "checkin_interest",
    "trade", "trade_escrow", "trade_refund", "auction_sale", "auction_buy", "sell_gear",
    "store_credit", "purchase", "gift", "transfer",
    "refund", "bounty_refund", "merchant_gamble_refund", "arena_armoury", "rate_doubling_backpay",
    "admin_grant", "coin_grant", "referral_bonus", "referral_joined",
]);

/** Tickets a drop from this source is worth. 0 means it never rolls — including anything unlisted. */
export function windfallWeight(source) {
    return WINDFALL_SOURCES[String(source || "")] || 0;
}

// ── THE ODDS ─────────────────────────────────────────────────────────────────────────────────────────────────
// Set against the real ledger rather than guessed. Over the 30 days to 2026-08-12, across 89 members active in
// that window, the sources above fired 17,791 times — about 200 per active member per month, so roughly 2,400
// drops a member a year. Weighted, 55,615 tickets a month and ~677,000 a year across the community, which at
// these rates pays, per year (measured, not estimated — this is the script's own output):
//
//     Ascendant    54.1    one every 7 days somewhere in the Den      1 per member per 2 years
//     Eternal      27.1    one every 13 days                          1 per 3 years
//     Celestial     8.1    one every 45 days                          1 per 11 years
//     Primordial    2.0    twice a year, and it should stop the room   1 per 44 years
//
// Ticket share lands at 16% taps / 22% actions / 52% completions / 10% bosses and raids, largest single source
// badge_reward at 10.8% — so no one system is the feature, which is the thing a flat rate would have broken.
//
// Re-run scripts/check-windfall.mjs after touching any number here; it re-reads the live ledger and prints that
// table off these exact constants, so it cannot quietly drift as the game grows.
export const WINDFALL_TIERS = [
    { tier: "primordial", chance: 0.000003 },
    { tier: "celestial", chance: 0.000012 },
    { tier: "eternal", chance: 0.000040 },
    { tier: "ascendant", chance: 0.000080 },
];
