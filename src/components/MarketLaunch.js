"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import useScrollLock from "@/lib/useScrollLock";

// ── First-visit "The Market is open" announcement ─────────────────────────────────────────────────────────────
// Same portal, same localStorage marker, same shape as DungeonLaunch / ForgeAnnounce / FishingLaunch /
// MiningLaunch — the fifth feature launched this way, and five announcement patterns would be worse than one.
// Bump SEEN_KEY to re-announce after a big change.
//
// It names Sunflower Jinxx, because she asked for it. A member who suggests something and then watches it
// arrive unattributed learns not to bother suggesting the next one.
const SEEN_KEY = "wolfden-market-announce-v1";

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

export default function MarketLaunch() {
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
            <div className="mkl-wrap" role="dialog" aria-modal="true" aria-label="The Market is open">
                <button type="button" className="mkl-scrim" aria-label="Close" onClick={dismiss} />
                <div className="mkl">
                    {/* Warm motes drifting up, so the card reads as a lantern-lit square before a word of it. */}
                    <div className="mkl-motes" aria-hidden="true">
                        {Array.from({ length: 14 }).map((_, i) => (
                            <span key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.5}s` }} />
                        ))}
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="mkl-art" src="/images/nav/market.png" alt="" draggable="false" />
                    <h2>The Market is open</h2>
                    <p>
                        A square in town where you sell each other what you grow, catch and prep. If you have a
                        recipe you love and not the one ingredient it wants, somebody here has it.
                    </p>
                    <ul className="mkl-list">
                        <li><b>Sell off your shelf</b> — any crop, fish or prepped ingredient, at whatever price you set</li>
                        <li><b>Nothing gets sold twice</b> — goods leave your pantry the moment the stall opens</li>
                        <li><b>Buy what you&rsquo;re short of</b> — it lands straight in your pantry, ready to cook</li>
                        <li><b>Change your mind</b> — pull a stall that hasn&rsquo;t sold and everything comes back</li>
                    </ul>
                    <p className="mkl-credit">
                        The Market was <b>Sunflower Jinxx&rsquo;s</b> idea. Her hero keeps a stall in the corner of
                        the square — tap it.
                    </p>
                    <a className="mkl-go" href="/marketplace/market" onClick={dismiss}>Visit the Market</a>
                    <button type="button" className="mkl-later" onClick={dismiss}>Maybe later</button>
                </div>
            </div>

            <style jsx>{`
                .mkl-wrap { position: fixed; inset: 0; z-index: 10090; display: flex; align-items: center; justify-content: center; padding: 18px; }
                .mkl-scrim { position: absolute; inset: 0; border: 0; padding: 0; cursor: pointer;
                    background: rgba(4,10,8,0.84); backdrop-filter: blur(3px); }
                .mkl { position: relative; overflow: hidden; width: min(430px, 100%); max-height: 88vh; overflow-y: auto;
                    padding: 22px 22px 18px; border-radius: 20px; text-align: center;
                    background: linear-gradient(180deg, #16302a, #091511); border: 2px solid #3fbb92;
                    box-shadow: 0 24px 70px rgba(0,0,0,0.78), 0 0 60px rgba(60,200,150,0.22); }
                .mkl-motes { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
                .mkl-motes span { position: absolute; bottom: -8px; width: 3px; height: 3px; border-radius: 50%;
                    background: #ffe9a8; box-shadow: 0 0 7px #ffcf7a; animation: mklMote 6.5s linear infinite; opacity: 0.7; }
                @keyframes mklMote { 0% { transform: translateY(0); opacity: 0; } 14% { opacity: 0.75; } 100% { transform: translateY(-430px); opacity: 0; } }
                .mkl-art { position: relative; width: 82px; height: 82px; object-fit: contain;
                    filter: drop-shadow(0 4px 14px rgba(60,200,150,0.55)); }
                .mkl h2 { margin: 6px 0 8px; font-size: 1.5rem; font-weight: 900; color: #d8fff0; }
                .mkl p { margin: 0 0 12px; font-size: 0.88rem; line-height: 1.5; color: #b6d3c9; }
                .mkl-list { list-style: none; margin: 0 0 15px; padding: 0; text-align: left; display: grid; gap: 7px; }
                .mkl-list li { position: relative; padding-left: 20px; font-size: 0.84rem; line-height: 1.45; color: #aecabf; }
                /* A CSS-drawn triangle, never a unicode content escape — see the note in DungeonLaunch: a
                   doubled backslash survives JS and then prints across the label. Borders cannot be escaped wrong. */
                .mkl-list li::before { content: ""; position: absolute; left: 5px; top: 0.5em;
                    width: 0; height: 0; border-top: 4px solid transparent; border-bottom: 4px solid transparent;
                    border-left: 6px solid #5fd0a8; }
                .mkl-list b { color: #d8fff0; }
                .mkl-credit { margin: 0 0 14px; padding: 9px 11px; border-radius: 11px; font-size: 0.8rem; line-height: 1.45;
                    color: #bfe7d8; background: rgba(95,208,168,0.1); border: 1px solid rgba(95,208,168,0.28); }
                .mkl-credit b { color: #ffd75e; }
                .mkl-go { display: block; padding: 14px 16px; border-radius: 14px; text-decoration: none;
                    font-size: 1rem; font-weight: 900; letter-spacing: 0.05em; color: #062018;
                    background: linear-gradient(180deg, #a9f0d6, #3fbb92);
                    box-shadow: 0 5px 0 rgba(0,0,0,0.42), 0 10px 24px rgba(63,187,146,0.32); }
                .mkl-later { display: block; width: 100%; margin-top: 9px; padding: 9px; border: 0; background: transparent;
                    cursor: pointer; font-size: 0.8rem; font-weight: 800; color: #8ba69b; }
            `}</style>
        </Portal>
    );
}
