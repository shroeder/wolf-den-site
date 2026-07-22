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

export async function consumeShopCoupon(buyerId) {
    await db.query(`UPDATE mkt_buyer SET shop_coupon_pct = NULL, shop_coupon_max = NULL, shop_coupon_at = NULL WHERE id = $1`, [buyerId]).catch(() => {});
}

// The active coupon, for display (null if none).
export async function getShopCoupon(buyerId) {
    const c = await db.queryOne(`SELECT shop_coupon_pct AS pct, shop_coupon_max AS max FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    return c?.pct ? { pct: c.pct, max: c.max } : null;
}
