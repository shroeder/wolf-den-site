"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import ItemArt from "@/components/ItemArt";
import { bandPct, gradeKeyForDist, GRADE_COLOR } from "@/lib/marketplace/timing.js";

// ── BREAKING THE SEAM ────────────────────────────────────────────────────────────────────────────────────────
// NO EMOJI here either — sprites and Gi glyphs only. See the note in MiningClient.
// A first-class timing minigame in its own modal, built to the same standard as the Kitchen's: nested bands you
// can SEE, a marker that overhangs the bar so the exact line is readable, a tap target that isn't under your
// thumb, and a hit that shakes, flashes, sparks and pops.
//
// The zones are DRAWN from the same cut-points the server GRADES against (lib/marketplace/timing.js), so what
// you are aiming at is literally what you are scored against — they cannot drift apart. Widest first, so each
// narrower band paints on top of the last.
const BAND_LABEL = { good: "GOOD", great: "GREAT", perfect: "PERFECT", pixel: "PIXEL" };
// `widen` is the Endurance allowance from the server. Drawn as well as graded, so a steadier hand visibly
// makes every band fatter rather than being an invisible stat.
const bandsFor = (widen = 0) => ["good", "great", "perfect", "pixel"].map((key) => ({
    key, pct: Math.min(100, bandPct(key) + widen * 200), label: BAND_LABEL[key], color: GRADE_COLOR[key],
}));
const KIND_ART = {
    gold: "/images/ui/coin.png",
    chest: "/images/ui/chest.png",
    gear: "/images/ui/gear.png",
    consumable: "/images/ui/potion.png",
};
// Same rarity language the chest opener uses, so a Legendary out of the rock reads exactly like a Legendary
// out of a chest — one game, one vocabulary.
const RARITY_COLOR = { common: "#9aa7b5", rare: "#4aa3ff", epic: "#b76bff", legendary: "#ffb52e", mythic: "#37f5c0", ascendant: "#ff7a3c", eternal: "#ff5cc8" };
const RARITY_LABEL = { common: "COMMON", rare: "RARE", epic: "EPIC", legendary: "LEGENDARY", mythic: "MYTHIC", ascendant: "ASCENDANT", eternal: "ETERNAL" };
const STAT_SHORT = { might: "Might", crit_chance: "Crit", crit_power: "Crit Dmg", ferocity: "Ferocity", fortune: "Fortune", extra_strike: "Extra Strike" };
const statLine = (stats) => Object.entries(stats || {}).map(([k, v]) => `+${v} ${STAT_SHORT[k] || k}`).join(" · ");

