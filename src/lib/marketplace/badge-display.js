// How badges surface on a member's card: they SHOWCASE up to a few (their pick), and the top-ranked of
// those silently becomes the "folder tab". Pure (no server-only) so any layer can import it. Badges are
// assumed pre-sorted by sort_order (most prestigious first).
export const MAX_SHOWCASE = 3;

// The badges to actually display on a card: the member's chosen showcase (capped), or — when they
// haven't picked any — their top few by rank. Preserves the incoming (sort_order) order.
export function pickShowcaseBadges(badges, showcaseSlugs) {
    if (!badges || !badges.length) return [];
    if (showcaseSlugs && showcaseSlugs.length) {
        const set = new Set(showcaseSlugs);
        const chosen = badges.filter((b) => set.has(b.slug));
        if (chosen.length) return chosen.slice(0, MAX_SHOWCASE);
    }
    return badges.slice(0, MAX_SHOWCASE);
}
