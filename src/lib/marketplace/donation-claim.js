import "server-only";

import { randomBytes } from "node:crypto";

import { db } from "@/lib/db";
import { syncEarnedBadges } from "@/lib/marketplace/badges.js";
import { DONATION_REWARD_MULTIPLIER } from "@/lib/marketplace/reward-rates.js";
import { awardXp } from "@/lib/marketplace/xp.js";

// Donation rewards. A recorded donation mints a single-use claim (QR) the donor scans to bank XP +
// donation badges. One claim per donation; 24h TTL. Mirrors trade-claim.js.
const DEFAULT_TTL_MINUTES = 24 * 60;

// XP for a donation (generous act → reward generously): a solid flat bonus + a point per dollar given.
const DONATION_XP_FLAT = 50;
const DONATION_XP_PER_DOLLAR = 1;

export function donationXp({ amountCents = 0 } = {}) {
    const dollars = Math.max(0, Math.round((Number(amountCents) || 0) / 100));
    // A donation is a gift, so the per-dollar reward is boosted slightly as a thank-you (flat bit unaffected).
    return DONATION_XP_FLAT + Math.round(dollars * DONATION_XP_PER_DOLLAR * DONATION_REWARD_MULTIPLIER);
}

export async function createDonationClaim({ donationId, amountCents = 0, ttlMinutes = DEFAULT_TTL_MINUTES }) {
    if (!donationId) return null;
    const token = randomBytes(24).toString("hex");
    const rows = await db
        .query(
            `INSERT INTO mkt_donation_claim (token, donation_id, amount_cents, expires_at)
             VALUES ($1, $2, $3, NOW() + ($4 || ' minutes')::interval)
             ON CONFLICT (donation_id) DO NOTHING
             RETURNING token`,
            [token, donationId, Math.max(0, Math.trunc(amountCents) || 0), String(Math.max(1, ttlMinutes))]
        )
        .catch(() => []);
    if (rows.length) return { token: rows[0].token, isNew: true };
    const existing = await db.queryOne(`SELECT token FROM mkt_donation_claim WHERE donation_id = $1`, [donationId]).catch(() => null);
    return existing ? { token: existing.token, isNew: false } : null;
}

export async function getDonationClaim(token) {
    if (!token) return null;
    const row = await db.queryOne(`SELECT amount_cents, redeemed_at, expires_at FROM mkt_donation_claim WHERE token = $1`, [token]).catch(() => null);
    if (!row) return null;
    return {
        amountCents: row.amount_cents,
        potentialXp: donationXp({ amountCents: row.amount_cents }),
        redeemed: Boolean(row.redeemed_at),
        expired: new Date(row.expires_at) < new Date(),
    };
}

// Redeem to a buyer: atomically win, award XP, sync donation badges. { ok, xp, amountCents, newBadges }.
export async function redeemDonationClaim(token, buyerId) {
    if (!token || !buyerId) return { ok: false, error: "invalid" };
    const won = await db
        .query(
            `UPDATE mkt_donation_claim
                SET redeemed_at = NOW(), redeemed_buyer_id = $2
              WHERE token = $1 AND redeemed_at IS NULL AND expires_at > NOW()
              RETURNING donation_id, amount_cents`,
            [token, buyerId]
        )
        .catch(() => []);

    if (!won.length) {
        const row = await db.queryOne(`SELECT redeemed_at, redeemed_buyer_id FROM mkt_donation_claim WHERE token = $1`, [token]).catch(() => null);
        if (!row) return { ok: false, error: "not_found" };
        if (row.redeemed_at) return { ok: false, error: row.redeemed_buyer_id === buyerId ? "already_yours" : "already_claimed" };
        return { ok: false, error: "expired" };
    }

    const c = won[0];
    const xp = donationXp({ amountCents: c.amount_cents });
    await awardXp(buyerId, "donation", { points: xp, dedupeKey: `donation:${c.donation_id}`, meta: { donationId: c.donation_id } });
    await db.query(`UPDATE mkt_donation_claim SET xp_awarded = $2 WHERE token = $1`, [token, xp]).catch(() => {});
    const newBadges = await syncEarnedBadges(buyerId).catch(() => []);
    return { ok: true, xp, amountCents: c.amount_cents, newBadges: newBadges.map((b) => ({ slug: b.slug, label: b.label, icon: b.icon })) };
}
