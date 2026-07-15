import "server-only";

import { db } from "@/lib/db";

// Buyer FCM token registry backing marketplace push (DMs, friend requests). The marketplace phone app
// registers its device token on sign-in and clears it on sign-out.

// Upsert a device token for a buyer. A token is unique across the table, so if it was previously
// registered to another account (shared device, account switch) it moves to this buyer.
export async function registerPushToken(buyerId, token, platform = "android") {
    if (!buyerId || !token || !String(token).trim()) return { ok: false };
    await db
        .query(
            `INSERT INTO mkt_push_token (buyer_id, token, platform)
             VALUES ($1, $2, $3)
             ON CONFLICT (token) DO UPDATE SET buyer_id = EXCLUDED.buyer_id, platform = EXCLUDED.platform, updated_at = NOW()`,
            [buyerId, String(token).trim(), platform || "android"]
        )
        .catch(() => {});
    return { ok: true };
}

// Drop a token (sign-out). Scoped to the buyer so one account can't unregister another's device.
export async function unregisterPushToken(buyerId, token) {
    if (!token) return { ok: true };
    await db.query(`DELETE FROM mkt_push_token WHERE token = $1 AND buyer_id = $2`, [String(token).trim(), buyerId]).catch(() => {});
    return { ok: true };
}
