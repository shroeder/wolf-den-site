"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import CoinCta from "@/components/CoinCta";
import useScrollLock from "@/lib/useScrollLock";

// ── THE PRIZE WHEEL — a canvas-drawn casino wheel: textured jewel wedges, a metallic gold rim studded with
// chasing marquee bulbs, a chrome hub, peg-tick ratchet audio, a physics spin that lands off-centre (never the
// same twice) with a settle wobble, and a "Lucky Charge" meter that builds to a guaranteed GOLDEN SPIN. ──

const TIER = {
    normalA: { base: "#2b3350", edge: "#131a2e", text: "#e4ebfb" },
    normalB: { base: "#26314c", edge: "#0f1528", text: "#e4ebfb" },
    rare: { base: "#0f6b56", edge: "#073329", text: "#8bf5d6" },
    bonus: { base: "#7a2b8e", edge: "#340f42", text: "#ffb6f2" },
    mini: { base: "#5a2fa0", edge: "#22103f", text: "#d3aaff" },
    jackpot: { base: "#9a6f12", edge: "#3a2606", text: "#ffe28a" },
};
const paletteFor = (p, i) => (p.tier && TIER[p.tier]) || (i % 2 ? TIER.normalB : TIER.normalA);

// Short wedge caption from the full label (the legend carries the detail).
function shortLabel(p) {
    const l = p.label || "";
    if (p.tier === "jackpot") return "JACKPOT";
    if (p.tier === "mini") return "MINI";
    if (p.kind === "respin" || /BONUS SPIN/i.test(l)) return "SPIN!";
    const num = l.match(/[\d,]+/);
    if (/gold/i.test(l) && num) return num[0];
    if (/XP/.test(l) && num) return `${num[0]} XP`;
    if (num) return `${num[0]}`;
    return l.split(" ")[0].slice(0, 8);
}

// ── tiny Web-Audio kit (no assets, CSP-safe) ──
let _ac = null;
const ac = () => { if (typeof window === "undefined") return null; try { _ac = _ac || new (window.AudioContext || window.webkitAudioContext)(); if (_ac.state === "suspended") _ac.resume(); return _ac; } catch { return null; } };
function tick(v = 0.05) {
    const a = ac(); if (!a) return;
    try { const o = a.createOscillator(), g = a.createGain(); o.type = "square"; o.frequency.value = 1200; g.gain.setValueAtTime(v, a.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.03); o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.035); } catch { /* ignore */ }
}
function playWin(kind) {
    const a = ac(); if (!a) return;
    const notes = kind === "jackpot" ? [523, 659, 784, 1047, 1319, 1568] : kind === "mini" ? [523, 659, 784, 1047] : kind === "bonus" ? [660, 990] : [523, 784];
    notes.forEach((freq, i) => {
        try { const t = a.currentTime + i * 0.1; const o = a.createOscillator(), g = a.createGain(); o.type = "triangle"; o.frequency.value = freq; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.2, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.38); } catch { /* ignore */ }
    });
}

const TAU = Math.PI * 2;
const easeOutQuart = (t) => 1 - (1 - t) ** 4;

