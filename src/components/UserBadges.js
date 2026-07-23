import BadgeArt from "@/components/BadgeArt";

// Presentational badge pills — usable from server or client components. Colors come from the badge def.
// The icon slot renders the badge's AI sprite when one exists, falling back to its emoji (BadgeArt handles it).
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
                        <span className="user-badge-icon">
                            <BadgeArt slug={b.slug} icon={b.icon} />
                        </span>
                    ) : null}
                    {b.label}
                </span>
            ))}
        </div>
    );
}
