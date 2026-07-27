"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import useScrollLock from "@/lib/useScrollLock";

// ── First-login "The Forge is open!" announcement — a juiced hearth-themed modal that fires once per browser
// for signed-in members, tells them what the Forge does + how to reach it, and drops them straight in. Shows
// once (localStorage), then never again. Bump SEEN_KEY to re-announce after a big Forge change.
const SEEN_KEY = "wolfden-forge-announce-v1";

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

const STEPS = [
    { icon: "🔨", title: "Salvage", desc: "Break down gear you're not using into forge parts — rarer gear yields higher-tier parts." },
    { icon: "🧩", title: "Combine", desc: "Fuse 5 parts of a tier into 1 of the next tier, all the way up the ladder." },
    { icon: "⚒️", title: "Enhance", desc: "Hammer your equipped gear on the anvil — time your strikes for Great · Perfect · PIXEL-PERFECT and bigger stat boosts." },
];

export default function ForgeAnnounce() {
    const [open, setOpen] = useState(false);
    useScrollLock(open);

    useEffect(() => {
        let seen = false;
        try { seen = Boolean(localStorage.getItem(SEEN_KEY)); } catch { seen = false; }
        // Hydration-safe: only the client can read localStorage, so decide after mount.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (!seen) setOpen(true);
    }, []);

    const dismiss = () => {
        try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* private mode — just close */ }
        setOpen(false);
    };

    if (!open) return null;

    return (
        <Portal>
            <div className="fga-scrim" onClick={dismiss} role="dialog" aria-modal="true" aria-label="The Forge is open">
                <div className="fga-card" onClick={(e) => e.stopPropagation()}>
                    {/* rising embers */}
                    <div className="fga-embers" aria-hidden="true">
                        {Array.from({ length: 16 }).map((_, i) => (
                            <span key={i} style={{ left: `${(i * 6.3 + 3) % 100}%`, animationDelay: `${(i * 0.53) % 5}s`, animationDuration: `${4 + (i % 5)}s` }} />
                        ))}
                    </div>

                    <button type="button" className="fga-x" onClick={dismiss} aria-label="Close">✕</button>

                    <div className="fga-crest" aria-hidden="true">
                        <span className="fga-crest-glow" />
                        <span className="fga-anvil">⚒️</span>
                    </div>

                    <div className="fga-new">NEW</div>
                    <h2 className="fga-title">The Forge is open!</h2>
                    <p className="fga-sub">The blacksmith&apos;s hearth is lit for every wolf. Make the gear you already own <b>stronger</b> — no new drops required.</p>

                    <ol className="fga-steps">
                        {STEPS.map((s) => (
                            <li key={s.title} className="fga-step">
                                <span className="fga-step-ico" aria-hidden="true">{s.icon}</span>
                                <span className="fga-step-body">
                                    <b>{s.title}</b>
                                    <span>{s.desc}</span>
                                </span>
                            </li>
                        ))}
                    </ol>

                    <p className="fga-where">Find it anytime in the game <b>Menu → 🔨 Forge</b>. Daily forging quests, secret smithing badges &amp; a Forge rank on every piece await.</p>

                    <a href="/marketplace/blacksmith" className="fga-cta" onClick={dismiss}>
                        <span className="fga-cta-sheen" aria-hidden="true" />
                        Enter the Forge →
                    </a>
                    <button type="button" className="fga-later" onClick={dismiss}>Maybe later</button>
                </div>
                <style>{FGA_CSS}</style>
            </div>
        </Portal>
    );
}

