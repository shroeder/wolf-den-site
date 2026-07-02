"use client";

function relTime(iso) {
    if (!iso) return null;
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return null;
    const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
    const days = Math.round(hrs / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
}

// "Live Local Inventory" strip — makes the marketplace feel alive. `nearby` (items within range) is
// supplied by the browse page once the buyer shares their location.
export default function MarketplaceLiveStats({ vendors = 0, items = 0, lastUpdatedAt = null, nearby = null }) {
    if (!items && !vendors) {
        return null;
    }
    const updated = relTime(lastUpdatedAt);

    return (
        <div className="mkt-live-stats">
            <span className="mkt-live-stat">
                <span className="mkt-live-dot" aria-hidden="true" />
                <strong>{vendors.toLocaleString()}</strong> vendor{vendors === 1 ? "" : "s"}
            </span>
            <span className="mkt-live-stat">
                <strong>{items.toLocaleString()}</strong> item{items === 1 ? "" : "s"} searchable
            </span>
            {updated ? <span className="mkt-live-stat">updated {updated}</span> : null}
            {nearby != null ? (
                <span className="mkt-live-stat">
                    <strong>{nearby.toLocaleString()}</strong> near you
                </span>
            ) : null}
        </div>
    );
}
