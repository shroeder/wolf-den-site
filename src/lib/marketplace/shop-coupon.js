import "server-only";

import { db } from "@/lib/db";

// Pure: the discounted price for a coupon ({ pct, max } | null) applied to `price`, or the original price
// unchanged when there's no coupon or the item is over the coupon's cap. Shared by the server preview and by
// the shop state builders (so on-screen prices + affordability match what the buy actually charges).
export function couponedPrice(coupon, price) {
    if (!coupon?.pct || price > (coupon.max || 0)) return price;
    return Math.max(1, Math.round(price * (1 - coupon.pct / 100)));
}

// A member's single active shop coupon (granted by a login-proc item). previewShopCoupon computes the
// discounted price WITHOUT consuming (so a failed purchase can't waste it); consumeShopCoupon clears it after
// a successful buy.
export async function previewShopCoupon(buyerId, price) {
    const coupon = await getShopCoupon(buyerId).catch(() => null);
    const discounted = couponedPrice(coupon, price);
    return { price: discounted, pct: discounted < price ? coupon.pct : 0 };
}

// ── AND THE HAGGLE, WHICH IS THE OTHER HALF OF EVERY GOLD PRICE ──────────────────────────────────────────────
// ⚠️ THE ABILITY PROMISED THE GOLD SHOP AND ONLY THE MERCHANT EVER HONOURED IT. `town_haggle` reads, in its
// own words, "N% off everything the travelling merchant AND THE GOLD SHOP sell" — and it was applied in
// exactly one statement in the whole codebase, town.js's merchant chest. Every gear tile, trophy and
// consumable on the gold shop charged full price. GrayKitsune, twice, and the second time after being told
// the first was answered: "again asking clarification on what this enshrined ability does - because it does
// not discount from the store page at all."
//
// It is not a clarification question. Half the sentence was never built.
//
// One rule, in one place, so the two halves cannot drift again: the merchant now calls this too.
export const HAGGLE_MAX = 0.4;   // the ceiling the merchant already enforced; kept as the shared one

/** What a haggling companion is worth, as a fraction. Pure, so the price maths can be read in one line. */
export const haggleCut = (pct) => Math.min(HAGGLE_MAX, Math.max(0, Number(pct) || 0) / 100);

/** A companion's haggle, or 0. Never throws — no pets is not an error, it is most members. */
export async function petHaggle(buyerId) {
    if (!buyerId) return 0;
    try {
        const { getPetSystemPerk } = await import("@/lib/marketplace/pet-combat.js");
        return Number(await getPetSystemPerk(buyerId, "town_haggle")) || 0;
    } catch { return 0; }
}

/**
 * The SHELF price, for display — pure, and deliberately the same two steps in the same order as
 * previewShopPrice below.
 *
 * ⚠️ DISPLAY AND CHARGE MUST COME OUT OF THE SAME ARITHMETIC. inventory.js already carries the scar:
 * "canAfford on FULL price was a bug — an item you could afford at half price still read need more".
 * A haggle folded into the charge but not the shelf is that bug again with a different discount.
 */
export const shelfPrice = (coupon, cut, price) => Math.max(1, Math.round(couponedPrice(coupon, price) * (1 - (cut || 0))));

/**
 * THE gold price of a thing on the shelf: the login coupon first, then the companion's haggle.
 *
 * Order matters and this is the generous one — the coupon is a one-shot with a cash ceiling, so taking it
 * off first and then haggling the remainder is worth marginally more to the player than the reverse. Both
 * are the member's own earned discounts and neither should be quietly eating the other.
 */
export async function previewShopPrice(buyerId, base) {
    const cp = await previewShopCoupon(buyerId, base);
    const pct = await petHaggle(buyerId);
    const cut = haggleCut(pct);
    const price = Math.max(1, Math.round(cp.price * (1 - cut)));
    return { price, couponPct: cp.pct || 0, hagglePct: cut > 0 ? Math.round(cut * 100) : 0 };
}

export async function consumeShopCoupon(buyerId) {
    await db.query(`UPDATE mkt_buyer SET shop_coupon_pct = NULL, shop_coupon_max = NULL, shop_coupon_at = NULL WHERE id = $1`, [buyerId]).catch(() => {});
}

// The active coupon, for display (null if none).
export async function getShopCoupon(buyerId) {
    const c = await db.queryOne(`SELECT shop_coupon_pct AS pct, shop_coupon_max AS max FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    return c?.pct ? { pct: c.pct, max: c.max } : null;
}
