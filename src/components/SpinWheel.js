"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import CoinCta from "@/components/CoinCta";
import useScrollLock from "@/lib/useScrollLock";

// ── THE PRIZE WHEEL — hand-painted game art: a big rotating 20-wedge disc inside a slim bulb-lit gold frame
// with a wolf-head pointer. Real prize sprites on every wedge (no emoji). Feeds a shared PROGRESSIVE jackpot,
// and has two bonus rounds: a MINI WHEEL and a pick-a-box BONUS GAME that reveals wheel-exclusive gear. ──

const WEDGES = 20;
const WEDGE_DEG = 360 / WEDGES;
const WEDGE_OFFSET = 9;      // icon ring rotation start (disc is a decorative backdrop; icons form the ring)
const ICON_R = 34;          // icon-ring radius, % of the rotor from center (fits inside the frame's hole)
const SPIN_MS = 5600;

const MINI_WEDGES = 8;
const MINI_DEG = 360 / MINI_WEDGES;
const MINI_OFFSET = 22.5;
const MINI_ICON_R = 33;

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

// Position an icon at wedge i of an N-wedge ring (percent coords + radial rotation).
function iconPos(i, offset, deg, r) {
    const th = i * deg + offset;
    const rad = (th * Math.PI) / 180;
    return { left: `${50 + r * Math.sin(rad)}%`, top: `${50 - r * Math.cos(rad)}%`, transform: `translate(-50%, -50%) rotate(${th}deg)` };
}

