// ── WHERE YOU WERE IN THE GROVE ──────────────────────────────────────────────────────────────────────────────
// Luke: "Going into a feature completely departs from the grove, we need a way to get back right where we left
// off. For example if I go to the forge in act 2 town I want to easily go right back to where I was in town.
// And this applies to every feature."
//
// The Grove is one full-screen client component with its own views; every feature is a separate Next page. So
// walking into the Forge is a real navigation that tears the Grove down, and coming back lands on the Grove's
// front door — the map — no matter which of its rooms you left from. For somebody standing in Deepdelve Camp
// that is two wrong screens: not the town, and not even the right map row.
//
// ⚠️ THE GROVE STAMPS WHERE IT IS; THE LINKS ARE NOT TOUCHED. The obvious build is to decorate every way out
// with a ?back= parameter — and it is the wrong one, because the ways out are not a list anybody can hold.
// The town street alone links to fifteen buildings, and the rest of the exits are the nav bar, the menu
// handle, a deep link in a sheet, the Tavern, a push notification. Decorating "every feature" means finding
// all of them, and the one that is missed is invisible: it just goes back to being the old behaviour.
//
// So nothing out-bound is decorated at all. The Grove writes down where it is as you move around inside it,
// and whatever takes you out — any link, typed URL, back button, anything built next year — leaves that note
// behind. One writer, one reader, and a new exit cannot forget to participate because it was never asked to.
//
// ⚠️ sessionStorage, NOT localStorage. The note means "you have a Grove open in this tab, go back to it". A
// tab that was closed a week ago does not, and a door pointing into a session that no longer exists is worse
// than no door — it is an invitation to a place you were not.

export const GROVE_RETURN_KEY = "wolfden-grove-return";

/** Fired when the note changes, so a door already on screen updates without a navigation. */
export const GROVE_RETURN_EVENT = "wolfden-grove-return";

/**
 * Where the Grove currently is, as somewhere you can be sent back to.
 *
 * @param {object|null} spot  { href, label } — or null to rub the note out
 *
 * Writing is wrapped because Safari's private mode throws on setItem rather than no-opping, and a storage
 * quota error thrown out of a render loop would take the whole Grove down to save a breadcrumb.
 */
export function stampGroveReturn(spot) {
    if (typeof window === "undefined") return;
    try {
        if (spot?.href) sessionStorage.setItem(GROVE_RETURN_KEY, JSON.stringify({ href: spot.href, label: spot.label || "The Grove" }));
        else sessionStorage.removeItem(GROVE_RETURN_KEY);
        window.dispatchEvent(new Event(GROVE_RETURN_EVENT));
    } catch { /* storage unavailable — the door simply does not appear */ }
}

/** The note, or null. ⚠️ CALL FROM AN EFFECT, never during render: it would differ from the server's HTML. */
export function readGroveReturn() {
    if (typeof window === "undefined") return null;
    try {
        const raw = sessionStorage.getItem(GROVE_RETURN_KEY);
        if (!raw) return null;
        const spot = JSON.parse(raw);
        // ⚠️ IT MUST POINT INTO THE GROVE. This is read back out of storage, which anything on the origin can
        // write — so a door built from it is a navigation target under someone else's control unless the
        // shape is checked here. A relative /marketplace/grove path and nothing else.
        return typeof spot?.href === "string" && spot.href.startsWith("/marketplace/grove") ? spot : null;
    } catch { return null; }
}

/**
 * The address of a Grove view, and what to call it on the door.
 *
 * ⚠️ A ZONE IS NOT A PLACE YOU CAN BE SENT BACK TO. A run holds a live server session — the floor, the seed,
 * what is still alive on it — and a URL cannot restore one; sending somebody to `view=zone` would drop them
 * into a Grove that has no session and renders nothing. The map row they were fighting on IS restorable, and
 * is one tap from the fight, so a zone stamps its map.
 */
export function groveSpot({ view, townN, townName, mapName }) {
    if (view === "town" && townN) {
        return { href: `/marketplace/grove?view=town&town=${townN}`, label: townName || `Town ${townN}` };
    }
    if (view === "town") return { href: "/marketplace/grove?view=town", label: townName || "Town" };
    return { href: "/marketplace/grove", label: mapName || "The Grove" };
}
