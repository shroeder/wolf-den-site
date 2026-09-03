import { WEDGES } from "@/lib/marketplace/wheel-geometry.js";

// ── WHAT THE COUNTER WHEEL PAYS ──────────────────────────────────────────────────────────────────────────────
// Luke: "rewards are in store discounts, all different kinds."
//
// ⚠️ THIS IS THE FILE TO EDIT. Every number a customer can win is on this page and nowhere else. Change a
// `face`, a `label` or a `weight` here and the wheel, the result card and the odds all follow.
//
// ── IT IS HONOUR-BASED, AND THAT IS A DELIBERATE CHOICE ──────────────────────────────────────────────────────
// Luke's call: whoever is at the counter honours whatever the screen says. No code, no token, no account —
// which means there is also nothing stopping somebody tapping the wheel until they like the answer. Two things
// keep that survivable, and both live here rather than in the component:
//
//   1. THE TOP WEDGES ARE CHEAP TO BE WRONG ABOUT. Nothing on this wheel is worth more than about ten dollars
//      of margin, because the worst case is not "somebody won it" — it is "somebody won it four times in a
//      row while nobody was looking". Anything that would hurt to hand over repeatedly does not belong here.
//   2. THE FLOOR IS NEVER NOTHING. There is no "no win" wedge. A stranger who walks up, spins, and is told
//      they get nothing has been given a reason to stop looking at the screen — and the screen's whole job is
//      to still be interesting when the next person walks past.
//
// The disc art is painted with exactly 20 physical wedges, so this list is exactly 20 long (see the throw at
// the bottom — the same contract WHEEL_WEDGES enforces for the member's wheel).
//
// `face` is what is painted on the wedge: short, and a NUMBER wherever there is one, because a number is what
// sells a discount from six feet away. `label` is the full offer, shown on the result card once it lands.
// `fine` is the qualifier that keeps the counter honest — the condition staff would otherwise have to
// improvise at the till.
export const COUNTER_DISCOUNTS = [
    // ── THE EVERYDAY WEDGES ──────────────────────────────────────────────────────────────────────────────
    // Between them these are ~69% of all spins. Each one is a small, immediate yes.
    { face: "5%", sub: "a single", label: "5% off any single card", fine: "One card, this visit.", weight: 12 },
    { face: "FREE", sub: "sleeves", label: "A free pack of penny sleeves", fine: "One pack, with any purchase.", weight: 10 },
    { face: "$1", sub: "a pack", label: "$1 off any booster pack", fine: "One pack, this visit.", weight: 10 },
    { face: "10%", sub: "supplies", label: "10% off supplies", fine: "Sleeves, boxes, binders, toploaders.", weight: 9 },
    { face: "5%", sub: "everything", label: "5% off your whole purchase", fine: "This visit.", weight: 9 },
    { face: "10%", sub: "a single", label: "10% off any single card", fine: "One card, this visit.", weight: 8 },
    { face: "$2", sub: "mystery pack", label: "$2 off a mystery pack", fine: "One pack, this visit.", weight: 8 },
    { face: "FREE", sub: "toploader", label: "A free toploader", fine: "With any purchase.", weight: 8 },
    { face: "10%", sub: "bulk", label: "10% off bulk singles", fine: "This visit.", weight: 7 },
    { face: "FREE", sub: "deck box", label: "A free deck box", fine: "With any purchase over $10.", weight: 7 },

    // ── THE MIDDLE ───────────────────────────────────────────────────────────────────────────────────────
    // Worth telling somebody about, still small enough to hand over without thinking about it.
    { face: "$5", sub: "a box", label: "$5 off a booster box", fine: "One box, this visit.", weight: 6, tier: "good" },
    { face: "15%", sub: "a single", label: "15% off any single card", fine: "One card, this visit.", weight: 6, tier: "good" },
    { face: "10%", sub: "everything", label: "10% off your whole purchase", fine: "This visit.", weight: 5, tier: "good" },
    { face: "BOGO", sub: "bulk", label: "Buy one get one half price on bulk", fine: "Cheaper card is the half-price one.", weight: 5, tier: "good" },
    { face: "FREE", sub: "pack", label: "A free booster pack", fine: "With any purchase over $25.", weight: 5, tier: "good" },
    { face: "$5", sub: "credit", label: "$5 in store credit", fine: "Added to your account at the counter.", weight: 4, tier: "good" },

    // ── THE ONES PEOPLE TELL THEIR FRIENDS ABOUT ─────────────────────────────────────────────────────────
    // ~7% of spins between them, and the top wedge is under 1%. See the note above about why none of these is
    // a big number: they are the ones most likely to be won by somebody who tapped four times.
    { face: "20%", sub: "a single", label: "20% off any single card", fine: "One card, this visit.", weight: 3, tier: "rare" },
    { face: "$10", sub: "a box", label: "$10 off a booster box", fine: "One box, this visit.", weight: 3, tier: "rare" },
    { face: "FREE", sub: "mystery pack", label: "A free mystery pack", fine: "One pack, this visit.", weight: 2, tier: "rare" },
    { face: "25%", sub: "everything", label: "25% off your whole purchase", fine: "This visit. Excludes sealed boxes.", weight: 1, tier: "top" },
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