export default function SpinWheel() {
    const [st, setSt] = useState(null);
    const [spinning, setSpinning] = useState(false);
    const [result, setResult] = useState(null);
    const [celebrate, setCelebrate] = useState(null);
    useScrollLock(Boolean(celebrate));
    const [msg, setMsg] = useState(null);
    const [lowCoins, setLowCoins] = useState(false);

    const wrapRef = useRef(null);
    const canvasRef = useRef(null);
    const sizeRef = useRef(300);
    const angleRef = useRef(0);            // current wheel rotation (radians)
    const spinRef = useRef(null);          // active spin animation descriptor
    const winnerRef = useRef(null);        // winning wedge index (for the winner glow)
    const goldenRef = useRef(false);       // charged wheel styling
    const prizesRef = useRef([]);
    const rafRef = useRef(0);
    const chainRef = useRef(0);            // guard against runaway bonus-spin chains
    const runSpinRef = useRef(null);       // lets runSpin re-invoke itself for the bonus-spin chain

    const load = useCallback(async () => {
        const r = await fetch("/api/marketplace/spin", { cache: "no-store" }).catch(() => null);
        const d = r?.ok ? await r.json().catch(() => null) : null;
        if (d) { setSt(d); prizesRef.current = d?.wheel?.prizes || []; goldenRef.current = Boolean(d?.golden); }
    }, []);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount (setState is post-await, not sync)
    useEffect(() => { load(); }, [load]);

    // ── the render loop (drives bulbs + the spin). Gated on sign-in because the <canvas> only mounts once
    // `st` loads (before that we render a "Loading…" placeholder), so this must (re)run when it appears. ──
    const ready = Boolean(st?.signedIn);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return undefined;
        const ctx = canvas.getContext("2d");
        let lastWedge = null;
        let lastTick = 0;

        const resize = () => {
            const w = wrapRef.current?.clientWidth || 300;
            const size = Math.max(220, Math.min(380, w));
            sizeRef.current = size;
            const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
            canvas.width = size * dpr; canvas.height = size * dpr;
            canvas.style.width = `${size}px`; canvas.style.height = `${size}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        resize();
        const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
        if (ro && wrapRef.current) ro.observe(wrapRef.current);

        const draw = (ts) => {
            const size = sizeRef.current;
            const prizes = prizesRef.current;
            const n = prizes.length || 1;
            const seg = TAU / n;
            const cx = size / 2, cy = size / 2;
            const Rwheel = size * 0.412, Rrim = size * 0.44, Rbulb = size * 0.468, Rhub = size * 0.125;

            // advance an active spin
            const sp = spinRef.current;
            if (sp) {
                if (sp.phase === "spin") {
                    const p = Math.min(1, (ts - sp.start) / sp.dur);
                    angleRef.current = sp.from + (sp.to - sp.from) * easeOutQuart(p);
                    if (p >= 1) { spinRef.current = { phase: "wobble", start: ts, dur: 480, base: sp.to, amp: seg * 0.14 }; }
                } else if (sp.phase === "wobble") {
                    const p = Math.min(1, (ts - sp.start) / sp.dur);
                    angleRef.current = sp.base + Math.sin(p * Math.PI * 2) * sp.amp * (1 - p);
                    if (p >= 1) { angleRef.current = sp.base; spinRef.current = null; sp.done?.(); }
                }
                // ratchet tick as wedges pass the pointer
                const idxUnder = ((Math.round(-angleRef.current / seg) % n) + n) % n;
                if (idxUnder !== lastWedge) { if (ts - lastTick > 28 && sp.phase === "spin") { tick(); lastTick = ts; } lastWedge = idxUnder; }
            }

            ctx.clearRect(0, 0, size, size);
            const golden = goldenRef.current;

            // ambient backglow
            const bg = ctx.createRadialGradient(cx, cy, Rhub, cx, cy, Rbulb + 10);
            bg.addColorStop(0, golden ? "rgba(255,200,80,0.10)" : "rgba(120,150,255,0.05)");
            bg.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(cx, cy, Rbulb + 12, 0, TAU); ctx.fill();

            // ── wheel layer (rotates) ──
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(angleRef.current);
            for (let i = 0; i < n; i += 1) {
                const p = prizes[i];
                const pal = paletteFor(p, i);
                const a0 = -Math.PI / 2 - seg / 2 + i * seg;
                const a1 = a0 + seg;
                const grad = ctx.createRadialGradient(0, 0, Rhub * 0.7, 0, 0, Rwheel);
                grad.addColorStop(0, pal.edge);
                grad.addColorStop(1, pal.base);
                ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, Rwheel, a0, a1); ctx.closePath();
                ctx.fillStyle = grad; ctx.fill();
                // winner glow
                if (winnerRef.current === i) { ctx.save(); ctx.fillStyle = "rgba(255,225,140,0.28)"; ctx.fill(); ctx.restore(); }
                // gold divider
                ctx.strokeStyle = "rgba(255,214,120,0.55)"; ctx.lineWidth = 1.5; ctx.stroke();
                // icon + short caption, radial
                const mid = a0 + seg / 2;
                ctx.save();
                ctx.rotate(mid);
                ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.font = `${Math.round(size * 0.055)}px system-ui`;
                ctx.fillText(p.emoji || "✨", Rwheel * 0.74, 0);
                ctx.fillStyle = pal.text;
                ctx.font = `800 ${Math.round(size * 0.032)}px system-ui`;
                ctx.fillText(shortLabel(p), Rwheel * 0.45, 0);
                ctx.restore();
            }
            ctx.restore();

            // ── metallic gold rim (static) ──
            const rim = ctx.createLinearGradient(cx - Rrim, cy - Rrim, cx + Rrim, cy + Rrim);
            [["#7a5410", 0], ["#ffe9a8", 0.25], ["#b5811f", 0.5], ["#ffe9a8", 0.75], ["#7a5410", 1]].forEach(([c, s]) => rim.addColorStop(s, c));
            ctx.strokeStyle = rim; ctx.lineWidth = size * 0.03; ctx.beginPath(); ctx.arc(cx, cy, Rrim, 0, TAU); ctx.stroke();

            // ── marquee bulbs (static ring, chasing) ──
            const nb = Math.min(28, Math.max(18, n * 2));
            const phase = Math.floor(ts / (spinRef.current ? 70 : 190));
            for (let b = 0; b < nb; b += 1) {
                const ang = (b / nb) * TAU - Math.PI / 2;
                const bx = cx + Math.cos(ang) * Rbulb, by = cy + Math.sin(ang) * Rbulb;
                const lit = (b + phase) % 3 === 0;
                const r = size * (lit ? 0.016 : 0.012);
                let core = golden ? "#fff6cf" : "#fff";
                let mid = golden ? "#ffcf4a" : lit ? "#ffe08a" : "#8a6a2a";
                if (golden && lit) { const hue = (b * 24 + phase * 40) % 360; mid = `hsl(${hue} 90% 60%)`; core = "#fff"; }
                const g = ctx.createRadialGradient(bx, by, 0, bx, by, r * 2.4);
                g.addColorStop(0, core); g.addColorStop(0.5, mid); g.addColorStop(1, "rgba(0,0,0,0)");
                ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by, r * 2.2, 0, TAU); ctx.fill();
            }

            // ── chrome hub (static) ──
            const hub = ctx.createRadialGradient(cx - Rhub * 0.4, cy - Rhub * 0.4, 1, cx, cy, Rhub);
            hub.addColorStop(0, "#eef3ff"); hub.addColorStop(0.5, "#9fb0c8"); hub.addColorStop(1, "#3a4560");
            ctx.fillStyle = hub; ctx.beginPath(); ctx.arc(cx, cy, Rhub, 0, TAU); ctx.fill();
            ctx.strokeStyle = rim; ctx.lineWidth = size * 0.014; ctx.stroke();
            ctx.font = `${Math.round(Rhub * 1.1)}px system-ui`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText("🐺", cx, cy + 1);

            // ── pointer (static, top) ──
            const py = cy - Rrim - size * 0.006;
            ctx.beginPath(); ctx.moveTo(cx - size * 0.035, py - size * 0.03); ctx.lineTo(cx + size * 0.035, py - size * 0.03); ctx.lineTo(cx, py + size * 0.03); ctx.closePath();
            ctx.fillStyle = "#ff4d5e"; ctx.shadowColor = "rgba(255,77,94,0.8)"; ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0;
            ctx.strokeStyle = rim; ctx.lineWidth = 2; ctx.stroke();

            rafRef.current = requestAnimationFrame(draw);
        };
        rafRef.current = requestAnimationFrame(draw);
        return () => { cancelAnimationFrame(rafRef.current); if (ro) ro.disconnect(); };
    }, [ready]);

    const doSpinRequest = useCallback(async () => {
        const r = await fetch("/api/marketplace/spin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "spin" }) }).catch(() => null);
        return r ? await r.json().catch(() => null) : null;
    }, []);

    const runSpin = useCallback(async () => {
        setSpinning(true); setResult(null); setMsg(null); setCelebrate(null); winnerRef.current = null;
        tick(0.04);
        const d = await doSpinRequest();
        if (!d?.ok) { setSpinning(false); chainRef.current = 0; setMsg(d?.error === "no_spins" ? "No spins left — earn or buy one." : "Couldn't spin."); return; }
        const n = prizesRef.current.length || 1;
        const seg = TAU / n;
        // land the winning wedge under the pointer, OFF-CENTRE by a random amount → never the same spin twice
        const offset = (Math.random() - 0.5) * seg * 0.7;
        const from = angleRef.current;
        const residueTarget = -(d.prizeIndex * seg) + offset;
        const curMod = ((from % TAU) + TAU) % TAU;
        const desMod = ((residueTarget % TAU) + TAU) % TAU;
        const turns = 5 + Math.floor(Math.random() * 4); // 5–8 full turns
        const to = from + turns * TAU + (((desMod - curMod) % TAU) + TAU) % TAU;
        const dur = 4200 + Math.random() * 1100;
        spinRef.current = {
            phase: "spin", start: performance.now(), dur, from, to,
            done: () => {
                winnerRef.current = d.prizeIndex;
                setSpinning(false);
                setResult(d.prize);
                setSt((s) => ({ ...s, tokens: d.tokens, freeAvailable: d.freeAvailable, canSpin: d.canSpin, gold: d.gold, spinCount: d.spinCount, charge: d.charge, chargeMax: d.chargeMax, golden: d.golden }));
                goldenRef.current = Boolean(d.golden);
                const kind = d.prize?.jackpot ? "jackpot" : d.prize?.mini ? "mini" : d.prize?.respin ? "bonus" : null;
                if (kind === "jackpot" || kind === "mini") { setCelebrate({ kind }); setTimeout(() => setCelebrate(null), 4200); }
                playWin(kind || (d.prize?.rare ? "rare" : "normal"));
                if (typeof window !== "undefined") window.dispatchEvent(new Event("wolfden-hud-refresh"));
                // BONUS SPIN → chain automatically (feels like a gift, not a banked token). Guarded.
                if (d.prize?.respin && chainRef.current < 6) { chainRef.current += 1; setTimeout(() => runSpinRef.current?.(), 1300); }
                else chainRef.current = 0;
            },
        };
    }, [doSpinRequest]);
    useEffect(() => { runSpinRef.current = runSpin; }, [runSpin]);

    const spin = useCallback(async () => {
        if (spinning || spinRef.current) return;
        if (!st?.canSpin) {
            const rs = await fetch("/api/marketplace/spin", { cache: "no-store" }).catch(() => null);
            const ds = rs?.ok ? await rs.json().catch(() => null) : null;
            if (ds) { setSt(ds); prizesRef.current = ds?.wheel?.prizes || []; }
            if (!ds?.canSpin) { setMsg("No spins right now — your free spin resets daily; earn or buy a token."); return; }
        }
        chainRef.current = 0;
        runSpin();
    }, [spinning, st, runSpin]);

    const buy = useCallback(async () => {
        if (spinning) return;
        const r = await fetch("/api/marketplace/spin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "buy" }) }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        if (d?.ok) { setSt(d); prizesRef.current = d?.wheel?.prizes || []; setLowCoins(false); if (typeof window !== "undefined") window.dispatchEvent(new Event("wolfden-hud-refresh")); }
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

            <div className={`cw-stage${st.golden ? " is-golden" : ""}`} ref={wrapRef}>
                <canvas ref={canvasRef} className="cw-canvas" />
            </div>

            {/* Lucky Charge meter → GOLDEN SPIN */}
            <div className={`cw-charge${st.golden ? " is-full" : ""}`}>
                <span className="cw-charge-lab">{st.golden ? "★ GOLDEN SPIN READY — guaranteed rare+" : "Lucky Charge"}</span>
                <span className="cw-charge-bar"><span style={{ width: `${st.golden ? 100 : chargePct}%` }} /></span>
                {!st.golden ? <span className="cw-charge-n">{st.charge}/{st.chargeMax}</span> : null}
            </div>

            {result ? (
                <div className={`cw-result tier-${resultKind}`}>
                    {resultKind === "jackpot" ? "💎 JACKPOT! " : resultKind === "mini" ? "🎰 MINI JACKPOT! " : resultKind === "bonus" ? "🎡 BONUS SPIN! " : "You won "}
                    <strong>{result.emoji} {result.text}</strong>{resultKind === "bonus" ? "" : "!"}
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

            <p className="cw-hint">One free spin daily. Earn 🎟️ tokens from quests, boss kills & streaks. Every spin builds your Lucky Charge toward a Golden Spin.</p>

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
.cw-stage { position: relative; display: grid; place-items: center; margin: 10px auto 4px; max-width: 380px; padding: 10px; border-radius: 20px;
    background: radial-gradient(120% 120% at 50% 0%, rgba(120,150,255,0.06), rgba(0,0,0,0.35)); }
.cw-stage.is-golden { background: radial-gradient(120% 120% at 50% 0%, rgba(255,200,80,0.16), rgba(0,0,0,0.4)); box-shadow: inset 0 0 40px rgba(255,190,70,0.15); }
.cw-canvas { display: block; touch-action: manipulation; filter: drop-shadow(0 12px 30px rgba(0,0,0,0.5)); }

.cw-charge { display: flex; align-items: center; gap: 8px; margin: 4px 2px 2px; }
.cw-charge-lab { font-size: 10.5px; font-weight: 800; color: #9aa2ab; white-space: nowrap; }
.cw-charge.is-full .cw-charge-lab { color: #ffd75e; }
.cw-charge-bar { flex: 1; height: 7px; border-radius: 999px; background: rgba(255,255,255,0.1); overflow: hidden; }
.cw-charge-bar > span { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, #6b8cff, #8fd8ff); transition: width .5s ease; }
.cw-charge.is-full .cw-charge-bar > span { background: linear-gradient(90deg, #ffb020, #ffe08a); box-shadow: 0 0 10px #ffce5a; animation: cwGlow 1.4s ease-in-out infinite; }
.cw-charge-n { font-size: 10.5px; font-weight: 800; color: #b6bcc4; font-variant-numeric: tabular-nums; }
@keyframes cwGlow { 0%,100% { opacity: 0.85; } 50% { opacity: 1; } }

.cw-result { margin: 10px 0 0; text-align: center; font-size: 0.95rem; font-weight: 700; padding: 9px 12px; border-radius: 12px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); }
.cw-result.tier-rare { border-color: rgba(92,224,192,0.5); color: #8bf5d6; }
.cw-result.tier-bonus { border-color: rgba(255,140,240,0.5); color: #ffb6f2; }
.cw-result.tier-mini { border-color: rgba(200,150,255,0.6); color: #d3aaff; }
.cw-result.tier-jackpot { border-color: rgba(255,215,94,0.7); color: #ffe28a; background: rgba(255,215,94,0.08); }
.cw-result strong { color: #fff; }
.cw-msg { margin: 10px 0 0; text-align: center; font-size: 0.85rem; color: #ffd1a1; }

.cw-actions { display: flex; gap: 10px; margin: 12px 0 0; }
.cw-go { flex: 1; padding: 13px; border-radius: 13px; border: none; cursor: pointer; font-weight: 900; font-size: 1rem; letter-spacing: 0.03em;
    color: #201206; background: linear-gradient(180deg, #ffe08a, #ffb020); box-shadow: 0 3px 0 #b47a12, 0 8px 20px -6px rgba(255,176,32,0.6); }
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
