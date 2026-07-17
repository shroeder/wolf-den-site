import { collectibleById } from "@/lib/marketplace/collectibles.js";

// The one collectible a member features on their profile — a compact rarity-tinted chip with the item's
// icon. Renders nothing if the id is missing/unknown. Purely presentational.
export default function FeaturedCollectible({ id, size = "md" }) {
    const item = id ? collectibleById(id) : null;
    if (!item) return null;
    const Icon = item.Icon;
    return (
        <span className={`featured-collectible rar-${item.rarity} fc-${size}`} title={`${item.name} — ${item.hint}`}>
            <span className="featured-collectible-icon" style={{ color: item.color }}>
                <Icon aria-hidden="true" />
            </span>
            <span className="featured-collectible-name">{item.name}</span>
        </span>
    );
}
