"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { GUIDE_STEP_PATHS } from "@/lib/marketplace/guide-chapters.js";
import { isGamePath } from "@/lib/marketplace/game-paths.js";

// ── THE GUIDE, EVERYWHERE ────────────────────────────────────────────────────────────────────────────────────
// Mounted once in the marketplace layout, so it follows you into every room of the game rather than living on
// the home screen and abandoning you the moment you walk somewhere. It self-hides outside the game (the shop,
// vendor and admin surfaces) using the same path list the nav uses, so a new area can never keep the nav and
// silently lose the guide.
//
// IT KNOWS WHERE YOU ARE STANDING. If you're already on the page the current step points at, it stops being a
// signpost and becomes a prompt: "You're in the right place — plant your first crop." That single state is the
// difference between a link you followed and a guide that came with you.
//
// EVERY RULE HERE IS GLOBAL, ON PURPOSE. The card is a <Link>, and styled-jsx does not add its `jsx-<hash>`
// scope class to a custom component — only to DOM elements. A scoped `.gs` on that <Link> is why this once
// rendered as "NEXT · THE TOWNTake a town quest+200" in bare text with no box at all. `npm run check:styled-jsx`
// fails the build if that comes back.

// One shared read across mounts — navigating between game pages remounts this constantly and the answer does
// not change in the half-second it takes to move rooms.
let memo = { at: 0, data: null };
const TTL = 10_000;

