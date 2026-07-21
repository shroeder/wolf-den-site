"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Sailing: dispatch a ONE-WAY voyage to the island, then play the excavation dig minigame — a grid of dirt
// with an Augur "hot/cold" reading, a stamina budget, and a buried treasure-chest fragment to uncover. Win or
// fail, you land back at port and can set sail again. Server is authoritative for digs + the fragment reward.

// --- juice: tiny Web-Audio SFX (no asset files) --------------------------------------------------------
let _ac = null;
function audioCtx() {
    if (typeof window === "undefined") return null;
    try {
        if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)();
        if (_ac.state === "suspended") _ac.resume().catch(() => {});
        return _ac;
    } catch { return null; }
}
function tone(freq, start, dur, { type = "sine", gain = 0.15 } = {}) {
    const c = audioCtx(); if (!c) return;
    const t0 = c.currentTime + start;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(c.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
}
const sfx = {
    sail() {
        const c = audioCtx(); if (!c) return;
        const t0 = c.currentTime, osc = c.createOscillator(), g = c.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(200, t0); osc.frequency.exponentialRampToValueAtTime(560, t0 + 0.5);
        g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.11, t0 + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
        osc.connect(g); g.connect(c.destination); osc.start(t0); osc.stop(t0 + 0.66);
    },
    // The big cast-off moment: a low ship's horn, the rising whoosh, and two bright bell dings layered together.
    depart() {
        const c = audioCtx(); if (!c) return;
        const t0 = c.currentTime, horn = c.createOscillator(), hg = c.createGain();
        horn.type = "sawtooth";
        horn.frequency.setValueAtTime(120, t0); horn.frequency.exponentialRampToValueAtTime(84, t0 + 0.55);
        hg.gain.setValueAtTime(0.0001, t0); hg.gain.linearRampToValueAtTime(0.15, t0 + 0.06); hg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.72);
        horn.connect(hg); hg.connect(c.destination); horn.start(t0); horn.stop(t0 + 0.78);
        this.sail();
        tone(988, 0.14, 0.5, { type: "sine", gain: 0.12 });
        tone(1319, 0.28, 0.5, { type: "sine", gain: 0.11 });
    },
    // Catching a tailwind: a swelling wind gust that rises then falls off.
    gust() {
        const c = audioCtx(); if (!c) return;
        const t0 = c.currentTime, osc = c.createOscillator(), g = c.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(300, t0);
        osc.frequency.exponentialRampToValueAtTime(900, t0 + 0.32);
        osc.frequency.exponentialRampToValueAtTime(280, t0 + 0.72);
        g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.1, t0 + 0.09); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.8);
        osc.connect(g); g.connect(c.destination); osc.start(t0); osc.stop(t0 + 0.85);
        tone(784, 0.06, 0.42, { type: "sine", gain: 0.08 });
    },
    arrive() { [523, 659, 784].forEach((f, i) => tone(f, i * 0.12, 0.55, { type: "sine", gain: 0.16 })); },
    dig() { tone(150, 0, 0.11, { type: "square", gain: 0.11 }); },
    win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.5, { type: "triangle", gain: 0.16 })); },
    fail() { tone(300, 0, 0.22, { type: "sawtooth", gain: 0.1 }); tone(170, 0.12, 0.4, { type: "sawtooth", gain: 0.1 }); },
};

function Confetti() {
    return <div className="sail-confetti" aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <span key={i} style={{ "--i": i }} />)}</div>;
}

// Tailwind gust FX: a screen flash + a stream of leaves/debris blowing across the scene left-to-right.
function WindGust() {
    return (
        <div className="sail-gustfx" aria-hidden="true">
            <span className="sail-flash" />
            {Array.from({ length: 18 }, (_, i) => (
                <span
                    key={i}
                    className="sail-leaf"
                    style={{
                        "--i": i,
                        top: `${4 + (i * 91) % 92}%`,
                        animationDelay: `${(i % 6) * 55}ms`,
                        fontSize: `${0.65 + ((i * 7) % 5) * 0.2}rem`,
                    }}
                >
                    {["🍃", "🍂", "🍃", "·"][i % 4]}
                </span>
            ))}
        </div>
    );
}

