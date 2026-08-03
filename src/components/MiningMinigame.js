"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import ItemArt from "@/components/ItemArt";

// ── BREAKING THE SEAM ────────────────────────────────────────────────────────────────────────────────────────
// NO EMOJI here either — sprites and Gi glyphs only. See the note in MiningClient.
// A first-class timing minigame in its own modal, built to the same standard as the Kitchen's: nested bands you
// can SEE, a marker that overhangs the bar so the exact line is readable, a tap target that isn't under your
// thumb, and a hit that shakes, flashes, sparks and pops.
//
// The band widths below are the real grading bands doubled (a band of ±0.022 is 4.4% of the bar), so what you
// are aiming at is literally what you are scored against. If those change server-side, change them here — the
// comment in mining.js says the same thing in the other direction.
const BANDS = [
    { key: "good", pct: 32, label: "GOOD", color: "#d7c48a" },
    { key: "great", pct: 20, label: "GREAT", color: "#8fe39a" },
    { key: "perfect", pct: 11, label: "PERFECT", color: "#8fe3ff" },
    { key: "pixel", pct: 4.4, label: "PIXEL", color: "#ffd75e" },
];
const KIND_ART = {
    gold: "/images/mining/icon-coins.png",
    chest: "/images/mining/icon-chest.png",
    gear: "/images/mining/icon-gear.png",
    consumable: "/images/mining/icon-potion.png",
};
// Same rarity language the chest opener uses, so a Legendary out of the rock reads exactly like a Legendary
// out of a chest — one game, one vocabulary.
const RARITY_COLOR = { common: "#9aa7b5", rare: "#4aa3ff", epic: "#b76bff", legendary: "#ffb52e", mythic: "#37f5c0", ascendant: "#ff7a3c", eternal: "#ff5cc8" };
const RARITY_LABEL = { common: "COMMON", rare: "RARE", epic: "EPIC", legendary: "LEGENDARY", mythic: "MYTHIC", ascendant: "ASCENDANT", eternal: "ETERNAL" };
const STAT_SHORT = { might: "Might", crit_chance: "Crit", crit_power: "Crit Dmg", ferocity: "Ferocity", fortune: "Fortune", extra_strike: "Extra Strike" };
const statLine = (stats) => Object.entries(stats || {}).map(([k, v]) => `+${v} ${STAT_SHORT[k] || k}`).join(" · ");

const GRADE_COLOR = { pixel: "#ffd75e", perfect: "#8fe3ff", great: "#8fe39a", good: "#d7c48a", miss: "#ff8f9a" };
const GRADE_SHAKE = { pixel: 4, perfect: 3, great: 2, good: 1, miss: 1 };
const SWEEP_MS = 900;
const GRADE_CD = { pixel: 700, perfect: 850, great: 1050, good: 1300, miss: 1600 };
const CD_DEFAULT = 1600;

let _ac = null;
const ac = () => { if (typeof window === "undefined") return null; try { _ac = _ac || new (window.AudioContext || window.webkitAudioContext)(); if (_ac.state === "suspended") _ac.resume(); return _ac; } catch { return null; } };
// A pick on rock: a bright strike that drops fast into a dull thud. Pitched by grade.
function strike(grade) {
    const a = ac(); if (!a) return;
    const top = grade === "pixel" ? 1150 : grade === "perfect" ? 900 : grade === "great" ? 700 : grade === "good" ? 520 : 300;
    try {
        const o = a.createOscillator(), g = a.createGain();
        o.type = "square"; o.frequency.setValueAtTime(top, a.currentTime);
        o.frequency.exponentialRampToValueAtTime(80, a.currentTime + 0.18);
        g.gain.setValueAtTime(0.14, a.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.22);
        o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.24);
        if (grade === "pixel" || grade === "perfect") {
            const o2 = a.createOscillator(), g2 = a.createGain();
            o2.type = "triangle"; o2.frequency.setValueAtTime(top * 1.5, a.currentTime + 0.02);
            g2.gain.setValueAtTime(0.09, a.currentTime + 0.02);
            g2.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.3);
            o2.connect(g2); g2.connect(a.destination); o2.start(a.currentTime + 0.02); o2.stop(a.currentTime + 0.32);
        }
    } catch { /* audio is a bonus */ }
}
function breakChord() {
    const a = ac(); if (!a) return;
    [392, 523, 659, 784].forEach((f, i) => {
        try {
            const t = a.currentTime + i * 0.07;
            const o = a.createOscillator(), g = a.createGain();
            o.type = "triangle"; o.frequency.value = f;
            g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.2, t + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
            o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.42);
        } catch { /* ignore */ }
    });
}

