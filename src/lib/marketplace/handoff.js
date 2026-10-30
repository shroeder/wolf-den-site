import "server-only";

import { randomBytes } from "node:crypto";

import { db } from "@/lib/db";

/**
 * ── THE COUNTER HANDSHAKE ────────────────────────────────────────────────────────────────────────────────────
 *
 * Luke: "there should be a QR code the customer can pull up from their card vault. And then the admin or
 * employee app, you can scan it with the camera and it'll open it up to that person's card vault so you can
 * clear it out for them. And the same is true for online orders."
 *
 * Before this, finding a member in the employee app meant typing a name that might be an alias, a display
 * name or neither, and finding their order meant reading a confirmation number off a phone screen. The code
 * removes the typing, which is the whole feature: the slow part of a hand-over was never the tapping.
 *
 * ⚠️ THIS CODE SPENDS NOTHING. A credit claim deducts money, so it is single-use and burning it matters.
 * This one only says WHO and WHICH — every action behind the screen it opens is separately admin-
 * authenticated, so a scan that opens the wrong member's vault is a mis-navigation, not a loss. That is why
 * it is not consumed on scan: a fumbled first scan should not force the member to re-generate.
 *
 * ⚠️ AND IT EXPIRES. A QR is photographable by anybody standing behind you in the queue. Fifteen minutes is
 * long enough to find staff and short enough that a screenshot is worthless by the time it is shared.
 */
const TTL_MINUTES = 15;

export const HANDOFF_KIND = { vault: "vault", order: "order" };

/**
 * Mint (or reuse) the code a member shows at the counter.
 *
 * Reuses a live claim rather than minting per tap: a member pressing the button three times while looking
 * for staff should be shown the same code, or the one staff finally scan may be the one that was replaced.
 */
export async function createHandoffClaim({ buyerId, kind, orderId = null }) {
    if (!buyerId) return { ok: false, error: "unauthorized" };
    if (!HANDOFF_KIND[kind]) return { ok: false, error: "bad_kind" };

    // ⚠️ THE ORDER IS CHECKED AGAINST THE BUYER, not taken on trust. The id arrives from a request body, so
    // without this a member could mint a code that opens somebody else's order in a staff app.
    if (kind === HANDOFF_KIND.order) {
        if (!orderId) return { ok: false, error: "bad_order" };
        const owned = await db
            .queryOne(`SELECT id FROM shop_orders WHERE id = $1 AND customer_id = $2`, [orderId, buyerId])
            .catch(() => null);
        if (!owned) return { ok: false, error: "bad_order" };
    }

    const existing = await db
        .queryOne(
            `SELECT token, expires_at FROM mkt_handoff_claim
              WHERE buyer_id = $1 AND kind = $2 AND expires_at > NOW()
                AND ($3::uuid IS NULL OR order_id = $3::uuid)
              ORDER BY created_at DESC LIMIT 1`,
            [buyerId, kind, orderId]
        )
        .catch(() => null);
    if (existing) {
        return { ok: true, token: existing.token, expiresAt: new Date(existing.expires_at).toISOString() };
    }

    const token = randomBytes(24).toString("hex");
    const row = await db
        .queryOne(
            `INSERT INTO mkt_handoff_claim (token, kind, buyer_id, order_id, expires_at)
             VALUES ($1, $2, $3, $4, NOW() + ($5 || ' minutes')::interval) RETURNING expires_at`,
            [token, kind, buyerId, orderId, String(TTL_MINUTES)]
        )
        .catch(() => null);
    if (!row) return { ok: false, error: "mint_failed" };
    return { ok: true, token, expiresAt: new Date(row.expires_at).toISOString() };
}

/**
 * Staff scanned a code: who is this, and which screen should open?
 *
 * Returns enough for the app to render a header without a second round trip — the member's name, and for an
 * order the confirmation number. A scan that lands on a blank screen while it fetches reads as a failed scan.
 */
export async function resolveHandoffClaim(token, { by = "staff" } = {}) {
    const t = String(token || "").trim();
    if (!t) return { ok: false, error: "not_found" };

    const claim = await db
        .queryOne(
            `SELECT c.token, c.kind, c.buyer_id, c.order_id, c.expires_at,
                    b.display_name, b.alias, b.first_name, b.last_name
               FROM mkt_handoff_claim c
               JOIN mkt_buyer b ON b.id = c.buyer_id
              WHERE c.token = $1`,
            [t]
        )
        .catch(() => null);
    if (!claim) return { ok: false, error: "not_found" };
    // ⚠️ EXPIRY IS A DISTINCT ANSWER, not a 404. "That code has expired, ask them to tap it again" is a thing
    // staff can act on at the counter; "not found" sends them hunting for a bug that is not there.
    if (new Date(claim.expires_at) <= new Date()) return { ok: false, error: "expired" };

    await db
        .query(`UPDATE mkt_handoff_claim SET scanned_at = NOW(), scanned_by = $2 WHERE token = $1`, [t, String(by).slice(0, 60)])
        .catch(() => {});

    const name = claim.display_name
        || [claim.first_name, claim.last_name].filter(Boolean).join(" ")
        || (claim.alias ? `@${claim.alias}` : "Member");

    const out = { ok: true, kind: claim.kind, buyerId: claim.buyer_id, memberName: name };

    if (claim.kind === HANDOFF_KIND.order && claim.order_id) {
        const order = await db
            .queryOne(
                `SELECT id, fulfillment_status, fulfillment_mode, vault_order, item_name
                   FROM shop_orders WHERE id = $1`,
                [claim.order_id]
            )
            .catch(() => null);
        out.orderId = claim.order_id;
        out.fulfillmentStatus = order?.fulfillment_status || null;
        out.fulfillmentMode = order?.fulfillment_mode || null;
        out.vaultOrder = Boolean(order?.vault_order);
        out.orderLabel = order?.item_name || null;
    }

    if (claim.kind === HANDOFF_KIND.vault) {
        // The count staff need before they open anything: is there actually something to hand over?
        const [row] = await db
            .query(
                `SELECT COUNT(*)::int AS n, COALESCE(SUM(current_value_cents), 0)::int AS cents
                   FROM mkt_vault_card WHERE buyer_id = $1 AND status IN ('held', 'on_order')`,
                [claim.buyer_id]
            )
            .catch(() => [{ n: 0, cents: 0 }]);
        out.vaultCards = row?.n || 0;
        out.vaultValueCents = row?.cents || 0;
    }

    return out;
}
