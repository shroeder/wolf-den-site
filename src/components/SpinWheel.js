"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Per-tier wedge fills — jackpot glows gold, mini purple, rare teal, everything else alternating slate.
const TIER_FILL = { jackpot: "#5a4212", mini: "#3a1f58", rare: "#12463c" };
const NORMAL_FILL = ["#242a33", "#1a1f27"];
const TIER_TEXT = { jackpot: "#ffd75e", mini: "#c99bff", rare: "#5ce0c0", rareword: "#5ce0c0" };

// A short win chime via Web Audio (no asset, CSP-safe). Jackpot gets a longer, triumphant run.
function playWin(kind) {
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const ctx = new AC();
        if (ctx.resume) ctx.resume().catch(() => {});
        const notes = kind === "jackpot" ? [523, 659, 784, 1047, 1319, 1568]
            : kind === "mini" ? [523, 659, 784, 1047]
                : [523, 784];
        notes.forEach((freq, i) => {
            const t = ctx.currentTime + i * 0.1;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "triangle";
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.2, t + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t); osc.stop(t + 0.38);
        });
        setTimeout(() => ctx.close().catch(() => {}), notes.length * 100 + 600);
    } catch { /* audio blocked */ }
}

const SPIN_MS = 5600;

export default function SpinWheel() {
    const [st, setSt] = useState(null);
    const [rotation, setRotation] = useState(0);
    const [spinning, setSpinning] = useState(false);
    const [result, setResult] = useState(null);
    const [celebrate, setCelebrate] = useState(null); // {kind} for jackpot/mini burst
    const [msg, setMsg] = useState(null);
    const timer = useRef(null);

    async function load() {
        const r = await fetch("/api/marketplace/spin", { cache: "no-store" }).catch(() => null);
        const d = r?.ok ? await r.json().catch(() => null) : null;
        if (d) setSt(d);
    }
    useEffect(() => { load(); return () => clearTimeout(timer.current); }, []);

    const prizes = st?.wheel?.prizes || [];
    const n = prizes.length || 1;
    const seg = 360 / n;

    const gradient = useMemo(() => {
        if (!prizes.length) return "#1a1f27";
        const parts = prizes.map((p, i) => {
            const c = TIER_FILL[p.tier] || NORMAL_FILL[i % 2];
            return `${c} ${i * seg}deg ${(i + 1) * seg}deg`;
        });
        return `conic-gradient(from -${seg / 2}deg, ${parts.join(", ")})`;
    }, [prizes, seg]);

    async function spin() {
        if (spinning || !st?.canSpin) return;
        setSpinning(true); setResult(null); setMsg(null); setCelebrate(null);
        const r = await fetch("/api/marketplace/spin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "spin" }) }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        if (!d?.ok) { setSpinning(false); setMsg(d?.error === "no_spins" ? "No spins left — earn or buy one." : "Couldn't spin."); return; }
        // Land the winning wedge under the top pointer after many full turns (spins fast, eases slowly in).
        const center = d.prizeIndex * seg;
        const base = Math.ceil(rotation / 360) * 360;
        setRotation(base + 360 * 8 + (360 - center));
        timer.current = setTimeout(() => {
            setSpinning(false);
            setResult(d.prize);
            const kind = d.prize?.jackpot ? "jackpot" : d.prize?.mini ? "mini" : null;
            if (kind) { setCelebrate({ kind }); setTimeout(() => setCelebrate(null), 4200); }
            playWin(kind || "normal");
            setSt((s) => ({ ...s, tokens: d.tokens, freeAvailable: d.freeAvailable, canSpin: d.canSpin, gold: d.gold, spinCount: d.spinCount }));
        }, SPIN_MS);
    }

    async function buy() {
        if (spinning) return;
        const r = await fetch("/api/marketplace/spin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "buy" }) }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        if (d?.ok) setSt(d);
        else setMsg(d?.error === "not_enough_gold" ? "Not enough gold." : "Couldn't buy a spin.");
    }

    if (!st) return <section className="card"><p className="muted" style={{ margin: 0 }}>Loading…</p></section>;
    if (!st.signedIn) return <section className="card"><p className="muted" style={{ margin: 0 }}>Sign in to spin the daily wheel.</p></section>;

    const spinLabel = st.freeAvailable ? "🎡 FREE SPIN" : st.tokens > 0 ? `🎟️ Spin (${st.tokens} token${st.tokens > 1 ? "s" : ""})` : "No spins left";
    const resultKind = result?.jackpot ? "jackpot" : result?.mini ? "mini" : result?.rare ? "rare" : "normal";

    return (
        <section className="card spin-card">
            <div className="spin-top">
                <span>🎡 {st.wheel.name}</span>
                <span className="muted">🎟️ {st.tokens} tokens · spun {st.spinCount}×</span>
            </div>
            <p className="muted spin-lead">Spin daily for gold, XP, chests, pet treats — and a rare shot at the <strong style={{ color: "#ffd75e" }}>💎 JACKPOT</strong>.</p>

            <div className="spin-stage">
                <div className="spin-pointer">▼</div>
                <div className={`spin-wheel${spinning ? " is-spinning" : ""}`} style={{ background: gradient, transform: `rotate(${rotation}deg)`, transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.09,0.7,0.06,1)` : "none" }}>
                    {prizes.map((p, i) => (
                        <div key={i} className="spin-seg-label" style={{ transform: `rotate(${i * seg}deg)` }}>
                            <span className={`spin-seg-emoji tier-${p.tier}`} style={{ transform: `rotate(${-(i * seg)}deg)` }}>{p.emoji}</span>
                        </div>
                    ))}
                    <div className="spin-hub">🐺</div>
                </div>
            </div>

            {result ? <div className={`spin-result tier-${resultKind}`}>{resultKind === "jackpot" ? "💎 JACKPOT! " : resultKind === "mini" ? "🎰 MINI JACKPOT! " : "You won "}<strong>{result.emoji} {result.text}</strong>!</div> : null}
            {msg ? <div className="spin-msg">{msg}</div> : null}

            <div className="spin-actions">
                <button type="button" className="btn-gold spin-go" onClick={spin} disabled={spinning || !st.canSpin}>{spinning ? "Spinning…" : spinLabel}</button>
                {!st.freeAvailable ? <button type="button" className="spin-buy" onClick={buy} disabled={spinning || st.gold < st.tokenCost}>Buy spin · 🪙 {st.tokenCost}</button> : null}
            </div>

            {/* Legend — what's on the wheel + the real odds (jackpot deliberately tiny). */}
            <div className="spin-legend">
                <div className="spin-legend-head">🎁 What&apos;s on the wheel</div>
                <div className="spin-legend-grid">
                    {prizes.map((p, i) => (
                        <div key={i} className={`spin-legend-item tier-${p.tier}`}>
                            <span className="spin-legend-emoji">{p.emoji}</span>
                            <span className="spin-legend-label">{p.label}</span>
                            <span className="spin-legend-odds">{p.odds}%</span>
                        </div>
                    ))}
                </div>
            </div>

            {st.nextWheel ? <p className="muted spin-next">Reach Lv {st.nextWheel.atLevel} to unlock the {st.nextWheel.name} (bigger prizes).</p> : null}
            <p className="muted spin-hint">One free spin daily. Earn 🎟️ tokens from quests, boss kills, and 7-day streaks. Odds are shown above — the jackpot is rare on purpose.</p>

            {celebrate ? (
                <div className={`spin-celebrate spin-celebrate-${celebrate.kind}`} onClick={() => setCelebrate(null)}>
                    <div className="spin-celebrate-confetti" aria-hidden="true">
                        {Array.from({ length: celebrate.kind === "jackpot" ? 80 : 44 }).map((_, i) => (
                            <span key={i} style={{ left: `${(i * 97) % 100}%`, animationDelay: `${(i % 10) * 0.08}s`, background: ["#ffd75e", "#ff7ad0", "#5ce0c0", "#8fd8ff", "#ff9f1c"][i % 5] }} />
                        ))}
                    </div>
                    <div className="spin-celebrate-card">
                        <div className="spin-celebrate-emoji">{celebrate.kind === "jackpot" ? "💎" : "🎰"}</div>
                        <div className="spin-celebrate-title">{celebrate.kind === "jackpot" ? "JACKPOT!" : "MINI JACKPOT!"}</div>
                        {result ? <div className="spin-celebrate-sub">{result.emoji} {result.text}</div> : null}
                        <button type="button" className="btn-gold" onClick={() => setCelebrate(null)}>Collect</button>
                    </div>
                </div>
            ) : null}
        </section>
    );
}
