import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { db } from "@/lib/db";

// ── ONE CLICK, NO LOGIN ──────────────────────────────────────────────────────────────────────────────────────
// Luke: "it's important that we don't get people unsubscribing or reporting us as spam."
//
// Those two are not the same risk and the second is the expensive one. An unsubscribe costs one member's
// inbox; a spam report costs a fraction of the sending domain's reputation, which is shared with the order
// receipts, the password resets and the card alerts. The single biggest driver of the second is an
// unsubscribe link that does not work without signing in — somebody who cannot find the off switch presses
// the one their mail client gives them instead.
//
// So the link is signed, carries no session, and works in one click from any device.
const SECRET = () => process.env.SHOP_CUSTOMER_SESSION_SECRET || process.env.CONSIGNMENT_SESSION_SECRET || "";

const sign = (buyerId) => createHmac("sha256", SECRET()).update(`outreach:${buyerId}`).digest("base64url");

export function unsubscribeToken(buyerId) {
    return `${buyerId}.${sign(buyerId)}`;
}

export async function unsubscribeByToken(token) {
    const [buyerId, mac] = String(token || "").split(".");
    if (!buyerId || !mac || !SECRET()) return false;
    const expected = Buffer.from(sign(buyerId));
    const given = Buffer.from(mac);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;

    // Turns off the announce channel, which is the one this campaign sends on. It deliberately does NOT touch
    // order receipts or card alerts: somebody saying "stop marketing at me" has not asked to stop being told
    // their card came in.
    const res = await db.query(
        `UPDATE mkt_buyer
            SET notify_prefs = COALESCE(notify_prefs, '{}'::jsonb) || '{"email:announce": false}'::jsonb
          WHERE id = $1`,
        [buyerId]
    ).catch(() => null);
    return res !== null;
}
