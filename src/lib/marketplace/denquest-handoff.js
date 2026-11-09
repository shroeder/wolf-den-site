import "server-only";

import { randomUUID } from "node:crypto";

import { db } from "@/lib/db.js";

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// CROSS-DOMAIN SIGN-IN — ONE ACCOUNT, TWO DOMAINS
//
// Den Quest lives on denquestonline.com. The Wolf Den session cookie is host-only to wolfdengamingmn.com, and
// browsers do not send cookies across registrable domains -- so the game's own origin cannot see who you are.
//
// The handoff is the standard answer, and it is three steps:
//   1. The browser visits the WOLF DEN domain, which can see the session, and asks for a code.
//   2. It is redirected to the GAME domain carrying that code.
//   3. The game domain redeems the code server-side and sets its own session cookie.
//
// Both domains are the same Next.js deployment, so step 3 reuses createBuyerSession unchanged -- there is one
// accounts table, one password, one ban list. What differs is only which host the cookie is written for.
//
// ⚠️ SINGLE-USE IS ENFORCED IN THE DATABASE, NOT IN MEMORY. The realtime server can keep spent ticket ids in a
//    Map because it is one long-lived process; Next.js on Vercel is not, so every request may be a different
//    instance. A code that is merely short-lived is replayable for its whole lifetime out of browser history,
//    a shared link, or a Referer header -- and this code is worth a session.
//
// ⚠️ TWENTY SECONDS. It is spent by an automatic redirect, so it never needs to survive a human reading
//    anything. Long enough for a slow phone on a bad connection; too short to be worth pasting anywhere.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

export const HANDOFF_TTL_MS = 20_000;

export async function mintHandoffCode(buyerId) {
    const jti = randomUUID();
    await db.query(
        `INSERT INTO mkt_denquest_handoff (jti, buyer_id, expires_at)
         VALUES ($1, $2, now() + ($3 || ' milliseconds')::interval)`,
        [jti, buyerId, String(HANDOFF_TTL_MS)]
    );
    return jti;
}

/**
 * Redeem a code, exactly once.
 *
 * ⚠️ THE UPDATE IS THE LOCK. Reading the row and then marking it used is two statements with a gap between
 *    them, and two requests arriving together both read "unredeemed" and both succeed. A conditional UPDATE
 *    that returns the row is atomic: the second one matches nothing and gets null. This is the same shape as
 *    the rest of the repo's one-shot claims, and it is the reason this is not a SELECT.
 *
 * @returns {Promise<string|null>} the buyer id, or null if the code was bad, expired or already spent.
 */
export async function redeemHandoffCode(jti) {
    if (typeof jti !== "string" || !/^[0-9a-f-]{36}$/i.test(jti)) return null;
    const row = await db.queryOne(
        `UPDATE mkt_denquest_handoff
            SET redeemed_at = now()
          WHERE jti = $1
            AND redeemed_at IS NULL
            AND expires_at > now()
      RETURNING buyer_id`,
        [jti]
    ).catch(() => null);
    if (!row) return null;

    // Housekeeping, on the path that already has a connection open: codes
    // nobody redeemed would otherwise sit here forever.
    db.query(`DELETE FROM mkt_denquest_handoff WHERE expires_at < now() - interval '1 hour'`)
        .catch(() => { /* best effort */ });

    return String(row.buyer_id);
}
