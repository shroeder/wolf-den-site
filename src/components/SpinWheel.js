"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const SEG_COLORS = ["#242a33", "#1a1f27"];

export default function SpinWheel() {
    const [st, setSt] = useState(null);
    const [rotation, setRotation] = useState(0);
    const [spinning, setSpinning] = useState(false);
    const [result, setResult] = useState(null);
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

    // Colored wedges via conic-gradient; rare segments glow gold.
    const gradient = useMemo(() => {
        if (!prizes.length) return "#1a1f27";
        const parts = prizes.map((p, i) => {
            const c = p.rare ? "#4a3a12" : SEG_COLORS[i % 2];
            return `${c} ${i * seg}deg ${(i + 1) * seg}deg`;
        });
        return `conic-gradient(${parts.join(", ")})`;
    }, [prizes, seg]);

    async function spin() {
        if (spinning || !st?.canSpin) return;
        setSpinning(true); setResult(null); setMsg(null);
        const r = await fetch("/api/marketplace/spin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "spin" }) }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        if (!d?.ok) { setSpinning(false); setMsg(d?.error === "no_spins" ? "No spins left — earn or buy one." : "Couldn't spin."); return; }
        // Land the winning segment's center under the top pointer, after several full turns.
        const center = d.prizeIndex * seg + seg / 2;
        const base = Math.ceil(rotation / 360) * 360;
        setRotation(base + 360 * 6 + (360 - center));
        timer.current = setTimeout(() => {
            setSpinning(false);
            setResult(d.prize);
            setSt((s) => ({ ...s, tokens: d.tokens, freeAvailable: d.freeAvailable, canSpin: d.canSpin, gold: d.gold, spinCount: d.spinCount }));
        }, 4200);
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

    return (
        <section className="card spin-card">
            <div className="spin-top">
                <span>🎡 {st.wheel.name}</span>
                <span className="muted">🪙 {st.gold.toLocaleString()} · 🎟️ {st.tokens} · spun {st.spinCount}×</span>
            </div>

            <div className="spin-stage">
                <div className="spin-pointer">▼</div>
                <div className="spin-wheel" style={{ background: gradient, transform: `rotate(${rotation}deg)`, transition: spinning ? "transform 4s cubic-bezier(0.17,0.67,0.2,1.0)" : "none" }}>
                    {prizes.map((p, i) => (
                        <div key={i} className="spin-seg-label" style={{ transform: `rotate(${i * seg + seg / 2}deg)` }}>
                            <span className="spin-seg-emoji" style={{ transform: `rotate(${-(i * seg + seg / 2)}deg)` }}>{p.emoji}</span>
                        </div>
                    ))}
                    <div className="spin-hub">🐺</div>
                </div>
            </div>

            {result ? <div className="spin-result">You won <strong>{result.emoji} {result.text}</strong>!</div> : null}
            {msg ? <div className="spin-msg">{msg}</div> : null}

            <div className="spin-actions">
                <button type="button" className="btn-gold spin-go" onClick={spin} disabled={spinning || !st.canSpin}>{spinning ? "Spinning…" : spinLabel}</button>
                {!st.freeAvailable ? <button type="button" className="spin-buy" onClick={buy} disabled={spinning || st.gold < st.tokenCost}>Buy spin · 🪙 {st.tokenCost}</button> : null}
            </div>
            {st.nextWheel ? <p className="muted spin-next">Reach Lv {st.nextWheel.atLevel} to unlock the {st.nextWheel.name} (better prizes).</p> : null}
            <p className="muted spin-hint">One free spin daily. Earn 🎟️ tokens from quests, boss kills, and 7-day streaks.</p>
        </section>
    );
}
