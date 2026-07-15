import Link from "next/link";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getLeaderboard } from "@/lib/marketplace/profile.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Wolf Den Rewards | Earn points on every purchase",
    description:
        "Join Wolf Den Rewards free. Earn XP on every in-store and online purchase, level up, and climb the leaderboard. Points on your very next visit.",
    alternates: { canonical: "/marketplace/rewards" },
};

const EARN = [
    { icon: "🛒", label: "Every $1 spent", points: "+1 XP", note: "in-store & online" },
    { icon: "⭐", label: "Your first purchase", points: "+100 XP", note: "one-time bonus" },
    { icon: "📅", label: "Check in at an event", points: "+50 XP", note: "each event" },
    { icon: "💬", label: "Link your Discord", points: "+50 XP", note: "join the server" },
    { icon: "✅", label: "Complete your profile", points: "+25 XP", note: "name, handle, photo" },
    { icon: "🔥", label: "Daily visits & activity", points: "+XP", note: "come back often" },
];

const MEDALS = ["🥇", "🥈", "🥉"];

export default async function RewardsPage() {
    const [buyer, top] = await Promise.all([
        getAuthenticatedBuyer().catch(() => null),
        getLeaderboard(5).catch(() => []),
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
                <div className="mkt-hero-links" style={{ marginTop: 12 }}>
                    {signedIn ? (
                        <>
                            <Link href="/marketplace/card" className="btn-gold">🎟️ Your loyalty card</Link>
                            <Link href="/marketplace/leaderboard" className="pill">🏆 Leaderboard</Link>
                        </>
                    ) : (
                        <>
                            <Link href="/marketplace/login?signup=1" className="btn-gold">
                                Create your free account →
                            </Link>
                            <Link href="/marketplace/leaderboard" className="pill">🏆 Leaderboard</Link>
                        </>
                    )}
                </div>
            </section>

            <section className="card">
                <h2>How you earn</h2>
                <ul className="mkt-earn-grid">
                    {EARN.map((e) => (
                        <li key={e.label} className="mkt-earn-item">
                            <span className="mkt-earn-icon" aria-hidden="true">{e.icon}</span>
                            <span className="mkt-earn-body">
                                <span className="mkt-earn-label">{e.label}</span>
                                <span className="muted mkt-earn-note">{e.note}</span>
                            </span>
                            <span className="mkt-earn-points">{e.points}</span>
                        </li>
                    ))}
                </ul>
                <p className="muted" style={{ fontSize: "0.85rem", marginTop: 10 }}>
                    Points land on your account automatically. Shopping in-store? Just scan the QR at checkout to start earning.
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
