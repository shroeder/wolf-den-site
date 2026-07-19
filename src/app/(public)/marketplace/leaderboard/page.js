import Link from "next/link";

import ViewPing from "@/components/ViewPing";

import { getLeaderboard } from "@/lib/marketplace/profile.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Leaderboard | Wolf Den Marketplace",
};

const MEDALS = ["🥇", "🥈", "🥉"];

export default async function LeaderboardPage() {
    const rows = await getLeaderboard(50);

    return (
        <div className="stack reveal">
            <ViewPing event="view_leaderboard" />
            <section className="card hero-accent">
                <h1>Leaderboard</h1>
                <p className="muted">Top members by lifetime XP. Earn XP by shopping, checking in at events, and being active.</p>
                <p style={{ marginTop: 10 }}><Link href="/marketplace/badges" className="pill">🎖️ Your badges &amp; what&apos;s next →</Link></p>
            </section>

            <section className="card">
                {rows.length === 0 ? (
                    <p className="muted">No ranked members yet — earn some XP to claim the top spot.</p>
                ) : (
                    <ol className="mkt-leaderboard">
                        {rows.map((r) => (
                            <li key={r.alias} className="mkt-leader-row">
                                <span className="mkt-leader-rank">{MEDALS[r.rank - 1] || r.rank}</span>
                                <span className="mkt-leader-avatar" aria-hidden="true">
                                    {r.avatarUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={r.avatarUrl} alt="" />
                                    ) : (
                                        <span>{(r.displayLabel || "?").slice(0, 1).toUpperCase()}</span>
                                    )}
                                </span>
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
                )}
            </section>
        </div>
    );
}
