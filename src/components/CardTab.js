import BadgeArt from "@/components/BadgeArt";

// A member's PRIMARY badge, rendered as a "folder tab" that sticks up above the top edge of their card
// (Manila-folder style). Purely presentational; render it as the first child of a `.has-card-tab`
// container (which must be position:relative and not clip overflow). Renders nothing without a badge.
export default function CardTab({ badge, compact = false }) {
    if (!badge) return null;
    return (
        <span
            className={`card-tab${compact ? " card-tab-compact" : ""}`}
            style={{ "--tab-color": badge.color || "#c8a24a" }}
            title={badge.label}
        >
            <span className="card-tab-icon" aria-hidden="true"><BadgeArt slug={badge.slug} icon={badge.icon || "🏅"} /></span>
            <span className="card-tab-label">{badge.label}</span>
        </span>
    );
}
