"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// The "here's what's new" card, shown once, the next time you open the game.
//
// Mounted in the game nav so it rides along on every marketplace screen — a launch card that only appears on
// the home page is a launch card most people never see, because most sessions start wherever they left off.
//
// Portalled to <body> deliberately: several game screens animate their children with a fill-mode that leaves a
// transform behind, and any transform makes an element the containing block for its own position:fixed
// children — which silently drops a "fixed" overlay somewhere down a long page instead of over the viewport.
export default function AnnouncementModal() {
    const [ann, setAnn] = useState(null);
    const [closing, setClosing] = useState(false);

    useEffect(() => {
        let alive = true;
        fetch("/api/marketplace/announcement", { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => { if (alive && d?.announcement) setAnn(d.announcement); })
            .catch(() => {});
        return () => { alive = false; };
    }, []);

    // Marked seen the moment it's dismissed, not when it's shown: if the request fails, or the tab is closed
    // mid-read, the member gets it again rather than silently missing the one telling.
    const dismiss = () => {
        if (!ann || closing) return;
        setClosing(true);
        fetch("/api/marketplace/announcement", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: ann.key }),
        }).catch(() => {});
        setTimeout(() => setAnn(null), 180);
    };

    useEffect(() => {
        if (!ann) return undefined;
        const onKey = (e) => { if (e.key === "Escape") dismiss(); };
        window.addEventListener("keydown", onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ann]);

    if (!ann || typeof document === "undefined") return null;

    return createPortal((
        <div className={`ann-scrim${closing ? " is-closing" : ""}`} role="dialog" aria-modal="true" aria-label={ann.title} onClick={dismiss}>
            <div className="ann-card" onClick={(e) => e.stopPropagation()}>
                <span className="ann-rays" aria-hidden="true" />
                <div className="ann-emoji" aria-hidden="true">{ann.emoji}</div>
                <div className="ann-kicker">NEW IN THE DEN</div>
                <h2 className="ann-title">{ann.title}</h2>
                {ann.artUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="ann-art" src={ann.artUrl} alt="" />
                ) : null}
                <p className="ann-body">{ann.body}</p>
                <div className="ann-actions">
                    {ann.ctaHref ? (
                        <Link href={ann.ctaHref} className="ann-cta" onClick={dismiss}>{ann.ctaLabel || "Take a look"}</Link>
                    ) : null}
                    <button type="button" className="ann-later" onClick={dismiss}>{ann.ctaHref ? "Maybe later" : "Got it"}</button>
                </div>
            </div>

            <style>{`
                /* ABOVE THE CHAT BUBBLE. z-index was 400 against the social FAB's 900, so the floating chat
                   button sat on top of the launch card's own call to action.
                   100svh, not just inset:0 — on a phone a fixed overlay is laid out against the LARGE viewport,
                   so the bottom of the card ends up underneath the browser's own bars. */
                .ann-scrim { position: fixed; inset: 0; height: 100svh; z-index: 10092; display: grid; place-items: center;
                    padding: 16px;
                    background: rgba(6,4,10,0.82); backdrop-filter: blur(4px); animation: annIn .22s ease both; }
                .ann-scrim.is-closing { animation: annOut .18s ease both; }
                @keyframes annIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes annOut { from { opacity: 1; } to { opacity: 0; } }
                /* THE CARD NEVER OUTGROWS THE SCREEN. It was free to be as tall as its copy, and a long
                   announcement with art pushed "Maybe later" clean off the bottom of a phone with no way to
                   scroll to it — the one control that dismisses the thing. The BODY scrolls now; the title,
                   the art and the buttons are always on screen. */
                .ann-card { position: relative; overflow: hidden; width: min(430px, 100%); padding: 26px 22px 20px;
                    max-height: 100%; display: flex; flex-direction: column;
                    text-align: center; border-radius: 20px; border: 2px solid rgba(255,215,110,0.5);
                    background: linear-gradient(180deg, #2a2033, #17121f);
                    box-shadow: 0 22px 60px rgba(0,0,0,0.65); animation: annPop .34s cubic-bezier(.2,1.25,.35,1) both; }
                @keyframes annPop { from { transform: translateY(16px) scale(.94); opacity: 0; } to { transform: none; opacity: 1; } }
                .ann-rays { position: absolute; inset: -40% -40% auto -40%; height: 180%; pointer-events: none;
                    background: conic-gradient(from 0deg, transparent 0 12deg, rgba(255,215,110,0.10) 12deg 18deg, transparent 18deg 30deg);
                    animation: annSpin 22s linear infinite; }
                @keyframes annSpin { to { transform: rotate(360deg); } }
                .ann-emoji { position: relative; flex: none; font-size: 54px; line-height: 1; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.5)); }
                .ann-kicker { position: relative; flex: none; margin-top: 8px; font-size: 0.66rem; font-weight: 900; letter-spacing: 0.16em; color: #ffd75e; }
                .ann-title { position: relative; flex: none; margin: 5px 0 0; font-size: 1.42rem; color: #f7efe0; }
                /* The art gives way before the words do — on a short screen it takes a fifth of the height
                   rather than a fixed 190px it cannot afford. */
                .ann-art { position: relative; flex: none; display: block; width: 100%; max-height: min(190px, 21svh);
                    object-fit: contain; margin: 12px 0 0; }
                .ann-body { position: relative; flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
                    margin: 10px 2px 0; font-size: 0.9rem; line-height: 1.5; color: #cfc6b6; }
                .ann-actions { position: relative; flex: none; display: flex; flex-direction: column; gap: 8px;
                    padding-top: 14px; margin-top: 4px; }
                .ann-cta { display: block; padding: 14px; border-radius: 13px; font-weight: 900; font-size: 1rem; text-decoration: none;
                    color: #3a2c08; background: linear-gradient(180deg,#ffe488,#f3b23a); box-shadow: 0 4px 0 #b57f22; }
                .ann-cta:active { transform: translateY(3px); box-shadow: 0 1px 0 #b57f22; }
                .ann-later { padding: 11px; border-radius: 11px; font-weight: 800; font-size: 0.86rem; cursor: pointer;
                    color: #b9a892; background: none; border: 1px solid rgba(255,255,255,0.14); }
            `}</style>
        </div>
    ), document.body);
}
