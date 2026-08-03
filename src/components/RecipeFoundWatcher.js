"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

// ── "YOU FOUND A RECIPE" ─────────────────────────────────────────────────────────────────────────────────────
// Mounted site-wide, because a recipe can drop from roughly eighteen places — a harvest, a cast, any chest, the
// boss, a raid, a dig, the forge, salvage, the merchant, the barkeep, the crier, tavern dice, the wheel, a
// daily deal, a pet bond, and cooking itself. Wiring a modal into each of those screens is exactly why the
// reveal never got built: half those call sites threw the result away and nobody noticed.
//
// So the server owns the debt (mkt_recipe_known.celebrated_at IS NULL) and this pays it wherever you are. It
// acknowledges the moment it opens, so closing the tab mid-animation costs you the animation, not the record.
//
// Reveals QUEUE. A boss kill can teach you several at once, and they deserve one card each rather than a
// summary line that reads like a receipt.
export default function RecipeFoundWatcher() {
    const [queue, setQueue] = useState([]);
    const [shown, setShown] = useState(false);
    const busyRef = useRef(false);
    const seenRef = useRef(new Set());

    const check = useCallback(async () => {
        if (busyRef.current) return;
        busyRef.current = true;
        try {
            const r = await fetch("/api/marketplace/recipe-found", { cache: "no-store", credentials: "same-origin" }).catch(() => null);
            const d = r?.ok ? await r.json().catch(() => null) : null;
            const fresh = (d?.pending || []).filter((x) => x?.id && !seenRef.current.has(x.id));
            if (!fresh.length) return;
            for (const x of fresh) seenRef.current.add(x.id);
            // Acknowledge straight away — exactly once, whatever happens to the tab next.
            fetch("/api/marketplace/recipe-found", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ ids: fresh.map((x) => x.id) }),
            }).catch(() => {});
            setQueue((q) => [...q, ...fresh]);
            setShown(true);
            chime();
        } finally { busyRef.current = false; }
    }, []);

    useEffect(() => {
        check();
        const onVisible = () => { if (document.visibilityState === "visible") check(); };
        // Nearly every rewarding action already fires this to refresh the gold/XP HUD, so piggy-backing on it
        // means the card lands seconds after the harvest or the chest rather than on the next navigation.
        const onRefresh = () => setTimeout(check, 600);
        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener("wolfden-hud-refresh", onRefresh);
        return () => {
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener("wolfden-hud-refresh", onRefresh);
        };
    }, [check]);

    const current = queue[0];
    if (!shown || !current) return null;

    const next = () => {
        setQueue((q) => q.slice(1));
        if (queue.length <= 1) setShown(false);
    };

    const isPrep = current.kind === "prep";
    const more = queue.length - 1;

    return (
        <div className="rfw-scrim" role="dialog" aria-modal="true" aria-label="Recipe found" onClick={next}>
            <div className="rfw-card" style={{ "--tier": current.tierColor || "#ffd75e" }} onClick={(e) => e.stopPropagation()}>
                <div className="rfw-rays" aria-hidden="true" />
                <div className="rfw-confetti" aria-hidden="true">
                    {Array.from({ length: 28 }).map((_, i) => (
                        <span key={i} style={{
                            left: `${(i * 37) % 100}%`,
                            animationDelay: `${(i % 9) * 0.07}s`,
                            background: ["#ffd75e", "#ff9ec4", "#7ec8ff", "#c9a2ff", "#7cffb2"][i % 5],
                        }} />
                    ))}
                </div>

                <p className="rfw-kicker">Recipe found</p>
                <div className="rfw-art">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={current.sprite || current.fallback} alt="" draggable="false" />
                </div>
                <h3 className="rfw-name">{current.name}</h3>
                <p className="rfw-tier">
                    <b style={{ color: current.tierColor }}>{current.tierName}</b>
                    <span>{isPrep ? "prep" : "dish"}</span>
                </p>
                {current.flavor ? <p className="rfw-flavor">&ldquo;{current.flavor}&rdquo;</p> : null}

                <div className="rfw-needs">
                    <span className="rfw-needs-lab">It calls for</span>
                    <div className="rfw-needs-row">
                        {current.needs.map((n) => (
                            <span key={n.ref} className="rfw-need" title={n.name}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={n.sprite || n.fallback} alt="" draggable="false" />
                                <em>×{n.qty}</em>
                            </span>
                        ))}
                    </div>
                </div>

                {current.makes ? (
                    <p className="rfw-makes">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={current.makes.sprite || current.makes.fallback} alt="" draggable="false" />
                        Makes <b>{current.makes.name}</b>
                    </p>
                ) : null}

                <div className="rfw-actions">
                    <Link href="/marketplace/cooking" className="rfw-go" onClick={next}>To the Kitchen</Link>
                    <button type="button" className="rfw-later" onClick={next}>
                        {more > 0 ? `Next (${more} more)` : "Nice"}
                    </button>
                </div>
            </div>

            <style jsx global>{`
.rfw-scrim { position: fixed; inset: 0; z-index: 9000; display: grid; place-items: center; padding: 18px;
    background: rgba(6,4,3,0.78); backdrop-filter: blur(3px); animation: rfwIn .18s ease-out; }
@keyframes rfwIn { from { opacity: 0; } to { opacity: 1; } }
.rfw-card { position: relative; overflow: hidden; width: min(380px, 100%); padding: 20px 18px 18px; border-radius: 20px;
    text-align: center; background: linear-gradient(180deg, #241a14, #14100d);
    border: 1px solid var(--tier); box-shadow: 0 0 44px -8px var(--tier), 0 18px 50px rgba(0,0,0,0.6);
    animation: rfwPop .38s cubic-bezier(.2,1.5,.4,1); }
@keyframes rfwPop { from { transform: scale(0.82) translateY(14px); opacity: 0; } to { transform: none; opacity: 1; } }
/* A slow sweep of light behind the card, so the moment has motion without anything jumping around. */
.rfw-rays { position: absolute; inset: -60% -60% auto -60%; height: 220%; pointer-events: none; opacity: .32;
    background: conic-gradient(from 0deg, transparent 0 12deg, var(--tier) 13deg 15deg, transparent 16deg 30deg);
    animation: rfwSpin 14s linear infinite; }
@keyframes rfwSpin { to { transform: rotate(360deg); } }
.rfw-confetti { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.rfw-confetti span { position: absolute; top: -12px; width: 7px; height: 11px; border-radius: 2px; opacity: 0;
    animation: rfwFall 1.5s ease-in forwards; }
@keyframes rfwFall { 0% { opacity: 0; transform: translateY(-10px) rotate(0deg); }
    12% { opacity: 1; } 100% { opacity: 0; transform: translateY(320px) rotate(520deg); } }
.rfw-kicker { position: relative; margin: 0 0 10px; font-size: .68rem; font-weight: 900; letter-spacing: .18em;
    text-transform: uppercase; color: var(--tier); }
.rfw-art { position: relative; width: 116px; height: 116px; margin: 0 auto 10px; display: grid; place-items: center;
    border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--tier) 26%, transparent), transparent 70%); }
.rfw-art img { width: 96px; height: 96px; object-fit: contain; animation: rfwBob 2.6s ease-in-out infinite; }
@keyframes rfwBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
.rfw-name { position: relative; margin: 0; font-size: 1.32rem; font-weight: 900; color: #fff4e0; line-height: 1.2; }
.rfw-tier { position: relative; margin: 5px 0 0; display: flex; gap: 7px; justify-content: center; align-items: baseline;
    font-size: .74rem; letter-spacing: .07em; text-transform: uppercase; }
.rfw-tier span { color: #8b8f96; }
.rfw-flavor { position: relative; margin: 9px 4px 0; font-size: .82rem; font-style: italic; color: #b9a98f; line-height: 1.4; }
.rfw-needs { position: relative; margin-top: 15px; padding-top: 13px; border-top: 1px solid rgba(255,255,255,0.1); }
.rfw-needs-lab { font-size: .64rem; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; color: #7a828c; }
.rfw-needs-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 8px; }
.rfw-need { display: inline-flex; align-items: center; gap: 4px; padding: 5px 9px 5px 6px; border-radius: 999px;
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); }
.rfw-need img { width: 24px; height: 24px; object-fit: contain; }
.rfw-need em { font-style: normal; font-size: .78rem; font-weight: 800; color: #e7dcc8; }
.rfw-makes { position: relative; display: flex; align-items: center; justify-content: center; gap: 7px;
    margin: 12px 0 0; font-size: .84rem; color: #b9a98f; }
.rfw-makes img { width: 26px; height: 26px; object-fit: contain; }
.rfw-makes b { color: #e7dcc8; }
.rfw-actions { position: relative; display: flex; gap: 9px; margin-top: 17px; }
.rfw-go, .rfw-later { flex: 1 1 0; height: 42px; display: inline-flex; align-items: center; justify-content: center;
    border-radius: 12px; font-size: .9rem; font-weight: 800; cursor: pointer; text-decoration: none; }
.rfw-go { background: linear-gradient(180deg, #ffd97a, #f0b93f); color: #2a1a05; border: none;
    box-shadow: 0 4px 14px rgba(240,185,63,0.35); }
.rfw-later { background: rgba(255,255,255,0.07); color: #e7dcc8; border: 1px solid rgba(255,255,255,0.14); }
            `}</style>
        </div>
    );
}

// A short rising two-note chime — the same "you got something" language the rest of the game speaks. Silent if
// the browser has not been interacted with yet, which is fine: it is decoration, never the notification.
function chime() {
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const a = new AC();
        if (a.state === "suspended") a.resume();
        [0, 0.12].forEach((t, i) => {
            const o = a.createOscillator(), g = a.createGain();
            o.type = "triangle";
            o.frequency.setValueAtTime(i === 0 ? 660 : 990, a.currentTime + t);
            g.gain.setValueAtTime(0.0001, a.currentTime + t);
            g.gain.exponentialRampToValueAtTime(0.12, a.currentTime + t + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + t + 0.34);
            o.connect(g); g.connect(a.destination);
            o.start(a.currentTime + t); o.stop(a.currentTime + t + 0.36);
        });
    } catch { /* audio is a bonus, never a requirement */ }
}
