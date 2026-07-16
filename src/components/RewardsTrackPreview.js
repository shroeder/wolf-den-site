import Link from "next/link";

// A compact, always-visible teaser of the next things a member will unlock on the rewards track — the
// engagement carrot. Shows the next few unreached level milestones with what unlocks there + the XP to
// the very next one, and a prominent CTA into the full track. Presentational (data from getRewardsTrack).
function levelItems(node) {
    const items = [];
    if (node.rank) items.push({ key: "rank", icon: node.rank.emoji, label: node.rank.title, rank: true });
    (node.badges || []).forEach((b) => items.push({ key: `b-${b.slug}`, icon: b.icon, label: b.label }));
    (node.perks || []).forEach((p, i) => items.push({ key: `p-${i}`, icon: p.icon, label: p.label }));
    return items;
}

export default function RewardsTrackPreview({ track }) {
    if (!track) return null;
    const upcoming = (track.spine || []).filter((n) => !n.reached).slice(0, 3);
    if (!upcoming.length) return null; // maxed out

    return (
        <section className="card track-preview">
            <div className="track-preview-head">
                <h2 style={{ margin: 0 }}>🎁 Up next to unlock</h2>
                <span className="track-preview-count muted">{track.unlockedUnlockable}/{track.totalUnlockable} earned</span>
            </div>

            <ol className="track-preview-list">
                {upcoming.map((node) => {
                    const items = levelItems(node);
                    const shown = items.slice(0, 4);
                    const extra = items.length - shown.length;
                    return (
                        <li key={node.level} className={`track-preview-node${node.isNext ? " is-next" : ""}`}>
                            <span className="track-preview-lv">
                                <strong>Lv {node.level}</strong>
                                {node.isNext ? <em className="track-preview-togo"> · {node.xpToGo.toLocaleString()} XP to go</em> : null}
                            </span>
                            <div className="track-preview-chips">
                                {shown.length ? (
                                    shown.map((it) => (
                                        <span key={it.key} className={`track-chip${it.rank ? " is-rank" : ""}`}>
                                            <span aria-hidden="true">{it.icon}</span> {it.label}
                                        </span>
                                    ))
                                ) : (
                                    <span className="track-chip muted">Level {node.level}</span>
                                )}
                                {extra > 0 ? <span className="track-chip is-more">+{extra} more</span> : null}
                            </div>
                        </li>
                    );
                })}
            </ol>

            <Link href="/marketplace/track" className="button primary track-preview-cta">See your full rewards track →</Link>
        </section>
    );
}