export default function SpinWheel() {
    const [st, setSt] = useState(null);
    const [rot, setRot] = useState(0);
    const [spinning, setSpinning] = useState(false);
    const [result, setResult] = useState(null);
    const [celebrate, setCelebrate] = useState(null);
    const [mini, setMini] = useState(null);       // { prizes, index, prize } bonus mini-wheel
    const [bonus, setBonus] = useState(null);      // { reveals } pick-a-box gear game
    useScrollLock(Boolean(celebrate) || Boolean(mini) || Boolean(bonus));
    const [msg, setMsg] = useState(null);
    const [lowCoins, setLowCoins] = useState(false);

    const rotorRef = useRef(null);
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

    const startTickLoop = useCallback(() => {
        let lastWedge = null, lastTick = 0;
        const step = (ts) => {
            const el = rotorRef.current;
            if (el) {
                let ang = 0;
                try { const m = new DOMMatrixReadOnly(getComputedStyle(el).transform); ang = Math.atan2(m.b, m.a); } catch { /* ignore */ }
                const w = Math.round((ang / (Math.PI * 2)) * WEDGES);
                if (w !== lastWedge) { if (ts - lastTick > 24) { tick(); lastTick = ts; } lastWedge = w; }
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
        const idx = Math.max(0, Math.min(WEDGES - 1, d.prizeIndex));
        const jitter = (Math.random() - 0.5) * WEDGE_DEG * 0.4;
        const turns = 5 + Math.floor(Math.random() * 4);
        const targetMod = (((-(idx * WEDGE_DEG + WEDGE_OFFSET)) % 360) + 360) % 360;
        setRot((prev) => { let n = Math.ceil(prev / 360) * 360 + turns * 360 + targetMod + jitter; if (n <= prev + 360) n += 360; return n; });
        cancelAnimationFrame(rafRef.current); startTickLoop();
        timerRef.current = setTimeout(() => {
            cancelAnimationFrame(rafRef.current);
            setSpinning(false);
            setSt((s) => ({ ...s, ...d, prize: undefined, miniWheel: undefined, bonusGame: undefined }));
            if (typeof window !== "undefined") window.dispatchEvent(new Event("wolfden-hud-refresh"));
            // Route to the right outcome.
            if (d.prize?.miniWheel && d.miniWheel) { setMini({ ...d.miniWheel, rot: 0, spinning: false, revealed: false }); playWin("bonus"); return; }
            if (d.prize?.bonusGame && d.bonusGame) { setBonus({ reveals: d.bonusGame.reveals, picks: [], done: false }); playWin("bonus"); return; }
            setResult(d.prize);
            const kind = d.prize?.jackpot ? "jackpot" : d.prize?.mini ? "mini" : d.prize?.respin ? "bonus" : null;
            if (kind === "jackpot" || kind === "mini") { setCelebrate({ kind, prize: d.prize }); setTimeout(() => setCelebrate(null), 4600); }
            playWin(kind || (d.prize?.rare ? "rare" : "normal"));
            if (d.prize?.respin && chainRef.current < 6) { chainRef.current += 1; setTimeout(() => runSpinRef.current?.(), 1400); }
            else chainRef.current = 0;
        }, SPIN_MS);
    }, [startTickLoop]);
    useEffect(() => { runSpinRef.current = runSpin; }, [runSpin]);

    const spin = useCallback(async () => {
        if (spinning || mini || bonus) return;
        if (!st?.canSpin) {
            const rs = await fetch("/api/marketplace/spin", { cache: "no-store" }).catch(() => null);
            const ds = rs?.ok ? await rs.json().catch(() => null) : null;
            if (ds) setSt(ds);
            if (!ds?.canSpin) { setMsg("No spins right now — your free spin resets daily; earn or buy a token."); return; }
        }
        chainRef.current = 0; runSpin();
    }, [spinning, mini, bonus, st, runSpin]);

    const buy = useCallback(async () => {
        if (spinning) return;
        const r = await fetch("/api/marketplace/spin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "buy" }) }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        if (d?.ok) { setSt(d); setLowCoins(false); if (typeof window !== "undefined") window.dispatchEvent(new Event("wolfden-hud-refresh")); }
        else { setMsg(d?.error === "not_enough_gold" ? "Not enough coins for a spin." : "Couldn't buy a spin."); setLowCoins(d?.error === "not_enough_gold"); }
    }, [spinning]);

    const reset = useCallback(async () => {
        if (spinning) return;
        const r = await fetch("/api/marketplace/spin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reset" }) }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        if (d?.ok) { setSt(d); setMsg(null); if (typeof window !== "undefined") window.dispatchEvent(new Event("wolfden-hud-refresh")); }
    }, [spinning]);

    // ── MINI WHEEL bonus round: auto-spin to its winning index, then reveal. ──
    useEffect(() => {
        if (!mini || mini.spinning || mini.revealed) return undefined;
        const t = setTimeout(() => {
            setMini((m) => {
                if (!m) return m;
                const targetMod = (((-(m.index * MINI_DEG + MINI_OFFSET)) % 360) + 360) % 360;
                const turns = 5 + Math.floor(Math.random() * 3);
                return { ...m, spinning: true, rot: turns * 360 + targetMod };
            });
        }, 500);
        return () => clearTimeout(t);
    }, [mini]);
    const onMiniLanded = useCallback(() => {
        setMini((m) => (m ? { ...m, revealed: true } : m));
        playWin("mini");
    }, []);

    const revealBonus = useCallback((slot) => {
        setBonus((b) => {
            if (!b || b.picks.length >= 3 || b.picks.some((p) => p.slot === slot)) return b;
            const reveal = b.reveals[b.picks.length];
            tick(0.06); playWin("rare");
            const picks = [...b.picks, { slot, ...reveal }];
            return { ...b, picks, done: picks.length >= 3 };
        });
    }, []);

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

            {/* Shared progressive jackpot banner */}
            <div className="cw-jackpot">
                <span className="cw-jackpot-lab">MAJOR JACKPOT</span>
                <span className="cw-jackpot-amt">{(st.jackpotPot || 0).toLocaleString()}<small>gold</small></span>
                <span className="cw-jackpot-note">grows every spin · community pot</span>
            </div>

            <div className={`cw-stage${st.golden ? " is-golden" : ""}${spinning ? " is-spinning" : ""}`}>
                <div className="cw-ring">
                    <div ref={rotorRef} className="cw-rotor" style={{ transform: `translate(-50%, -50%) rotate(${rot}deg)`, transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.08,0.72,0.04,1)` : "none" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="cw-disc" src="/images/spin/wheel-disc.png" alt="" draggable="false" />
                        <div className="cw-icons">
                            {prizes.map((p, i) => (
                                <div key={i} className={`cw-ico tier-${p.tier}`} style={iconPos(i, WEDGE_OFFSET, WEDGE_DEG, ICON_R)}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    {p.sprite ? <img className="cw-ico-img" src={p.sprite} alt="" draggable="false" /> : null}
                                </div>
                            ))}
                        </div>
                    </div>
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
                    {result.sprite ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="cw-result-img" src={result.sprite} alt="" draggable="false" />
                    ) : null}
                    <span className="cw-result-kicker">{resultKind === "jackpot" ? "💎 JACKPOT!" : resultKind === "mini" ? "MINI JACKPOT!" : resultKind === "bonus" ? "BONUS SPIN!" : resultKind === "rare" ? "Rare!" : "You won"}</span>
                    <span className="cw-result-prize">{result.text}</span>
                </div>
            ) : null}
            {msg ? <div className="cw-msg">{msg}{lowCoins ? <span style={{ marginLeft: 8 }}><CoinCta label="Get coins" /></span> : null}</div> : null}

            <div className="cw-actions">
                <button type="button" className={`cw-go${st.golden ? " is-golden" : ""}`} onClick={spin} disabled={spinning || !st.canSpin} style={{ opacity: spinning || !st.canSpin ? 0.6 : 1 }}>{spinLabel}</button>
                {!st.freeAvailable ? <button type="button" className="cw-buy" onClick={buy} disabled={spinning || st.gold < st.tokenCost}>Buy spin · 🪙 {st.tokenCost}</button> : null}
            </div>

            {st.isOwner ? <button type="button" className="cw-reset" onClick={reset} disabled={spinning}>🛠️ Free reset (owner · debug)</button> : null}

            <details className="cw-legend">
                <summary>🎁 What&apos;s on the wheel <span>{prizes.length} prizes</span></summary>
                <div className="cw-legend-grid">
                    {prizes.map((p, i) => (
                        <div key={i} className={`cw-leg tier-${p.tier}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {p.sprite ? <img className="cw-leg-img" src={p.sprite} alt="" /> : null}
                            <span className="cw-leg-label">{p.label}</span>
                            <span className="cw-leg-odds">{p.odds}%</span>
                        </div>
                    ))}
                </div>
            </details>

            <p className="cw-hint">One free spin daily. Earn 🎟️ tokens from quests, boss kills &amp; streaks. Every spin builds your Lucky Charge toward a Golden Spin — and feeds the community jackpot.</p>

            {/* ── MINI WHEEL modal ── */}
            {mini ? (
                <div className="cw-modal">
                    <div className="cw-modal-card">
                        <div className="cw-modal-title">🎡 Mini Wheel Bonus!</div>
                        <div className="cw-mini-stage">
                            <div className="cw-mini-rotor" style={{ transform: `rotate(${mini.rot}deg)`, transition: mini.spinning ? "transform 3600ms cubic-bezier(0.08,0.72,0.05,1)" : "none" }} onTransitionEnd={mini.spinning && !mini.revealed ? onMiniLanded : undefined}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img className="cw-mini-disc" src="/images/spin/mini-wheel.png" alt="" draggable="false" />
                                <div className="cw-icons">
                                    {mini.prizes.map((p, i) => (
                                        <div key={i} className={`cw-ico tier-${p.tier}`} style={iconPos(i, MINI_OFFSET, MINI_DEG, MINI_ICON_R)}>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img className="cw-ico-img" src={p.sprite} alt="" draggable="false" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="cw-mini-pointer">▼</div>
                        </div>
                        {mini.revealed ? (
                            <>
                                <div className="cw-modal-won">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    {mini.prize?.sprite ? <img src={mini.prize.sprite} alt="" className="cw-modal-won-img" /> : null}
                                    <span>You won <b>{mini.prize?.text}</b>!</span>
                                </div>
                                <button type="button" className="cw-collect" onClick={() => setMini(null)}>Collect</button>
                            </>
                        ) : <p className="cw-modal-sub">Spinning for a bonus prize…</p>}
                    </div>
                </div>
            ) : null}

            {/* ── BONUS GAME modal (pick 3 boxes → wheel-exclusive gear) ── */}
            {bonus ? (
                <div className="cw-modal">
                    <div className="cw-modal-card">
                        <div className="cw-modal-title">🎁 Bonus Game — pick 3!</div>
                        <p className="cw-modal-sub">{bonus.done ? "Your wheel-exclusive gear:" : `Pick a box to reveal gear · ${bonus.picks.length}/3`}</p>
                        <div className="cw-boxes">
                            {Array.from({ length: 6 }).map((_, slot) => {
                                const pick = bonus.picks.find((p) => p.slot === slot);
                                return (
                                    <button key={slot} type="button" className={`cw-box${pick ? ` is-open rar-${pick.rarity}` : ""}`} disabled={Boolean(pick) || bonus.picks.length >= 3} onClick={() => revealBonus(slot)}>
                                        {pick ? (
                                            <>
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={pick.sprite} alt="" className="cw-box-img" />
                                                <span className="cw-box-name">{pick.name}</span>
                                            </>
                                        ) : (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src="/images/spin/prizes/mystery-box.png" alt="" className="cw-box-img is-closed" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                        {bonus.done ? <button type="button" className="cw-collect" onClick={() => setBonus(null)}>Collect gear</button> : null}
                    </div>
                </div>
            ) : null}

            {celebrate ? (
                <div className={`cw-celebrate cw-celebrate-${celebrate.kind}`} onClick={() => setCelebrate(null)}>
                    <div className="cw-confetti" aria-hidden="true">
                        {Array.from({ length: celebrate.kind === "jackpot" ? 100 : 54 }).map((_, i) => (
                            <span key={i} style={{ left: `${(i * 97) % 100}%`, animationDelay: `${(i % 12) * 0.07}s`, background: ["#ffd75e", "#ff7ad0", "#5ce0c0", "#8fd8ff", "#ff9f1c"][i % 5] }} />
                        ))}
                    </div>
                    <div className="cw-celebrate-card">
                        {celebrate.prize?.sprite ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img className="cw-celebrate-img" src={celebrate.prize.sprite} alt="" />
                        ) : null}
                        <div className="cw-celebrate-title">{celebrate.kind === "jackpot" ? "JACKPOT!" : "MINI JACKPOT!"}</div>
                        {result ? <div className="cw-celebrate-sub">{result.text}</div> : null}
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

.cw-jackpot { margin: 10px auto 2px; max-width: 420px; text-align: center; padding: 8px 14px; border-radius: 14px;
    background: linear-gradient(180deg, rgba(255,200,80,0.16), rgba(255,150,40,0.06)); border: 1px solid rgba(255,215,94,0.5); box-shadow: 0 0 22px -6px rgba(255,190,60,0.6); }
.cw-jackpot-lab { display: block; font-size: 10.5px; font-weight: 900; letter-spacing: 0.14em; color: #ffcf6a; }
.cw-jackpot-amt { display: block; font-size: 1.8rem; font-weight: 900; color: #ffe9a8; text-shadow: 0 2px 12px rgba(255,180,40,0.6); font-variant-numeric: tabular-nums; line-height: 1.1; }
.cw-jackpot-amt small { font-size: 0.7rem; font-weight: 800; color: #d8b46a; margin-left: 5px; letter-spacing: 0.04em; }
.cw-jackpot-note { display: block; font-size: 9.5px; color: #b79a5e; font-weight: 700; }

.cw-stage { position: relative; display: grid; place-items: center; margin: 8px auto 6px; width: 100%; max-width: 440px; aspect-ratio: 1; }
.cw-stage::before { content: ""; position: absolute; inset: 4%; border-radius: 50%; background: radial-gradient(circle, rgba(255,190,70,0.14), transparent 68%); filter: blur(8px); transition: opacity .4s; }
.cw-stage.is-golden::before { background: radial-gradient(circle, rgba(255,205,80,0.34), transparent 70%); animation: cwHalo 1.6s ease-in-out infinite; }
@keyframes cwHalo { 0%,100% { opacity: 0.7; } 50% { opacity: 1; } }
.cw-ring { position: relative; width: 100%; height: 100%; }
.cw-rotor { position: absolute; top: 50%; left: 50%; width: 82%; height: 82%; transform-origin: center; will-change: transform; }
.cw-disc { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 50%; box-shadow: 0 8px 26px rgba(0,0,0,0.55); }
.cw-icons { position: absolute; inset: 0; }
.cw-ico { position: absolute; width: 11%; height: 11%; display: grid; place-items: center; border-radius: 50%;
    background: radial-gradient(circle, rgba(8,5,2,0.62) 48%, rgba(8,5,2,0) 74%); }
.cw-ico-img { width: 116%; height: 116%; object-fit: contain; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.7)); }
.cw-ico.tier-jackpot .cw-ico-img { filter: drop-shadow(0 0 6px rgba(255,215,94,0.95)); }
.cw-ico.tier-mini .cw-ico-img { filter: drop-shadow(0 0 5px rgba(200,150,255,0.8)); }
.cw-ico.tier-bonus .cw-ico-img { filter: drop-shadow(0 0 5px rgba(255,140,240,0.7)); }
.cw-frame { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; filter: drop-shadow(0 6px 16px rgba(0,0,0,0.45)); }
.cw-stage.is-golden .cw-frame { filter: drop-shadow(0 0 16px rgba(255,200,80,0.7)); }
.cw-stage.is-spinning .cw-frame { animation: cwBuzz 0.14s steps(2) infinite; }
@keyframes cwBuzz { 0% { transform: translate(0,0); } 50% { transform: translate(0,-0.6px); } }

.cw-charge { display: flex; align-items: center; gap: 8px; margin: 2px 2px; }
.cw-charge-lab { font-size: 10.5px; font-weight: 800; color: #9aa2ab; white-space: nowrap; }
.cw-charge.is-full .cw-charge-lab { color: #ffd75e; }
.cw-charge-bar { flex: 1; height: 7px; border-radius: 999px; background: rgba(255,255,255,0.1); overflow: hidden; }
.cw-charge-bar > span { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, #6b8cff, #8fd8ff); transition: width .5s ease; }
.cw-charge.is-full .cw-charge-bar > span { background: linear-gradient(90deg, #ffb020, #ffe08a); box-shadow: 0 0 10px #ffce5a; }
.cw-charge-n { font-size: 10.5px; font-weight: 800; color: #b6bcc4; font-variant-numeric: tabular-nums; }

.cw-result { margin: 10px 0 0; display: flex; flex-direction: column; align-items: center; gap: 3px; text-align: center; padding: 10px 12px; border-radius: 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); animation: cwPop .35s cubic-bezier(.2,1.4,.35,1) both; }
.cw-result-img { width: 54px; height: 54px; object-fit: contain; filter: drop-shadow(0 3px 6px rgba(0,0,0,0.5)); }
.cw-result-kicker { font-size: 11px; font-weight: 900; letter-spacing: 0.05em; text-transform: uppercase; color: #9aa2ab; }
.cw-result-prize { font-size: 1.05rem; font-weight: 900; color: #fff; }
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
.cw-reset { width: 100%; margin-top: 8px; padding: 8px; border-radius: 10px; border: 1px dashed rgba(255,120,120,0.4); background: rgba(255,80,80,0.06); color: #ff9a9a; font-weight: 800; font-size: 0.8rem; cursor: pointer; }
.cw-reset:disabled { opacity: 0.5; cursor: default; }

.cw-legend { margin: 14px 0 0; }
.cw-legend > summary { cursor: pointer; font-weight: 800; font-size: 0.9rem; list-style: none; display: flex; align-items: center; gap: 8px; }
.cw-legend > summary::-webkit-details-marker { display: none; }
.cw-legend > summary span { font-size: 11px; color: #9aa2ab; font-weight: 700; padding: 1px 7px; border-radius: 999px; background: rgba(255,255,255,0.06); }
.cw-legend > summary::after { content: "▸"; margin-left: auto; color: #9aa2ab; transition: transform .18s; }
.cw-legend[open] > summary::after { transform: rotate(90deg); }
.cw-legend-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; margin-top: 10px; }
.cw-leg { display: flex; align-items: center; gap: 7px; padding: 5px 9px; border-radius: 9px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); font-size: 12px; }
.cw-leg-img { width: 22px; height: 22px; object-fit: contain; flex: none; }
.cw-leg-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cw-leg-odds { font-size: 10.5px; color: #9aa2ab; font-weight: 700; font-variant-numeric: tabular-nums; }
.cw-leg.tier-rare { border-color: rgba(92,224,192,0.35); }
.cw-leg.tier-bonus { border-color: rgba(255,140,240,0.35); }
.cw-leg.tier-mini { border-color: rgba(200,150,255,0.4); }
.cw-leg.tier-jackpot { border-color: rgba(255,215,94,0.5); background: rgba(255,215,94,0.06); }
.cw-hint { margin: 12px 0 0; font-size: 11px; color: #8a9099; text-align: center; line-height: 1.5; }

/* modals (mini wheel + bonus game) */
.cw-modal { position: fixed; inset: 0; z-index: 300; display: grid; place-items: center; padding: 18px; background: rgba(6,4,10,0.78); backdrop-filter: blur(4px); }
.cw-modal-card { width: 100%; max-width: 360px; text-align: center; padding: 20px; border-radius: 20px; background: linear-gradient(180deg, #241a06, #120c03); border: 1px solid rgba(255,215,94,0.5); box-shadow: 0 24px 70px rgba(0,0,0,0.7), 0 0 44px rgba(255,190,60,0.3); animation: cwPop .35s cubic-bezier(.2,1.4,.35,1) both; }
.cw-modal-title { font-size: 1.3rem; font-weight: 900; color: #ffe28a; text-shadow: 0 2px 10px rgba(255,180,40,0.5); }
.cw-modal-sub { font-size: 0.85rem; color: #d3bd98; margin: 4px 0 12px; }
.cw-mini-stage { position: relative; width: 240px; height: 240px; margin: 8px auto 4px; }
.cw-mini-rotor { position: absolute; inset: 0; transform-origin: center; }
.cw-mini-disc { width: 100%; height: 100%; border-radius: 50%; }
.cw-mini-pointer { position: absolute; top: -6px; left: 50%; transform: translateX(-50%); color: #ff4d5e; font-size: 26px; text-shadow: 0 2px 6px rgba(0,0,0,0.6); z-index: 2; }
.cw-modal-won { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 12px 0 4px; font-size: 1rem; color: #ecd6bc; }
.cw-modal-won b { color: #fff; }
.cw-modal-won-img { width: 42px; height: 42px; object-fit: contain; }
.cw-collect { margin-top: 14px; padding: 11px 28px; border-radius: 12px; border: none; cursor: pointer; font-weight: 900; color: #201206; background: linear-gradient(180deg, #ffe08a, #ffb020); box-shadow: 0 3px 0 #b47a12; }
.cw-boxes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 6px 0 4px; }
.cw-box { aspect-ratio: 1; border-radius: 14px; border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.04); cursor: pointer; display: grid; place-items: center; padding: 6px; transition: transform .15s; }
.cw-box:not(:disabled):hover { transform: translateY(-2px); border-color: rgba(255,215,94,0.6); }
.cw-box.is-open { cursor: default; border-color: rgba(176,97,255,0.7); background: rgba(176,97,255,0.1); animation: cwPop .35s cubic-bezier(.2,1.4,.35,1) both; }
.cw-box.is-open.rar-legendary { border-color: #ffb020; background: rgba(255,176,32,0.12); }
.cw-box-img { width: 74%; height: 74%; object-fit: contain; }
.cw-box-img.is-closed { opacity: 0.9; filter: drop-shadow(0 2px 5px rgba(0,0,0,0.5)); }
.cw-box-name { font-size: 9.5px; font-weight: 800; color: #e6d3ff; margin-top: 2px; line-height: 1.1; }

.cw-celebrate { position: fixed; inset: 0; z-index: 320; display: grid; place-items: center; background: rgba(6,4,10,0.72); backdrop-filter: blur(3px); }
.cw-confetti { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.cw-confetti span { position: absolute; top: -12px; width: 9px; height: 14px; border-radius: 2px; animation: cwFall 3.4s linear infinite; }
@keyframes cwFall { 0% { transform: translateY(-20px) rotate(0); opacity: 1; } 100% { transform: translateY(102vh) rotate(720deg); opacity: 0.9; } }
.cw-celebrate-card { position: relative; text-align: center; padding: 26px 34px; border-radius: 20px; background: linear-gradient(180deg, #241a06, #120c03); border: 1px solid rgba(255,215,94,0.55); box-shadow: 0 24px 70px rgba(0,0,0,0.7), 0 0 50px rgba(255,190,60,0.4); animation: cwPop .4s cubic-bezier(.2,1.4,.35,1) both; }
.cw-celebrate-img { width: 84px; height: 84px; object-fit: contain; animation: cwSpin .7s ease both; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.5)); }
.cw-celebrate-title { font-size: 1.6rem; font-weight: 900; color: #ffe28a; text-shadow: 0 2px 12px rgba(255,180,40,0.6); letter-spacing: 0.04em; }
.cw-celebrate-sub { font-size: 1rem; color: #ecd6bc; margin-top: 4px; }
@keyframes cwPop { from { opacity: 0; transform: scale(.85) translateY(12px); } to { opacity: 1; transform: scale(1) translateY(0); } }
@keyframes cwSpin { from { transform: rotate(-30deg) scale(.6); } to { transform: rotate(0) scale(1); } }
`;
