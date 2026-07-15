import Link from "next/link";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getLeaderboard } from "@/lib/marketplace/profile.js";
import { getRewardsProgress } from "@/lib/marketplace/xp.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Wolf Den Rewards | Earn points on every purchase",
    description:
        "Join Wolf Den Rewards free. Earn XP on every in-store and online purchase, level up, and climb the leaderboard. Points on your very next visit.",
    alternates: { canonical: "/marketplace/rewards" },
};

// `repeatable` items can be earned again, so their "done" reads as an ongoing state, not a finish line.
const EARN = [
    { key: "spend", icon: "🛒", label: "Every $1 spent", points: "+1 XP", note: "in-store & online", href: "/shop", cta: "Shop now →", doneNote: "You're earning on purchases", repeatable: true },
    { key: "first_purchase", icon: "⭐", label: "Your first purchase", points: "+100 XP", note: "one-time bonus", href: "/shop", cta: "Make a purchase →" },
    { key: "event_checkin", icon: "📅", label: "Check in at an event", points: "+50 XP", note: "each event", href: "/events", cta: "See events →", doneNote: "Checked in before", repeatable: true },
    { key: "discord_link", icon: "💬", label: "Link your Discord", points: "+50 XP", note: "join the server", href: "/api/marketplace/discord/start", cta: "Link Discord →" },
    { key: "profile_complete", icon: "✅", label: "Complete your profile", points: "+25 XP", note: "name, handle, photo", href: "/marketplace/profile", cta: "Edit profile →" },
    { key: "daily_active", icon: "🔥", label: "Daily visits & activity", points: "+XP", note: "come back often", href: "/shop", cta: "Keep it up →", doneNote: "Active today", repeatable: true },
];

const MEDALS = ["🥇", "🥈", "🥉"];

export default async function RewardsPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    const [top, progress] = await Promise.all([
        getLeaderboard(5).catch(() => []),
        buyer ? getRewardsProgress(buyer.id).catch(() => ({})) : Promise.resolve({}),
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
                    {EARN.map((e) => {
                        const done = signedIn && Boolean(progress[e.key]);
                        return (
                            <li key={e.key}>
                                <Link href={e.href} className={`mkt-earn-item mkt-earn-cta${done ? " mkt-earn-done" : ""}`}>
                                    <span className="mkt-earn-icon" aria-hidden="true">{done && !e.repeatable ? "✅" : e.icon}</span>
                                    <span className="mkt-earn-body">
                                        <span className="mkt-earn-label">{e.label}</span>
                                        <span className="muted mkt-earn-note">{done ? (e.doneNote || "Completed ✓") : (signedIn ? e.cta : e.note)}</span>
                                    </span>
                                    <span className="mkt-earn-points">{done && !e.repeatable ? "Done" : e.points}</span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
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
