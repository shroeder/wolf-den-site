import BadgeArt from "@/components/BadgeArt";
import UserLevel from "@/components/UserLevel";

// The rewards track: a level roadmap (ranks + badges + future perks at each notable level) and an
// achievements list (every non-level badge with live progress). Presentational — data from getRewardsTrack.
export default function RewardsTrack({ track }) {
    if (!track) return null;
    const { level, levelObj, rank, spine, achievements, unlockedUnlockable, totalUnlockable } = track;

    return (
        <div className="stack">
            <section className="card rewards-hub-card">
                <div className="track-head">
                    <span className="rank-chip"><span aria-hidden="true">{rank.emoji}</span> {rank.title}</span>
                    <span className="track-head-level">Level {level}</span>
                </div>
                <UserLevel level={levelObj} />
                <div className="track-head-count muted">
                    🔓 {unlockedUnlockable} of {totalUnlockable} unlockable badges earned
                </div>
            </section>

            <section className="card">
                <h2 style={{ marginTop: 0 }}>Level roadmap</h2>
                <p className="muted" style={{ marginTop: 0 }}>Every level ahead and what it unlocks — ranks, badges, and perks on the way.</p>
                <ol className="track-spine">
                    {spine.map((n) => (
                        <li key={n.level} className={`track-node${n.reached ? " is-done" : ""}${n.isNext ? " is-next" : ""}`}>
                            <span className="track-node-marker" aria-hidden="true">{n.reached ? "✓" : n.level}</span>
                            <div className="track-node-body">
                                <div className="track-node-head">
                                    <span className="track-node-level">Level {n.level}</span>
                                    {n.isNext ? <span className="track-next-tag">NEXT · {n.xpToGo.toLocaleString()} XP to go</span> : null}
                                    {n.reached ? <span className="track-done-tag">Unlocked</span> : null}
                                </div>
                                <div className="track-unlocks">
                                    {n.rank ? (
                                        <span className="track-unlock is-rank">{n.rank.emoji} Rank: <strong>{n.rank.title}</strong></span>
                                    ) : null}
                                    {n.badges.map((b) => (
                                        <span key={b.slug} className="track-unlock is-badge" style={{ borderColor: b.color || undefined }}>
                                            {b.held ? "✅" : <BadgeArt slug={b.slug} icon={b.icon} />} {b.label}
                                        </span>
                                    ))}
                                    {n.perks.map((p, i) => (
                                        <span key={i} className="track-unlock is-perk">
                                            {p.icon} {p.label}{p.soon ? <em className="track-soon"> · Coming soon</em> : null}
                                        </span>
                                    ))}
                                    {!n.rank && n.badges.length === 0 && n.perks.length === 0 ? (
                                        <span className="track-unlock muted">Level {n.level}</span>
                                    ) : null}
                                </div>
                            </div>
                        </li>
                    ))}
                </ol>
            </section>

            <section className="card">
                <h2 style={{ marginTop: 0 }}>Badges &amp; achievements</h2>
                <p className="muted" style={{ marginTop: 0 }}>Milestones you unlock by doing what you already do. Progress updates as you go.</p>
                <div className="track-ach-grid">
                    {achievements.map((a) => (
                        <div key={a.slug} className={`track-ach${a.done ? " is-done" : ""}`}>
                            <div className="track-ach-top">
                                <span className="track-ach-icon" aria-hidden="true">{a.done ? "✅" : <BadgeArt slug={a.slug} icon={a.icon} />}</span>
                                <span className="track-ach-label">{a.label}</span>
                                {a.done ? <span className="track-ach-check">Unlocked</span> : null}
                            </div>
                            {a.description ? <div className="track-ach-desc muted">{a.description}</div> : null}
                            <div className="track-ach-bar">
                                <span style={{ "--pct": `${a.pct}%` }} />
                            </div>
                            <div className="track-ach-progress muted">{a.done ? "Complete ✓" : a.progress}</div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
