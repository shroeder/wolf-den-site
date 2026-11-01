"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { SHOP_VIEW, SHOP_VIEW_COOKIE, SHOP_VIEW_MAX_AGE } from "@/lib/shop-view.js";

// ── THE WAY BACK TO THE OLD SHOP ────────────────────────────────────────────────────────────────────────────
// Luke: "have a way to change the view mode to the old one that is intuitive."
//
// ⚠️ A SEGMENTED CONTROL, NOT A LINK AND NOT A MENU ITEM. Two labelled halves with the current one filled is
// the one control everybody already reads as "there are exactly two of these and you are in this one". The
// previous door to this feature was a prose link ("Try the new view") that Luke could not find on his own
// phone — see the note in shop/page.js. A toggle that has to be discovered is the same bug again.
//
// ⚠️ IT SAYS WHAT YOU GET, NOT WHAT IT DOES. "Swipe" / "Browse" name the two storefronts; "Switch view" would
// make somebody tap it to find out. No icons — the words are shorter than explaining a glyph.
//
// ⚠️ router.refresh(), NOT location.reload(). The server decides which view renders off the cookie, so the
// page has to be re-fetched — but a hard reload throws away the cart drawer and scroll position and reads as
// the site restarting. refresh() re-renders the server component in place.
// WARNING: NOT .shop-view-toggle -- ShopBrowser has owned that class since long before this component,
// for the scrolling category TAB STRIP inside the grid. A duplicate here would have landed later in
// globals.css and restyled that strip into a pill. [[grep-the-class-name-before-taking-it]].
export default function ShopViewToggle({ view }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    function choose(next) {
        if (next === view || busy) return;
        setBusy(true);
        document.cookie = `${SHOP_VIEW_COOKIE}=${next}; path=/; max-age=${SHOP_VIEW_MAX_AGE}; samesite=lax`;
        router.refresh();
        // The refresh resolves on the server; clearing here would re-enable the control before the new view
        // arrives, which invites a second tap that writes the cookie back.
    }

    return (
        <div className="shop-mode-switch" role="group" aria-label="Shop view">
            <button
                type="button"
                className={`sms-opt ${view === SHOP_VIEW.swipe ? "sms-on" : ""}`}
                aria-pressed={view === SHOP_VIEW.swipe}
                onClick={() => choose(SHOP_VIEW.swipe)}
            >
                Swipe
            </button>
            <button
                type="button"
                className={`sms-opt ${view === SHOP_VIEW.browse ? "sms-on" : ""}`}
                aria-pressed={view === SHOP_VIEW.browse}
                onClick={() => choose(SHOP_VIEW.browse)}
            >
                Browse
            </button>
        </div>
    );
}
