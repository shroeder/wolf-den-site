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
//   1   a tap on a timer — a crop, a fish, a seam. You will do thousands of these.
//   4   a fight or a dig — a duel, a bout, a voyage, a delve, a spin. Something with a stake behind it.
//  40   the big ones. A boss, a raid: the things a whole town turns up for.
//
// ── AND A CLAIM IS NOT A LOOT MOMENT ─────────────────────────────────────────────────────────────────────────
// The first cut of this rolled on fourteen more sources: badges, quests, the guide, the four feature dailies,
// the daily check-in, giveaways, onboarding, the wishing well, buried harvest loot. Every one of them is
// something you CLAIM — you press a button that hands you a thing you had already earned. Luke, on what that
// produces: *"it's going to say like oh you got a pet treat and then just randomly you get a chest... that's
// not what we're looking for we're looking for actual thoughtful ways to get these chests."* He is right, and
// it is the same objection as the ledger version wearing different clothes: a roll that rides along beside a
// hand-out is detached from anything you did, so it reads as noise however rare it is.
//
// The line is: A CHEST COMES OFF SOMETHING YOU DUG UP OR PUT DOWN. A crop, a fish, a seam, a dig, a raider, a
// bout, a boss, a floor of the dungeon, a chest you cracked open. Those are moments with a "what did I find"
// already built into them, and a chest belongs in that sentence. A daily reward does not have that sentence
// and never will, so it does not roll.
//
// UNLISTED IS ZERO. There is no default: a source that is not in this table does not roll, and a typo in a
// call site is a source that silently never pays rather than one that silently always does. Wiring a new
// system is two lines — a key here, and the call in the system.
export const WINDFALL_SOURCES = {
    // ── TAPS ── the high-frequency loot moments. Thousands of these a month between everybody.
    harvest: 1,          // a crop pulled out of the ground
    fishing: 1,          // a fish landed
    mining: 1,           // a seam broken open
    farm_encounter: 1,   // whatever wandered onto the farm, put down
    loot_pig: 1,         // the pig turned something up
    chest_reward: 1,     // a chest opened. Bounded by chests owned, and a fine thing to find inside one.
    // ── FIGHTS AND DIGS ── something with a cooldown, a stake, or a real chance of losing.
    town_duel: 4,        // a raider put down in the plaza
    arena_win: 4,        // a bout won, ladder included
    ship_battle: 4,
    raid_defense: 4,     // somebody raided YOU and you held
    delve: 4,            // a floor of the dungeon cleared
    merchant_minigame: 4,
    spin_prize: 4,
    tavern_gambit_win: 4,
    cooking: 4,          // a dish that came out right
    sailing: 4,          // what a dig turned up. NOT a ledger reason — sailing pays in loot, so this one
                         // source is invisible to check-windfall.mjs, which prints it as unmeasured.
    // ── THE BIG ONES ──
    // ── A STRIKE IS AN ACTION, NOT "THE BIG ONE" ─────────────────────────────────────────────────────────
    // boss_raid was 40 — the band reserved for "a boss, a raid: the things a whole town turns up for". That
    // is the right weight for a boss KILL and the wrong one for what the call site actually does: boss.js
    // rolls on every MANUAL STRIKE, of which the Den throws about sixty a day.
    //
    // The error hid because check-windfall could not see it. A strike only writes a coin row when the
    // Prospector signature pays, so the ledger showed 2.4 boss rolls a day against a real 59.6, and the
    // script happily reported one celestial per 42 days while boss strikes alone were paying one per 17.
    // Measured properly, boss_raid was 72.8% of every ticket in the game and all four tiers were landing at
    // roughly 3.3x their intended rate — one ascendant every two days, one celestial every thirteen.
    //
    // 4 is the band a strike belongs in: "a fight or a dig — something with a stake behind it". raid_complete
    // keeps its 40, because a town raid IS the whole-town event that band was written for.
    boss_raid: 4, raid_complete: 40,
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
// A CLAIM IS NOT A LOOT MOMENT — see the note above WINDFALL_SOURCES. These are all real rewards and none of
// them roll, on purpose. Listed so the balance script reports them as a decision rather than as a system
// somebody forgot to wire, which is what an unexplained gap in that output turns into after a month.
export const WINDFALL_NOT_LOOT = new Set([
    "badge_reward", "badge_milestone", "guide_step", "guide_chapter", "quest_reward", "town_quest",
    "bounty_win", "checkin", "onboarding", "giveaway", "farm_daily", "sailing_daily", "forge_daily",
    "cooking_daily", "harvest_loot", "wishing_well", "town_project", "happy_hour",
    // Written by awardXp rather than by a payout of their own, so there is no moment to hang a roll on.
    "town_event", "raid_loss",
    // The boss's gold line. The strike itself already rolls once as boss_raid; rolling here would pay twice.
    "boss_reward",
]);

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
// Set against the real ledger rather than guessed, and re-measured after the claim sources were cut. Over the
// 30 days to 2026-08-12, across 89 members active in that window, the LOOT MOMENTS above fired 11,901 times —
// with a further 6,294 claims that deliberately do not roll. Weighted, 27,102 tickets a month and ~330,000 a
// year across the community, which at these rates pays, per year (measured — this is the script's own output):
//
//     Ascendant    52.8    one every 7 days somewhere in the Den      1 per member per 2 years
//     Eternal      26.4    one every 14 days                          1 per 3 years
//     Celestial     7.9    one every 46 days                          1 per 11 years
//     Primordial    2.0    twice a year, and it should stop the room   1 per 45 years
//
// Ticket share is 31% taps / 48% fights and digs / 20% bosses and raids, and 0% claims. Halving the sources
// halved the payout, so these rates are double the first cut's — the target table is what was agreed, and it
// is the thing held constant when the sources change.
//
// Re-run scripts/check-windfall.mjs after touching any number here; it re-reads the live ledger and prints that
// table off these exact constants, so it cannot quietly drift as the game grows.
export const WINDFALL_TIERS = [
    { tier: "primordial", chance: 0.000006 },
    { tier: "celestial", chance: 0.000024 },
    { tier: "eternal", chance: 0.000080 },
    { tier: "ascendant", chance: 0.000160 },
];
