"use client";

import { useEffect } from "react";

// Lock background scrolling while a modal/overlay is open. `overflow:hidden` alone doesn't hold on mobile —
// the page still scrolls under a fixed overlay — so we pin the body with position:fixed and restore the exact
// scroll position on close. Refcounted so nested/stacked modals don't fight over the body (the lock lifts
// only when the LAST open modal closes). Call with a boolean: useScrollLock(isOpen).
let locks = 0;
let saved = null; // { scrollY, prev: {...body styles} }

export default function useScrollLock(active) {
    useEffect(() => {
        if (!active || typeof document === "undefined") return undefined;
        const body = document.body;
        if (locks === 0) {
            const scrollY = window.scrollY;
            saved = {
                scrollY,
                prev: { position: body.style.position, top: body.style.top, left: body.style.left, right: body.style.right, width: body.style.width, overflow: body.style.overflow },
            };
            body.style.position = "fixed";
            body.style.top = `-${scrollY}px`;
            body.style.left = "0";
            body.style.right = "0";
            body.style.width = "100%";
            body.style.overflow = "hidden";
        }
        locks += 1;
        return () => {
            locks -= 1;
            if (locks <= 0 && saved) {
                locks = 0;
                const { scrollY, prev } = saved;
                body.style.position = prev.position;
                body.style.top = prev.top;
                body.style.left = prev.left;
                body.style.right = prev.right;
                body.style.width = prev.width;
                body.style.overflow = prev.overflow;
                window.scrollTo(0, scrollY);
                saved = null;
            }
        };
    }, [active]);
}
