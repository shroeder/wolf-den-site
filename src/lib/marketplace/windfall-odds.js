// ── THE WINDFALL: THE ODDS ───────────────────────────────────────────────────────────────────────────────────
// PURE. No DB, no server-only — deliberately, so scripts/check-windfall.mjs can measure what the SERVER will
// actually pay rather than a second copy of these numbers that agrees with them today. A lottery whose odds
// are only checkable by reading them is a lottery that drifts.
// ── THE WINDFALL ─────────────────────────────────────────────────────────────────────────────────────────────
// The four rarest chests drop from ORDINARY PLAY, out of every system in the game that hands out loot.
//
// Before this they had exactly one source between them: a lottery riding on every tenth level from 20. Sixteen
// days of grant history had produced seven Ascendants and ZERO Eternals, Celestials or Primordials — which is
// not "rare", it is "does not happen", and it is why the two chests whose whole purpose is to pay Celestial and
// Primordial gear had never been held by anybody.
//
// Luke set the shape: *"we just have to decide how to add to each one of them the ability to get these rare
// chests, but make it so that it's like a very very rare thing... I would rather they randomly get it maybe
// once once a year. You know? Super, super rare."*
//
// ── THE ODDS ARE SET AGAINST A MEASURED NUMBER, NOT A GUESS ──────────────────────────────────────────────────
// "Once a year" means nothing until you know how many rolls a year is, so the rate was set against the real
// ledger. Over the 30 days to 2026-08-12, across 89 members active in that window, the game wrote 29,030
// positive coin events; stripping the ones that are not loot (see DENY below) leaves ~17,850 genuine drops —
// about 200 per active member per month, so roughly 2,440 loot events per member per year.
//
// Weighted (below), that is ~61,500 tickets a month, ~748,000 a year across the community. At the rates in
// WINDFALL_TIERS that lands, community-wide and per year:
//
//     Ascendant    ~60     one every six days somewhere in the Den
//     Eternal      ~30     one every two weeks
//     Celestial    ~9      one every six weeks
//     Primordial   ~2      twice a year, and it should stop the room
//
// Per member that is about one rare chest a year each and a Primordial roughly once every forty years, which
// is the "super, super rare" the brief asked for. Re-run scripts/check-windfall.mjs after touching any number
// here; it re-reads the live ledger and prints this table, so it cannot quietly drift as the game grows.
export const WINDFALL_TIERS = [
    { tier: "primordial", chance: 0.000003 },
    { tier: "celestial", chance: 0.000012 },
    { tier: "eternal", chance: 0.000040 },
    { tier: "ascendant", chance: 0.000080 },
];

// ── WHAT A TICKET IS WORTH ───────────────────────────────────────────────────────────────────────────────────
// A flat rate per loot event would have made this a farming feature and nothing else: harvesting, fishing and
// mining alone are 42% of every drop in the game, so "across every system" would have meant "go and tend crops".
// An event is therefore worth tickets in proportion to what it COST you, which keeps every system a real
// source without making the cheapest one the only sensible one.
//
//   1   a tap on a timer — a crop, a fish, a seam. You will do thousands of these.
//   4   a real action with a cooldown or a stake behind it — a duel, a bout, a voyage, a spin.
//   5   something finished — a daily, a quest, a badge, a chapter of the guide.
//  40   the big ones. A boss, a raid, a town event: the things a whole town turns up for.
//
// Anything NOT listed defaults to 1, on purpose: a system shipped next month should be a windfall source the
// day it ships, not the day somebody remembers to add it here. The things that must never pay a ticket are
// named in DENY instead, and they are all the same kind of thing — gold that moved rather than gold that was
// found. Without that list, two accounts trading a single coin back and forth would be the best farm in the
// game, and an admin correction would roll the lottery.
const WEIGHTS = {
    harvest: 1, harvest_loot: 1, fishing: 1, mining: 1, farm_encounter: 1, loot_pig: 1, wishing_well: 1,
    town_duel: 4, arena_win: 4, ship_battle: 4, delve: 4, delve_merchant: 4, merchant_minigame: 4,
    merchant_chest: 4, spin_prize: 4, tavern_gambit_win: 4, cooking: 4, sailing: 4,
    farm_daily: 5, sailing_daily: 5, forge_daily: 5, cooking_daily: 5, checkin: 5, quest_reward: 5,
    town_quest: 5, guide_step: 5, guide_chapter: 5, badge_reward: 5, badge_milestone: 5, onboarding: 5,
    giveaway: 5, happy_hour: 5, town_project: 5,
    boss_raid: 40, boss_reward: 40, raid_complete: 40, raid_defense: 40, raid_loss: 40, town_event: 40,
    bounty_win: 5, chest_reward: 1, merchant_gamble: 4, mining_trip: 4,
};

// GOLD THAT MOVED, NOT GOLD THAT WAS FOUND — plus the one passive trickle. Every entry here is a hole if it is
// left out: `xp_accrual` alone is 10,669 events a month of pure idle income and would have been the single
// largest source in the game; `trade`, `auction_sale` and the refunds are two accounts handing each other the
// same coin; `admin_grant` and `coin_grant` would make a support correction roll a lottery.
const DENY = new Set([
    // IDLE INCOME. Neither of these is a drop — one is earner pets ticking over while the app is closed and
    // the other pays interest on a balance. Rewarding a bank statement with the rarest object in the game is
    // the exact opposite of "drops from ordinary play", and xp_accrual alone is 10,669 events a month.
    "xp_accrual", "pet_income", "checkin_interest",
    // GOLD THAT MOVED BETWEEN TWO PEOPLE. Without these, two accounts passing the same coin back and forth
    // is the best farm in the game, and it is a farm that costs nothing and leaves no trace.
    "trade", "trade_escrow", "trade_refund", "auction_sale", "auction_buy", "sell_gear",
    "store_credit", "purchase", "gift", "transfer",
    // MONEY COMING BACK. A refund is the reversal of a spend, not a reward — pay a ticket for one and every
    // cancelled trade or lost gamble becomes a free roll.
    "refund", "bounty_refund", "merchant_gamble_refund", "arena_armoury", "rate_doubling_backpay",
    // HANDED OVER BY A PERSON, not found. A support correction must never roll a lottery.
    "admin_grant", "coin_grant", "referral_bonus", "referral_joined",
]);

/** Tickets an event of this kind is worth. 0 means it never rolls. */
export function windfallWeight(reason) {
    const r = String(reason || "");
    if (!r || DENY.has(r)) return 0;
    return WEIGHTS[r] ?? 1;
}
