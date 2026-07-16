import Link from "next/link";

// A compact "next badge to earn" strip + link to the Badges hub. Presentational — drop it anywhere the
// board data is available (profile, rewards) to make earning + customizing badges obvious.
export default function NextBadgeNudge({ next, earnedCount = 0, totalCount = 0, href = "/marketplace/badges" }) {
    return (
        <Link href={href} className="badge-nudge">
            <span className="badge-nudge-icon" aria-hidden="true">{next ? next.icon || "🎖️" : "🏆"}</span>
            {next ? (
                <span className="badge-nudge-body">
                    <span className="badge-nudge-label">Next badge: {next.label}</span>
                    <span className="badge-nudge-bar"><span style={{ width: `${next.pct}%` }} /></span>
                    <span className="badge-nudge-sub muted">{next.current.toLocaleString()} / {next.target.toLocaleString()} · {earnedCount}/{totalCount} badges earned</span>
                </span>
            ) : (
                <span className="badge-nudge-body">
                    <span className="badge-nudge-label">You&apos;ve earned every badge! 🎉</span>
                    <span className="badge-nudge-sub muted">{earnedCount}/{totalCount} · tap to choose which show on your card</span>
                </span>
            )}
            <span className="badge-nudge-cta" aria-hidden="true">›</span>
        </Link>
    );
}
