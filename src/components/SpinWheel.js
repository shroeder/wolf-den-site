"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import CoinCta from "@/components/CoinCta";
import useScrollLock from "@/lib/useScrollLock";

// ── THE PRIZE WHEEL — built from hand-painted game art (matching the rest of the game): a rotating ornate
// disc inside a stationary bulb-lit gold frame with a carved wolf-head pointer. Spins with a randomized,
// off-centre landing + a live ratchet tick, then reveals the prize. A "Lucky Charge" meter builds toward a
// guaranteed GOLDEN SPIN. ──

const WEDGES = 10;           // the disc art has 10 painted wedges — land on one for a tidy stop
const SPIN_MS = 5200;

// ── tiny Web-Audio kit (no assets, CSP-safe) ──
let _ac = null;
const ac = () => { if (typeof window === "undefined") return null; try { _ac = _ac || new (window.AudioContext || window.webkitAudioContext)(); if (_ac.state === "suspended") _ac.resume(); return _ac; } catch { return null; } };
function tick(v = 0.05) {
    const a = ac(); if (!a) return;
    try { const o = a.createOscillator(), g = a.createGain(); o.type = "square"; o.frequency.value = 1100; g.gain.setValueAtTime(v, a.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.03); o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.035); } catch { /* ignore */ }
}
function playWin(kind) {
    const a = ac(); if (!a) return;
    const notes = kind === "jackpot" ? [523, 659, 784, 1047, 1319, 1568] : kind === "mini" ? [523, 659, 784, 1047] : kind === "bonus" ? [660, 990] : [523, 784];
    notes.forEach((freq, i) => {
        try { const t = a.currentTime + i * 0.1; const o = a.createOscillator(), g = a.createGain(); o.type = "triangle"; o.frequency.value = freq; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.2, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.38); } catch { /* ignore */ }
    });
}

