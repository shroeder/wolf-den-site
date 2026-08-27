"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useVisiblePoll } from "@/lib/use-visible-poll";
import { nudgeFeed, refreshNudges } from "@/lib/nudge-feed";

// ── YOU EARNED A BADGE ───────────────────────────────────────────────────────────────────────────────────────
//
// Every badge is a painted die-cut sprite, 120 XP, 120 gold and a permanent bonus in the system it belongs to
// — and none of that was ever said out loud. Almost all of them are earned while you are busy doing something
// else, so the instant one landed was the exact instant nobody was looking at the badge screen. You found out
// later, by counting, if you found out at all.
//
// Mounted on the game nav, like the launch card, so it reaches you wherever you happen to be when it lands.
// One at a time, oldest first: three badges out of one boss fight is three small moments, not a pile.
export default function BadgePop() {
    const [badge, setBadge] = useState(null);
    const [closing, setClosing] = useState(false);

    // Shared with the other three root-layout watchers — see lib/nudge-feed.js. The POST that marks the badge
    // seen stays below, because acknowledging is this component's job and the read is not.
    const load = useCallback(() => nudgeFeed()
        .then((d) => { if (d?.badge?.badge) setBadge(d.badge.badge); })
        .catch(() => {}), []);

    // ── IT ONLY ASKED ONCE, ON MOUNT ─────────────────────────────────────────────────────────────────────
    // This ran a single fetch when the nav mounted and never looked again — so a badge earned while you were
    // already standing on a page did not appear until you happened to NAVIGATE somewhere that remounted the
    // nav. Luke: "the badge modal fires like way late, almost like it only fires if you are on the farm
    // screen or something." It was not the farm; it was whichever page he opened next.
    //
    // Two signals now, and the cheap one does the real work:
    //   · `wolfden-hud-refresh` is already dispatched by ~39 places the instant an action pays out, which is
    //     exactly when a badge can have landed. That makes the pop feel immediate rather than polled.
    //   · A slow poll underneath catches anything earned by a cron or by another device. useVisiblePoll, not
    //     setInterval, so a backgrounded phone is not asking all night — see that file for why that matters.
    useVisiblePoll(() => { if (!badge) load(); }, 45000);
    useEffect(() => {
        const onHud = () => { if (!badge) load(); };
        window.addEventListener("wolfden-hud-refresh", onHud);
        return () => window.removeEventListener("wolfden-hud-refresh", onHud);
    }, [badge, load]);

    // Marked seen on DISMISS, not on show: a request that fails, or a tab closed mid-read, should hand the
    // badge back next time rather than silently spending the one telling.
    const dismiss = () => {
        if (!badge || closing) return;
        const slug = badge.slug;
        setClosing(true);
        fetch("/api/marketplace/badge-pop", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slug }),
        }).catch(() => {});
        refreshNudges(); // the server's answer just changed; the shared reply must not outlive it
        setTimeout(() => {
            setBadge(null);
            setClosing(false);
            // Straight on to the next one if the same action earned more than one.
            load();
        }, 200);
    };

    useEffect(() => {
        if (!badge) return undefined;
        const onKey = (e) => { if (e.key === "Escape") dismiss(); };
        window.addEventListener("keydown", onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [badge]);

    if (!badge || typeof document === "undefined") return null;
    const c = badge.color || "#ffd75e";

    return createPortal((
        <div className={`bdg-scrim${closing ? " is-closing" : ""}`} role="dialog" aria-modal="true"
            aria-label={`Badge earned: ${badge.label}`} onClick={dismiss}>
            <span className="bdg-rays" aria-hidden="true" style={{ "--c": c }} />
            <div className="bdg-card" style={{ "--c": c }} onClick={(e) => e.stopPropagation()}>
                <div className="bdg-kicker">Badge earned</div>
                <div className="bdg-art" aria-hidden="true">
                    {badge.art ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={badge.art} alt="" draggable="false" />
                    ) : <span className="bdg-fallback">{badge.icon || "★"}</span>}
                </div>
                <h2 className="bdg-name">{badge.label}</h2>
                {badge.why ? <p className="bdg-why">{badge.why}</p> : null}

                <div className="bdg-paid">
                    <span><b>+{badge.xp}</b><em>XP</em></span>
                    <span><b>+{badge.gold}</b><em>gold</em></span>
                </div>

                {/* The part nobody knew: a badge is a live number in the system it came from, for good.
                    AND WHEN IT IS NOT — 35 of the badges carry no stat at all, and this block simply vanished
                    for them, leaving a card that looked like it had forgotten to say something. Luke, on the
                    Enshriner card: "this badge doesnt show what bonus it gives". Silence is the one thing a
                    card cannot do here: it reads identically to a bug. Say which it is, either way. */}
                <div className={`bdg-bonus${badge.bonus?.length ? "" : " is-none"}`}>
                    {badge.bonus?.length ? (
                        <>
                            {badge.bonus.map((b) => (
                                <p key={b.where}><i>{b.where}</i>{b.what}</p>
                            ))}
                            <em>Permanent, and it stacks with every other badge you hold.</em>
                        </>
                    ) : (
                        <p className="bdg-none">No stat bonus &mdash; this one is the XP, the gold and the record of it.</p>
                    )}
                </div>

                <div className="bdg-acts">
                    <button type="button" className="bdg-take" onClick={dismiss}>Nice</button>
                    <Link href="/marketplace/badges" className="bdg-all" onClick={dismiss}>See all badges</Link>
                </div>
            </div>

            <style>{`
                /* ABOVE THE ONE-TIME LAUNCH CARDS (10088-10090). They all mount on the same nav, so on the
                   load where a badge lands at the same moment as one of them, whoever is higher wins — and a
                   badge is the transient one: the launch card is still there tomorrow, the badge moment is
                   not. Caught by a hit test that came back "minelaunch" over the button. */
                .bdg-scrim { position: fixed; inset: 0; height: 100svh; z-index: 10095; display: grid; place-items: center;
                    padding: 16px; background: rgba(5,4,9,0.84);
                    backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); animation: bdgIn .2s ease both; }
                .bdg-scrim.is-closing { animation: bdgOut .18s ease both; }
                @keyframes bdgIn { from { opacity: 0 } to { opacity: 1 } }
                @keyframes bdgOut { from { opacity: 1 } to { opacity: 0 } }
                /* The badge arrives ON something — a slow turning starburst in its own colour, so a gold badge
                   and a teal one do not land identically. */
                .bdg-rays { position: absolute; inset: -20% -20%; pointer-events: none;
                    background: conic-gradient(from 0deg, transparent 0 10deg,
                        color-mix(in srgb, var(--c) 22%, transparent) 10deg 15deg, transparent 15deg 26deg);
                    animation: bdgSpin 26s linear infinite; }
                @keyframes bdgSpin { to { transform: rotate(360deg) } }
                .bdg-card { position: relative; width: min(360px, 100%); max-height: 100%; overflow-y: auto;
                    text-align: center; padding: 20px 20px 18px; border-radius: 20px;
                    border: 2px solid color-mix(in srgb, var(--c) 70%, transparent);
                    background: linear-gradient(180deg, #221a2c, #14101c);
                    box-shadow: 0 0 60px color-mix(in srgb, var(--c) 30%, transparent), 0 22px 60px rgba(0,0,0,0.65);
                    animation: bdgPop .42s cubic-bezier(.2,1.25,.35,1) both; }
                @keyframes bdgPop { from { opacity: 0; transform: scale(.86) translateY(14px) } to { opacity: 1; transform: none } }
                .bdg-kicker { font-size: 0.64rem; font-weight: 900; letter-spacing: .18em; text-transform: uppercase;
                    color: var(--c); }
                .bdg-art { display: grid; place-items: center; margin: 10px 0 2px; }
                .bdg-art img { width: 148px; height: 148px; object-fit: contain;
                    filter: drop-shadow(0 10px 22px rgba(0,0,0,0.6)) drop-shadow(0 0 26px color-mix(in srgb, var(--c) 45%, transparent));
                    animation: bdgFloat 3s ease-in-out infinite; }
                @keyframes bdgFloat { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-7px) } }
                .bdg-fallback { font-size: 84px; line-height: 1; }
                .bdg-name { margin: 6px 0 0; font-size: 1.32rem; color: #f7efe0; }
                .bdg-why { margin: 6px 2px 0; font-size: 0.84rem; line-height: 1.45; color: #b6adc4; }
                .bdg-paid { display: flex; justify-content: center; gap: 10px; margin: 13px 0 0; }
                .bdg-paid span { flex: 1; max-width: 120px; padding: 8px 6px; border-radius: 12px;
                    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); }
                .bdg-paid b { display: block; font-family: var(--font-display); font-size: 1.1rem; color: #ffd75e; }
                .bdg-paid em { display: block; font-style: normal; font-size: 0.68rem; letter-spacing: .1em;
                    text-transform: uppercase; color: #8f8875; margin-top: 1px; }
                .bdg-bonus { margin: 12px 0 0; padding: 11px 12px; border-radius: 13px; text-align: left;
                    background: color-mix(in srgb, var(--c) 9%, rgba(0,0,0,0.25));
                    border: 1px solid color-mix(in srgb, var(--c) 32%, transparent); }
                .bdg-bonus p { margin: 0 0 4px; font-size: 0.82rem; color: #e8dcc6; }
                .bdg-bonus i { display: block; font-style: normal; font-size: 0.62rem; font-weight: 900;
                    letter-spacing: .1em; text-transform: uppercase; color: var(--c); }
                .bdg-bonus.is-none { background: rgba(0,0,0,0.25); border-color: rgba(255,255,255,0.1); text-align: center; }
                .bdg-none { margin: 0 !important; font-size: 0.78rem !important; color: #9aa2ab !important; }
                .bdg-bonus em { display: block; font-style: normal; font-size: 0.72rem; color: #9aa2ab; margin-top: 6px; }
                .bdg-acts { display: grid; gap: 7px; margin-top: 15px; }
                .bdg-take { padding: 13px; border-radius: 13px; cursor: pointer; border: 1px solid rgba(255,225,140,0.6);
                    font-family: var(--font-display); font-weight: 900; font-size: 1rem; color: #3a2c08;
                    background: linear-gradient(180deg,#ffe488,#f3b23a); box-shadow: 0 4px 0 #b57f22; }
                .bdg-take:active { transform: translateY(3px); box-shadow: 0 1px 0 #b57f22; }
                .bdg-all { padding: 10px; border-radius: 11px; text-decoration: none; font-weight: 800;
                    font-size: 0.84rem; color: #b9a892; border: 1px solid rgba(255,255,255,0.14); }
            `}</style>
        </div>
    ), document.body);
}
