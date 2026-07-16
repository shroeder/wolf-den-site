import Link from "next/link";

import EarnChecklist from "@/components/EarnChecklist";
import RewardsTrackPreview from "@/components/RewardsTrackPreview";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getLeaderboard } from "@/lib/marketplace/profile.js";
import { getRewardsTrack } from "@/lib/marketplace/track.js";
import { showcaseTrack } from "@/lib/marketplace/unlocks.js";
import { getRewardsProgress } from "@/lib/marketplace/xp.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Wolf Den Rewards | Earn points on every purchase",
    description:
        "Join Wolf Den Rewards free. Earn XP on every in-store and online purchase, level up, and climb the leaderboard. Points on your very next visit.",
    alternates: { canonical: "/marketplace/rewards" },
};

const MEDALS = ["🥇", "🥈", "🥉"];

export default async function RewardsPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    const [top, progress, memberTrack] = await Promise.all([
        getLeaderboard(5).catch(() => []),
        buyer ? getRewardsProgress(buyer.id).catch(() => ({})) : Promise.resolve({}),
        buyer ? getRewardsTrack(buyer.id).catch(() => null) : Promise.resolve(null),
    ]);
    const signedIn = Boolean(buyer);

    return (
        <div className="stack reveal">
            <section className="card hero-accent">
                <h1>Wolf Den Rewards</h1>
                <p className="muted" style={{ fontSize: "1.05rem" }}>
                    Earn points on everything you do — every purchase, every event, every day. Level up, unlock your spot on the
                    leaderboard, and get recognized in the community. It&apos;s free.
                </p>
                {signedIn ? (
                    <div className="rewards-hero-cta">
                        <Link href="/marketplace/track" className="btn-gold rewards-hero-primary">Your rewards track →</Link>
                        <div className="rewards-hero-secondary">
                            <Link href="/marketplace/boss" className="pill">⚔️ Boss fight</Link>
                            <Link href="/marketplace/card" className="pill">🎟️ Loyalty card</Link>
                            <Link href="/marketplace/leaderboard" className="pill">🏆 Leaderboard</Link>
                        </div>
                    </div>
                ) : (
                    <div className="rewards-hero-cta">
                        <Link href="/marketplace/login?signup=1" className="btn-gold rewards-hero-primary">Create your free account →</Link>
                        <div className="rewards-hero-secondary">
                            <Link href="/marketplace/leaderboard" className="pill">🏆 Leaderboard</Link>
                        </div>
                    </div>
                )}
            </section>

            {signedIn ? (
                <RewardsTrackPreview track={memberTrack} />
            ) : (
                <RewardsTrackPreview
                    track={showcaseTrack()}
                    heading="🎁 Unlock these as you level up"
                    ctaHref="/marketplace/login?signup=1"
                    ctaLabel="Create a free account to start →"
                />
            )}

            <section className="card">
                <h2>How you earn</h2>
                <EarnChecklist progress={progress} signedIn={signedIn} />
                <p className="muted" style={{ fontSize: "0.85rem", marginTop: 10 }}>
                    {signedIn
                        ? "Tap any card to go earn it. Points land on your account automatically — in-store, just scan the QR at checkout."
                        : "Points land on your account automatically. Sign in to see what you've completed and tap to earn the rest."}
                </p>
            </section>

            {top.length > 0 ? (
                <section className="card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                        <h2 style={{ margin: 0 }}>Top members</h2>
                        <Link href="/marketplace/leaderboard" style={{ fontSize: "0.85rem" }}>Full leaderboard →</Link>
                    </div>
                    <ol className="mkt-leaderboard" style={{ marginTop: 10 }}>
                        {top.map((r) => (
                            <li key={r.alias} className="mkt-leader-row">
                                <span className="mkt-leader-rank">{MEDALS[r.rank - 1] || r.rank}</span>
                                <span className="mkt-leader-name">
                                    <Link href={`/marketplace/u/${r.alias}`}>{r.displayLabel}</Link>
                                    <span className="muted mkt-leader-handle">@{r.alias}</span>
                                </span>
                                <span className="mkt-leader-level">
                                    <span className="user-level-badge">Lv {r.level.level}</span>
                                    <span className="muted" style={{ fontSize: "0.8rem" }}>{r.xp.toLocaleString()} XP</span>
                                </span>
                            </li>
                        ))}
                    </ol>
                </section>
            ) : null}

            {!signedIn ? (
                <section className="card" style={{ textAlign: "center" }}>
                    <h2 style={{ marginTop: 0 }}>Start earning today</h2>
                    <p className="muted">Create a free account and earn points on your very next purchase.</p>
                    <Link href="/marketplace/login?signup=1" className="btn-gold">
                        Create your free account →
                    </Link>
                </section>
            ) : null}
        </div>
    );
}
