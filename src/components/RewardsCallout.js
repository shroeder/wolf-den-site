import Link from "next/link";

// Reusable "join the rewards program" hook. Drop it on high-traffic pages (home, shop) to pull visitors
// into the loyalty program. Presentational — no client JS.
export default function RewardsCallout({ href = "/marketplace/rewards", cta = "Join free →" }) {
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
