import "server-only";

import { db } from "@/lib/db";
import { awardXp } from "@/lib/marketplace/xp.js";
import { levelForXp } from "@/lib/marketplace/xp.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { syncEarnedBadges } from "@/lib/marketplace/badges.js";
import { bumpQuestProgress } from "@/lib/marketplace/quests.js";

// Farm LIKES — a positive-only, three-tier "rate a friend's farm" system. Rating is a like, not a score:
// Like 👍 < Love ❤️ < Admire ⭐. One persistent rating per (rater → owner); revise anytime. Both earn XP the
// first time you rate them (changing a rating spends a charge but awards nothing — anti-farm). THREE rating
// charges per day, spent on a NEW rating OR changing an existing one — no free flip-flopping. (mig222.)
const DAY = "(NOW() AT TIME ZONE 'America/Chicago')::date";
const RATES_PER_DAY = 3; // rating charges per day — spent on a NEW rating OR changing an existing one

export const RATE_TIERS = {
    // Trimmed ~35%. Between them these two paid 8,128 XP a week (5.5% of all XP) for visiting a farm and
    // pressing a button, and the OWNER's half is XP for having been visited — the most passive income here.
    // Ratings should still be worth giving and getting; they should not out-earn playing.
    1: { key: "like", label: "Like", icon: "👍", color: "#7ec8ff", raterXp: 8, ownerXp: 12, blurb: "Nice farm!" },
    2: { key: "love", label: "Love", icon: "❤️", color: "#ff6fae", raterXp: 15, ownerXp: 22, blurb: "Love it!" },
    3: { key: "admire", label: "Admire", icon: "⭐", color: "#ffd75e", raterXp: 26, ownerXp: 38, blurb: "Absolutely admire it!" },
};
export const tierMeta = (t) => RATE_TIERS[t] || null;

// Read + lazily day-reset the rater's daily new-rating charge. Idempotent (safe on plain load).
async function rateCharge(buyerId) {
    const b = await db
        .queryOne(
            `UPDATE mkt_buyer
                SET farm_rate_used = CASE WHEN farm_rate_day = ${DAY} THEN farm_rate_used ELSE 0 END,
                    farm_rate_bonus = CASE WHEN farm_rate_day = ${DAY} THEN COALESCE(farm_rate_bonus,0) ELSE 0 END,
                    farm_rate_day = ${DAY}
              WHERE id = $1
              RETURNING farm_rate_used, COALESCE(farm_rate_bonus,0) AS farm_rate_bonus`,
            [buyerId]
        )
        .catch(() => null);
    const used = b?.farm_rate_used || 0;
    const bonus = b?.farm_rate_bonus || 0; // Kindness Token consumable — extra rating charges today
    const allowance = RATES_PER_DAY + bonus;
    return { used, allowance, left: Math.max(0, allowance - used) };
}

// Aggregate counts of a farm's likes, by tier + total, plus the viewer's own current rating.
async function ratingSummary(ownerId, viewerId) {
    const [rows, mine] = await Promise.all([
        db.query(`SELECT tier, COUNT(*)::int AS n FROM mkt_farm_rating WHERE owner_id = $1 GROUP BY tier`, [ownerId]).catch(() => []),
        viewerId && String(viewerId) !== String(ownerId)
            ? db.queryOne(`SELECT tier FROM mkt_farm_rating WHERE owner_id = $1 AND rater_id = $2`, [ownerId, viewerId]).catch(() => null)
            : Promise.resolve(null),
    ]);
    const byTier = { 1: 0, 2: 0, 3: 0 };
    for (const r of rows || []) byTier[r.tier] = r.n;
    const total = byTier[1] + byTier[2] + byTier[3];
    return { total, byTier, myTier: mine?.tier || null };
}

// The rating block attached to a farm view: the summary, whether the viewer can rate, and their charge state.
export async function farmRatingBits(ownerId, viewerId) {
    const own = String(viewerId || "") === String(ownerId);
    const [summary, charge] = await Promise.all([
        ratingSummary(ownerId, viewerId),
        viewerId && !own ? rateCharge(viewerId) : Promise.resolve(null),
    ]);
    return {
        rating: {
            ...summary,
            canRate: Boolean(viewerId) && !own,
            isOwn: own,
            charge, // { used, allowance, left } or null on your own farm
        },
    };
}

