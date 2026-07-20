import "server-only";

import { db } from "@/lib/db";

// A member's single active shop coupon (granted by a login-proc item). previewShopCoupon computes the
// discounted price WITHOUT consuming (so a failed purchase can't waste it); consumeShopCoupon clears it after
// a successful buy.
export async function previewShopCoupon(buyerId, price) {
    const c = await db.queryOne(`SELECT shop_coupon_pct AS pct, shop_coupon_max AS max FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    if (!c?.pct || price > (c.max || 0)) return { price, pct: 0 };
    return { price: Math.max(1, Math.round(price * (1 - c.pct / 100))), pct: c.pct };
}

export async function consumeShopCoupon(buyerId) {
    await db.query(`UPDATE mkt_buyer SET shop_coupon_pct = NULL, shop_coupon_max = NULL, shop_coupon_at = NULL WHERE id = $1`, [buyerId]).catch(() => {});
}

// The active coupon, for display (null if none).
export async function getShopCoupon(buyerId) {
    const c = await db.queryOne(`SELECT shop_coupon_pct AS pct, shop_coupon_max AS max FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    return c?.pct ? { pct: c.pct, max: c.max } : null;
}
