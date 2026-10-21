"use client";

// ── THE WISHLIST ─────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "You should be able to tap ingredients to add to wish list and see on the map where to find and above
// enemies which items they have that you wish for, and you can tap to remove similar to how yoi add. And an
// abikity to clear your wishlist."
//
// ⚠️ IT LIVES IN THE BROWSER AND IT IS SUPPOSED TO. Every instinct here says "a player's wishlist is player
// state, so it belongs in mkt_grove_player" — and that would put a read on the bench, a read on the map, a
// read on zone entry and a write on every tap, for a note-to-self. Active CPU is the bill and round trips
// are Active CPU (see CLAUDE.md); this is the one kind of state that genuinely does not need the server. It
// is a planning aid, not an entitlement: losing it costs a player thirty seconds of re-tapping, and nothing
// in the game reads it, grants from it, or validates against it.
//
// ⚠️ ONE STORE, THREE SURFACES, AND THEY MUST AGREE. The bench, the map and the zone all show the same list,
// and a tap in one has to be visible in the others immediately — a part you just un-wished still glowing over
// an enemy's head is the feature telling you something false. localStorage alone does not do that: it fires
// `storage` across TABS and never within the one that wrote it. So writes go through this module and it
// notifies its own subscribers synchronously; `storage` is handled too, for the second tab.
import { useCallback, useEffect, useState } from "react";

const KEY = "gv-wish";

// ⚠️ A CEILING, because the map pin and the enemy marker are per-part work on surfaces that run every frame,
// and because a wishlist of everything is a wishlist of nothing. Thirty is far more than a bench row needs.
export const WISH_MAX = 30;

const subs = new Set();

function read() {
    if (typeof window === "undefined") return [];
    try {
        const v = JSON.parse(window.localStorage.getItem(KEY) || "[]");
        return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, WISH_MAX) : [];
    } catch {
        // A corrupt value is not worth a crash on a screen whose job is to show a shopping list.
        return [];
    }
}

function write(next) {
    try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode, quota */ }
    for (const fn of subs) fn(next);
}

/**
 * The wishlist, and the three verbs every surface uses.
 *
 * ⚠️ STARTS EMPTY ON THE SERVER AND FILLS IN AN EFFECT. Reading localStorage during render makes the first
 * client paint disagree with the server's HTML, which React resolves by throwing the whole subtree away —
 * on the bench that is 129 recipe rows re-mounting on load.
 */
export function useWishlist() {
    const [wish, setWish] = useState([]);

    useEffect(() => {
        setWish(read());
        const onLocal = (next) => setWish(next);
        const onStorage = (e) => { if (e.key === KEY) setWish(read()); };
        subs.add(onLocal);
        window.addEventListener("storage", onStorage);
        return () => { subs.delete(onLocal); window.removeEventListener("storage", onStorage); };
    }, []);

    // ⚠️ READS THROUGH read() RATHER THAN CLOSING OVER `wish`. Two surfaces are mounted at once — the bench
    // behind the map sheet — and a toggle computed from a stale render's copy would drop whatever the other
    // surface added since. The stored value is the only truth.
    const toggle = useCallback((part) => {
        if (!part) return;
        const cur = read();
        write(cur.includes(part) ? cur.filter((p) => p !== part) : [...cur, part].slice(0, WISH_MAX));
    }, []);

    const clear = useCallback(() => write([]), []);

    return { wish, toggle, clear, has: (p) => wish.includes(p) };
}
