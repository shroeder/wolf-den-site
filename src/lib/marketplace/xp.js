import "server-only";

import { db } from "@/lib/db";

// Loyalty XP + levels. Meaningful actions award XP; a user's level is derived from their total.
// awardXp is best-effort and never throws into the action that triggered it.

// Point values per action. Tune freely — they're only read here.
// Anti-farm: dollars spent are uncapped (real money), everything else is capped via dedupe keys
// (once-per-entity) and per-action daily caps at the call sites. The grindable actions' daily caps sum
// under ~50 XP/day, so no amount of busywork moves you fast — only spending does.
// Which rewards milestones a member has completed — drives the "How you earn" checklist. Repeatable
// ones (spend, event, daily) report whether they've been earned (daily = earned today).
export async function getRewardsProgress(buyerId) {
    if (!buyerId) return {};
    const rows = await db.query(`SELECT DISTINCT action FROM mkt_xp_event WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    const actions = new Set(rows.map((r) => r.action));
    const todayActive = await db
        .queryOne(
            `SELECT 1 FROM mkt_xp_event
              WHERE buyer_id = $1 AND action = 'daily_active'
                AND (created_at AT TIME ZONE 'America/Chicago')::date = (NOW() AT TIME ZONE 'America/Chicago')::date
              LIMIT 1`,
            [buyerId]
        )
        .catch(() => null);
    return {
        spend: actions.has("purchase_spend"),
        first_purchase: actions.has("first_purchase"),
        event_checkin: actions.has("event_checkin"),
        discord_link: actions.has("discord_link"),
        profile_complete: actions.has("profile_complete"),
        daily_active: Boolean(todayActive),
        // Onboarding milestones — one-time nudges to try the social/community features.
        first_message: actions.has("first_message"),
        first_friend: actions.has("first_friend"),
        first_wishlist: actions.has("first_wishlist"),
        first_equip: actions.has("first_equip"),
    };
}

export const XP_ACTIONS = {
    message: 5, // sending a message — dedupe once/thread/day, plus a 3/day cap
    wishlist_add: 10, // adding a card to a wishlist — dedupe once/card, plus a 3/day cap
    daily_active: 3, // first app open of the day (dedupe once/day)
    profile_complete: 25, // name + handle + avatar all set (once, ever)
    purchase_flat: 20, // flat per-purchase bonus, capped 1/day (wired in the POS phase)
    first_purchase: 100, // first-ever purchase (once, ever) (wired in the POS phase)
    event_checkin: 50, // checking in at an event (once/event)
    discord_link: 50, // linking your Discord account while in the server (once, ever)
    // Onboarding milestones (each once, ever) — reward trying a feature for the first time.
    first_message: 40, // send your first message (store or a friend)
    first_friend: 40, // make your first friend
    first_wishlist: 30, // add your first card to your Looking For list
    first_equip: 20, // customize your look — equip a border or background
};

// Award a one-time onboarding milestone. dedupe on (action, buyerId) so it can only ever fire once.
// Best-effort; returns the points granted or null if already earned / skipped.
export async function awardOnce(buyerId, action, meta = null) {
    if (!buyerId) return null;
    return awardXp(buyerId, action, { dedupeKey: `${action}:${buyerId}`, meta });
}

// Dollars spent → XP (uncapped). Used by the purchase/POS hook.
export const SPEND_XP_PER_DOLLAR = 1;

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

// Award XP to a user for an action. Returns the points granted, or null if skipped (deduped / capped /
// no user / zero points / any error).
//   dedupeKey — enforces once-per-entity via the unique index (e.g. once/card, once/day).
//   dailyCap  — at most this many awards of this action per user per (UTC) day.
export async function awardXp(buyerId, action, { points = null, dedupeKey = null, dailyCap = null, meta = null } = {}) {
    if (!buyerId) return null;
    const pts = points != null ? Math.round(points) : XP_ACTIONS[action] || 0;
    if (pts <= 0) return null;

    // Per-action daily cap: if the user already hit today's limit for this action, skip.
    if (dailyCap != null && dailyCap > 0) {
        const capRow = await db
            .queryOne(
                `SELECT COUNT(*)::int AS n FROM mkt_xp_event
                  WHERE buyer_id = $1 AND action = $2 AND created_at::date = (NOW() AT TIME ZONE 'utc')::date`,
                [buyerId, action]
            )
            .catch(() => null);
        if (capRow && capRow.n >= dailyCap) return null;
    }

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

// Credit loyalty XP for a completed purchase to the matching marketplace account (found by email, or a
// known buyerId). Best-effort. Awards: $1 spent = 1 XP (uncapped, once/order) + a flat purchase bonus
// (once/order, capped 1/day) + a one-time first-purchase bonus. Also links the account to its Square
// customer for in-store loyalty later. Dollars are computed from the merchandise subtotal the caller
// passes (not tax/shipping). Deduped by order id so re-processing an order never double-credits.
export async function awardPurchaseXp({ email = null, phone = null, buyerId = null, amountCents = 0, orderId, squareCustomerId = null } = {}) {
    let id = buyerId;
    if (!id && squareCustomerId) {
        const row = await db
            .queryOne(`SELECT id FROM mkt_buyer WHERE square_customer_id = $1`, [squareCustomerId])
            .catch(() => null);
        id = row?.id || null;
    }
    if (!id && email) {
        const row = await db
            .queryOne(`SELECT id FROM mkt_buyer WHERE email_normalized = $1`, [String(email).trim().toLowerCase()])
            .catch(() => null);
        id = row?.id || null;
    }
    if (!id && phone) {
        const row = await db.queryOne(`SELECT id FROM mkt_buyer WHERE phone = $1`, [phone]).catch(() => null);
        id = row?.id || null;
    }
    if (!id) {
        // No marketplace account yet — park the credit by email so it's waiting the moment they register.
        await parkPendingPurchase({ email, amountCents, orderId, squareCustomerId });
        return null;
    }

    const oid = String(orderId || "").trim();
    const dollars = Math.max(0, Math.round((Number(amountCents) || 0) / 100));

    if (dollars > 0 && oid) {
        await awardXp(id, "purchase_spend", { points: dollars * SPEND_XP_PER_DOLLAR, dedupeKey: `spend:${oid}`, meta: { orderId: oid } });
    }
    if (oid) {
        await awardXp(id, "purchase_flat", { dedupeKey: `purchase_flat:${oid}`, dailyCap: 1, meta: { orderId: oid } });
    }
    await awardXp(id, "first_purchase", { dedupeKey: `first_purchase:${id}`, meta: { orderId: oid } });

    if (squareCustomerId) {
        await db
            .query(
                `UPDATE mkt_buyer SET square_customer_id = $2 WHERE id = $1 AND (square_customer_id IS NULL OR square_customer_id = '')`,
                [id, squareCustomerId]
            )
            .catch(() => {});
    }
    return id;
}

// Park a purchase that has no marketplace account yet, keyed by email. Redeemed into real XP when the
// buyer registers with that email (see claimPendingPurchases). Deduped by (email, order). Best-effort.
async function parkPendingPurchase({ email, amountCents = 0, orderId, squareCustomerId = null }) {
    const normalized = email ? String(email).trim().toLowerCase() : null;
    const oid = String(orderId || "").trim();
    if (!normalized || !oid) return;
    await db
        .query(
            `INSERT INTO mkt_pending_purchase (email_normalized, order_id, amount_cents, square_customer_id)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (email_normalized, order_id) DO NOTHING`,
            [normalized, oid, Math.max(0, Number(amountCents) || 0), squareCustomerId || null]
        )
        .catch(() => {});
}

// Redeem any purchases parked for this buyer's email into real XP, and link their Square customer. Called
// when an account is created/opened. Best-effort and idempotent — awardPurchaseXp is deduped by order id,
// and each pending row is marked redeemed so it never replays. Safe to call often.
export async function claimPendingPurchases(buyerId, email) {
    const normalized = email ? String(email).trim().toLowerCase() : null;
    if (!buyerId || !normalized) return 0;
    const rows = await db
        .query(
            `SELECT id, order_id, amount_cents, square_customer_id
               FROM mkt_pending_purchase
              WHERE email_normalized = $1 AND redeemed_at IS NULL
              ORDER BY created_at ASC`,
            [normalized]
        )
        .then((r) => r?.rows || r || [])
        .catch(() => []);
    if (!rows.length) return 0;

    let claimed = 0;
    for (const row of rows) {
        await awardPurchaseXp({
            buyerId,
            amountCents: row.amount_cents,
            orderId: row.order_id,
            squareCustomerId: row.square_customer_id || null,
        });
        await db
            .query(`UPDATE mkt_pending_purchase SET redeemed_at = NOW(), redeemed_buyer_id = $2 WHERE id = $1`, [row.id, buyerId])
            .catch(() => {});
        claimed += 1;
    }
    return claimed;
}

// Is there a level-up the user hasn't been shown yet? Compares current level to celebrated_level so the
// celebration fires exactly once per level, tracked server-side (same on every device, never on login).
export async function getPendingLevelUp(buyerId) {
    if (!buyerId) return { pending: false };
    const row = await db.queryOne(`SELECT xp, celebrated_level FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    if (!row) return { pending: false };
    const level = levelForXp(row.xp || 0).level;
    const celebrated = Math.max(1, Number(row.celebrated_level || 1));
    return level > celebrated ? { pending: true, level, from: celebrated } : { pending: false, level };
}

// Mark that the user has seen the celebration up through [level] — so it never replays for that level.
export async function acknowledgeLevel(buyerId, level) {
    if (!buyerId) return;
    const lvl = Math.max(1, Math.floor(Number(level) || 1));
    await db.query(`UPDATE mkt_buyer SET celebrated_level = GREATEST(celebrated_level, $2) WHERE id = $1`, [buyerId, lvl]).catch(() => {});
}