const FGA_CSS = `
.fga-scrim { position: fixed; inset: 0; z-index: 400; display: grid; place-items: center; padding: 16px;
    background: radial-gradient(130% 100% at 50% 0%, rgba(70,30,6,0.72), rgba(6,4,10,0.86) 70%); backdrop-filter: blur(4px);
    animation: fgaFade .25s ease both; }
@keyframes fgaFade { from { opacity: 0 } to { opacity: 1 } }
.fga-card { position: relative; width: 100%; max-width: 430px; max-height: 92dvh; overflow-y: auto; overflow-x: hidden;
    text-align: center; padding: 30px 22px 20px; border-radius: 22px;
    background: linear-gradient(180deg, #2a1808 0%, #1a0f05 55%, #120a04 100%);
    border: 1px solid rgba(255,168,64,0.55); box-shadow: 0 30px 80px rgba(0,0,0,0.72), 0 0 60px rgba(255,120,20,0.28), inset 0 1px 0 rgba(255,200,120,0.15);
    animation: fgaPop .42s cubic-bezier(.2,1.35,.35,1) both; }
@keyframes fgaPop { from { opacity: 0; transform: translateY(14px) scale(.92) } to { opacity: 1; transform: translateY(0) scale(1) } }

/* embers */
.fga-embers { position: absolute; inset: 0; overflow: hidden; pointer-events: none; border-radius: 22px; }
.fga-embers span { position: absolute; bottom: -10px; width: 4px; height: 4px; border-radius: 50%;
    background: radial-gradient(circle, #ffd27a, #ff7a1a 70%, transparent); opacity: 0; animation-name: fgaEmber; animation-iteration-count: infinite; animation-timing-function: ease-out; }
@keyframes fgaEmber { 0% { transform: translateY(0) scale(1); opacity: 0 } 12% { opacity: .9 } 100% { transform: translateY(-360px) scale(.3); opacity: 0 } }

.fga-x { position: absolute; top: 12px; right: 12px; z-index: 3; width: 34px; height: 34px; border-radius: 50%;
    border: 1px solid rgba(255,255,255,0.18); background: rgba(0,0,0,0.4); color: #f4e6d2; font-size: 15px; font-weight: 900; cursor: pointer; line-height: 1; }
.fga-x:hover { background: rgba(0,0,0,0.6); }

.fga-crest { position: relative; width: 92px; height: 92px; margin: 4px auto 6px; display: grid; place-items: center; }
.fga-crest-glow { position: absolute; inset: -14px; border-radius: 50%; background: radial-gradient(circle, rgba(255,150,40,0.55), transparent 62%); filter: blur(3px); animation: fgaHalo 1.8s ease-in-out infinite; }
@keyframes fgaHalo { 0%,100% { transform: scale(.9); opacity: .65 } 50% { transform: scale(1.12); opacity: 1 } }
.fga-anvil { position: relative; font-size: 60px; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.6)); animation: fgaBob 2.4s ease-in-out infinite; }
@keyframes fgaBob { 0%,100% { transform: translateY(0) rotate(-3deg) } 50% { transform: translateY(-5px) rotate(3deg) } }

.fga-new { display: inline-block; font-size: 10.5px; font-weight: 900; letter-spacing: 0.14em; color: #2a1000;
    background: linear-gradient(180deg, #ffe488, #f3a72a); padding: 3px 11px; border-radius: 999px; box-shadow: 0 2px 8px rgba(255,150,40,0.5); }
.fga-title { margin: 9px 0 0; font-size: 1.72rem; font-weight: 900; color: #ffdf9c; letter-spacing: 0.01em;
    text-shadow: 0 2px 16px rgba(255,150,40,0.6); }
.fga-sub { margin: 7px 4px 16px; font-size: 0.92rem; line-height: 1.5; color: #e7d3b6; }
.fga-sub b { color: #ffcf7a; }

.fga-steps { list-style: none; margin: 0 0 14px; padding: 0; display: grid; gap: 9px; text-align: left; }
.fga-step { display: flex; gap: 12px; align-items: flex-start; padding: 11px 12px; border-radius: 13px;
    background: rgba(255,255,255,0.035); border: 1px solid rgba(255,168,64,0.22); }
.fga-step-ico { flex: none; width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; font-size: 19px;
    background: radial-gradient(circle at 50% 35%, rgba(255,150,40,0.32), rgba(255,120,20,0.1)); border: 1px solid rgba(255,168,64,0.35); }
.fga-step-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.fga-step-body > b { font-size: 0.95rem; color: #ffe0ad; }
.fga-step-body > span { font-size: 0.83rem; line-height: 1.45; color: #cbb79a; }

.fga-where { margin: 0 2px 16px; font-size: 0.8rem; line-height: 1.5; color: #b7a487; }
.fga-where b { color: #ffcf7a; }

.fga-cta { position: relative; overflow: hidden; display: block; width: 100%; padding: 14px 16px; border-radius: 13px;
    font-weight: 900; font-size: 1.02rem; text-decoration: none; color: #2a1000;
    background: linear-gradient(180deg, #ffe084, #f3a029); box-shadow: 0 4px 0 #b06a12, 0 8px 22px rgba(255,140,30,0.4);
    transition: transform .12s ease, box-shadow .12s ease; }
.fga-cta:hover { transform: translateY(-1px); box-shadow: 0 5px 0 #b06a12, 0 10px 26px rgba(255,140,30,0.5); }
.fga-cta:active { transform: translateY(2px); box-shadow: 0 2px 0 #b06a12, 0 5px 14px rgba(255,140,30,0.4); }
.fga-cta-sheen { position: absolute; top: 0; left: 0; width: 40%; height: 100%; transform: skewX(-20deg);
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent); animation: fgaSheen 2.6s ease-in-out infinite; }
@keyframes fgaSheen { 0% { left: -50% } 55%,100% { left: 130% } }
.fga-later { margin-top: 9px; background: none; border: none; color: #a08b70; font-size: 0.82rem; font-weight: 700; cursor: pointer; padding: 6px; }
.fga-later:hover { color: #cbb79a; }
`;
