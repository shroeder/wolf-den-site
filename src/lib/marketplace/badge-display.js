// How badges surface on a member's card: they SHOWCASE up to a few (their pick), and the top-ranked of
// those silently becomes the "folder tab". Pure (no server-only) so any layer can import it. Badges are
// assumed pre-sorted by sort_order (most prestigious first).
export const MAX_SHOWCASE = 3;

/**
 * The badges to actually display on a card: the member's chosen showcase (capped), or — when they haven't
 * picked any — their top few by rank.
 *
 * `lockedSlug` is forced to the FRONT and can never be dropped. That has to happen here rather than by
 * ordering the stored array, because the filter below preserves the order of `badges` (sort_order), not the
 * order of the showcase list: the Mark of Shame sat first in the member's stored array and still rendered
 * last, behind Challenger and Boss Slayer, because its sort_order is 999. Index 0 is also the "tab", so an
 * account meant to be wearing a punishment was displaying its proudest badge instead.
 */
export function pickShowcaseBadges(badges, showcaseSlugs, lockedSlug = null) {
    if (!badges || !badges.length) return [];

    let out;
    if (showcaseSlugs && showcaseSlugs.length) {
        const set = new Set(showcaseSlugs);
        const chosen = badges.filter((b) => set.has(b.slug));
        out = chosen.length ? chosen : badges;
    } else {
        out = badges;
    }

    if (lockedSlug) {
        const locked = badges.find((b) => b.slug === lockedSlug);
        // Only if they actually hold it — a stale lock shouldn't invent a badge they don't have.
        if (locked) out = [locked, ...out.filter((b) => b.slug !== lockedSlug)];
    }
    return out.slice(0, MAX_SHOWCASE);
}
