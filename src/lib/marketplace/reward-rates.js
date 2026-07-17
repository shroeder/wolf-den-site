// Central tuning for scan-to-earn reward XP by transaction type.
//
// Payouts (trades + restock buyouts) reward at a DISCOUNT: we're paying the customer money/credit, so the
// deal value only partially counts toward XP. Donations get a slight BOOST as a thank-you for giving.
//
// These apply to the value-driven portion of each reward (the flat per-scan bonus is unaffected).

export const PAYOUT_REWARD_RATE = 0.5; // trades + restock buys: 50% of deal value counts toward XP
export const DONATION_REWARD_MULTIPLIER = 1.25; // donations reward 1.25x face value
