"use client";

import { useEffect, useRef } from "react";

/**
 * Poll on a timer, but only while the tab is actually being looked at.
 *
 * Every live screen (Town, Farm, boss fight, DMs, the messaging dock) ran a bare `setInterval` that kept firing
 * forever — so a phone with the Town open, screen off, in a pocket, was still asking the server for the whole
 * plaza every 4 seconds all night. That traffic was ~99% of the 944k function invocations in a 10-day billing
 * period, and it feeds Fluid CPU, Function Invocations and Fast Origin Transfer alike.
 *
 * Hidden means stopped, not slowed. Coming back fires immediately, so returning to the tab is fresh within a
 * second rather than waiting out an interval.
 *
 * Note this DOES change who counts as present in the Town: presence is a 90-second window, so a backgrounded
 * tab now drops out of the plaza. That's the honest answer — someone whose screen is off isn't standing in the
 * square — and they reappear the moment they look again.
 *
 * `fn` is read through a ref, so a caller re-creating its handler each render no longer tears down and rebuilds
 * the interval; the timer keeps its cadence and always calls the newest handler.
 *
 * @param {() => void} fn      what to run on each tick
 * @param {number|null} ms     interval; pass null/0 to disable (e.g. a modal that isn't open)
 * @param {{leading?: boolean}} [opts]  leading: also run once on mount (default true)
 */
export function useVisiblePoll(fn, ms, { leading = true } = {}) {
    const fnRef = useRef(fn);
    useEffect(() => { fnRef.current = fn; }, [fn]);

    useEffect(() => {
        if (!ms) return undefined;
        const visible = () => typeof document === "undefined" || document.visibilityState === "visible";
        let timer = null;
        const start = () => { if (timer == null) timer = setInterval(() => { if (visible()) fnRef.current?.(); }, ms); };
        const stop = () => { if (timer != null) { clearInterval(timer); timer = null; } };
        const onVisibility = () => {
            if (visible()) { fnRef.current?.(); start(); } else stop();
        };
        if (leading) fnRef.current?.();
        if (visible()) start();
        document.addEventListener("visibilitychange", onVisibility);
        return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
    }, [ms, leading]);
}