const GRADE_SHAKE = { pixel: 4, perfect: 3, great: 2, good: 1, miss: 1 };
const SWEEP_MS = 900;
// Matches the server's anti-double-tap floor. Not a cooldown — you will never see it; it exists so a shaky
// double-tap can't come back as "Easy — let the bar refill".
const FLOOR_MS = 300;

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
    // Seam integrity and your running average swing quality, both straight from the server's answer — the two
    // things worth knowing mid-hand now that there is no swing budget to count down.
    const [pct, setPct] = useState(Number(node?.pct ?? 100));
    const [quality, setQuality] = useState(0);
    // Endurance's steady-hand allowance, from the server. Used to GRADE locally and to DRAW the bands, so what
    // you see is what you are scored against.
    const widen = Number(node?.widen) || 0;
    const bands = bandsFor(widen);
    const [score, setScore] = useState(0);
    const [pop, setPop] = useState(null);        // the grade label that punches out on a hit
    const [sparks, setSparks] = useState([]);
    const [floats, setFloats] = useState([]);
    const [shake, setShake] = useState(0);
    const [flash, setFlash] = useState(null);
    const [chain, setChain] = useState(0);
    const [tickets, setTickets] = useState(0);   // rare tickets your timing has put in the bag
    const [cracked, setCracked] = useState(null);
    const [notice, setNotice] = useState(null);
    const busyRef = useRef(false), cdUntil = useRef(0);
    const idRef = useRef(0);

    // The marker sweeps. rAF rather than CSS so the sampled position and the drawn position are the same number.
    useEffect(() => {
        let raf = 0;
        const t0 = performance.now();
        const loop = (t) => {
            const phase = ((t - t0) % (SWEEP_MS * 2)) / SWEEP_MS;
            const pos = phase <= 1 ? phase : 2 - phase;
            markerRef.current = pos; setMarker(pos);
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
        // Only two reasons not to swing: one is already in flight, or the seam is already open. No cooldown —
        // the bar takes 900ms to cross, so there is nothing to gain by tapping faster than you can aim, and
        // locking the button was punishing a problem nobody had. The tiny floor below just matches the
        // server's anti-double-tap so a fumbled double never comes back as an error.
        if (busyRef.current || cracked) return;
        if (Date.now() < cdUntil.current) return;
        busyRef.current = true;
        cdUntil.current = Date.now() + FLOOR_MS;
        const d = Math.abs(markerRef.current - 0.5);
        const key = gradeKeyForDist(d, widen);

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

        if (!r?.ok) {
            cdUntil.current = 0;
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
        if (typeof r.pct === "number") setPct(r.pct);
        if (typeof r.quality === "number") setQuality(r.quality);

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
            {/* The shake used to be on the CARD, up to 11px, so every good hit threw the whole modal — the bar
                you are aiming at and the button under your thumb — around the screen. It lives on the seam art
                now, where the impact actually is. */}
            <div className="mmg" style={{ "--ore": node?.color || "#ffd75e" }}>
                {flash ? <span key={flash.k} className="mmg-flash" style={{ "--fc": flash.c }} aria-hidden="true" /> : null}

                <div className="mmg-head">
                    <Img src={node?.art} className={`mmg-art${shake ? ` is-shake-${shake}` : ""}`} fallback="" />
                    <div className="mmg-headbody">
                        <div className="mmg-name">{node?.name}</div>
                        <div className="mmg-tier">smelts to tier {node?.partTier}</div>
                    </div>
                    {/* "rare" alone meant nothing to anyone who hadn't read the code. Say what it buys. */}
                    <div className="mmg-tickets" title="Clean swings raise the odds of something buried with the ore">
                        <b>{tickets}</b><span>lucky</span>
                    </div>
                </div>

                {/* THE ROCK. Swings aren't metered — the trip is the budget — so what you want to see is how
                    close the seam is to giving way. A pip row for a fixed hand was the wrong readout for a
                    game you can play as long as you like. */}
                <div className="mmg-hp" aria-label={`${pct}% of the seam left`}>
                    <span style={{ width: `${pct}%`, background: node?.color || "#ffd75e" }} />
                </div>

                {cracked ? (
                    // THE OPEN. Staggered so each thing you pulled out lands separately.
                    <div className="mmg-draw" style={{ "--rk": cracked.rankColor }}>
                        {/* The payoff needs to LAND. A rank that just appears is a receipt; one that stamps in
                            over a light sweep, with the seam's colour raining down, is the reason you swung. */}
                        <span className="mmg-draw-rays" aria-hidden="true" />
                        <span className="mmg-draw-confetti" aria-hidden="true">
                            {Array.from({ length: 26 }).map((_, i) => (
                                <span key={i} style={{
                                    left: `${(i * 41) % 100}%`,
                                    animationDelay: `${(i % 8) * 0.06}s`,
                                    background: i % 3 === 0 ? cracked.rankColor : ["#ffd75e", "#8fe3ff", "#8fe39a"][i % 3],
                                }} />
                            ))}
                        </span>
                        <div className="mmg-rank" style={{ "--rk": cracked.rankColor }}>
                            <b>{cracked.rankLabel}</b>
                            <em>{cracked.pct}% of a flawless run · {cracked.hits} swings</em>
                        </div>
                        <div className="mmg-draw-head">The seam opens</div>

                        {/* THE HAUL. Ore is the reward; a bonus is the surprise on top. This was a row of up to
                            six "pulls from the bag" — three chests and a robe out of one Coal seam — which is
                            absurd as an economy and unreadable as a moment. The farm gets this right: one
                            guaranteed thing, and occasionally one more. */}
                        <div className="mmg-haul">
                            <Img src={cracked.art} className="mmg-haul-art" fallback="" />
                            <b style={{ color: cracked.color }}>{cracked.ore} {cracked.oreName}</b>
                        </div>
                        <div className="mmg-earn">
                            <span><Img src="/images/ui/coin.png" className="mmg-earn-ico" fallback="" /> +{Number(cracked.gold || 0).toLocaleString()}</span>
                            <span>+{cracked.xp} XP</span>
                        </div>

                        {cracked.bonus ? (
                            <div className="mmg-bonus"
                                style={{ "--rar": cracked.bonus.kind === "gear" ? (RARITY_COLOR[cracked.bonus.rarity] || "#ffd75e") : "#ffd75e" }}>
                                <span className="mmg-bonus-lab">Buried with it</span>
                                {cracked.bonus.kind === "gear" && cracked.bonus.id ? (
                                    <>
                                        <ItemArt id={cracked.bonus.id} icon={cracked.bonus.icon} className="mmg-item-art" alt="" />
                                        <i className="mmg-item-tag">{RARITY_LABEL[cracked.bonus.rarity] || cracked.bonus.rarity}</i>
                                        <em className="mmg-item-name" style={{ color: RARITY_COLOR[cracked.bonus.rarity] || "#e7dcc8" }}>{cracked.bonus.name}</em>
                                        {cracked.bonus.stats ? <i className="mmg-item-stats">{statLine(cracked.bonus.stats)}</i> : null}
                                    </>
                                ) : (
                                    <>
                                        <Img src={cracked.bonus.art || KIND_ART[cracked.bonus.kind] || KIND_ART.gold} className="mmg-bonus-art" fallback="" />
                                        <em>{cracked.bonus.kind === "ore" ? `${cracked.bonus.n} more ${cracked.bonus.name}` : cracked.bonus.name}</em>
                                    </>
                                )}
                            </div>
                        ) : null}

                        <button type="button" className="mmg-tap" onClick={() => onDone(cracked)}>Pocket it</button>
                    </div>
                ) : (
                    <>
                        <div className="mmg-bar" aria-hidden="true">
                            {bands.map((b) => <span key={b.key} className={`mmg-zone is-${b.key}`} style={{ width: `${b.pct}%` }} />)}
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
                            {bands.map((b) => <span key={b.key} className={`is-${b.key}`}>{b.label}</span>)}
                        </div>

                        {/* No cooldown, no disabled state, no sweep draining across the button — the kitchen's
                            tap has none of that and is the better game for it. The marker takes 900ms to cross,
                            so tapping faster than the bar moves gains you nothing; the cooldown was punishing
                            you for a thing you had no reason to do. */}
                        <button type="button" className="mmg-tap" onPointerDown={(e) => { e.preventDefault(); swing(); }}>
                            SWING
                        </button>

                        <div className="mmg-meta">
                            <span>Swings <b>{hits}</b></span>
                            <span title="Your average swing quality — this is what the rank is read off">Quality <b>{quality}%</b></span>
                            <span className={chain >= 3 ? "mmg-chain-hot" : undefined}>Chain <b>×{chain}</b></span>
                            <span title="Clean swings raise the odds of something buried with the ore">Luck <b>{tickets}</b></span>
                        </div>
                        {notice ? <p className="mmg-notice">{notice}</p> : null}
                        <p className="mmg-hint">Dead centre is PIXEL. Your average across the whole seam sets the rank — and the rank decides how much ore comes out, and the odds of something buried with it.</p>
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
/* max-height + scroll: the reveal used to run off the bottom of a phone with no way to reach the button. */
.mmg { position: relative; width: min(440px, 100%); max-height: calc(100dvh - 32px); overflow-y: auto; overflow-x: hidden;
    padding: 18px 16px 14px; border-radius: 20px;
    background: linear-gradient(180deg, #2a1e10, #16100a);
    border: 2px solid color-mix(in srgb, var(--ore) 60%, transparent);
    box-shadow: 0 24px 70px rgba(0,0,0,0.72), 0 0 50px -12px var(--ore);
    animation: mmgPop .34s cubic-bezier(.2,1.3,.35,1) both; }
@keyframes mmgPop { from { opacity: 0; transform: translateY(14px) scale(.94); } to { opacity: 1; transform: none; } }
/* The seam art takes the hit, at a fraction of the old amplitude. 11px of whole-modal shake on a PIXEL was
   the "jostling": the thing you aim at and the thing you tap both moved every time you did well. */
.mmg-art.is-shake-1 { animation: mmgShake .16s ease-out; --amp: 1px; }
.mmg-art.is-shake-2 { animation: mmgShake .2s ease-out; --amp: 2px; }
.mmg-art.is-shake-3 { animation: mmgShake .24s ease-out; --amp: 3px; }
.mmg-art.is-shake-4 { animation: mmgShake .3s ease-out; --amp: 5px; }
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
.mmg-meta { display: flex; justify-content: space-between; gap: 8px; margin-top: 11px; font-size: 11.5px; color: #b9a98f; }
.mmg-meta b { color: #ffe9c9; }
.mmg-chain-hot b { color: #ffd75e; animation: mmgHot .9s ease-in-out infinite; }
@keyframes mmgHot { 0%,100% { transform: scale(1); } 50% { transform: scale(1.18); } }
.mmg-notice { text-align: center; margin: 8px 0 0; font-size: 12px; font-weight: 700; color: #ffcf6a; }
.mmg-hint { margin: 9px 0 0; font-size: 11px; line-height: 1.5; color: #8b8171; text-align: center; }

.mmg-draw { position: relative; overflow: hidden; }
.mmg-draw-note.is-sub { margin-top: -4px; font-size: 11.5px; color: #9aa2ab; }
.mmg-seed-rare { color: #ffd75e; }
/* A slow sweep of the rank's own colour behind the whole reveal. */
.mmg-draw-rays { position: absolute; inset: -70% -70% auto -70%; height: 240%; pointer-events: none; opacity: .28;
    background: conic-gradient(from 0deg, transparent 0 11deg, var(--rk) 12deg 14deg, transparent 15deg 30deg);
    animation: mmgRays 16s linear infinite; }
@keyframes mmgRays { to { transform: rotate(360deg); } }
.mmg-draw-confetti { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.mmg-draw-confetti span { position: absolute; top: -14px; width: 6px; height: 10px; border-radius: 2px; opacity: 0;
    animation: mmgFall 1.6s ease-in forwards; }
@keyframes mmgFall { 0% { opacity: 0; transform: translateY(-12px) rotate(0deg); }
    12% { opacity: 1; } 100% { opacity: 0; transform: translateY(340px) rotate(540deg); } }
/* The rank STAMPS in rather than fading — it is the verdict on how you played. */
.mmg-rank { position: relative; animation: mmgStamp .42s cubic-bezier(.2,1.6,.35,1) both; }
@keyframes mmgStamp { 0% { transform: scale(1.7); opacity: 0; filter: blur(3px); }
    60% { transform: scale(.94); opacity: 1; filter: none; } 100% { transform: none; } }
/* THE HAUL — one line, big, the thing you actually earned. */
.mmg-haul { position: relative; display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 8px; }
.mmg-haul-art { width: 66px; height: 66px; object-fit: contain; filter: drop-shadow(0 0 16px var(--ore)); }
.mmg-haul b { font-size: 1.7rem; font-weight: 900; letter-spacing: .01em; }
.mmg-earn { position: relative; display: flex; justify-content: center; gap: 16px; font-size: .92rem; color: #e7dcc8; font-weight: 800; }
.mmg-earn span { display: inline-flex; align-items: center; gap: 5px; }
.mmg-earn-ico { width: 17px; height: 17px; object-fit: contain; }
/* BURIED WITH IT — the occasional extra. One slot, so it reads as a find and not a receipt line. */
.mmg-bonus { position: relative; margin-top: 14px; padding: 12px 10px 11px; border-radius: 14px;
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    border: 1px solid var(--rar); background: color-mix(in srgb, var(--rar) 11%, rgba(0,0,0,0.3));
    box-shadow: 0 0 26px -10px var(--rar); animation: mmgBonusIn .45s cubic-bezier(.2,1.5,.35,1) .25s both; }
@keyframes mmgBonusIn { from { opacity: 0; transform: scale(.86) translateY(8px); } to { opacity: 1; transform: none; } }
.mmg-bonus-lab { font-size: 9.5px; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; color: var(--rar); }
.mmg-bonus-art { width: 46px; height: 46px; object-fit: contain; }
.mmg-bonus em { font-style: normal; font-size: 1rem; font-weight: 800; color: #f2e6e6; text-align: center; }
.mmg-draw-head, .mmg-draw-row, .mmg-draw-note, .mmg-draw .mmg-tap { position: relative; }
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
