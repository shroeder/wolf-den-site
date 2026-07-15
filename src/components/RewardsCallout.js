import Link from "next/link";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";

// "Join the rewards program" hook for high-traffic pages (home, shop). Hidden for signed-in members —
// they already have an account, so the "Join free" CTA is noise.
export default async function RewardsCallout({ href = "/marketplace/rewards", cta = "Join free →" }) {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (buyer) return null;

    return (
        <section className="card rewards-callout">
            <div className="rewards-callout-text">
                <div className="rewards-callout-title">🏆 Wolf Den Rewards</div>
                <div className="rewards-callout-sub">
                    Earn points on every purchase — in-store &amp; online. Level up, climb the leaderboard. Free to join.
                </div>
            </div>
            <Link href={href} className="btn-gold">{cta}</Link>
        </section>
    );
}
