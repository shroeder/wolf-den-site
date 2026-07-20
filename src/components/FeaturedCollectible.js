import PetArt from "@/components/PetArt";
import { collectibleById } from "@/lib/marketplace/collectibles.js";

// The one collectible a member features on their profile — a compact rarity-tinted chip with the pet's
// sprite (react-icons glyph fallback). Renders nothing if the id is missing/unknown. Purely presentational.
export default function FeaturedCollectible({ id, size = "md" }) {
    const item = id ? collectibleById(id) : null;
    if (!item) return null;
    // icon = compact circular badge (just the pet, no name) — used as a companion on avatars.
    if (size === "icon") {
        return (
            <span className={`pet-badge rar-${item.rarity}`} title={`${item.name} — ${item.hint}`}>
                <PetArt id={id} className="pet-badge-icon" />
            </span>
        );
    }
    return (
        <span className={`featured-collectible rar-${item.rarity} fc-${size}`} title={`${item.name} — ${item.hint}`}>
            <PetArt id={id} className="featured-collectible-icon" />
            <span className="featured-collectible-name">{item.name}</span>
        </span>
    );
}
