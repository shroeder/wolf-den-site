// Level badge + progress-to-next-level bar. Presentational (server or client). `level` is the object
// from levelForXp(): { level, totalXp, xpToNext, progress }.
export default function UserLevel({ level }) {
    if (!level) return null;
    const pct = Math.round(Math.min(1, Math.max(0, level.progress || 0)) * 100);
    return (
        <div className="user-level">
            <div className="user-level-row">
                <span className="user-level-badge">Lv {level.level}</span>
                <span className="user-level-xp muted">
                    {level.totalXp} XP{level.xpToNext > 0 ? ` · ${level.xpToNext} to next` : ""}
                </span>
            </div>
            <div className="user-level-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}
