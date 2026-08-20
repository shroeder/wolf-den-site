"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import useScrollLock from "@/lib/useScrollLock";

// ── "The ring is open again" ──────────────────────────────────────────────────────────────────────────────────
// Same portal, same localStorage marker, same shape as MarketLaunch / DungeonLaunch / ForgeAnnounce /
// FishingLaunch / MiningLaunch. Six features have been announced this way and six patterns would be worse
// than one.
//
// This one is a REOPENING rather than a launch, which changes what it has to do. Combat was shut for days and
// the Arbiter told the plaza why, so this card cannot just say "it's back" — the reason it was shut is also
// the reason it is worth opening again. Fights were over in about five swings, which meant a class was a
// costume: nothing that needs rounds to happen in ever got a turn. That is what the rework fixed, so the
// classes and the points you spend on them are the headline, not a footnote.
const SEEN_KEY = "wolfden-arena-reopen-v1";

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

const CLASSES = [
    { key: "reaver", name: "Reaver", line: "Bleed, speed and criticals — end it early." },
    { key: "warden", name: "Warden", line: "Blocks, counters and sustain — still standing." },
    { key: "runecaller", name: "Runecaller", line: "Affinity and burns — win the rounds after this one." },
];

export default function ArenaReopenLaunch() {
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
            <div className="arl-wrap" role="dialog" aria-modal="true" aria-label="The Arena is open again">
                <button type="button" className="arl-scrim" aria-label="Close" onClick={dismiss} />
                <div className="arl">
                    {/* Embers rather than the Market's motes — the same idea in the ring's own colour. */}
                    <div className="arl-motes" aria-hidden="true">
                        {Array.from({ length: 14 }).map((_, i) => (
                            <span key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.5}s` }} />
                        ))}
                    </div>

                    <span className="arl-kick">The ring is open</span>
                    <h2>Fights last long enough to fight</h2>
                    <p>
                        A bout used to be settled in about five swings &mdash; which meant your class was a costume.
                        A bleed, a counter, a burn, a Lifedrink pulling you off the floor: none of it ever got a
                        turn. Bouts run many times longer now, so the build you chose is the thing that decides them.
                    </p>

                    {/* The three classes, by name, because "reworked classes" means nothing without them. */}
                    <div className="arl-classes">
                        {CLASSES.map((c) => (
                            <div key={c.key} className="arl-class">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={`/images/arena/class/${c.key}.webp`} alt="" draggable="false" />
                                <b>{c.name}</b>
                                <span>{c.line}</span>
                            </div>
                        ))}
                    </div>

                    <ul className="arl-list">
                        <li><b>Every bout pays arena XP</b> &mdash; win or lose, and it is what buys your points</li>
                        <li><b>Spend points on the tree</b> &mdash; your class&rsquo;s own passives, and you can refund three a day for free</li>
                        <li><b>The ring matches people</b> &mdash; real members and their real loadouts; nobody has to be online</li>
                        <li><b>The Long Road is open too</b> &mdash; a hundred rungs, each one harder than the last</li>
                    </ul>

                    <a className="arl-go" href="/marketplace/arena" onClick={dismiss}>Step into the ring</a>
                    <button type="button" className="arl-later" onClick={dismiss}>Maybe later</button>
                </div>
            </div>

            <style jsx>{`
                .arl-wrap { position: fixed; inset: 0; z-index: 10090; display: flex; align-items: center; justify-content: center; padding: 18px; }
                .arl-scrim { position: absolute; inset: 0; border: 0; padding: 0; cursor: pointer;
                    background: rgba(10,4,4,0.86); backdrop-filter: blur(3px); }
                .arl { position: relative; overflow: hidden; width: min(430px, 100%); max-height: 88dvh; overflow-y: auto;
                    padding: 22px 22px 18px; border-radius: 20px; text-align: center;
                    background: linear-gradient(180deg, #2a1620, #140a0e); border: 2px solid #d4573f;
                    box-shadow: 0 24px 70px rgba(0,0,0,0.78), 0 0 60px rgba(212,87,63,0.24); }
                .arl-motes { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
                .arl-motes span { position: absolute; bottom: -8px; width: 3px; height: 3px; border-radius: 50%;
                    background: #ffd08a; box-shadow: 0 0 7px #ff8a3c; animation: arlMote 6.5s linear infinite; opacity: 0.7; }
                @keyframes arlMote { 0% { transform: translateY(0); opacity: 0; } 14% { opacity: 0.75; } 100% { transform: translateY(-430px); opacity: 0; } }
                .arl-kick { display: block; font-size: 10.5px; font-weight: 900; letter-spacing: 0.16em;
                    text-transform: uppercase; color: #ff9f7a; }
                .arl h2 { margin: 6px 0 8px; font-size: 1.45rem; font-weight: 900; color: #ffe3d2; }
                .arl p { margin: 0 0 14px; font-size: 0.88rem; line-height: 1.5; color: #d3b9b0; }
                .arl-classes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 0 0 14px; }
                .arl-class { padding: 9px 6px; border-radius: 12px; background: rgba(255,255,255,0.045);
                    border: 1px solid rgba(255,150,110,0.28); }
                .arl-class img { width: 44px; height: 44px; object-fit: contain; display: block; margin: 0 auto 4px;
                    filter: drop-shadow(0 3px 8px rgba(0,0,0,0.5)); }
                .arl-class b { display: block; font-size: 0.82rem; color: #ffd0b8; }
                .arl-class span { display: block; margin-top: 2px; font-size: 0.66rem; line-height: 1.35; color: #b39a94; }
                .arl-list { list-style: none; margin: 0 0 15px; padding: 0; text-align: left; display: grid; gap: 7px; }
                .arl-list li { position: relative; padding-left: 16px; font-size: 0.82rem; line-height: 1.45; color: #d3b9b0; }
                .arl-list li::before { content: "▸"; position: absolute; left: 0; color: #ff8a4c; }
                .arl-list b { color: #ffd0b8; }
                /* The site's link colour would paint this button's label blue on an orange ground. */
                .arl-go { display: block; padding: 12px; border-radius: 13px; text-decoration: none;
                    font-size: 0.95rem; font-weight: 900; color: #2a1000;
                    background: linear-gradient(180deg, #ffb98a, #e8763f); border: 1px solid rgba(255,200,170,0.5); }
                .arl-go:hover, .arl-go:focus-visible { color: #2a1000; filter: brightness(1.06); }
                .arl-later { display: block; width: 100%; margin-top: 8px; padding: 8px; background: none; border: 0;
                    cursor: pointer; font-size: 0.8rem; font-weight: 800; color: rgba(255,255,255,0.5); }
                .arl-later:hover { color: rgba(255,255,255,0.8); }
            `}</style>
        </Portal>
    );
}