// A crisp ship's-wheel (helm) for the primary Set-sail CTA — reads far better than the flat ⛵ emoji.
function HelmIcon() {
    return (
        <svg className="sail-cta-svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"
            fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="2.6" />
            <circle cx="12" cy="12" r="8.4" />
            <path d="M12 3.6v3.8M12 16.6v3.8M3.6 12h3.8M16.6 12h3.8M6.1 6.1l2.7 2.7M15.2 15.2l2.7 2.7M17.9 6.1l-2.7 2.7M8.8 15.2l-2.7 2.7" />
        </svg>
    );
}

function fmtLeft(ms) {
    if (ms <= 0) return "landing…";
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
}

function heatColor(h) {
    if (h <= 0) return "#37f5c0";
    if (h === 1) return "#ffe14a";
    if (h === 2) return "#ff9f43";
    return "#7a4a4a";
}
function heatLabel(h) { return h <= 0 ? "On it!" : h === 1 ? "Warm" : h === 2 ? "Near" : "Cold"; }

function Stars({ level }) {
    const tier = Math.floor((level - 1) / 10) + 1;
    return <span className="sail-stars">{Array.from({ length: 5 }, (_, i) => <span key={i} className={i < tier ? "on" : "off"}>★</span>)}</span>;
}

export default function SailingClient({ initial, hero, pet }) {
    const [state, setState] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const [celebrate, setCelebrate] = useState(null); // "arrive" while the Land-ho banner shows
    const [now, setNow] = useState(Date.now);

    const stateRef = useRef(state);
    useEffect(() => { stateRef.current = state; }, [state]);
    const arrivedRef = useRef(false);

    // Clock + arrival detection: when the voyage timer crosses arrival, fire the chime + Land-ho celebration.
    useEffect(() => {
        const id = setInterval(() => {
            setNow(Date.now());
            const s = stateRef.current;
            if (s.status === "sailing" && s.arrivesAt && Date.now() >= s.arrivesAt && !arrivedRef.current) {
                arrivedRef.current = true;
                sfx.arrive();
                setCelebrate("arrive");
                setTimeout(() => setCelebrate((c) => (c === "arrive" ? null : c)), 2600);
            }
        }, 1000);
        return () => clearInterval(id);
    }, []);

    const { departedAt, arrivesAt } = state;
    let liveStatus = state.status;
    let progress = state.progress || 0;
    if (state.status === "sailing" && departedAt && arrivesAt) {
        if (now >= arrivesAt) liveStatus = "arrived";
        else progress = Math.max(0, Math.min(0.999, (now - departedAt) / (arrivesAt - departedAt)));
    }

    const act = useCallback(async (action, extra = {}) => {
        setBusy(true);
        if (action === "start") {
            sfx.depart(); arrivedRef.current = false;
            setCelebrate("depart");
            setTimeout(() => setCelebrate((c) => (c === "depart" ? null : c)), 1900);
        }
        if (action === "wind") {
            sfx.gust();
            setCelebrate("gust");
            setTimeout(() => setCelebrate((c) => (c === "gust" ? null : c)), 2400);
        }
        if (action === "dig" || action === "begin_dig") sfx.dig();
        try {
            const r = await fetch("/api/marketplace/sailing", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }),
            });
            const d = await r.json().catch(() => ({}));
            if (d && !d.error) {
                setState(d);
                if (d.result) { d.result.won ? sfx.win() : sfx.fail(); setResult(d.result); }
            }
        } finally { setBusy(false); }
    }, []);

    const level = state.level;
    const xpPct = Math.min(100, Math.round((state.xpInto / Math.max(1, state.xpSpan)) * 100));
    const dig = state.dig;

    return (
        <div className="stack reveal sailing">
            <section className="card" style={{ overflow: "hidden" }}>
                <div className="sail-head">
                    <h1 style={{ margin: 0 }}>⛵ Sailing</h1>
                    <span className="sail-owner-pill">Owner preview</span>
                </div>

                {liveStatus === "digging" && dig ? (
                    /* ---------- Excavation dig minigame ---------- */
                    <div className="dig-wrap" style={{ backgroundImage: `url(${state.digBg})` }}>
                        <div className="dig-hud">
                            <span className="dig-frag">🧩 Fragment {dig.fragmentExposed}/{dig.fragmentTotal}</span>
                            <span className="dig-stam" title="Digs remaining">⚡ {dig.stamina}/{dig.maxStamina}</span>
                        </div>
                        <div className="dig-stambar"><span style={{ width: `${Math.round((dig.stamina / dig.maxStamina) * 100)}%` }} /></div>
                        <div className="dig-grid" style={{ gridTemplateColumns: `repeat(${dig.cols}, 1fr)` }}>
                            {dig.tiles.flatMap((row, r) => row.map((t, c) => (
                                <button
                                    key={`${r}-${c}`}
                                    type="button"
                                    className={`dig-tile${t.dug ? " is-dug" : ""}${t.exposed ? " is-exposed" : ""}`}
                                    style={{ "--heat": heatColor(t.heat), "--depth": t.depth ?? 3 }}
                                    disabled={busy || dig.status !== "active" || (t.dug && t.depth === 0)}
                                    onClick={() => act("dig", { r, c })}
                                    title={heatLabel(t.heat)}
                                >
                                    {t.exposed ? <span className="dig-glint">🧩</span>
                                        : t.dug ? <span className="dig-depth">{t.depth === 0 ? "" : "·".repeat(t.depth)}</span>
                                            : <span className="dig-mound" />}
                                </button>
                            )))}
                        </div>
                        <p className="muted dig-tip">Follow the <b style={{ color: "#37f5c0" }}>green</b> tiles (the Augur reads hot/cold) and clear the dirt over the fragment before your digs run out.</p>
                    </div>
                ) : (
                    /* ---------- The sea (idle / sailing / arrived) ---------- */
                    <>
                        <div className="sail-sea" style={{ backgroundImage: `url(${state.oceanBg})` }}>
                            <div className="sail-boat">
                                <div className={`sail-boat-inner${celebrate === "depart" ? " is-casting" : ""}${celebrate === "gust" ? " is-gusting" : ""}`}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img className="sail-boat-img" src={state.boatArt} alt="Your boat" />
                                    <span className="sail-crew">
                                        {pet?.url ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img className="sail-pet" src={pet.url} alt="" style={pet.flip ? { transform: "scaleX(-1)" } : undefined} />
                                        ) : null}
                                        {hero?.spriteUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img className="sail-hero" src={hero.spriteUrl} alt="" style={hero.spriteFlip ? { transform: "scaleX(-1)" } : undefined} />
                                        ) : hero?.avatarUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img className="sail-hero sail-hero-avatar" src={hero.avatarUrl} alt="" />
                                        ) : null}
                                    </span>
                                </div>
                            </div>
                            <div className="sail-status">
                                {liveStatus === "idle" && <span>⚓ Docked · ready to set sail</span>}
                                {liveStatus === "sailing" && <span>🧭 Sailing to the island · {fmtLeft(arrivesAt - now)}</span>}
                                {liveStatus === "arrived" && <span>🏝️ Landed! Time to dig.</span>}
                            </div>

                            {/* Primary action docked to the bottom of the animation window so it reads as part of the scene. */}
                            {liveStatus === "idle" && (
                                <div className="sail-cta-dock">
                                    <button className="sail-cta" disabled={busy} onClick={() => act("start")}>
                                        <HelmIcon /> {busy ? "Casting off…" : "Set sail"}
                                    </button>
                                </div>
                            )}
                            {liveStatus === "arrived" && (
                                <div className="sail-cta-dock">
                                    <button className="sail-cta sail-cta-dig" disabled={busy} onClick={() => act("begin_dig")}>
                                        <span className="sail-cta-ico">⛏️</span> {busy ? "Landing…" : "Dig for treasure"}
                                    </button>
                                </div>
                            )}

                            {celebrate === "arrive" ? (<><div className="sail-landho">🏝️ LAND HO!</div><Confetti /></>) : null}
                            {celebrate === "depart" ? (<><div className="sail-bonvoyage">⚓ BON VOYAGE!</div><Confetti /></>) : null}
                            {celebrate === "gust" ? <WindGust /> : null}
                        </div>
                        {/* Voyage progress — only while actually at sea; a little boat creeping from port (⚓) to the island (🏝️). */}
                        {liveStatus === "sailing" && (
                            <div className="sail-voyage">
                                <span className="sail-voyage-end" aria-hidden="true">⚓</span>
                                <div className="sail-voyage-track">
                                    <span className="sail-voyage-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
                                    <span className="sail-voyage-boat" style={{ left: `${Math.round(progress * 100)}%` }} aria-hidden="true">⛵</span>
                                </div>
                                <span className="sail-voyage-end" aria-hidden="true">🏝️</span>
                            </div>
                        )}
                    </>
                )}

                {/* At-sea + digging controls below the scene. The tailwind is the one real action here, so it's a primary CTA. */}
                {(liveStatus === "sailing" || liveStatus === "digging") && (
                    <div className="sail-actions">
                        {liveStatus === "sailing" && (
                            state.windAvailable
                                ? <button className="sail-cta sail-cta-wind" disabled={busy} onClick={() => act("wind")}>{busy ? "Catching the wind…" : "Catch a tailwind — arrive 1h sooner"}</button>
                                : <button className="pill sail-donepill" disabled>Tailwind caught · resets tomorrow</button>
                        )}
                        {liveStatus === "digging" && <button className="pill" disabled>⛏️ Digging · {dig?.stamina} digs left</button>}
                    </div>
                )}

                {/* Boat identity + XP */}
                <div className="sail-boatline">
                    <div><span className="sail-boatname">Wood Boat</span> <Stars level={level} /><span className="muted" style={{ marginLeft: 8 }}>Lv {level}</span></div>
                    <span className="muted">🧩 {state.fragments} fragments · 🪙 {state.gold.toLocaleString()}</span>
                </div>
                <div className="sail-xpbar"><span style={{ width: `${xpPct}%` }} /></div>
            </section>

            {/* Upgrades */}
            <section className="card">
                <h2 style={{ marginTop: 0 }}>Upgrade your boat</h2>
                <div className="sail-upgrades">
                    <div className="sail-upg">
                        <div className="sail-upg-top"><span>💨 Speed</span><span className="muted">Lv {state.speed.level}/{state.speed.max}</span></div>
                        <p className="muted sail-upg-desc">Reach the island faster.</p>
                        {state.speed.maxed ? <button className="pill" disabled>Maxed</button>
                            : <button className="btn-ghost" disabled={busy || state.gold < state.speed.cost} onClick={() => act("upgrade_speed")}>🪙 {state.speed.cost.toLocaleString()}</button>}
                    </div>
                    <div className="sail-upg">
                        <div className="sail-upg-top"><span>🍀 Luck</span><span className="muted">Lv {state.luck.level}/{state.luck.max}</span></div>
                        <p className="muted sail-upg-desc">+1 dig stamina per level (currently {state.digStamina}).</p>
                        {state.luck.maxed ? <button className="pill" disabled>Maxed</button>
                            : <button className="btn-ghost" disabled={busy || state.gold < state.luck.cost} onClick={() => act("upgrade_luck")}>🪙 {state.luck.cost.toLocaleString()}</button>}
                    </div>
                </div>
            </section>

            {result ? (
                <div className="sail-reward-overlay" onClick={() => setResult(null)}>
                    <div className="card sail-reward" onClick={(e) => e.stopPropagation()}>
                        {result.won ? <Confetti /> : null}
                        <div className="sail-reward-emoji">{result.won ? "🧩" : "🪹"}</div>
                        <h2 style={{ margin: "6px 0" }}>{result.won ? "Fragment recovered!" : "Came up empty"}</h2>
                        <p className="muted" style={{ marginTop: 0 }}>{result.won ? `You now hold ${result.fragments} treasure-chest fragment${result.fragments === 1 ? "" : "s"}.` : "The fragment stayed buried. Sail out and try again."}</p>
                        <button className="sail-cta" onClick={() => setResult(null)}>{result.won ? "🎉 Nice" : "Try again"}</button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
