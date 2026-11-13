// ── WHAT THE SHOP CHARGES TO POST A PARCEL ───────────────────────────────────────────────────────────────────
// Luke, 2026-11-13: "since we don't even end up using the Easy Post actual... I end up having to just select
// my own shipping, and it ends up being way more expensive... I wonder if the Easy Post is a constraint we
// don't need right now that we could just hide, and then we come up with our own shipping amount. That way
// the customer isn't selecting shipping instructions that we're not delivering on."
//
// The numbers say he is right, and they say it plainly. Of **13 shipping orders ever taken, exactly ONE had
// its label bought through the system.** So the carrier rate picker set the price on all thirteen and was
// used to actually ship one of them — the customer chose a service, the shop posted it some other way at the
// counter, and the difference came out of the margin every time.
//
// It was also structurally doomed to undercharge, because the two prices are quoted in different worlds: the
// buyer pays EasyPost's *discounted* rate and the shop pays *retail* at the counter. Nothing in the old path
// could ever close that gap; it was not a bug to find, it was the design.
//
// Backtested against all thirteen orders, this table would have collected **$227.00 against $112.31** — and
// only one of the thirteen (a 34-cent order in July) would have been charged less than it was.
//
// ⚠️ THIS FILE IS PURE: NO ENV, NO `server-only`, NO IMPORTS. The cart quotes shipping, the checkout charges
// it, the buyer's screen shows it and Square is told the same figure — four consumers that must agree to the
// cent, exactly as shop-tax-base.js says of the tax rule it exists to hold. A second copy of a shipping
// calculation is how a checkout displays one number and charges another.

/**
 * Charge our own banded rate instead of offering carrier rates at checkout.
 *
 * ⚠️ TURNING THIS OFF PUTS THE RATE PICKER BACK, and that is the only thing it does. The EasyPost code is
 * untouched and the admin label purchase still works — the one thing being switched off is making a CUSTOMER
 * choose a service, because choosing is the part the shop was not honouring.
 */
export const OWN_SHIPPING = true;

// ── THE TABLE ───────────────────────────────────────────────────────────────────────────────────────────────
// Banded on the weight already estimated for every order (see parcelEstimate — it reads category, type and
// price, and multiplies BOTH weight and size by quantity). Seeded from what these services retail at rather
// than what EasyPost quotes, because retail at the counter is what the shop actually pays.
//
// ⚠️ THESE ARE LUKE'S NUMBERS TO SET AND THEY ARE ONLY SEEDED HERE. The estimator is measured; the prices are
// a starting point taken from public Ground Advantage and UPS Ground retail. Check them against a few real
// receipts and edit this list — nothing else needs to change.
export const SHIPPING_BANDS = [
    { maxOz: 4, cents: 500, label: "up to 4 oz" },        // a few singles in a plain mailer
    { maxOz: 16, cents: 800, label: "up to 1 lb" },
    { maxOz: 48, cents: 1300, label: "up to 3 lb" },      // a few sealed boxes
    { maxOz: 80, cents: 1800, label: "up to 5 lb" },
    { maxOz: 160, cents: 2500, label: "up to 10 lb" },
    { maxOz: Infinity, cents: 3500, label: "over 10 lb" },
];

/**
 * The shipping charge for a parcel of `weightOz`.
 *
 * ⚠️ IT FAILS UPWARD. An unknown or nonsense weight takes the TOP band, not the bottom one — the failure that
 * has cost this shop money thirteen times is under-charging, so the direction a broken input falls has to be
 * the safe one. [[ladder-lookups-must-fail-upward]]
 */
export function bandedShippingCents(weightOz) {
    const oz = Number(weightOz);
    if (!Number.isFinite(oz) || oz <= 0) return SHIPPING_BANDS[SHIPPING_BANDS.length - 1].cents;
    return (SHIPPING_BANDS.find((band) => oz <= band.maxOz) || SHIPPING_BANDS[SHIPPING_BANDS.length - 1]).cents;
}
