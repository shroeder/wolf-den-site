import "server-only";

import { db } from "@/lib/db";
import {
    createBuyerSession, getOrCreateBuyerByEmail, isValidBuyerEmail, normalizeEmail, setBuyerSessionCookie,
} from "@/lib/marketplace/buyer-session.js";
import { getDonationClaim, redeemDonationClaim } from "@/lib/marketplace/donation-claim.js";
import { getLoyaltyClaim, redeemLoyaltyClaim } from "@/lib/marketplace/loyalty-claim.js";
import { previewPurchaseXp } from "@/lib/marketplace/xp.js";
import { getTradeClaim, redeemTradeClaim } from "@/lib/marketplace/trade-claim.js";

// ── CLAIMING AT THE COUNTER, IN ONE FIELD ────────────────────────────────────────────────────────────────────
// Luke: "they are at the counter after the sale and dont want to type in their email and verify because its
// too much thinking for them."
//
// He is right, and the numbers are blunt about it. 56 of 80 scans happen within TEN MINUTES of the sale —
// median time from the receipt printing to the phone hitting the page is 0.0 hours — so this form is being
// filled in at the till with a queue behind them. What it asked for was first name, last name, display name,
// email and a password, and THEN a six-digit code out of their inbox, which is an app-switch. 31 of those 80
// walked away.
//
// This is the whole of it: type your email, tap once, the points are banked. No password, no code, no name.
//
// ── WHY THAT IS SAFE, AND EXACTLY WHERE IT STOPS BEING SAFE ──────────────────────────────────────────────────
// Handing out a session for an unverified email typed at a counter is account takeover if that email already
// belongs to somebody: type a member's address, get their account. So the rule is absolute and it is the
// reason this file exists rather than a flag on the register route:
//
//     NEW email  → create a passwordless account and sign them in. There is nothing to steal; the account
//                  did not exist a moment ago and they are the one who caused it to.
//     KNOWN email → NO session, ever. Not under any circumstances, not behind any confirmation.
//
// ⚠️ BUT "NO SESSION" IS NOT THE SAME AS "NO POINTS", AND CONFLATING THE TWO SENT EVERY EXISTING MEMBER TO A
// LOGIN FORM AT THE TILL. Luke: "it also made her log in again, where it used to not." What actually happened
// to her is iOS Safari: a QR opens a fresh Safari context, and Safari's ITP wipes the cookies of a context
// that has not visited the site in seven days. Her everyday context was signed in the whole time — 422 hits,
// used the day before — while the one the Camera app opens had gone cold since 4 September. She was never
// signed out; she was signed out THERE. That will happen to every customer who scans less than weekly, which
// is most of them, and no session length fixes it because the cookie is deleted rather than expired.
//
// So a KNOWN address confirms and banks. The points go to the account that owns that address — which is where
// they were always going, by definition — and the browser gets nothing: no cookie, no session, no way into
// the account. Typing a stranger's address makes THEM a present and gets you a screen saying so.
//
// The confirmation exists for the typo, not the attacker: banking a $200 receipt onto somebody else's account
// because of one wrong letter is unrecoverable, so the address is read back before it is spent.
//
// The passwordless account is not a new idea here — getOrCreateBuyerByEmail already builds exactly this for
// /shop customers, links the Square customer, sets an alias and grants starter seeds. They set a password
// later through the ordinary reset flow, which is what that function's own note says it is for.
//
// EMAIL ENUMERATION is the residual: "that address already has an account" is information. It is gated behind
// possession of a live, unredeemed claim token — you have to be holding a real receipt QR from a real sale in
// the last day to ask the question even once — and the alternative is refusing to tell a genuine customer why
// their own address will not work. That trade is deliberate.

// The three kinds of claim a customer scans. Each is (read, redeem) over its own table; nothing else differs,
// which is why one door serves all three rather than three near-identical routes.
const KINDS = {
    loyalty: { read: getLoyaltyClaim, redeem: redeemLoyaltyClaim, path: "claim" },
    trade: { read: getTradeClaim, redeem: redeemTradeClaim, path: "claim-trade" },
    donation: { read: getDonationClaim, redeem: redeemDonationClaim, path: "claim-donation" },
};

export const isClaimKind = (k) => Object.hasOwn(KINDS, String(k || ""));

