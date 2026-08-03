"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import useScrollLock from "@/lib/useScrollLock";

// ── First-visit "The Mine is open!" announcement ──────────────────────────────────────────────────────────────
// Fires once per browser for signed-in members, says what the mine is, and drops them into it. Built to match
// ForgeAnnounce and FishingLaunch exactly — same portal, same localStorage marker, same shape — because this is
// the third feature we've launched this way and three different announcement patterns would be worse than one.
// Bump SEEN_KEY to re-announce after a big change.
const SEEN_KEY = "wolfden-mining-announce-v1";

// Portal to <body> so position:fixed is measured against the VIEWPORT, not the hub's animated (transformed)
// container — otherwise a "full-screen" overlay gets trapped inside a tall scroll box.
function Portal({ children }) {
    const [el] = useState(() => (typeof document === "undefined" ? null : document.createElement("div")));
    useEffect(() => {
        if (!el) return undefined;
        document.body.appendChild(el);
        return () => { document.body.removeChild(el); };
    }, [el]);
    if (!el) return null;
    return createPortal(children, el);
}

export default function MiningLaunch() {
    const [show, setShow] = useState(false);
    useScrollLock(show);

    useEffect(() => {
        let seen = null;
        try { seen = localStorage.getItem(SEEN_KEY); } catch { /* private mode — just don't show it */ }
        // Hydration-safe: only the client can read localStorage, so decide after mount.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (!seen) setShow(true);
    }, []);

    const dismiss = () => {
        try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ }
        setShow(false);
    };

    if (!show) return null;
    return (
        <Portal>
            <div className="minelaunch-wrap" role="dialog" aria-modal="true" aria-label="The Mine is open">
                <button type="button" className="minelaunch-scrim" aria-label="Close" onClick={dismiss} />
                <div className="minelaunch">
                    {/* Falling sparks, so the card reads as underground before you get to a word of it. */}
                    <div className="minelaunch-sparks" aria-hidden="true">
                        {Array.from({ length: 14 }).map((_, i) => (
                            <span key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.42}s` }} />
                        ))}
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="minelaunch-art" src="/images/mining/pick-iron.png" alt="" draggable="false" />
                    <h2>The Mine is open</h2>
                    <p>
                        Three trips a day into the dark. Push deeper for richer rock — but the roof gets less
                        forgiving every step, and it keeps what you were carrying.
                    </p>
                    <ul className="minelaunch-list">
                        <li><b>Descend</b> — push your luck down the tunnel, and climb out before it comes in</li>
                        <li><b>Mine</b> — crack the seam you carried up, timing every swing</li>
                        <li><b>Smelt</b> — five pours at the furnace, faster each time, for forge parts</li>
                        <li>Three gear sets, five pets and eleven badges that only the mine gives out</li>
                    </ul>
                    <a className="minelaunch-go" href="/marketplace/mining" onClick={dismiss}>Head down &#9935;</a>
                    <button type="button" className="minelaunch-later" onClick={dismiss}>Maybe later</button>
                </div>
            </div>

            <style jsx>{`
                .minelaunch-wrap { position: fixed; inset: 0; z-index: 10090; display: flex; align-items: center; justify-content: center; padding: 18px; }
                .minelaunch-scrim { position: absolute; inset: 0; border: 0; padding: 0; cursor: pointer;
                    background: rgba(8,5,2,0.82); backdrop-filter: blur(3px); }
                .minelaunch { position: relative; overflow: hidden; width: min(430px, 100%); max-height: 88vh; overflow-y: auto;
                    padding: 22px 22px 18px; border-radius: 20px; text-align: center;
                    background: linear-gradient(180deg, #2a1c10, #150e07); border: 2px solid #b3762c;
                    box-shadow: 0 24px 70px rgba(0,0,0,0.75), 0 0 60px rgba(255,150,40,0.18); }
                .minelaunch-sparks { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
                .minelaunch-sparks span { position: absolute; top: -8px; width: 3px; height: 3px; border-radius: 50%;
                    background: #ffb45e; box-shadow: 0 0 6px #ff9f1c; animation: mlSpark 5.5s linear infinite; opacity: 0.75; }
                @keyframes mlSpark { 0% { transform: translateY(-10px); opacity: 0; } 12% { opacity: 0.8; } 100% { transform: translateY(420px); opacity: 0; } }
                .minelaunch-art { position: relative; width: 78px; height: 78px; object-fit: contain;
                    filter: drop-shadow(0 4px 14px rgba(255,150,40,0.5)); }
                .minelaunch h2 { margin: 6px 0 8px; font-size: 1.5rem; font-weight: 900; color: #ffd08a; }
                .minelaunch p { margin: 0 0 12px; font-size: 0.88rem; line-height: 1.5; color: #d3c3ad; }
                .minelaunch-list { list-style: none; margin: 0 0 15px; padding: 0; text-align: left; display: grid; gap: 7px; }
                .minelaunch-list li { position: relative; padding-left: 20px; font-size: 0.84rem; line-height: 1.45; color: #cbbca6; }
                .minelaunch-list li::before { content: "\\25B8"; position: absolute; left: 4px; color: #f0a93a; font-weight: 900; }
                .minelaunch-list b { color: #ffd08a; }
                .minelaunch-go { display: block; padding: 14px 16px; border-radius: 14px; text-decoration: none;
                    font-size: 1rem; font-weight: 900; letter-spacing: 0.05em; color: #22160b;
                    background: linear-gradient(180deg, #ffd79a, #ef9f34);
                    box-shadow: 0 5px 0 rgba(0,0,0,0.4), 0 10px 24px rgba(239,159,52,0.3); }
                .minelaunch-later { display: block; width: 100%; margin-top: 9px; padding: 9px; border: 0; background: transparent;
                    cursor: pointer; font-size: 0.8rem; font-weight: 800; color: #a9967d; }
            `}</style>
        </Portal>
    );
}