const Img = ({ src, className, fallback }) => {
    const [bad, setBad] = useState(false);
    if (bad || !src) return <span className={className} aria-hidden="true">{fallback}</span>;
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={className} src={src} alt="" draggable="false" onError={() => setBad(true)} />;
};

export default function MiningMinigame({ node, pick, onSwing, onDone }) {
    const [marker, setMarker] = useState(0.5);
    const markerRef = useRef(0.5);
    const [hits, setHits] = useState(node?.mySwings ?? 0);
    const maxHits = node?.maxHits ?? 8;
    const [score, setScore] = useState(0);
    const [cooling, setCooling] = useState(false);
    const [pop, setPop] = useState(null);        // the grade label that punches out on a hit
    const [sparks, setSparks] = useState([]);
    const [floats, setFloats] = useState([]);
    const [shake, setShake] = useState(0);
    const [flash, setFlash] = useState(null);
    const [chain, setChain] = useState(0);
    const [tickets, setTickets] = useState(0);   // rare tickets your timing has put in the bag
    const [cracked, setCracked] = useState(null);
    const [notice, setNotice] = useState(null);
    const cdRef = useRef(false), busyRef = useRef(false), cdUntil = useRef(0), cdMs = useRef(CD_DEFAULT), cdEl = useRef(null);
    const idRef = useRef(0);

    // The marker sweeps. rAF rather than CSS so the sampled position and the drawn position are the same number.
    useEffect(() => {
        let raf = 0;
        const t0 = performance.now();
        const loop = (t) => {
            const phase = ((t - t0) % (SWEEP_MS * 2)) / SWEEP_MS;
            const pos = phase <= 1 ? phase : 2 - phase;
            markerRef.current = pos; setMarker(pos);
            if (cdEl.current) cdEl.current.style.transform = `scaleX(${Math.max(0, cdUntil.current - Date.now()) / (cdMs.current || CD_DEFAULT)})`;
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, []);

    const burst = (grade) => {
        const c = GRADE_COLOR[grade] || "#fff";
        const n = grade === "pixel" ? 14 : grade === "perfect" ? 10 : grade === "great" ? 7 : 4;
        const made = Array.from({ length: n }, () => ({
            id: (idRef.current += 1),
            a: Math.round(Math.random() * 360),
            d: 40 + Math.round(Math.random() * 70),
            c,
        }));
        setSparks((s) => [...s.slice(-24), ...made]);
        setTimeout(() => setSparks((s) => s.filter((x) => !made.some((m) => m.id === x.id))), 700);
    };

    const swing = useCallback(async () => {
        if (cdRef.current || busyRef.current || cracked) return;
        busyRef.current = true; cdRef.current = true;
        const d = Math.abs(markerRef.current - 0.5);
        const key = d <= 0.022 ? "pixel" : d <= 0.055 ? "perfect" : d <= 0.10 ? "great" : d <= 0.16 ? "good" : "miss";
        const guess = GRADE_CD[key] ?? CD_DEFAULT;
        cdMs.current = guess; cdUntil.current = Date.now() + guess;
        let timer = setTimeout(() => { cdRef.current = false; setCooling(false); }, guess);
        setCooling(true);

        // Everything you FEEL fires now, off the local grade — the round trip must never be in the way of the
        // hit landing. The server's answer only ever corrects the numbers.
        strike(key);
        setShake(GRADE_SHAKE[key] || 1);
        setTimeout(() => setShake(0), 320);
        setFlash({ k: Date.now(), c: GRADE_COLOR[key] });
        setTimeout(() => setFlash(null), 340);
        burst(key);
        try {
            navigator.vibrate?.(key === "pixel" ? [30, 30, 30, 30, 60, 40, 110] : key === "perfect" ? [22, 34, 26, 34, 70]
                : key === "great" ? [16, 30, 40] : key === "good" ? [12, 26] : [8]);
        } catch { /* no haptics here */ }

        const r = await onSwing(d);
        busyRef.current = false;

        if (typeof r?.cooldownMs === "number" && r.cooldownMs !== guess) {
            clearTimeout(timer);
            const remain = Math.max(0, r.cooldownMs - (guess - Math.max(0, cdUntil.current - Date.now())));
            cdMs.current = r.cooldownMs; cdUntil.current = Date.now() + remain;
            timer = setTimeout(() => { cdRef.current = false; setCooling(false); }, remain);
        }

        if (!r?.ok) {
            clearTimeout(timer);
            cdRef.current = false; cdUntil.current = 0; setCooling(false);
            setNotice(r?.error === "too_fast" ? "Easy — let the bar refill" : r?.error === "node_gone" ? "This seam is gone" : "That swing didn't land");
            setTimeout(() => setNotice(null), 1500);
            return;
        }

        setPop({ k: Date.now(), label: r.gradeLabel, color: GRADE_COLOR[r.grade], chain: r.combo });
        setTimeout(() => setPop(null), 800);
        const fid = (idRef.current += 1);
        setFloats((f) => [...f.slice(-6), { id: fid, dmg: r.damage, grade: r.grade }]);
        setTimeout(() => setFloats((f) => f.filter((x) => x.id !== fid)), 900);
        setChain(r.combo || 0);
        if (r.grade === "pixel") setTickets((t) => t + 2);
        else if (r.grade === "perfect") setTickets((t) => t + 1);
        if (typeof r.hits === "number") setHits(r.hits);
        if (typeof r.score === "number") setScore(r.score);

        if (r.cracked) {
            breakChord();
            setShake(4); setTimeout(() => setShake(0), 420);
            try { navigator.vibrate?.([40, 50, 40, 50, 140]); } catch { /* no haptics */ }
            setTimeout(() => setCracked(r.cracked), 380);
        }
    }, [onSwing, cracked]);

    const label = (kind, x) => {
        if (kind === "gold") return `${Number(x.n).toLocaleString()} gold`;
        if (kind === "chest") return `${x.tier[0].toUpperCase()}${x.tier.slice(1)} chest`;
        return x.name || kind;
    };

    return createPortal(
        <div className="mmg-scrim" role="dialog" aria-modal="true" aria-label={`Breaking ${node?.name}`}>
            <div className={`mmg${shake ? ` is-shake-${shake}` : ""}`} style={{ "--ore": node?.color || "#ffd75e" }}>
                {flash ? <span key={flash.k} className="mmg-flash" style={{ "--fc": flash.c }} aria-hidden="true" /> : null}

                <div className="mmg-head">
                    <Img src={node?.art} className="mmg-art" fallback="" />
                    <div className="mmg-headbody">
                        <div className="mmg-name">{node?.name}</div>
                        <div className="mmg-tier">smelts to tier {node?.partTier}</div>
                    </div>
                    <div className="mmg-tickets" title="Rare tickets your timing has put in the bag">
                        <b>{tickets}</b><span>rare</span>
                    </div>
                </div>

                {/* SWINGS LEFT, not a health bar. A fixed hand of swings that gets scored — so the last one
                    matters as much as the first, and the run has an ending you can see coming. */}
                <div className="mmg-hits" aria-label={`${Math.max(0, maxHits - hits)} swings left`}>
                    {Array.from({ length: maxHits }, (_, i) => <i key={i} className={i < hits ? "spent" : ""} />)}
                </div>

                {cracked ? (
                    // THE OPEN. Staggered so each thing you pulled out lands separately.
                    <div className="mmg-draw">
                        <div className="mmg-rank" style={{ "--rk": cracked.rankColor }}>
                            <b>{cracked.rankLabel}</b>
                            <em>{cracked.pct}% of a flawless run · {cracked.hits} swings</em>
                        </div>
                        <div className="mmg-draw-head">The seam opens</div>
                        <div className="mmg-draw-row">
                            {(cracked.draws || []).map((x, i) => (
                                <span key={i} className={`mmg-drawn is-${x.kind}`} style={{ animationDelay: `${i * 0.16}s` }}>
                                    {x.art ? <Img src={x.art} className="mmg-drawn-art" fallback="" />
                                        : <Img src={KIND_ART[x.kind] || KIND_ART.gold} className="mmg-drawn-art" fallback="" />}
                                    <em style={{ color: x.color || "#e7dcc8" }}>{label(x.kind, x)}</em>
                                    {x.n && x.kind === "ore" ? <i>×{x.n}</i> : null}
                                </span>
                            ))}
                        </div>
                        <p className="mmg-draw-note">
                            {cracked.seeded ? `${cracked.seeded} rare ticket${cracked.seeded === 1 ? "" : "s"} went in the bag from your timing.` : "No rare tickets that time — clean swings put them in."}
                        </p>
                        <button type="button" className="mmg-tap" onClick={() => onDone(cracked)}>Pocket it</button>
                    </div>
                ) : (
                    <>
                        <div className="mmg-bar" aria-hidden="true">
                            {BANDS.map((b) => <span key={b.key} className={`mmg-zone is-${b.key}`} style={{ width: `${b.pct}%` }} />)}
                            <span className="mmg-marker" style={{ left: `${marker * 100}%` }} />
                            <Img src={pick?.sprite} className="mmg-rider" fallback="" />
                            {sparks.map((sp) => (
                                <span key={sp.id} className="mmg-spark" style={{ "--a": `${sp.a}deg`, "--d": `${sp.d}px`, background: sp.c }} />
                            ))}
                            {pop ? (
                                <span key={pop.k} className="mmg-pop" style={{ color: pop.color }}>
                                    {pop.label}{pop.chain > 1 ? <b> ×{pop.chain}</b> : null}
                                </span>
                            ) : null}
                            {floats.map((f) => (
                                <span key={f.id} className="mmg-float" style={{ color: GRADE_COLOR[f.grade] }}>{f.dmg}</span>
                            ))}
                        </div>

                        {/* The bands, named. The widths above ARE these bands, so the legend is the rules. */}
                        <div className="mmg-key">
                            <span className="is-miss">MISS</span>
                            {BANDS.map((b) => <span key={b.key} className={`is-${b.key}`}>{b.label}</span>)}
                        </div>

                        <button type="button" className="mmg-tap" onPointerDown={(e) => { e.preventDefault(); swing(); }} disabled={cooling}>
                            <span className="mmg-tap-cd" ref={cdEl} aria-hidden="true" />
                            <span>{cooling ? "…" : "SWING"}</span>
                        </button>

                        <div className="mmg-meta">
                            <span>Swings <b>{Math.max(0, maxHits - hits)}</b></span>
                            <span className={chain >= 3 ? "mmg-chain-hot" : undefined}>Chain <b>×{chain}</b></span>
                            <span>Bag <b>{tickets}</b></span>
                        </div>
                        {notice ? <p className="mmg-notice">{notice}</p> : null}
                        <p className="mmg-hint">Dead centre is PIXEL. Clean swings drop rare tickets in the bag — what the seam pays is drawn from it when the rock opens.</p>
                    </>
                )}
            </div>
            <style>{MMG_CSS}</style>
        </div>,
        document.body
    );
}

const MMG_CSS = `
.mmg-scrim { position: fixed; inset: 0; z-index: 320; display: grid; place-items: center; padding: 16px;
    background: radial-gradient(120% 90% at 50% 30%, rgba(60,36,10,0.55), rgba(6,4,10,0.92) 70%);
    backdrop-filter: blur(4px); animation: mmgFade .25s ease both; }
@keyframes mmgFade { from { opacity: 0; } to { opacity: 1; } }
.mmg { position: relative; width: min(440px, 100%); padding: 18px 16px 14px; border-radius: 20px; overflow: hidden;
    background: linear-gradient(180deg, #2a1e10, #16100a);
    border: 2px solid color-mix(in srgb, var(--ore) 60%, transparent);
    box-shadow: 0 24px 70px rgba(0,0,0,0.72), 0 0 50px -12px var(--ore);
    animation: mmgPop .34s cubic-bezier(.2,1.3,.35,1) both; }
@keyframes mmgPop { from { opacity: 0; transform: translateY(14px) scale(.94); } to { opacity: 1; transform: none; } }
.mmg.is-shake-1 { animation: mmgShake .16s ease-out; --amp: 2px; }
.mmg.is-shake-2 { animation: mmgShake .2s ease-out; --amp: 4px; }
.mmg.is-shake-3 { animation: mmgShake .24s ease-out; --amp: 7px; }
.mmg.is-shake-4 { animation: mmgShake .3s ease-out; --amp: 11px; }
@keyframes mmgShake { 0%,100% { transform: none; } 20% { transform: translate(calc(var(--amp) * -1), 1px) rotate(-.4deg); }
    50% { transform: translate(var(--amp), -1px) rotate(.4deg); } 80% { transform: translate(calc(var(--amp) * -.5), 0); } }
.mmg-flash { position: absolute; inset: 0; pointer-events: none; border-radius: 20px;
    background: radial-gradient(circle at 50% 55%, var(--fc), transparent 62%); animation: mmgFlash .34s ease-out forwards; }
@keyframes mmgFlash { from { opacity: .55; } to { opacity: 0; } }

.mmg-head { display: flex; align-items: center; gap: 11px; margin-bottom: 10px; }
.mmg-art { width: 54px; height: 54px; object-fit: contain; filter: drop-shadow(0 0 14px var(--ore)); }
.mmg-headbody { flex: 1; min-width: 0; }
.mmg-name { font-weight: 900; font-size: 1.05rem; color: #ffe9c9; }
.mmg-tier { font-size: .72rem; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; color: var(--ore); }
.mmg-tickets { flex: 0 0 auto; text-align: center; padding: 5px 10px; border-radius: 10px;
    background: rgba(255,215,94,0.12); border: 1px solid rgba(255,215,94,0.4); }
.mmg-tickets b { display: block; font-size: 1.1rem; color: #ffd75e; line-height: 1; }
.mmg-tickets span { font-size: 9px; letter-spacing: .08em; text-transform: uppercase; color: #b9a98f; }

.mmg-hp { height: 9px; border-radius: 999px; background: rgba(0,0,0,0.55); overflow: hidden; margin-bottom: 16px; }
.mmg-hp > span { display: block; height: 100%; transition: width .25s cubic-bezier(.3,1.2,.4,1); }

.mmg-bar { position: relative; height: 30px; border-radius: 999px; margin-bottom: 7px;
    background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.14); }
/* Nested, centred. Each width is its real grading band doubled — the band you see is the band you're scored on. */
.mmg-zone { position: absolute; top: 0; bottom: 0; left: 50%; transform: translateX(-50%); border-radius: 999px; }
.mmg-zone.is-good { background: rgba(215,196,138,0.18); }
.mmg-zone.is-great { background: rgba(143,227,154,0.26); }
.mmg-zone.is-perfect { background: rgba(143,227,255,0.34); }
.mmg-zone.is-pixel { background: rgba(255,215,94,0.75); box-shadow: 0 0 16px rgba(255,215,94,0.85); }
.mmg-marker { position: absolute; top: -5px; bottom: -5px; width: 4px; margin-left: -2px; border-radius: 3px;
    background: linear-gradient(180deg, #fff, #ffe9c9); box-shadow: 0 0 12px #fff, 0 0 22px var(--ore); }
.mmg-rider { position: absolute; top: -30px; left: 50%; transform: translateX(-50%); width: 26px; height: 26px;
    object-fit: contain; pointer-events: none; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.7)); }
.mmg-spark { position: absolute; left: 50%; top: 50%; width: 5px; height: 5px; border-radius: 50%; pointer-events: none;
    animation: mmgSpark .6s ease-out both; }
@keyframes mmgSpark { from { transform: translate(-50%,-50%) rotate(var(--a)) translateX(0); opacity: 1; }
    to { transform: translate(-50%,-50%) rotate(var(--a)) translateX(var(--d)); opacity: 0; } }
.mmg-pop { position: absolute; left: 50%; top: -34px; transform: translateX(-50%); font-weight: 900; font-size: 1.1rem;
    letter-spacing: .04em; white-space: nowrap; pointer-events: none; text-shadow: 0 2px 8px rgba(0,0,0,.85);
    animation: mmgPopUp .8s ease-out both; }
@keyframes mmgPopUp { 0% { opacity: 0; transform: translateX(-50%) scale(.6); } 22% { opacity: 1; transform: translateX(-50%) scale(1.12); }
    100% { opacity: 0; transform: translateX(-50%) translateY(-22px) scale(1); } }
.mmg-float { position: absolute; right: 8px; top: -26px; font-weight: 900; font-size: 1rem; pointer-events: none;
    text-shadow: 0 2px 6px #000; animation: mmgFloat .9s ease-out both; }
@keyframes mmgFloat { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-30px); } }

.mmg-key { display: flex; gap: 3px; margin-bottom: 13px; }
.mmg-key span { flex: 1 1 0; text-align: center; font-size: 9px; font-weight: 900; letter-spacing: .05em;
    padding: 4px 2px; border-radius: 6px; background: rgba(255,255,255,0.05); }
.mmg-key .is-miss { color: #ff8f9a; } .mmg-key .is-good { color: #d7c48a; } .mmg-key .is-great { color: #8fe39a; }
.mmg-key .is-perfect { color: #8fe3ff; } .mmg-key .is-pixel { color: #2a1400; background: #ffd75e; }

.mmg-tap { position: relative; overflow: hidden; width: 100%; padding: 15px; border-radius: 14px; border: none;
    font-weight: 900; font-size: 1.18rem; letter-spacing: .06em; color: #2a1400; cursor: pointer;
    background: linear-gradient(180deg, #ffe08a, #ffb020); box-shadow: 0 4px 0 #b47a12, 0 8px 22px rgba(255,160,30,.3); }
.mmg-tap:active { transform: translateY(2px); box-shadow: 0 2px 0 #b47a12; }
.mmg-tap:disabled { filter: saturate(.7) brightness(.9); cursor: default; }
.mmg-tap-cd { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; transform-origin: left center; background: rgba(0,0,0,0.28); }
.mmg-meta { display: flex; justify-content: space-between; gap: 8px; margin-top: 11px; font-size: 11.5px; color: #b9a98f; }
.mmg-meta b { color: #ffe9c9; }
.mmg-chain-hot b { color: #ffd75e; animation: mmgHot .9s ease-in-out infinite; }
@keyframes mmgHot { 0%,100% { transform: scale(1); } 50% { transform: scale(1.18); } }
.mmg-notice { text-align: center; margin: 8px 0 0; font-size: 12px; font-weight: 700; color: #ffcf6a; }
.mmg-hint { margin: 9px 0 0; font-size: 11px; line-height: 1.5; color: #8b8171; text-align: center; }

.mmg-hits { display: flex; gap: 4px; margin-bottom: 16px; }
.mmg-hits i { flex: 1 1 0; height: 8px; border-radius: 999px; background: var(--ore); box-shadow: 0 0 8px -2px var(--ore); }
.mmg-hits i.spent { background: rgba(255,255,255,0.13); box-shadow: none; }
.mmg-rank { margin-bottom: 12px; padding: 10px; border-radius: 12px; border: 1px solid var(--rk);
    background: color-mix(in srgb, var(--rk) 14%, transparent); animation: mmgPop .4s cubic-bezier(.2,1.4,.35,1) both; }
.mmg-rank b { display: block; font-size: 1.3rem; letter-spacing: .06em; color: var(--rk); }
.mmg-rank em { font-style: normal; font-size: 11px; color: #b9a98f; }
.mmg-draw { text-align: center; animation: mmgPop .4s cubic-bezier(.2,1.3,.35,1) both; }
.mmg-draw-head { font-weight: 900; font-size: 1.15rem; color: #ffd75e; margin-bottom: 12px; letter-spacing: .04em; }
.mmg-draw-row { display: flex; justify-content: center; gap: 9px; flex-wrap: wrap; margin-bottom: 10px; }
.mmg-drawn { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 9px 8px; border-radius: 12px;
    min-width: 74px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12);
    animation: mmgDrawn .5s cubic-bezier(.2,1.4,.35,1) both; }
.mmg-drawn.is-gear, .mmg-drawn.is-chest { border-color: rgba(255,215,94,0.6); background: rgba(255,215,94,0.12); }
@keyframes mmgDrawn { from { opacity: 0; transform: translateY(14px) scale(.7); } to { opacity: 1; transform: none; } }
/* A found ITEM is the headline of a draw — full width, its rarity in the frame, glowing. */
.mmg-drawn.is-item { flex-basis: 100%; min-width: 100%; padding: 12px; border-color: var(--rar);
    background: color-mix(in srgb, var(--rar) 13%, rgba(0,0,0,0.3)); box-shadow: 0 0 28px -6px var(--rar); }
.mmg-item-tag { font-size: 9px; font-weight: 900; letter-spacing: .12em; color: var(--rar); }
.mmg-item-art { width: 74px; height: 74px; display: grid; place-items: center; }
.mmg-item-art .item-art-img { width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 0 12px var(--rar)); }
.mmg-item-art svg { width: 54px; height: 54px; color: var(--rar); }
.mmg-item-name { font-size: 1.02rem !important; font-weight: 900; }
.mmg-item-slot { font-style: normal; font-size: 10px; text-transform: uppercase; letter-spacing: .07em; color: #9aa2ab; }
.mmg-item-stats { font-style: normal; font-size: 11px; color: #e7dcc8; }
.mmg-drawn-art { width: 36px; height: 36px; object-fit: contain; }
.mmg-drawn-emoji { font-size: 30px; line-height: 1; }
.mmg-drawn em { font-style: normal; font-size: 10.5px; }
.mmg-drawn i { font-style: normal; font-size: 11px; font-weight: 900; color: #ffe9c9; }
.mmg-draw-note { font-size: 11.5px; color: #8b8171; margin: 0 0 14px; }
`;
