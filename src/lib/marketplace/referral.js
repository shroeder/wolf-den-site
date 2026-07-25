import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";
import { addChests } from "@/lib/marketplace/chests.js";
import { sendWebPush } from "@/lib/push/web-push.js";
import { syncEarnedBadges } from "@/lib/marketplace/badges.js";

// ===== Referral loop =====
// A member's public referral code IS their @handle (alias); the share link is /marketplace/play?ref=<handle>.
// When a referred member VERIFIES their email (so throwaway signups can't farm it) BOTH sides get a one-time
// reward. Tunables are plain consts — no env vars.
export const REF_REFERRER_GOLD = 500;
export const REF_JOINER_GOLD = 250;
export const REF_REFERRER_CHEST = { iron: 1 };
export const REF_JOINER_CHEST = { wooden: 1 };

// Resolve a referral code (@handle) → the referrer's buyer id, or null.
export async function resolveReferrer(refCode) {
    const code = String(refCode || "").trim().replace(/^@/, "").toLowerCase();
    if (!code) return null;
    const row = await db.queryOne(`SELECT id FROM mkt_buyer WHERE lower(alias) = $1`, [code]).catch(() => null);
    return row?.id || null;
}

// Record who referred a freshly-created member. Best-effort; ignores self-referral and never overwrites an
// already-set referrer. Reward is NOT granted here — it waits for email verification.
export async function attachReferrer(newBuyerId, refCode) {
    if (!newBuyerId || !refCode) return;
    const referrerId = await resolveReferrer(refCode);
    if (!referrerId || referrerId === newBuyerId) return;
    await db.query(`UPDATE mkt_buyer SET referred_by = $2 WHERE id = $1 AND referred_by IS NULL`, [newBuyerId, referrerId]).catch(() => {});
}

// Grant the one-time both-sides referral reward. Idempotent: the reward slot is claimed atomically via
// referral_reward_at so a double-verify can't double-pay. Call right after a successful email verification.
export async function maybeGrantReferral(newBuyerId) {
    if (!newBuyerId) return null;
    const claimed = await db.queryOne(
        `UPDATE mkt_buyer SET referral_reward_at = NOW()
          WHERE id = $1 AND referred_by IS NOT NULL AND referral_reward_at IS NULL
          RETURNING referred_by`,
        [newBuyerId]
    ).catch(() => null);
    if (!claimed?.referred_by) return null;
    const referrerId = claimed.referred_by;

    // New member's welcome bonus.
    await db.query(`UPDATE mkt_buyer SET gold = gold + $2, updated_at = NOW() WHERE id = $1`, [newBuyerId, REF_JOINER_GOLD]).catch(() => {});
    await logCoin(newBuyerId, REF_JOINER_GOLD, "referral_joined").catch(() => {});
    await addChests(newBuyerId, REF_JOINER_CHEST).catch(() => {});

    // Referrer's reward.
    await db.query(`UPDATE mkt_buyer SET gold = gold + $2, updated_at = NOW() WHERE id = $1`, [referrerId, REF_REFERRER_GOLD]).catch(() => {});
    await logCoin(referrerId, REF_REFERRER_GOLD, "referral_bonus").catch(() => {});
    await addChests(referrerId, REF_REFERRER_CHEST).catch(() => {});
    // Now that this referral has converted, grant any invite badges the referrer newly qualifies for.
    await syncEarnedBadges(referrerId).catch(() => {}); // Recruiter / Pack Builder / Pack Leader

    // Let the referrer know their invite paid off (best-effort web push).
    const joiner = await db.queryOne(`SELECT display_name, alias FROM mkt_buyer WHERE id = $1`, [newBuyerId]).catch(() => null);
    const who = joiner?.display_name || (joiner?.alias ? `@${joiner.alias}` : "A new member");
    await sendWebPush(referrerId, {
        title: "🎉 Your invite joined!",
        body: `${who} signed up with your link — you earned ${REF_REFERRER_GOLD} gold + an Iron Chest.`,
        url: "/marketplace/profile",
        tag: "referral",
    }).catch(() => {});

    return { referrerId, joinerId: newBuyerId };
}

// A member's own invite scorecard for the invite page: how many friends they invited, how many converted
// (verified their email → the reward paid out), and the gold they earned from it. Cheap single-row query.
export async function getReferralStats(buyerId) {
    const empty = { invited: 0, converted: 0, goldEarned: 0 };
    if (!buyerId) return empty;
    const row = await db.queryOne(
        `SELECT COUNT(*)::int AS invited,
                COUNT(*) FILTER (WHERE referral_reward_at IS NOT NULL)::int AS converted
           FROM mkt_buyer WHERE referred_by = $1`,
        [buyerId]
    ).catch(() => null);
    if (!row) return empty;
    return {
        invited: row.invited || 0,
        converted: row.converted || 0,
        goldEarned: (row.converted || 0) * REF_REFERRER_GOLD,
    };
}

// Whole-program telemetry for the admin invite screen. Three grouped queries (no N+1): headline totals,
// the most recent joins (joiner + who referred them), and the top-referrer leaderboard.
export async function getReferralAdminStats({ recentLimit = 25, leaderLimit = 25 } = {}) {
    const [totalsRow, recentRows, leaderRows] = await Promise.all([
        db.queryOne(
            `SELECT COUNT(*) FILTER (WHERE referred_by IS NOT NULL)::int AS total_referred,
                    COUNT(*) FILTER (WHERE referral_reward_at IS NOT NULL)::int AS total_converted
               FROM mkt_buyer`
        ).catch(() => null),
        db.query(
            `SELECT j.id AS joiner_id, j.alias AS joiner_alias, j.display_name AS joiner_name,
                    r.alias AS referrer_alias, r.display_name AS referrer_name,
                    j.created_at AS joined_at, j.referral_reward_at AS verified_at
               FROM mkt_buyer j
               JOIN mkt_buyer r ON r.id = j.referred_by
              ORDER BY j.created_at DESC
              LIMIT $1`,
            [recentLimit]
        ).catch(() => []),
        db.query(
            `SELECT r.id AS referrer_id, r.alias AS referrer_alias, r.display_name AS referrer_name,
                    COUNT(j.id)::int AS invited,
                    COUNT(j.id) FILTER (WHERE j.referral_reward_at IS NOT NULL)::int AS converted
               FROM mkt_buyer r
               JOIN mkt_buyer j ON j.referred_by = r.id
              GROUP BY r.id, r.alias, r.display_name
              ORDER BY converted DESC, invited DESC
              LIMIT $1`,
            [leaderLimit]
        ).catch(() => []),
    ]);

    const totalReferred = totalsRow?.total_referred || 0;
    const totalConverted = totalsRow?.total_converted || 0;
    const label = (alias, name) => (alias ? `@${alias}` : name || "—");

    return {
        totals: {
            totalReferred,
            totalConverted,
            conversionPct: totalReferred ? Math.round((totalConverted / totalReferred) * 1000) / 10 : 0,
            goldPaidOut: totalConverted * (REF_REFERRER_GOLD + REF_JOINER_GOLD),
        },
        recentJoins: (recentRows || []).map((r) => ({
            joiner: label(r.joiner_alias, r.joiner_name),
            referrer: label(r.referrer_alias, r.referrer_name),
            joinedAt: r.joined_at,
            verifiedAt: r.verified_at,
            converted: Boolean(r.verified_at),
        })),
        topReferrers: (leaderRows || []).map((r) => ({
            referrer: label(r.referrer_alias, r.referrer_name),
            invited: r.invited || 0,
            converted: r.converted || 0,
        })),
    };
}
