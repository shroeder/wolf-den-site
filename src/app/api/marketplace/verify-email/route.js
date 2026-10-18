import { NextResponse } from "next/server";

import {
    afterEmailVerified, createEmailVerification, getAuthenticatedBuyer, verifyEmailCode,
} from "@/lib/marketplace/buyer-session.js";
import { sendVerificationEmail } from "@/lib/marketplace/email.js";
import { settleIdleIncome } from "@/lib/marketplace/pet-income.js";
import { verifyOffer } from "@/lib/marketplace/verified-perks.js";
import { db } from "@/lib/db";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// ── VERIFYING FROM INSIDE THE GAME, FOR SOMEBODY WHO IS ALREADY SIGNED IN ────────────────────────────────────
// The login screen's verify flow (auth/verify) is the signup door: it takes an email + a code and hands back a
// session. This is the OTHER door — a member who has been playing for weeks on an unverified, passwordless
// account made at the till (counter-claim.js) and is being asked, from the couch, to finish the job.
//
// It is a different route rather than a flag on that one because the inputs are different: the address comes
// from the SESSION, never from the request body. A signed-in member may only ever verify their own address,
// which removes the whole question of what happens when somebody types a stranger's.
//
// The perks it switches on live in verified-perks.js; this route only turns the key.
const REASON_MESSAGES = {
    invalid_code: "That code isn't right.",
    expired: "That code expired — ask for a new one.",
    too_many_attempts: "Too many tries — ask for a new code.",
    no_code: "Ask for a code first.",
    not_found: "No account found for that address.",
};

// A fresh code may be asked for once a minute. createEmailVerification overwrites the stored code and resets
// the attempt counter on every call, so without this a held-down button is both an email flood aimed at the
// member's own inbox and a way to wipe the attempt throttle. 30 minutes is the code's TTL, so "expires more
// than 29 minutes from now" is "one was issued in the last minute" without storing anything new.
const RESEND_GRACE_MIN = 29;

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/verify-email", async ({ logger, internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer?.id) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const action = String(body?.action || "").trim().toLowerCase();

            // Already verified? Say so plainly rather than sending a code for nothing. Also covers the member
            // who verified on another device and still has this card on screen.
            const offer = await verifyOffer(buyer.id);
            if (offer.verified) return NextResponse.json({ ok: true, verified: true, perks: offer.perks });

            if (action === "send") {
                const pending = await db
                    .queryOne(
                        `SELECT 1 AS recent FROM mkt_buyer
                          WHERE id = $1 AND email_verify_expires > NOW() + ($2 || ' minutes')::interval`,
                        [buyer.id, String(RESEND_GRACE_MIN)]
                    )
                    .catch(() => null);
                if (pending) return NextResponse.json({ ok: true, sent: true, alreadySent: true, email: offer.email });

                const verification = await createEmailVerification(buyer.email);
                if (verification) {
                    try {
                        await sendVerificationEmail(verification.email, verification.code);
                    } catch (emailError) {
                        logger.warn("marketplace.verify_perks.email_failed", { reason: emailError.message });
                        return NextResponse.json({ error: "We couldn't send that email. Try again in a minute." }, { status: 502 });
                    }
                }
                return NextResponse.json({ ok: true, sent: true, email: offer.email });
            }

            if (action === "confirm") {
                const code = String(body?.code || "").trim();
                if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: "Enter the 6-digit code.", reason: "invalid_code" }, { status: 400 });
                // ── SETTLE BEFORE THE FLAG FLIPS, STAMP THE CLOCK AFTER ─────────────────────────────────
                // The idle clock (mkt_buyer.pet_income_at) has been ticking since this member's first game
                // read, and settleIdleIncome prices the whole elapsed window at the CURRENT rate. Verifying
                // first and settling after would therefore pay up to 24 hours of verified mail for the day
                // BEFORE the perk existed — a reward backdated to before it was earned, which is the same
                // shape of bug as a faucet nobody declared.
                //
                // So: settle here, while the account is still unverified (pays out any pet income owed at
                // the old rate — rather than forfeiting it, which is what stamping alone would do), then
                // verify, then put the clock at now so the mail starts from the moment it was switched on.
                await settleIdleIncome(buyer.id).catch(() => {});
                const result = await verifyEmailCode(buyer.email, code);
                if (!result.ok) {
                    const message = REASON_MESSAGES[result.reason] || "Couldn't verify your address.";
                    return NextResponse.json({ error: message, reason: result.reason }, { status: 400 });
                }
                // The shop bridge + the one-time referral payout, shared with the login-screen door.
                await afterEmailVerified(result.buyer);
                // The mail starts here (see the note above the settle).
                await db.query(`UPDATE mkt_buyer SET pet_income_at = NOW() WHERE id = $1`, [buyer.id]).catch(() => {});
                const after = await verifyOffer(buyer.id);
                logger.info("marketplace.buyer.verified_in_game", { buyerId: buyer.id });
                return NextResponse.json({ ok: true, verified: true, perks: after.perks });
            }

            return NextResponse.json({ error: "bad_request" }, { status: 400 });
        } catch (error) {
            return internalError(error, { event: "marketplace.verify_perks.failure" });
        }
    });
}
