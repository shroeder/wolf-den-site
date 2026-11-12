"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

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
//
// ── ⚠️ THIS USED TO SHOW NOTHING AND THEN WORK ONCE ─────────────────────────────────────────────────────────
// Eric, on the storefront: "it lags and has no loader when switching between swipe and browse." Two faults,
// and the second one is the worse of the two.
//
// THE MISSING LOADER. It held a `busy` flag that NO PART OF ITS OWN MARKUP READ. Nothing was disabled,
// nothing spun, nothing dimmed — so a tap produced no response whatsoever until the whole page changed
// underneath you. And the wait is not small: switching to Browse re-renders a page carrying all 1,798
// in-stock items, which shop/page.js measured at 863 KB of HTML, and its own note says the stall is the
// browser parsing that and hydrating 1,798 components, "hardest on a phone". A seconds-long wait with no
// acknowledgement is indistinguishable from a dead button, which is exactly how it was reported.
//
// ⚠️ AND THE TOGGLE ONLY WORKED ONCE PER PAGE LOAD. `busy` was set true and deliberately never cleared —
// the old comment here argued that clearing it "would re-enable the control before the new view arrives".
// But router.refresh() does not unmount a client component; preserving client state across a re-render is
// the entire reason it is used instead of location.reload(), two notes up. So `busy` stayed true for the
// life of the page and every later tap hit `if (busy) return` and died silently. Swipe → Browse worked;
// Browse → Swipe did nothing at all, forever, until you reloaded by hand.
//
// useTransition fixes both, because `pending` is owned by React and goes false WHEN THE REFRESH LANDS —
// there is no flag to forget to clear and no window in which the control is wrongly live. `want` is only
// which half was tapped, so the spinner has somewhere to sit.
// ⚠️ MODULE SCOPE, NOT INSIDE THE COMPONENT, AND THE LINTER IS RIGHT TO INSIST. Writing document.cookie from
// a handler that useTransition has pulled into the React Compiler's graph trips react-hooks/immutability —
// "modifying a variable defined outside a component or hook is not allowed". It never fired on the old
// version because nothing there was memoizable. Naming the write and lifting it out is the honest fix: it is
// a DOM side effect and it has no business being analysed as render work.
function writeViewCookie(next) {
    document.cookie = `${SHOP_VIEW_COOKIE}=${next}; path=/; max-age=${SHOP_VIEW_MAX_AGE}; samesite=lax`;
}

export default function ShopViewToggle({ view }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [want, setWant] = useState(null);

    function choose(next) {
        if (next === view || pending) return;
        setWant(next);
        writeViewCookie(next);
        startTransition(() => { router.refresh(); });
    }

    // The tapped half fills GOLD on the tap rather than when the page arrives. That is honest and not
    // optimistic: the cookie is already written by this point, so that view IS what the shop is now set to
    // — the only thing still outstanding is the render. It is also the whole of the "it lags" complaint,
    // because a control that answers instantly reads as fast even when the page behind it takes a second.
    const lit = pending && want ? want : view;

    const half = (value, label) => (
        <button
            type="button"
            className={`sms-opt ${lit === value ? "sms-on" : ""}`}
            aria-pressed={lit === value}
            // The style hook as well as the announcement — see .sms-opt[aria-busy] in globals.css, and the
            // cart line items, which have styled off this attribute since long before this control.
            aria-busy={pending && want === value ? "true" : undefined}
            disabled={pending}
            onClick={() => choose(value)}
        >
            <span className="sms-label">{label}</span>
            {pending && want === value ? <span className="sms-spin" aria-hidden="true" /> : null}
        </button>
    );

    return (
        <div className="shop-mode-switch" role="group" aria-label="Shop view">
            {half(SHOP_VIEW.swipe, "Swipe")}
            {half(SHOP_VIEW.browse, "Browse")}
        </div>
    );
}
