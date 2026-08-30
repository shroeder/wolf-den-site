import CounterClaimClient from "@/components/CounterClaimClient";
import TradeClaimClient from "@/components/TradeClaimClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getTradeClaim } from "@/lib/marketplace/trade-claim.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Claim your trade rewards | Wolf Den",
    robots: { index: false, follow: false },
};

// ── THE TRADE QR LANDS HERE ──────────────────────────────────────────────────────────────────────────────────
// Same shape as the purchase claim, and it had the same two problems in a worse form: the claim was read only
// AFTER the auth check, so a scanner was never told what the trade was worth — and it handed them the LOGIN
// form rather than the signup one, which is the wrong door for somebody who has never had an account.
//
// 44 of 79 trade QRs have never been redeemed. See counter-claim.js.
export default async function TradeClaimPage({ params }) {
    const { token } = await params;
    const [buyer, claim] = await Promise.all([
        getAuthenticatedBuyer().catch(() => null),
        getTradeClaim(token).catch(() => null),
    ]);

    if (buyer) {
        return (
            <div className="stack reveal" style={{ maxWidth: 460, margin: "0 auto" }}>
                <section className="card">
                    <TradeClaimClient token={token} claim={claim} />
                </section>
            </div>
        );
    }

    if (!claim || claim.redeemed || claim.expired) {
        return (
            <div className="stack reveal" style={{ maxWidth: 460, margin: "0 auto" }}>
                <section className="card cclaim-dead">
                    <b>{!claim ? "We can't find that code" : claim.redeemed ? "Already claimed" : "That code has expired"}</b>
                    <p className="muted">
                        {claim?.redeemed
                            ? "These rewards are already on somebody's account."
                            : "Show it to staff at the counter and they can put it right."}
                    </p>
                </section>
            </div>
        );
    }

    // getTradeClaim already works out `potentialXp` — the same number redeemTradeClaim pays — so unlike the
    // purchase claim there is nothing to re-derive here.
    const preview = {
        total: claim.potentialXp,
        lines: [
            { label: `${claim.cardCount} card${claim.cardCount === 1 ? "" : "s"} traded in`, points: claim.potentialXp },
        ],
    };

    return (
        <div className="stack reveal" style={{ maxWidth: 460, margin: "0 auto" }}>
            <section className="card">
                <CounterClaimClient
                    kind="trade" token={token} preview={preview}
                    signInHref={`/marketplace/login?returnTo=${encodeURIComponent(`/marketplace/claim-trade/${token}`)}`}
                />
            </section>
        </div>
    );
}