export default function GuideStrip() {
    const pathname = usePathname() || "";
    const [g, setG] = useState(memo.data);

    const load = useCallback(async (force = false) => {
        if (!force && memo.data && Date.now() - memo.at < TTL) { setG(memo.data); return; }
        const d = await fetch("/api/marketplace/guide", { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (d) { memo = { at: Date.now(), data: d }; setG(d); }
    }, []);

    // Game pages, PLUS every page a step points at. /looking-for and /shop are not game pages and never should
    // be — but the guide sends you to both, and a guide that disappears the moment you follow it is worse than
    // no guide. Derived from the catalog, so this cannot drift.
    const onGame = isGamePath(pathname) || GUIDE_STEP_PATHS.some((h) => pathname === h || pathname.startsWith(`${h}/`));
    // The guide page shows all of this in full; a strip above it would just be the same sentence twice.
    const show = onGame && pathname !== "/marketplace/guide";
    const step = g?.current?.step || null;
    // DISMISSABLE. A step whose completion signal is broken traps you on it forever — the Pathfinder's last
    // step recorded zero events Den-wide for months and members sat staring at it. The signal is fixed, but a
    // guide that CANNOT be put down is a trap by design, so any step can be waved off.
    //
    // Keyed BY STEP and kept in localStorage: this is "not now", not "never show me the guide". Dismiss the
    // current step and the strip returns the moment a different step is next, and the Guide page still lists
    // everything either way.
    const [hidden, setHidden] = useState(() => {
        try { return new Set(JSON.parse(window.localStorage.getItem("wolfden-guide-dismissed") || "[]")); } catch { return new Set(); }
    });
    const dismiss = useCallback((key) => {
        setHidden((prev) => {
            const next = new Set(prev); next.add(key);
            try { window.localStorage.setItem("wolfden-guide-dismissed", JSON.stringify([...next])); } catch { /* private mode */ }
            return next;
        });
    }, []);
    const here = Boolean(step && (pathname === step.href || pathname.startsWith(`${step.href}/`)));

    useEffect(() => { if (show) load(); }, [show, pathname, load]);

    // Coming back to the tab is the commonest moment for a step to have just become true.
    useEffect(() => {
        if (!show) return undefined;
        const onVis = () => { if (document.visibilityState === "visible") load(true); };
        document.addEventListener("visibilitychange", onVis);
        return () => document.removeEventListener("visibilitychange", onVis);
    }, [show, load]);

    // Only poll while you are standing ON the step's page — that is the one place a tick is imminent, and
    // watching it complete under you is the whole payoff. Everywhere else this costs nothing.
    useEffect(() => {
        if (!show || !here) return undefined;
        const t = setInterval(() => load(true), 20_000);
        return () => clearInterval(t);
    }, [show, here, load]);

    // NOTHING TO SAY, NOTHING ON SCREEN. With every open chapter finished this sat on every page of the game
    // reading "You know the place" over a full bar, forever — a banner whose only content was that it had no
    // content. The strip exists to point at the next thing; when there is no next thing it gets out of the way.
    //
    // It is not gone for good: it comes back on its own the moment a step exists again — a chapter unlocking at
    // a higher level, or a new one shipping — and the Guide sits in the nav the whole time regardless.
    if (!show || !g?.signedIn || !step || hidden.has(step.key)) return null;
    const pct = g.totals?.steps ? Math.round((g.totals.doneSteps / g.totals.steps) * 100) : 0;
    const tint = g.current?.tint || "#ffd75e";

    const body = (
        <>
            {g.current?.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="gs-emblem" src={g.current.icon} alt="" draggable="false" />
            ) : <span className="gs-emblem" />}
            <span className="gs-body">
                <span className="gs-kicker">
                    {here ? "You're in the right place" : `Next · ${g.current.name}`}
                </span>
                <b className="gs-label">{step.label}</b>
                <span className="gs-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
            </span>
            <span className="gs-right">
                <span className="gs-pay">+{Number(step.gold).toLocaleString()}</span>
                {here ? null : <span className="gs-chev" aria-hidden="true" />}
            </span>
        </>
    );

    // On the step's own page there is nowhere to send you, so it isn't a link — it's a note.
    if (here) {
        return (
            <div className="gs is-here" style={{ "--tint": tint }}>
                {body}
                <button type="button" className="gs-x" aria-label="Hide this step"
                    onClick={() => dismiss(step.key)}>×</button>
                <Styles />
            </div>
        );
    }
    // The X sits OUTSIDE the anchor rather than inside it — a button nested in a link is ambiguous to a
    // screen reader and a coin-flip for which one a tap lands on.
    return (
        <div className="gs-wrap">
            <Link className="gs" href={step.href} style={{ "--tint": tint }}>
                {body}
            </Link>
            <button type="button" className="gs-x" aria-label="Hide this step" onClick={() => dismiss(step.key)}>×</button>
            <Styles />
        </div>
    );
}

function Styles() {
    return (
        <style jsx global>{`
            .gs-wrap { position: relative; }
            /* "Not now." A step whose signal is broken would otherwise sit there forever; this is the escape
               hatch, per step, so the strip returns for the next one. */
            .gs-x { position: absolute; top: 4px; right: 6px; z-index: 2; width: 26px; height: 26px; border-radius: 50%;
                display: grid; place-items: center; cursor: pointer; font-size: 17px; line-height: 1;
                color: #cdd3d8; background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.18); }
            .gs-x:hover { color: #fff; background: rgba(0,0,0,0.7); }
            .gs.is-here { position: relative; }
            .gs { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; align-items: center; gap: 11px;
                padding: 9px 13px; margin: 0 auto 10px; max-width: 1100px; border-radius: 14px; text-decoration: none;
                background: linear-gradient(148deg, color-mix(in srgb, var(--tint) 22%, transparent), rgba(255,255,255,0.03) 62%), rgba(12,10,16,0.66);
                border: 1px solid color-mix(in srgb, var(--tint) 42%, transparent);
                box-shadow: 0 8px 22px -16px var(--tint); transition: transform .13s ease; }
            a.gs:active { transform: scale(0.99); }
            /* Standing on the step's page: greener, calmer, and not a link. */
            .gs.is-here { border-color: rgba(124,232,164,0.55);
                background: linear-gradient(148deg, rgba(124,232,164,0.16), rgba(255,255,255,0.03) 62%), rgba(12,10,16,0.66); }
            .gs.is-here .gs-kicker { color: #8bf0b4; }
            .gs-emblem { width: 40px; height: 40px; object-fit: contain; filter: drop-shadow(0 3px 8px rgba(0,0,0,0.55)); }
            .gs-body { min-width: 0; }
            .gs-kicker { display: block; font-size: 9px; font-weight: 900; letter-spacing: .13em; text-transform: uppercase;
                color: color-mix(in srgb, var(--tint) 80%, white); }
            .gs-label { display: block; margin-top: 2px; font-size: 0.9rem; font-weight: 900; color: #fff; line-height: 1.25;
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .gs-bar { display: block; height: 3px; margin-top: 6px; border-radius: 2px; background: rgba(255,255,255,0.12); overflow: hidden; }
            .gs-bar > i { display: block; height: 100%; border-radius: 2px; background: color-mix(in srgb, var(--tint) 85%, white);
                transition: width .6s cubic-bezier(.2,.8,.3,1); }
            .gs.is-here .gs-bar > i { background: #7ce8a4; }
            .gs-right { display: flex; align-items: center; gap: 9px; }
            .gs-pay { font-size: 11.5px; font-weight: 900; color: #ffd75e; white-space: nowrap; }
            /* Drawn, not typed — a > glyph renders differently on every platform and an arrow emoji is out. */
            .gs-chev { width: 7px; height: 7px; border-top: 2px solid rgba(255,255,255,0.75);
                border-right: 2px solid rgba(255,255,255,0.75); transform: rotate(45deg); }
        `}</style>
    );
}
