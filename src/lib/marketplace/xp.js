import "server-only";

import { db } from "@/lib/db";

// Loyalty XP + levels. Meaningful actions award XP; a user's level is derived from their total.
// awardXp is best-effort and never throws into the action that triggered it.

// Point values per action. Tune freely — they're only read here.
export const XP_ACTIONS = {
    message: 5, // sending a message (dedupe: once per thread per day, so it can't be farmed)
    wishlist_add: 10, // adding a card to a wishlist / posting a want
    purchase: 50, // completing an online order
    profile_complete: 25, // filling out name + handle + avatar (one-time)
    daily_active: 3, // first meaningful action of the day
};

// Level curve: cumulative XP to REACH level L is 50*(L-1)*L → L1=0, L2=100, L3=300, L4=600, L5=1000…
// Gentle early, steeper later. Returns level + progress toward the next.
export function levelForXp(totalXp) {
    const xp = Math.max(0, Math.floor(Number(totalXp) || 0));
    // Largest L with 50*(L-1)*L <= xp  →  L = floor((1 + sqrt(1 + xp/12.5)) / 2)
    const level = Math.max(1, Math.floor((1 + Math.sqrt(1 + xp / 12.5)) / 2));
    const floorXp = 50 * (level - 1) * level;
    const nextXp = 50 * level * (level + 1);
    const span = nextXp - floorXp;
    const into = xp - floorXp;
    return {
        level,
        totalXp: xp,
        currentLevelXp: into,
        nextLevelXp: span,
        xpToNext: Math.max(0, nextXp - xp),
        progress: span > 0 ? Math.min(1, into / span) : 0,
    };
}

// Award XP to a user for an action. Returns the points granted, or null if skipped (deduped / no user /
// zero points / any error). [dedupeKey] enforces idempotency via the unique index.
export async function awardXp(buyerId, action, { points = null, dedupeKey = null, meta = null } = {}) {
    if (!buyerId) return null;
    const pts = points != null ? Math.round(points) : XP_ACTIONS[action] || 0;
    if (pts <= 0) return null;
    try {
        // The unique index on dedupe_key makes a duplicate insert throw; we then skip the increment.
        await db.query(
            `INSERT INTO mkt_xp_event (buyer_id, action, points, dedupe_key, meta)
             VALUES ($1, $2, $3, $4, $5)`,
            [buyerId, action, pts, dedupeKey, meta ? JSON.stringify(meta) : null]
        );
    } catch {
        return null; // deduped (or a transient error) — never break the caller
    }
    try {
        await db.query(`UPDATE mkt_buyer SET xp = xp + $2, updated_at = NOW() WHERE id = $1`, [buyerId, pts]);
    } catch {
        // Ledger row exists; total will self-heal on the next recompute if we ever add one.
    }
    return pts;
}

// Convenience: a per-day dedupe key so an action only earns XP once per user per day.
export function dailyKey(action, buyerId, scope = "") {
    const day = new Date().toISOString().slice(0, 10);
    return `${action}:${buyerId}:${scope}:${day}`;
}