export default function SpinWheel() {
    const [st, setSt] = useState(null);
    const [rot, setRot] = useState(0);
    const [spinning, setSpinning] = useState(false);
    const [result, setResult] = useState(null);
    const [celebrate, setCelebrate] = useState(null);
    useScrollLock(Boolean(celebrate));
    const [msg, setMsg] = useState(null);
    const [lowCoins, setLowCoins] = useState(false);

    const discRef = useRef(null);
    const rafRef = useRef(0);
    const timerRef = useRef(null);
    const chainRef = useRef(0);
    const runSpinRef = useRef(null);

    const load = useCallback(async () => {
        const r = await fetch("/api/marketplace/spin", { cache: "no-store" }).catch(() => null);
        const d = r?.ok ? await r.json().catch(() => null) : null;
        if (d) setSt(d);
    }, []);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount (setState is post-await, not sync)
    useEffect(() => { load(); return () => { clearTimeout(timerRef.current); cancelAnimationFrame(rafRef.current); }; }, [load]);

    // Live ratchet: read the disc's actual rotation each frame while spinning, tick as wedges pass the pointer.
    const startTickLoop = useCallback(() => {
        let lastWedge = null, lastTick = 0;
        const step = (ts) => {
            const el = discRef.current;
            if (el) {
                let ang = 0;
                try { const m = new DOMMatrixReadOnly(getComputedStyle(el).transform); ang = Math.atan2(m.b, m.a); } catch { /* ignore */ }
                const w = Math.round((ang / (Math.PI * 2)) * WEDGES);
                if (w !== lastWedge) { if (ts - lastTick > 26) { tick(); lastTick = ts; } lastWedge = w; }
            }
            rafRef.current = requestAnimationFrame(step);
        };
        rafRef.current = requestAnimationFrame(step);
    }, []);

    const runSpin = useCallback(async () => {
        setSpinning(true); setResult(null); setMsg(null); setCelebrate(null);
        tick(0.04);
        const r = await fetch("/api/marketplace/spin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "spin" }) }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        if (!d?.ok) { setSpinning(false); chainRef.current = 0; setMsg(d?.error === "no_spins" ? "No spins left — earn or buy one." : "Couldn't spin."); return; }
        // Land on a random wedge, off-centre, after 5–8 turns — never the same spin twice.
        const wedge = Math.floor(Math.random() * WEDGES);
        const jitter = (Math.random() - 0.5) * (360 / WEDGES) * 0.6;
        const turns = 5 + Math.floor(Math.random() * 4);
        setRot((prev) => Math.ceil(prev / 360) * 360 + turns * 360 + wedge * (360 / WEDGES) + jitter);
        cancelAnimationFrame(rafRef.current); startTickLoop();
        timerRef.current = setTimeout(() => {
            cancelAnimationFrame(rafRef.current);
            setSpinning(false);
            setResult(d.prize);
            setSt((s) => ({ ...s, tokens: d.tokens, freeAvailable: d.freeAvailable, canSpin: d.canSpin, gold: d.gold, spinCount: d.spinCount, charge: d.charge, chargeMax: d.chargeMax, golden: d.golden }));
            const kind = d.prize?.jackpot ? "jackpot" : d.prize?.mini ? "mini" : d.prize?.respin ? "bonus" : null;
            if (kind === "jackpot" || kind === "mini") { setCelebrate({ kind }); setTimeout(() => setCelebrate(null), 4200); }
            playWin(kind || (d.prize?.rare ? "rare" : "normal"));
            if (typeof window !== "undefined") window.dispatchEvent(new Event("wolfden-hud-refresh"));
            if (d.prize?.respin && chainRef.current < 6) { chainRef.current += 1; setTimeout(() => runSpinRef.current?.(), 1400); }
            else chainRef.current = 0;
        }, SPIN_MS);
    }, [startTickLoop]);
    useEffect(() => { runSpinRef.current = runSpin; }, [runSpin]);

    const spin = useCallback(async () => {
        if (spinning) return;
        if (!st?.canSpin) {
            const rs = await fetch("/api/marketplace/spin", { cache: "no-store" }).catch(() => null);
            const ds = rs?.ok ? await rs.json().catch(() => null) : null;
            if (ds) setSt(ds);
            if (!ds?.canSpin) { setMsg("No spins right now — your free spin resets daily; earn or buy a token."); return; }
        }
        chainRef.current = 0; runSpin();
    }, [spinning, st, runSpin]);

    const buy = useCallback(async () => {
        if (spinning) return;
        const r = await fetch("/api/marketplace/spin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "buy" }) }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        if (d?.ok) { setSt(d); setLowCoins(false); if (typeof window !== "undefined") window.dispatchEvent(new Event("wolfden-hud-refresh")); }
        else { setMsg(d?.error === "not_enough_gold" ? "Not enough coins for a spin." : "Couldn't buy a spin."); setLowCoins(d?.error === "not_enough_gold"); }
    }, [spinning]);

    if (!st) return <section className="card"><p className="muted" style={{ margin: 0 }}>Loading…</p></section>;
    if (!st.signedIn) return <section className="card"><p className="muted" style={{ margin: 0 }}>Sign in to spin the daily wheel.</p></section>;

    const prizes = st?.wheel?.prizes || [];
    const chargePct = st.chargeMax ? Math.round((st.charge / st.chargeMax) * 100) : 0;
    const resultKind = result?.jackpot ? "jackpot" : result?.mini ? "mini" : result?.respin ? "bonus" : result?.rare ? "rare" : "normal";
    const spinLabel = spinning ? "Spinning…" : st.golden ? "★ GOLDEN SPIN ★" : st.freeAvailable ? "FREE SPIN" : st.tokens > 0 ? `Spin · 🎟️ ${st.tokens}` : "No spins left";

    return (
        <section className="card cw-card">
            <div className="cw-top">
                <span className="cw-title">🎡 {st.wheel.name}</span>
                <span className="cw-sub">🎟️ {st.tokens} · spun {st.spinCount}×</span>
            </div>

            <div className={`cw-stage${st.golden ? " is-golden" : ""}${spinning ? " is-spinning" : ""}`}>
                <div className="cw-ring">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        ref={discRef}
                        className="cw-disc"
                        src="/images/spin/wheel-disc.png"
                        alt=""
                        draggable="false"
                        style={{ transform: `translate(-50%, -50%) rotate(${rot}deg)`, transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.08,0.72,0.04,1)` : "none" }}
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="cw-frame" src="/images/spin/wheel-frame.png" alt="" draggable="false" />
                </div>
            </div>

            <div className={`cw-charge${st.golden ? " is-full" : ""}`}>
                <span className="cw-charge-lab">{st.golden ? "★ GOLDEN SPIN READY — guaranteed rare+" : "Lucky Charge"}</span>
                <span className="cw-charge-bar"><span style={{ width: `${st.golden ? 100 : chargePct}%` }} /></span>
                {!st.golden ? <span className="cw-charge-n">{st.charge}/{st.chargeMax}</span> : null}
            </div>

            {result ? (
                <div className={`cw-result tier-${resultKind}`}>
                    <span className="cw-result-kicker">{resultKind === "jackpot" ? "💎 JACKPOT!" : resultKind === "mini" ? "🎰 MINI JACKPOT!" : resultKind === "bonus" ? "🎡 BONUS SPIN!" : resultKind === "rare" ? "✨ Rare!" : "You won"}</span>
                    <span className="cw-result-prize">{result.emoji} {result.text}</span>
                </div>
            ) : null}
            {msg ? <div className="cw-msg">{msg}{lowCoins ? <span style={{ marginLeft: 8 }}><CoinCta label="Get coins" /></span> : null}</div> : null}

            <div className="cw-actions">
                <button type="button" className={`cw-go${st.golden ? " is-golden" : ""}`} onClick={spin} disabled={spinning || !st.canSpin} style={{ opacity: spinning || !st.canSpin ? 0.6 : 1 }}>{spinLabel}</button>
                {!st.freeAvailable ? <button type="button" className="cw-buy" onClick={buy} disabled={spinning || st.gold < st.tokenCost}>Buy spin · 🪙 {st.tokenCost}</button> : null}
            </div>

            <details className="cw-legend">
                <summary>🎁 What&apos;s on the wheel <span>{prizes.length} prizes</span></summary>
                <div className="cw-legend-grid">
                    {prizes.map((p, i) => (
                        <div key={i} className={`cw-leg tier-${p.tier}`}>
                            <span className="cw-leg-emoji">{p.emoji}</span>
                            <span className="cw-leg-label">{p.label}</span>
                            <span className="cw-leg-odds">{p.odds}%</span>
                        </div>
                    ))}
                </div>
            </details>

            <p className="cw-hint">One free spin daily. Earn 🎟️ tokens from quests, boss kills &amp; streaks. Every spin builds your Lucky Charge toward a Golden Spin.</p>

            {celebrate ? (
                <div className={`cw-celebrate cw-celebrate-${celebrate.kind}`} onClick={() => setCelebrate(null)}>
                    <div className="cw-confetti" aria-hidden="true">
                        {Array.from({ length: celebrate.kind === "jackpot" ? 90 : 50 }).map((_, i) => (
                            <span key={i} style={{ left: `${(i * 97) % 100}%`, animationDelay: `${(i % 12) * 0.07}s`, background: ["#ffd75e", "#ff7ad0", "#5ce0c0", "#8fd8ff", "#ff9f1c"][i % 5] }} />
                        ))}
                    </div>
                    <div className="cw-celebrate-card">
                        <div className="cw-celebrate-emoji">{celebrate.kind === "jackpot" ? "💎" : "🎰"}</div>
                        <div className="cw-celebrate-title">{celebrate.kind === "jackpot" ? "JACKPOT!" : "MINI JACKPOT!"}</div>
                        {result ? <div className="cw-celebrate-sub">{result.emoji} {result.text}</div> : null}
                        <button type="button" className="cw-collect" onClick={() => setCelebrate(null)}>Collect</button>
                    </div>
                </div>
            ) : null}

            <style>{CW_CSS}</style>
        </section>
    );
}

const CW_CSS = `
.cw-card { position: relative; overflow: hidden; }
.cw-top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.cw-title { font-weight: 900; font-size: 1.05rem; }
.cw-sub { font-size: 11.5px; color: #9aa2ab; font-weight: 700; }

.cw-stage { position: relative; display: grid; place-items: center; margin: 12px auto 6px; width: 100%; max-width: 360px; aspect-ratio: 1; }
.cw-stage::before { content: ""; position: absolute; inset: 6%; border-radius: 50%; background: radial-gradient(circle, rgba(255,190,70,0.14), transparent 68%); filter: blur(6px); transition: opacity .4s; }
.cw-stage.is-golden::before { background: radial-gradient(circle, rgba(255,205,80,0.32), transparent 70%); animation: cwHalo 1.6s ease-in-out infinite; }
@keyframes cwHalo { 0%,100% { opacity: 0.7; } 50% { opacity: 1; } }
.cw-ring { position: relative; width: 100%; height: 100%; }
.cw-disc { position: absolute; top: 50%; left: 50%; width: 68%; height: 68%; transform-origin: center; border-radius: 50%; will-change: transform;
    box-shadow: 0 8px 26px rgba(0,0,0,0.55); }
.cw-frame { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; filter: drop-shadow(0 6px 16px rgba(0,0,0,0.45)); }
.cw-stage.is-golden .cw-frame { filter: drop-shadow(0 0 16px rgba(255,200,80,0.7)); }
.cw-stage.is-spinning .cw-frame { animation: cwFrameBuzz 0.14s steps(2) infinite; }
@keyframes cwFrameBuzz { 0% { transform: translate(0,0); } 50% { transform: translate(0,-0.6px); } }

.cw-charge { display: flex; align-items: center; gap: 8px; margin: 2px 2px; }
.cw-charge-lab { font-size: 10.5px; font-weight: 800; color: #9aa2ab; white-space: nowrap; }
.cw-charge.is-full .cw-charge-lab { color: #ffd75e; }
.cw-charge-bar { flex: 1; height: 7px; border-radius: 999px; background: rgba(255,255,255,0.1); overflow: hidden; }
.cw-charge-bar > span { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, #6b8cff, #8fd8ff); transition: width .5s ease; }
.cw-charge.is-full .cw-charge-bar > span { background: linear-gradient(90deg, #ffb020, #ffe08a); box-shadow: 0 0 10px #ffce5a; }
.cw-charge-n { font-size: 10.5px; font-weight: 800; color: #b6bcc4; font-variant-numeric: tabular-nums; }

.cw-result { margin: 10px 0 0; display: flex; flex-direction: column; align-items: center; gap: 2px; text-align: center; padding: 10px 12px; border-radius: 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); animation: cwPop .35s cubic-bezier(.2,1.4,.35,1) both; }
.cw-result-kicker { font-size: 11px; font-weight: 900; letter-spacing: 0.05em; text-transform: uppercase; color: #9aa2ab; }
.cw-result-prize { font-size: 1.1rem; font-weight: 900; color: #fff; }
.cw-result.tier-rare { border-color: rgba(92,224,192,0.5); } .cw-result.tier-rare .cw-result-kicker { color: #8bf5d6; }
.cw-result.tier-bonus { border-color: rgba(255,140,240,0.5); } .cw-result.tier-bonus .cw-result-kicker { color: #ffb6f2; }
.cw-result.tier-mini { border-color: rgba(200,150,255,0.6); } .cw-result.tier-mini .cw-result-kicker { color: #d3aaff; }
.cw-result.tier-jackpot { border-color: rgba(255,215,94,0.7); background: rgba(255,215,94,0.08); } .cw-result.tier-jackpot .cw-result-kicker { color: #ffe28a; }
.cw-msg { margin: 10px 0 0; text-align: center; font-size: 0.85rem; color: #ffd1a1; }

.cw-actions { display: flex; gap: 10px; margin: 12px 0 0; }
.cw-go { flex: 1; padding: 13px; border-radius: 13px; border: none; cursor: pointer; font-weight: 900; font-size: 1rem; letter-spacing: 0.03em; color: #201206; background: linear-gradient(180deg, #ffe08a, #ffb020); box-shadow: 0 3px 0 #b47a12, 0 8px 20px -6px rgba(255,176,32,0.6); }
.cw-go:active { transform: translateY(2px); box-shadow: 0 1px 0 #b47a12; }
.cw-go.is-golden { background: linear-gradient(180deg, #fff0b0, #ffca3a); box-shadow: 0 3px 0 #b47a12, 0 0 24px rgba(255,206,90,0.8); animation: cwPulse 1.3s ease-in-out infinite; }
@keyframes cwPulse { 0%,100% { box-shadow: 0 3px 0 #b47a12, 0 0 18px rgba(255,206,90,0.6); } 50% { box-shadow: 0 3px 0 #b47a12, 0 0 30px rgba(255,206,90,0.95); } }
.cw-buy { flex: none; padding: 13px 16px; border-radius: 13px; border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.05); color: #e6ebf2; font-weight: 800; font-size: 0.9rem; cursor: pointer; }
.cw-buy:disabled { opacity: 0.5; cursor: default; }

.cw-legend { margin: 14px 0 0; }
.cw-legend > summary { cursor: pointer; font-weight: 800; font-size: 0.9rem; list-style: none; display: flex; align-items: center; gap: 8px; }
.cw-legend > summary::-webkit-details-marker { display: none; }
.cw-legend > summary span { font-size: 11px; color: #9aa2ab; font-weight: 700; padding: 1px 7px; border-radius: 999px; background: rgba(255,255,255,0.06); }
.cw-legend > summary::after { content: "▸"; margin-left: auto; color: #9aa2ab; transition: transform .18s; }
.cw-legend[open] > summary::after { transform: rotate(90deg); }
.cw-legend-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; margin-top: 10px; }
.cw-leg { display: flex; align-items: center; gap: 7px; padding: 6px 9px; border-radius: 9px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); font-size: 12px; }
.cw-leg-emoji { font-size: 14px; }
.cw-leg-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cw-leg-odds { font-size: 10.5px; color: #9aa2ab; font-weight: 700; font-variant-numeric: tabular-nums; }
.cw-leg.tier-rare { border-color: rgba(92,224,192,0.35); }
.cw-leg.tier-bonus { border-color: rgba(255,140,240,0.35); }
.cw-leg.tier-mini { border-color: rgba(200,150,255,0.4); }
.cw-leg.tier-jackpot { border-color: rgba(255,215,94,0.5); background: rgba(255,215,94,0.06); }
.cw-hint { margin: 12px 0 0; font-size: 11px; color: #8a9099; text-align: center; line-height: 1.5; }

.cw-celebrate { position: fixed; inset: 0; z-index: 300; display: grid; place-items: center; background: rgba(6,4,10,0.72); backdrop-filter: blur(3px); }
.cw-confetti { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.cw-confetti span { position: absolute; top: -12px; width: 9px; height: 14px; border-radius: 2px; animation: cwFall 3.4s linear infinite; }
@keyframes cwFall { 0% { transform: translateY(-20px) rotate(0); opacity: 1; } 100% { transform: translateY(102vh) rotate(720deg); opacity: 0.9; } }
.cw-celebrate-card { position: relative; text-align: center; padding: 26px 34px; border-radius: 20px; background: linear-gradient(180deg, #241a06, #120c03); border: 1px solid rgba(255,215,94,0.55); box-shadow: 0 24px 70px rgba(0,0,0,0.7), 0 0 50px rgba(255,190,60,0.4); animation: cwPop .4s cubic-bezier(.2,1.4,.35,1) both; }
.cw-celebrate-emoji { font-size: 58px; animation: cwSpin .7s ease both; }
.cw-celebrate-title { font-size: 1.6rem; font-weight: 900; color: #ffe28a; text-shadow: 0 2px 12px rgba(255,180,40,0.6); letter-spacing: 0.04em; }
.cw-celebrate-sub { font-size: 1rem; color: #ecd6bc; margin-top: 4px; }
.cw-collect { margin-top: 16px; padding: 10px 26px; border-radius: 12px; border: none; cursor: pointer; font-weight: 900; color: #201206; background: linear-gradient(180deg, #ffe08a, #ffb020); box-shadow: 0 3px 0 #b47a12; }
@keyframes cwPop { from { opacity: 0; transform: scale(.85) translateY(12px); } to { opacity: 1; transform: scale(1) translateY(0); } }
@keyframes cwSpin { from { transform: rotate(-30deg) scale(.6); } to { transform: rotate(0) scale(1); } }
`;
