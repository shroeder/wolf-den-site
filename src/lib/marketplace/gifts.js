import "server-only";

import { db } from "@/lib/db";

// In-site gift pop-ups. Recording a gift here guarantees the recipient finds out — a celebratory overlay
// shows the next time they open the site, no push permission or config required. Cleared once shown.

// Record a gift so the recipient sees a pop-up on their next visit. Best-effort — never throws into the
// gift action itself.
export async function recordGift(buyerId, { kind, title, body, icon = null, rarity = null, url = "/marketplace/equipment" } = {}) {
    if (!buyerId || !kind) return;
    await db
        .query(
            `INSERT INTO mkt_pending_gift (buyer_id, kind, title, body, icon, rarity, url)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [buyerId, kind, String(title || "").slice(0, 120), String(body || "").slice(0, 240), icon, rarity, url || "/marketplace/equipment"]
        )
        .catch(() => {});
}

// The member's un-shown gifts, oldest first (the watcher pops them one after another).
export async function getPendingGifts(buyerId, limit = 5) {
    if (!buyerId) return [];
    return db
        .query(
            `SELECT id, kind, title, body, icon, rarity, url FROM mkt_pending_gift
              WHERE buyer_id = $1 AND seen_at IS NULL ORDER BY created_at ASC LIMIT $2`,
            [buyerId, Math.max(1, Math.min(20, Number(limit) || 5))]
        )
        .catch(() => []);
}

// Mark gifts shown so they never replay (on any device).
export async function markGiftsSeen(buyerId, ids = []) {
    const clean = (Array.isArray(ids) ? ids : []).map((x) => Number(x)).filter(Number.isInteger);
    if (!buyerId || !clean.length) return;
    await db
        .query(`UPDATE mkt_pending_gift SET seen_at = NOW() WHERE buyer_id = $1 AND id = ANY($2) AND seen_at IS NULL`, [buyerId, clean])
        .catch(() => {});
}
