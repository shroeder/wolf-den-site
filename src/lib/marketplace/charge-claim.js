import { randomBytes } from "crypto";

import { db } from "@/lib/db";
import { redeemCharge } from "@/lib/marketplace/inventory.js";
import { itemById } from "@/lib/marketplace/items.js";

// How long a minted charge-claim QR stays valid. Short — the member mints it at the register and shows it
// to staff right away. If it lapses, they just tap again.
const TTL_MINUTES = 15;

// Member taps a READY charge → mint a single-use claim (nothing burned yet). We verify ownership + that the
// charge is currently available so a QR is only ever handed out for a redeemable perk. The actual burn
// happens when staff scan it (redeemChargeClaim). Returns { ok, token, rewardLabel, expiresAt } or an error.
export async function createChargeClaim(buyerId, itemId) {
    if (!buyerId || !itemId) return { ok: false, error: "missing_params" };
    const item = itemById(itemId);
    if (!item?.charged) return { ok: false, error: "not_chargeable" };
    const owned = await db
        .queryOne(`SELECT charges_left, last_charge_at FROM mkt_user_item WHERE buyer_id = $1 AND item_id = $2`, [buyerId, itemId])
        .catch(() => null);
    if (!owned) return { ok: false, error: "not_owned" };
    const left = Math.max(0, owned.charges_left ?? 0);
    const readyAt = owned.last_charge_at ? new Date(owned.last_charge_at).getTime() + Math.max(0, item.cooldownDays || 0) * 86400000 : 0;
    if (left <= 0) return { ok: false, error: "no_charges" };
    if (Date.now() < readyAt) return { ok: false, error: "on_cooldown", cooldownUntil: new Date(readyAt).toISOString() };
    // Reuse an existing un-redeemed, un-expired claim for this buyer+item so rapid re-taps don't pile up.
    const existing = await db
        .queryOne(
            `SELECT token, expires_at FROM mkt_charge_claim
              WHERE buyer_id = $1 AND item_id = $2 AND redeemed_at IS NULL AND expires_at > NOW()
              ORDER BY created_at DESC LIMIT 1`,
            [buyerId, itemId]
        )
        .catch(() => null);
    if (existing) return { ok: true, token: existing.token, rewardLabel: item.chargeRewardLabel, expiresAt: new Date(existing.expires_at).toISOString() };
    const token = randomBytes(24).toString("hex");
    const row = await db
        .queryOne(
            `INSERT INTO mkt_charge_claim (token, buyer_id, item_id, reward, reward_label, expires_at)
             VALUES ($1, $2, $3, $4, $5, NOW() + ($6 || ' minutes')::interval)
             RETURNING expires_at`,
            [token, buyerId, itemId, item.chargeReward, item.chargeRewardLabel, String(TTL_MINUTES)]
        )
        .catch(() => null);
    if (!row) return { ok: false, error: "mint_failed" };
    return { ok: true, token, rewardLabel: item.chargeRewardLabel, expiresAt: new Date(row.expires_at).toISOString() };
}

// Staff scanned a member's charge QR → atomically claim the token (single-use + expiry guard, race-safe),
// then burn the charge via redeemCharge. If the burn fails (e.g. the charge went on cooldown between mint
// and scan), we release the claim so it isn't silently consumed. Returns rich info for the staff screen.
export async function redeemChargeClaim(token, { by = "admin" } = {}) {
    const t = String(token || "").trim();
    if (!t) return { ok: false, error: "not_found" };
    // Win the token first (only one scan can).
    const claim = await db
        .queryOne(
            `UPDATE mkt_charge_claim SET redeemed_at = NOW(), redeemed_by = $2
              WHERE token = $1 AND redeemed_at IS NULL AND expires_at > NOW()
              RETURNING buyer_id, item_id`,
            [t, by]
        )
        .catch(() => null);
    if (!claim) {
        // Distinguish already-used / expired / unknown for a clearer staff message.
        const existing = await db.queryOne(`SELECT redeemed_at, expires_at FROM mkt_charge_claim WHERE token = $1`, [t]).catch(() => null);
        if (!existing) return { ok: false, error: "not_found" };
        if (existing.redeemed_at) return { ok: false, error: "already_redeemed" };
        return { ok: false, error: "expired" };
    }
    const res = await redeemCharge(claim.buyer_id, claim.item_id, { by, note: "member QR" });
    if (!res.ok) {
        // Release the claim so a legitimate retry (once off cooldown) can still work.
        await db.query(`UPDATE mkt_charge_claim SET redeemed_at = NULL, redeemed_by = NULL WHERE token = $1`, [t]).catch(() => {});
        return { ok: false, error: res.error, cooldownUntil: res.cooldownUntil || null };
    }
    const item = itemById(claim.item_id);
    const member = await db
        .queryOne(`SELECT display_name, alias, first_name, last_name FROM mkt_buyer WHERE id = $1`, [claim.buyer_id])
        .catch(() => null);
    const memberName =
        member?.display_name ||
        [member?.first_name, member?.last_name].filter(Boolean).join(" ") ||
        (member?.alias ? `@${member.alias}` : "Member");
    return {
        ok: true,
        rewardLabel: item?.chargeRewardLabel || res.reward || "Perk",
        itemName: item?.name || "Item",
        chargesLeft: res.chargesLeft,
        member: { name: memberName, alias: member?.alias || null },
    };
}
