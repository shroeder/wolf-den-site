// SEO-friendly shop product URLs: /shop/<name-slug>-<variationId>. Square variation ids are
// hyphen-free uppercase tokens, so the id is always the segment after the final hyphen. Plain module
// (no server-only) so client components can build links too.

const COMBINING_MARKS = /[̀-ͯ]/g;

export function productSlug(name) {
    const slug = String(name || "")
        .normalize("NFKD")
        .replace(COMBINING_MARKS, "") // strip accents (Pokémon -> Pokemon)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60)
        .replace(/-+$/g, "");

    return slug || "item";
}

export function productHandle(name, variationId) {
    return `${productSlug(name)}-${variationId}`;
}

export function variationIdFromHandle(handle) {
    const h = String(handle || "");
    const i = h.lastIndexOf("-");
    return i >= 0 ? h.slice(i + 1) : h;
}
