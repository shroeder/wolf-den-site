// Presentational badge pills — usable from server or client components. Colors come from the badge def.
export default function UserBadges({ badges }) {
    if (!badges || badges.length === 0) return null;
    return (
        <div className="user-badges">
            {badges.map((b) => (
                <span
                    key={b.slug}
                    className="user-badge"
                    style={{ background: b.color || "#333" }}
                    title={b.description || b.label}
                >
                    {b.icon ? (
                        <span className="user-badge-icon" aria-hidden="true">
                            {b.icon}
                        </span>
                    ) : null}
                    {b.label}
                </span>
            ))}
        </div>
    );
}
