import { WEDGES } from "@/lib/marketplace/wheel-geometry.js";

// ── WHAT THE COUNTER WHEEL PAYS ──────────────────────────────────────────────────────────────────────────────
// Luke: "rewards are in store discounts, all different kinds." Then, narrowing it: "no bulk or sleeves or
// supplies, just use percent off on purchase above x and store credit. with top ones being free pack or
// mystery pack."
//
// ⚠️ THIS IS THE FILE TO EDIT. Every number a customer can win is on this page and nowhere else. Change a
// `face`, a `label` or a `weight` here and the wheel, the result card and the odds all follow.
//
// ── THREE FAMILIES, AND WHY IT IS MOSTLY THE FIRST ONE ───────────────────────────────────────────────────────
// A PERCENTAGE AGAINST A MINIMUM SPEND is the only discount on the wheel that cannot cost anything by itself:
// it pays out on a sale that has already happened, and the customer chose how big that sale was. Fourteen of
// the twenty wedges are this, and that is what makes an unattended wheel affordable at all.
//
// STORE CREDIT is a real cost with no sale attached, so the ladder is short and stops at $10. It earns its
// place because it is the only wedge that gives somebody a reason to come BACK — every percentage is spent
// today or not at all.
//
// A FREE PACK is the worst deal on the wheel and the best story on it, which is exactly why it is the top.
// Nobody walks across a shop for 5% off. Both free wedges carry "with any purchase" — see the note on them.
//
// ── IT IS HONOUR-BASED, AND THAT IS A DELIBERATE CHOICE ──────────────────────────────────────────────────────
// Luke's call: whoever is at the counter honours whatever the screen says. No code, no token, no account —
// which means there is also nothing stopping somebody tapping the wheel until they like the answer. Three
// things keep that survivable, and all three live here rather than in the component:
//
//   1. NOTHING PAYS OUT WITHOUT A SALE except store credit, which tops out at $10. The case to design for is
//      not "somebody won it", it is "somebody won it four times in a row while nobody was looking" — and a
//      percentage won four times is still just a discount on one purchase.
//   2. THE EXPENSIVE WEDGES ARE CONDITIONAL. The free pack and the free mystery pack are the only items that
//      leave the shop, and both need a purchase attached before they do.
//   3. THE FLOOR IS NEVER NOTHING. There is no "no win" wedge. A stranger who walks up, spins, and is told
//      they get nothing has been given a reason to stop looking at the screen — and the screen's whole job is
//      to still be interesting when the next person walks past.
//
// The disc art is painted with exactly 20 physical wedges, so this list is exactly 20 long (see the throw at
// the bottom — the same contract WHEEL_WEDGES enforces for the member's wheel).
//
// `face` is what is painted on the wedge: short, and a NUMBER wherever there is one, because a number is what
// sells a discount from six feet away. `sub` is the qualifier under it. `label` is the full offer, shown on the
// result card once it lands, and `fine` is the condition staff would otherwise have to improvise at the till.
export const COUNTER_DISCOUNTS = [
    // ── THE PERCENT LADDER ───────────────────────────────────────────────────────────────────────────────
    // TWO THINGS MAKE ONE WEDGE BETTER THAN ANOTHER — a bigger percentage, or a lower bar to clear — and the
    // weights follow both. Nothing here is strictly worse than something else on the wheel: no two wedges
    // share a percentage AND a threshold, and where a percentage repeats, the easier one to qualify for is
    // the rarer one. A wedge somebody can look at and see is a dud makes the whole wheel feel rigged.
    { face: "5%", sub: "over $10", label: "5% off a purchase over $10", fine: "This visit.", weight: 13 },
    { face: "5%", sub: "anything", label: "5% off anything", fine: "No minimum, this visit.", weight: 9 },
    { face: "10%", sub: "over $25", label: "10% off a purchase over $25", fine: "This visit.", weight: 12 },
    { face: "10%", sub: "over $15", label: "10% off a purchase over $15", fine: "This visit.", weight: 9 },
    { face: "10%", sub: "anything", label: "10% off anything", fine: "No minimum, this visit.", weight: 6 },
    { face: "15%", sub: "over $50", label: "15% off a purchase over $50", fine: "This visit.", weight: 8 },
    { face: "15%", sub: "over $30", label: "15% off a purchase over $30", fine: "This visit.", weight: 6, tier: "good" },
    { face: "15%", sub: "over $20", label: "15% off a purchase over $20", fine: "This visit.", weight: 5, tier: "good" },
    { face: "20%", sub: "over $75", label: "20% off a purchase over $75", fine: "This visit.", weight: 5, tier: "good" },
    { face: "20%", sub: "over $50", label: "20% off a purchase over $50", fine: "This visit.", weight: 4, tier: "good" },
    { face: "20%", sub: "over $30", label: "20% off a purchase over $30", fine: "This visit.", weight: 3, tier: "rare" },
    // ⚠️ 25% IS THE CEILING, AND IT IS A MARGIN DECISION RATHER THAN A DESIGN ONE. Singles and sealed do not
    // carry enough for a bigger number to still be a discount rather than a loss, so the ladder stops here and
    // buys its excitement from the free-pack wedges below instead.
    { face: "25%", sub: "over $100", label: "25% off a purchase over $100", fine: "This visit. Excludes sealed boxes.", weight: 3, tier: "rare" },
    { face: "25%", sub: "over $75", label: "25% off a purchase over $75", fine: "This visit. Excludes sealed boxes.", weight: 2, tier: "rare" },
    { face: "25%", sub: "over $50", label: "25% off a purchase over $50", fine: "This visit. Excludes sealed boxes.", weight: 2, tier: "rare" },

    // ── STORE CREDIT ─────────────────────────────────────────────────────────────────────────────────────
    { face: "$2", sub: "credit", label: "$2 in store credit", fine: "Added at the counter.", weight: 9 },
    { face: "$3", sub: "credit", label: "$3 in store credit", fine: "Added at the counter.", weight: 7 },
    { face: "$5", sub: "credit", label: "$5 in store credit", fine: "Added at the counter.", weight: 5, tier: "good" },
    { face: "$10", sub: "credit", label: "$10 in store credit", fine: "Added at the counter.", weight: 2, tier: "rare" },

    // ── THE TOP OF THE WHEEL ─────────────────────────────────────────────────────────────────────────────
    // ⚠️ BOTH CARRY "with any purchase", and that condition is doing real work: it is the difference between
    // the top of this wheel being a discount and being a giveaway to whoever walks in off the street and taps
    // it. The screen is unattended and honour-based — see the note at the top of this file. Take the condition
    // off and a $20 mystery pack leaves the shop for nothing, repeatedly, on the days nobody is watching.
    { face: "FREE", sub: "pack", label: "A free booster pack", fine: "With any purchase.", weight: 2, tier: "rare" },
    { face: "FREE", sub: "mystery pack", label: "A free mystery pack", fine: "With any purchase.", weight: 1, tier: "top" },
];

// The disc is a painting, not a generated graphic: a 21st entry would be drawn on top of the first one at dead
// top, exactly as happened to the member's wheel when its list grew past 20. Fail the build, not the customer.
if (COUNTER_DISCOUNTS.length !== WEDGES) {
    throw new Error(`counter-discounts has ${COUNTER_DISCOUNTS.length} offers but the disc art has ${WEDGES} wedges — repaint wheel-disc.png or fix the list`);
}

const TOTAL_WEIGHT = COUNTER_DISCOUNTS.reduce((s, d) => s + d.weight, 0);

/** The odds of each wedge, as a percentage — for anyone checking what this wheel actually pays out. */
export const discountOdds = () => COUNTER_DISCOUNTS.map((d) => ({
    label: d.label,
    pct: Math.round((d.weight / TOTAL_WEIGHT) * 1000) / 10,
}));

/** Pick a wedge by weight. */
export function rollDiscount() {
    let r = Math.random() * TOTAL_WEIGHT;
    for (let i = 0; i < COUNTER_DISCOUNTS.length; i += 1) {
        r -= COUNTER_DISCOUNTS[i].weight;
        if (r <= 0) return i;
    }
    return COUNTER_DISCOUNTS.length - 1;
}
