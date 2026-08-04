"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import useScrollLock from "@/lib/useScrollLock";

// ── First-visit "The Dungeons are open!" announcement ─────────────────────────────────────────────────────────
// Same portal, same localStorage marker, same shape as ForgeAnnounce / FishingLaunch / MiningLaunch — this is
// the fourth feature launched this way and four different announcement patterns would be worse than one.
// Bump SEEN_KEY to re-announce after a big change.
const SEEN_KEY = "wolfden-dungeons-announce-v1";

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

export default function DungeonLaunch() {
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
            <div className="dgl-wrap" role="dialog" aria-modal="true" aria-label="The Dungeons are open">
                <button type="button" className="dgl-scrim" aria-label="Close" onClick={dismiss} />
                <div className="dgl">
                    {/* Motes drifting UP out of the dark, so the card reads as underground before a word of it. */}
                    <div className="dgl-motes" aria-hidden="true">
                        {Array.from({ length: 14 }).map((_, i) => (
                            <span key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.5}s` }} />
                        ))}
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="dgl-art" src="/images/guide/ch-dungeons.webp" alt="" draggable="false" />
                    <h2>The Dungeons are open</h2>
                    <p>
                        Four of them under the Den, and one run a day at each. Ten floors down, something new on
                        every one, and a boss at the bottom that has been waiting.
                    </p>
                    <ul className="dgl-list">
                        <li><b>Your gear is your health</b> — vigour and every swing come off your level and what you&rsquo;re wearing</li>
                        <li><b>Nothing repeats</b> — four decks of encounters, and none of them are shared between dungeons</li>
                        <li><b>Real loot</b> — gear, forge parts, chests, shards and potions, straight off what you kill</li>
                        <li><b>Die and you keep it</b> — everything you banked on the way down is yours regardless</li>
                    </ul>
                    <a className="dgl-go" href="/marketplace/dungeons" onClick={dismiss}>Descend</a>
                    <button type="button" className="dgl-later" onClick={dismiss}>Maybe later</button>
                </div>
            </div>

            <style jsx>{`
                .dgl-wrap { position: fixed; inset: 0; z-index: 10090; display: flex; align-items: center; justify-content: center; padding: 18px; }
                .dgl-scrim { position: absolute; inset: 0; border: 0; padding: 0; cursor: pointer;
                    background: rgba(6,4,10,0.84); backdrop-filter: blur(3px); }
                .dgl { position: relative; overflow: hidden; width: min(430px, 100%); max-height: 88vh; overflow-y: auto;
                    padding: 22px 22px 18px; border-radius: 20px; text-align: center;
                    background: linear-gradient(180deg, #241c33, #130f1d); border: 2px solid #7d5fbe;
                    box-shadow: 0 24px 70px rgba(0,0,0,0.78), 0 0 60px rgba(150,110,255,0.2); }
                .dgl-motes { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
                .dgl-motes span { position: absolute; bottom: -8px; width: 3px; height: 3px; border-radius: 50%;
                    background: #d3b0ff; box-shadow: 0 0 7px #b98cff; animation: dglMote 6.5s linear infinite; opacity: 0.7; }
                @keyframes dglMote { 0% { transform: translateY(0); opacity: 0; } 14% { opacity: 0.75; } 100% { transform: translateY(-430px); opacity: 0; } }
                .dgl-art { position: relative; width: 82px; height: 82px; object-fit: contain;
                    filter: drop-shadow(0 4px 14px rgba(150,110,255,0.55)); }
                .dgl h2 { margin: 6px 0 8px; font-size: 1.5rem; font-weight: 900; color: #e0ceff; }
                .dgl p { margin: 0 0 12px; font-size: 0.88rem; line-height: 1.5; color: #c2b6d8; }
                .dgl-list { list-style: none; margin: 0 0 15px; padding: 0; text-align: left; display: grid; gap: 7px; }
                .dgl-list li { position: relative; padding-left: 20px; font-size: 0.84rem; line-height: 1.45; color: #b9aed0; }
                /* A CSS-drawn triangle, never a unicode content escape — a \\25B8 inside a styled-jsx template
                   literal needs its backslash doubled to survive JS, and the doubled one then reaches the CSS
                   parser as a literal backslash and prints across the label. Borders cannot be escaped wrong. */
                .dgl-list li::before { content: ""; position: absolute; left: 5px; top: 0.5em;
                    width: 0; height: 0; border-top: 4px solid transparent; border-bottom: 4px solid transparent;
                    border-left: 6px solid #b98cff; }
                .dgl-list b { color: #e0ceff; }
                .dgl-go { display: block; padding: 14px 16px; border-radius: 14px; text-decoration: none;
                    font-size: 1rem; font-weight: 900; letter-spacing: 0.05em; color: #1b1226;
                    background: linear-gradient(180deg, #e2ccff, #a578f0);
                    box-shadow: 0 5px 0 rgba(0,0,0,0.42), 0 10px 24px rgba(165,120,240,0.32); }
                .dgl-later { display: block; width: 100%; margin-top: 9px; padding: 9px; border: 0; background: transparent;
                    cursor: pointer; font-size: 0.8rem; font-weight: 800; color: #9a8fb5; }
            `}</style>
        </Portal>
    );
}