/**
 * Claim a scanned QR with nothing but an email address.
 *
 * Returns one of:
 *   { ok: true, signedIn: true }      — account made, signed in, claim redeemed
 *   { ok: true, signedIn: false }     — banked onto an existing member's account; no session granted
 *   { ok: false, needsConfirm: true } — the address is already a member's; read it back and ask
 *   { ok: false, error }              — the claim is dead, or the address is not an address
 */
export async function claimAtCounter({ kind, token, email, confirm = false }) {
    const def = KINDS[String(kind || "")];
    if (!def || !token) return { ok: false, error: "bad_request" };
    if (!isValidBuyerEmail(email)) return { ok: false, error: "bad_email" };

    // ── THE CLAIM IS CHECKED FIRST, BEFORE ANY ACCOUNT EXISTS ────────────────────────────────────────────
    // Creating an account and then discovering the token expired leaves somebody with a Wolf Den login they
    // never asked for and no points, which is a worse outcome than the refusal. Ask the cheap question first.
    const claim = await def.read(token).catch(() => null);
    if (!claim) return { ok: false, error: "not_found" };
    if (claim.redeemed) return { ok: false, error: "already_claimed" };
    if (claim.expired) return { ok: false, error: "expired" };

    // Is this address already somebody? Read-only — see the note above on why a KNOWN address never gets a
    // session out of this door.
    const normalized = normalizeEmail(email);
    const existing = await db
        .queryOne(`SELECT id FROM mkt_buyer WHERE email_normalized = $1`, [normalized])
        .catch(() => null);
    if (existing) {
        // First pass: read the address back and ask. Nothing is spent and nothing is revealed — they are being
        // shown what they themselves just typed.
        //
        // ⚠️ AND THE HEADLINE NUMBER IS CORRECTED WHILE WE ARE HERE. The page renders its preview with
        // `firstEver: true`, because a scanner with no session is ASSUMED to be new — which is the right guess
        // right up until the address turns out to belong to a member who used their first-visit bonus months
        // ago. The screen then promised 245 points and banked 149. Over-promising and under-delivering is its
        // own kind of "the rewards were lame", and it is the half we can simply not do.
        const had = await db
            .queryOne(`SELECT 1 AS ok FROM mkt_xp_event WHERE buyer_id = $1 AND action = 'first_purchase' LIMIT 1`, [existing.id])
            .catch(() => null);
        const honest = previewPurchaseXp({ amountCents: claim.amountCents, firstEver: !had });
        if (!confirm) {
            return {
                ok: false, needsConfirm: true, error: "needs_confirm", email: normalized,
                points: honest.total,
                lines: [
                    { label: `$${(claim.amountCents / 100).toFixed(2)} spent`, points: honest.spend },
                    ...(honest.flat ? [{ label: "Purchase bonus", points: honest.flat }] : []),
                    ...(honest.first ? [{ label: "First visit bonus", points: honest.first }] : []),
                ],
            };
        }
        // Second pass: bank it on THEIR account and hand this browser nothing at all.
        const redeemed = await def.redeem(token, existing.id).catch(() => ({ ok: false, error: "redeem_failed" }));
        if (!redeemed?.ok) return { ok: false, error: redeemed?.error || "redeem_failed" };
        return {
            ok: true, signedIn: false, email: normalized,
            redeemed: true,
            points: Number(redeemed.points) || 0,
            level: redeemed.level ?? null,
        };
    }

    const buyer = await getOrCreateBuyerByEmail(email, { emailVerified: false }).catch(() => null);
    if (!buyer?.id) return { ok: false, error: "could_not_create" };

    // Signed in on this device for 90 days, the same cookie the ordinary web login sets. The account is
    // unverified and stays that way until they verify — which is now a thing they can be asked at leisure,
    // from the couch, instead of at the till.
    const session = await createBuyerSession(buyer.id, { deviceLabel: "counter-claim" }).catch(() => null);
    if (!session?.token) return { ok: false, error: "could_not_sign_in" };
    await setBuyerSessionCookie(session.token);

    const redeemed = await def.redeem(token, buyer.id).catch(() => ({ ok: false, error: "redeem_failed" }));
    // The account and the session stand either way. They typed their address and pressed the button; if the
    // redemption lost a race they are still a member, and telling them to make the account again would be
    // both wrong and impossible.
    return {
        ok: true,
        signedIn: true,
        buyerId: buyer.id,
        email: buyer.email,
        redeemed: Boolean(redeemed?.ok),
        points: Number(redeemed?.points) || 0,
        level: redeemed?.level ?? null,
        redeemError: redeemed?.ok ? null : (redeemed?.error || null),
    };
}
