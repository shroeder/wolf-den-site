import CounterClaimClient from "@/components/CounterClaimClient";
import LoyaltyClaimClient from "@/components/LoyaltyClaimClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getLoyaltyClaim } from "@/lib/marketplace/loyalty-claim.js";
import { previewPurchaseXp } from "@/lib/marketplace/xp.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Claim your points | Wolf Den",
    robots: { index: false, follow: false },
};

// ── THE RECEIPT QR LANDS HERE ────────────────────────────────────────────────────────────────────────────────
// This used to check the session FIRST and hand an unknown scanner the ordinary create-account form — which
// meant `getLoyaltyClaim` was never called for them and the page could not say what they had won. A signup
// form with nothing on the other side of it, read at a till with a queue behind them.
//
// The claim is read BEFORE the auth check now, so the prize is on screen for everybody, and the signed-out
// path is one email field (see CounterClaimClient / counter-claim.js).
export default async function LoyaltyClaimPage({ params }) {
    const { token } = await params;
    const [buyer, claim] = await Promise.all([
        getAuthenticatedBuyer().catch(() => null),
        getLoyaltyClaim(token).catch(() => null),
    ]);

    if (buyer) {
        return (
            <div className="stack reveal" style={{ maxWidth: 460, margin: "0 auto" }}>
                <section className="card">
                    <LoyaltyClaimClient token={token} claim={claim} />
                </section>
            </div>
        );
    }

    // A dead code says so plainly rather than asking for an address it is going to refuse anyway.
    if (!claim || claim.redeemed || claim.expired) {
        return (
            <div className="stack reveal" style={{ maxWidth: 460, margin: "0 auto" }}>
                <section className="card cclaim-dead">
                    <b>{!claim ? "We can't find that code" : claim.redeemed ? "Already claimed" : "That code has expired"}</b>
                    <p className="muted">
                        {claim?.redeemed
                            ? "These points are already on somebody's account."
                            : "Show it to staff at the counter and they can put it right."}
                    </p>
                </section>
            </div>
        );
    }

    // firstEver: true — they are scanning without an account, so they cannot have bought anything before and
    // the first-purchase bonus is a certainty rather than a guess. See previewPurchaseXp.
    const xp = previewPurchaseXp({ amountCents: claim.amountCents, firstEver: true });
    const preview = {
        total: xp.total,
        lines: [
            { label: `$${(claim.amountCents / 100).toFixed(2)} spent`, points: xp.spend },
            ...(xp.flat ? [{ label: "Purchase bonus", points: xp.flat }] : []),
            ...(xp.first ? [{ label: "First visit bonus", points: xp.first }] : []),
        ],
    };

    return (
        <div className="stack reveal" style={{ maxWidth: 460, margin: "0 auto" }}>
            <section className="card">
                <CounterClaimClient
                    kind="loyalty" token={token} preview={preview}
                    signInHref={`/marketplace/login?returnTo=${encodeURIComponent(`/marketplace/claim/${token}`)}`}
                />
            </section>
        </div>
    );
}