// Rate (or revise your rating of) another member's farm. First rating of a person spends a daily charge and
// awards XP to BOTH; revising an existing rating is free and re-awards nothing (anti-farm). Returns the fresh
// summary + charge so the client can patch in place.
export async function rateFarm(raterId, ownerId, tier) {
    if (!raterId || !ownerId) return { ok: false, error: "bad_request" };
    if (String(raterId) === String(ownerId)) return { ok: false, error: "cant_rate_own" };
    const t = Number(tier);
    if (!RATE_TIERS[t]) return { ok: false, error: "bad_tier" };
    // Owner must exist (and have a farm — everyone implicitly does once they have an account).
    const owner = await db.queryOne(`SELECT id FROM mkt_buyer WHERE id = $1`, [ownerId]).catch(() => null);
    if (!owner) return { ok: false, error: "no_such_farm" };

    const existing = await db.queryOne(`SELECT tier FROM mkt_farm_rating WHERE rater_id = $1 AND owner_id = $2`, [raterId, ownerId]).catch(() => null);
    const meta = RATE_TIERS[t];

    if (existing) {
        // Tapping the tier you already gave = no-op (no charge spent).
        if (existing.tier === t) {
            const [summary, charge] = await Promise.all([ratingSummary(ownerId, raterId), rateCharge(raterId)]);
            return { ok: true, changed: false, myTier: t, ...summary, charge, xpGained: 0 };
        }
        // CHANGING your rating now costs a charge too — no free flip-flopping. No XP (anti-farm).
        const charge0 = await rateCharge(raterId);
        if (charge0.left <= 0) {
            const summary = await ratingSummary(ownerId, raterId);
            return { ok: false, error: "no_charge_left", myTier: existing.tier, ...summary, charge: charge0 };
        }
        const slot = await db
            .queryOne(`UPDATE mkt_buyer SET farm_rate_used = farm_rate_used + 1 WHERE id = $1 AND farm_rate_day = ${DAY} AND farm_rate_used < $2 RETURNING farm_rate_used`, [raterId, charge0.allowance])
            .catch(() => null);
        if (!slot) {
            const [summary, charge] = await Promise.all([ratingSummary(ownerId, raterId), rateCharge(raterId)]);
            return { ok: false, error: "no_charge_left", myTier: existing.tier, ...summary, charge };
        }
        await db.query(`UPDATE mkt_farm_rating SET tier = $3, updated_at = NOW(), owner_seen_at = NULL WHERE rater_id = $1 AND owner_id = $2`, [raterId, ownerId, t]).catch(() => {});
        await trackActivity(raterId, "farm_rate_revise", { owner: ownerId, tier: t }).catch(() => {});
        const [summary, charge] = await Promise.all([ratingSummary(ownerId, raterId), rateCharge(raterId)]);
        return { ok: true, changed: true, revised: true, myTier: t, ...summary, charge, xpGained: 0 };
    }

    // NEW rating — spend one daily charge (atomic guard), then insert + award XP to both.
    const charge0 = await rateCharge(raterId);
    if (charge0.left <= 0) return { ok: false, error: "no_charge_left", charge: charge0 };
    const slot = await db
        .queryOne(
            `UPDATE mkt_buyer SET farm_rate_used = farm_rate_used + 1
              WHERE id = $1 AND farm_rate_day = ${DAY} AND farm_rate_used < $2 RETURNING farm_rate_used`,
            [raterId, charge0.allowance]
        )
        .catch(() => null);
    if (!slot) return { ok: false, error: "no_charge_left", charge: await rateCharge(raterId) };

    const inserted = await db
        .queryOne(
            `INSERT INTO mkt_farm_rating (rater_id, owner_id, tier, owner_seen_at) VALUES ($1, $2, $3, NULL)
             ON CONFLICT (rater_id, owner_id) DO NOTHING RETURNING tier`,
            [raterId, ownerId, t]
        )
        .catch(() => null);
    if (!inserted) {
        // Raced with another insert (already rated) — refund the charge and treat as a no-op revise.
        await db.query(`UPDATE mkt_buyer SET farm_rate_used = GREATEST(0, farm_rate_used - 1) WHERE id = $1 AND farm_rate_day = ${DAY}`, [raterId]).catch(() => {});
        const [summary, charge] = await Promise.all([ratingSummary(ownerId, raterId), rateCharge(raterId)]);
        return { ok: true, changed: false, myTier: t, ...summary, charge, xpGained: 0 };
    }

    // Green Thumb: a companion turns the courtesy of rating someone's farm into a seed for you. Rating is
    // already daily-capped, so this can't be farmed beyond that ceiling.
    let seedFound = null;
    try {
        const { getPetSystemPerk } = await import("@/lib/marketplace/pet-combat.js");
        const gt = await getPetSystemPerk(raterId, "green_thumb");
        if (gt > 0 && Math.random() < gt / 100) {
            const { dropSeedFrom } = await import("@/lib/marketplace/farm-crops.js");
            seedFound = await dropSeedFrom(raterId, "green_thumb").catch(() => null);
        }
    } catch { /* a seed is a bonus; never fail the rating */ }
    await awardXp(raterId, "farm_rate_give", { points: meta.raterXp, gold: 0 }).catch(() => {});
    await awardXp(ownerId, "farm_rate_get", { points: meta.ownerXp, gold: 0 }).catch(() => {});
    await trackActivity(raterId, "farm_rate", { owner: ownerId, tier: t }).catch(() => {});
    // Earned cosmetic: the "Kindred Spirit" border for a generous rater at 10 distinct farms rated (the row
    // was inserted just above, so this count includes it). Idempotent grant into mkt_cosmetic_unlock.
    const given = await db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_farm_rating WHERE rater_id = $1`, [raterId]).catch(() => null);
    if ((given?.n || 0) >= 10) await db.query(`INSERT INTO mkt_cosmetic_unlock (buyer_id, category, ref) VALUES ($1, 'border', 'kindred') ON CONFLICT DO NOTHING`, [raterId]).catch(() => {});
    await bumpQuestProgress(raterId, "farm_rate", 1).catch(() => {}); // credit the "rate a friend's farm" quest (new ratings only)
    await syncEarnedBadges(ownerId).catch(() => {}); // Well-Liked / Adored — the OWNER just received a rating

    const [summary, charge] = await Promise.all([ratingSummary(ownerId, raterId), rateCharge(raterId)]);
    return { ok: true, changed: true, isNew: true, myTier: t, xpGained: meta.raterXp, seedFound, ...summary, charge };
}

// "N people rated your farm" welcome-back recap. Returns every unseen (new or revised) rating on your farm, plus
// the all-time totals. Fetching it marks those rows seen so it pops once — same contract as the pet-visit recap.
export async function getUnseenFarmRatings(ownerId) {
    if (!ownerId) return { raters: [], newCount: 0, byTier: { 1: 0, 2: 0, 3: 0 }, total: 0 };
    const rows = await db
        .query(
            `SELECT rater_id, tier, updated_at FROM mkt_farm_rating
              WHERE owner_id = $1 AND owner_seen_at IS NULL ORDER BY updated_at DESC`,
            [ownerId]
        )
        .catch(() => []);
    if (!rows.length) return { raters: [], newCount: 0, byTier: { 1: 0, 2: 0, 3: 0 }, total: 0 };
    const ids = [...new Set(rows.map((r) => r.rater_id))];
    const buyers = await db
        .query(`SELECT id, display_name, alias, COALESCE(xp,0) AS xp, avatar_sprite_url, avatar_sprite_flip, equipped_border FROM mkt_buyer WHERE id = ANY($1)`, [ids])
        .catch(() => []);
    const byId = new Map((buyers || []).map((b) => [b.id, b]));
    const raters = rows.map((r) => {
        const b = byId.get(r.rater_id) || {};
        const meta = RATE_TIERS[r.tier] || RATE_TIERS[1];
        return {
            name: b.display_name || b.alias || "A visitor",
            alias: b.alias || null,
            level: levelForXp(b.xp || 0).level,
            avatarUrl: b.avatar_sprite_url || null,
            avatarFlip: b.avatar_sprite_url ? b.avatar_sprite_flip === true : false,
            border: b.equipped_border && b.equipped_border !== "none" ? b.equipped_border : null,
            tier: r.tier, tierKey: meta.key, tierLabel: meta.label, tierIcon: meta.icon, tierColor: meta.color,
        };
    });
    const summary = await ratingSummary(ownerId, null);
    await db.query(`UPDATE mkt_farm_rating SET owner_seen_at = NOW() WHERE owner_id = $1 AND owner_seen_at IS NULL`, [ownerId]).catch(() => {});
    return { raters, newCount: rows.length, byTier: summary.byTier, total: summary.total };
}
