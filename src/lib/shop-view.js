// ── WHICH STOREFRONT THIS VISITOR GETS ──────────────────────────────────────────────────────────────────────
// Luke, 2026-11-01: "Can we make the new shop experience the default, and have a way to change the view mode
// to the old one that is intuitive."
//
// ⚠️ PLAIN MODULE, NO IMPORTS. /shop reads it on the server to decide what to render; the toggle reads it in
// the browser to write the cookie. One definition of the two names, or the two halves disagree and a visitor
// toggles into a view the server does not recognise.
//
// ⚠️ A COOKIE, NOT A QUERY PARAM. The choice has to survive a tap into a product page and back, and a shared
// /shop link must not carry one person's preference to everybody who opens it.
export const SHOP_VIEW_COOKIE = "wd-shop-view";

export const SHOP_VIEW = { swipe: "swipe", browse: "browse" };

// ⚠️ THE DEFAULT IS THE DECK, AND THAT IS THE WHOLE CHANGE. Anything unrecognised — no cookie, a stale value
// from an older build, a crawler — falls here, so the default is a property of this one line.
export const SHOP_VIEW_DEFAULT = SHOP_VIEW.swipe;

export function parseShopView(raw) {
    const v = String(raw || "").trim();
    return v === SHOP_VIEW.browse || v === SHOP_VIEW.swipe ? v : SHOP_VIEW_DEFAULT;
}

// A year: this is a preference, not a session. Lax so it survives arriving from a Facebook link.
export const SHOP_VIEW_MAX_AGE = 60 * 60 * 24 * 365;
