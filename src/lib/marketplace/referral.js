import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";
import { addChests } from "@/lib/marketplace/chests.js";
import { sendWebPush } from "@/lib/push/web-push.js";

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
