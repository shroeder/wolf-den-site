"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// The enterable Tavern: a cozy, rowdy interior you step into from the plaza. Fireplace glow + drifting ambient
// emotes for life; the barkeep runs a little dialogue tree — rumors, the daily pint, and a press-your-luck dice
// game. Owner-gated during the Town build.
const DIE_FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
const AMBIENT = ["🍺", "🎵", "😄", "🔥", "🍻", "✨"];
const GREET = [
    "Ahh, a familiar face! Pull up a stool — what'll it be?",
    "Welcome back to the Wolf's Den! Fire's warm, ale's cold.",
    "*wipes down the bar* Evenin', friend. What can I do you for?",
];
const LORE = [
    "This old tavern's been the heart of the Den since before your time — warm fire, cold ale, good company.",
    "Every wolf in the pack passes through here eventually. Stick around, you'll see.",
    "The owner keeps it lively — raids, feasts, dice... never a dull night in the Den.",
    "Mind the bard in the corner. He's terrible, but he's ours.",
];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export default function TavernInterior({ bgUrl, onLeave }) {
    const [st, setSt] = useState(null);
    const [busy, setBusy] = useState(false);
    const [view, setView] = useState("bar");     // "bar" (dialogue) | "dice"
    const [line, setLine] = useState(GREET[0]);   // what the barkeep is currently saying
    const [roll, setRoll] = useState(null);
    const [flash, setFlash] = useState(null);
    const greeted = useRef(false);

    const load = useCallback(async () => {
        const r = await fetch("/api/marketplace/tavern", { cache: "no-store" }).catch(() => null);
        const d = r?.ok ? await r.json().catch(() => null) : null;
        if (d && d.owner !== false) setSt(d);
    }, []);
    useEffect(() => { load(); if (!greeted.current) { greeted.current = true; setLine(pick(GREET)); } }, [load]);

    const act = useCallback(async (payload) => {
        setBusy(true);
        const r = await fetch("/api/marketplace/tavern", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }).then((x) => x.json()).catch(() => null);
        setBusy(false);
        try { window.dispatchEvent(new Event("wolfden-hud-refresh")); } catch { /* ok */ }
        await load();
        return r;
    }, [load]);

    // ── Dialogue branches ──
    const askNews = useCallback(() => {
        const rumors = st?.rumors || [];
        setFlash(null);
        setLine(rumors.length ? `*leans in* Word around the Den?\n\n${rumors.join("\n")}` : "*shrugs* Quiet night so far, friend.");
    }, [st?.rumors]);
    const askLore = useCallback(() => { setFlash(null); setLine(pick(LORE)); }, []);
    const askPint = useCallback(async () => {
        setFlash(null);
        const r = await act({ action: "pint" });
        if (r?.ok) setLine("There you are — finest ale in the Den. *slides a frothing mug your way* 🍺");
        else if (r?.error === "already") setLine("Ha! You've had your fill today. Come back tomorrow, friend.");
        else setLine("*frowns* Tap's stuck. Try again in a moment.");
    }, [act]);

    // ── Dice ──
    const bet = useCallback(async (amount) => {
        setRoll(null); setFlash(null);
        const r = await act({ action: "dice_start", bet: amount });
        if (!r?.ok && r?.error) setFlash(r.error === "insufficient_gold" ? "Not enough gold." : "Couldn't place that bet.");
    }, [act]);
    const doRoll = useCallback(async () => {
        const r = await act({ action: "dice_roll" });
        if (r?.ok) {
            setRoll({ face: r.roll, bust: r.bust });
            if (r.bust) setFlash("💥 Busted! The pot's gone.");
            else if (r.forcedCashOut) setFlash(`🎉 Max streak — cashed out ${r.won?.toLocaleString()} gold!`);
        }
    }, [act]);
    const cash = useCallback(async () => {
        const r = await act({ action: "dice_cash" });
        if (r?.ok) { setRoll(null); setFlash(`💰 Cashed out ${r.won?.toLocaleString()} gold!`); }
    }, [act]);

    const dice = st?.dice;

    return (
        <div className="tv">
            <div className="tv-scene" style={bgUrl ? { backgroundImage: `url(${bgUrl})` } : undefined}>
                {!bgUrl ? <div className="tv-scene-fallback">🍺 The Tavern</div> : null}
                <div className="tv-fire" aria-hidden="true" />
                <div className="tv-vignette" aria-hidden="true" />
                {AMBIENT.map((em, i) => (
                    <span key={i} className="tv-ambient" style={{ left: `${8 + i * 15}%`, animationDelay: `${i * 1.3}s` }} aria-hidden="true">{em}</span>
                ))}
                <button type="button" className="tv-leave" onClick={onLeave}>← Leave</button>
                <div className="tv-title">🍺 The Tavern</div>
            </div>

            <section className="card tv-panel">
                {view === "dice" ? (
                    <div className="tv-diceview">
                        <button type="button" className="tv-back" onClick={() => { setView("bar"); setRoll(null); setFlash(null); }}>← Back to the bar</button>
                        <div className="tv-row-label"><strong>🎲 Dice table</strong><span className="muted">Press your luck — roll to grow the pot, but a ⚀ busts you. Cash out anytime.</span></div>
                        {flash ? <div className="tv-flash">{flash}</div> : null}
                        {!dice?.active ? (
                            <div className="tv-bets">
                                {[10, 50, 200].map((amt) => (
                                    <button key={amt} type="button" disabled={busy || (st?.gold || 0) < amt} onClick={() => bet(amt)}>Bet {amt}</button>
                                ))}
                                <span className="muted tv-gold">🪙 {(st?.gold || 0).toLocaleString()}</span>
                            </div>
                        ) : (
                            <div className="tv-play">
                                <div className="tv-pot">
                                    <span className={`tv-die${roll ? (roll.bust ? " is-bust" : " is-grow") : ""}`}>{roll?.face ? DIE_FACES[roll.face] : "🎲"}</span>
                                    <span className="tv-pot-amt">Pot: <strong>{dice.pot.toLocaleString()}</strong> 🪙 <span className="muted">· {dice.rolls} rolls</span></span>
                                </div>
                                <div className="tv-play-btns">
                                    <button type="button" className="tv-roll" disabled={busy} onClick={doRoll}>🎲 Roll</button>
                                    <button type="button" className="tv-cash" disabled={busy} onClick={cash}>💰 Cash out {dice.pot.toLocaleString()}</button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="tv-dialogue">
                        <div className="tv-keeper">
                            <span className="tv-keeper-ic" aria-hidden="true">🧔</span>
                            <div className="tv-speech">{line}</div>
                        </div>
                        {flash ? <div className="tv-flash">{flash}</div> : null}
                        <div className="tv-options">
                            <button type="button" onClick={askNews}>🗞️ What&apos;s the word tonight?</button>
                            <button type="button" disabled={busy || !st?.dailyPint?.available} onClick={askPint}>{st?.dailyPint?.available ? "🍺 Pour me a pint" : "🍺 Already had my pint today"}</button>
                            <button type="button" onClick={() => { setFlash(null); setView("dice"); }}>🎲 Fancy a game of dice?</button>
                            <button type="button" onClick={askLore}>🏰 Tell me about this place</button>
                        </div>
                    </div>
                )}
            </section>

            <style>{TV_CSS}</style>
        </div>
    );
}

const TV_CSS = `
.tv { display: flex; flex-direction: column; gap: 12px; }
.tv-scene { position: relative; width: 100%; height: min(52vh, 420px); border-radius: 18px; overflow: hidden;
    background-size: cover; background-position: center; background-color: #241206;
    box-shadow: inset 0 -40px 80px rgba(60,20,0,0.5), 0 10px 30px rgba(0,0,0,0.45); }
.tv-scene-fallback { position: absolute; inset: 0; display: grid; place-items: center; font-size: 1.4rem; color: #ffcf8a; }
.tv-fire { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(120% 90% at 22% 92%, rgba(255,140,40,0.42), transparent 55%); mix-blend-mode: screen; animation: tvFlicker 2.6s ease-in-out infinite; }
@keyframes tvFlicker { 0%,100% { opacity: .78; } 45% { opacity: 1; } 70% { opacity: .68; } }
.tv-vignette { position: absolute; inset: 0; pointer-events: none; box-shadow: inset 0 0 120px 30px rgba(20,8,0,0.6); }
.tv-ambient { position: absolute; bottom: 12%; font-size: 20px; opacity: 0; pointer-events: none; animation: tvRise 5.5s ease-in infinite; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.4)); }
@keyframes tvRise { 0% { opacity: 0; transform: translateY(0) scale(.7); } 15% { opacity: .9; } 80% { opacity: .6; } 100% { opacity: 0; transform: translateY(-160px) scale(1.1); } }
.tv-leave { position: absolute; top: 10px; left: 10px; z-index: 3; padding: 7px 13px; border-radius: 999px; border: none; cursor: pointer; font-weight: 800; font-size: 13px; color: #2a1a06; background: linear-gradient(180deg,#ffd75e,#f3b23a); box-shadow: 0 2px 8px rgba(0,0,0,0.45); }
.tv-title { position: absolute; top: 12px; right: 14px; z-index: 3; font-weight: 900; color: #ffe0b0; text-shadow: 0 2px 6px rgba(0,0,0,0.7); }
.tv-panel { display: flex; flex-direction: column; gap: 12px; }
.tv-dialogue { display: flex; flex-direction: column; gap: 12px; }
.tv-keeper { display: flex; gap: 12px; align-items: flex-start; }
.tv-keeper-ic { font-size: 40px; flex: 0 0 auto; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.4)); }
.tv-speech { position: relative; flex: 1 1 auto; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,215,110,0.25); border-radius: 12px; padding: 10px 13px; font-size: 0.92rem; color: #eadfce; line-height: 1.4; font-style: italic; white-space: pre-line; }
.tv-options { display: flex; flex-direction: column; gap: 8px; }
.tv-options button { text-align: left; padding: 11px 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #f2ead9; font-weight: 700; font-size: 0.9rem; cursor: pointer; }
.tv-options button:hover:not(:disabled) { border-color: rgba(255,215,110,0.5); }
.tv-options button:disabled { opacity: .5; cursor: default; }
.tv-flash { text-align: center; font-weight: 800; color: #ffe0b0; background: rgba(255,215,110,0.12); border: 1px solid rgba(255,215,110,0.35); border-radius: 10px; padding: 8px 12px; }
.tv-back { align-self: flex-start; background: none; border: none; color: #ffd75e; font-weight: 800; font-size: 0.85rem; cursor: pointer; padding: 0; }
.tv-row-label { display: flex; flex-direction: column; gap: 2px; }
.tv-row-label .muted { font-size: 0.78rem; }
.tv-diceview { display: flex; flex-direction: column; gap: 12px; }
.tv-bets { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.tv-bets button { padding: 9px 16px; border-radius: 10px; border: 1px solid rgba(255,215,110,0.4); background: rgba(255,215,110,0.12); color: #ffe0b0; font-weight: 800; font-size: 0.85rem; cursor: pointer; }
.tv-bets button:disabled { opacity: .45; cursor: default; }
.tv-gold { margin-left: auto; font-size: 0.85rem; }
.tv-play { display: flex; flex-direction: column; gap: 10px; }
.tv-pot { display: flex; align-items: center; gap: 12px; }
.tv-die { font-size: 40px; line-height: 1; }
.tv-die.is-grow { animation: tvPop .3s ease; color: #8fe39a; }
.tv-die.is-bust { animation: tvShake .3s ease; color: #e0433f; }
@keyframes tvPop { 0% { transform: scale(.5); } 60% { transform: scale(1.25); } 100% { transform: scale(1); } }
@keyframes tvShake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-5px) rotate(-8deg); } 75% { transform: translateX(5px) rotate(8deg); } }
.tv-pot-amt { font-size: 1rem; color: #f2ead9; }
.tv-play-btns { display: flex; gap: 10px; }
.tv-roll { flex: 1 1 auto; padding: 12px; border-radius: 12px; border: none; cursor: pointer; font-weight: 900; font-size: 15px; color: #2a1a06; background: linear-gradient(180deg,#ffe488,#f3b23a); box-shadow: 0 3px 0 #b57f22; }
.tv-roll:active { transform: translateY(2px); box-shadow: 0 1px 0 #b57f22; }
.tv-cash { flex: 1 1 auto; padding: 12px; border-radius: 12px; border: 1px solid rgba(143,227,154,0.5); cursor: pointer; font-weight: 800; font-size: 14px; color: #b8f0c2; background: rgba(143,227,154,0.12); }
.tv-roll:disabled, .tv-cash:disabled { opacity: .5; cursor: default; }
`;
