"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// The enterable Tavern: a cozy, rowdy interior you step into from the plaza. Fireplace glow + drifting ambient
// emotes for life; the barkeep runs a little dialogue tree — rumors, the daily pint, and a press-your-luck dice
// game. Owner-gated during the Town build.
// Pip positions (in a 100×100 die viewBox) for values 1-6 — drawn as clean SVG dice.
const PIP_LAYOUT = { 1: [[50, 50]], 2: [[30, 30], [70, 70]], 3: [[30, 30], [50, 50], [70, 70]], 4: [[30, 30], [70, 30], [30, 70], [70, 70]], 5: [[30, 30], [70, 30], [50, 50], [30, 70], [70, 70]], 6: [[30, 28], [70, 28], [30, 50], [70, 50], [30, 72], [70, 72]] };
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

export default function TavernInterior({ bgUrl, diceUrl, onLeave }) {
    const [st, setSt] = useState(null);
    const [busy, setBusy] = useState(false);
    const [view, setView] = useState("bar");     // "bar" (dialogue) | "dice"
    const [line, setLine] = useState(GREET[0]);   // what the barkeep is currently saying
    const [g, setG] = useState(null);            // active Wolf's Gambit hand: { bet, dice[], hold[], rerolled, hand }
    const [result, setResult] = useState(null);  // resolved hand vs the Gambler
    const [rolling, setRolling] = useState(false); // dice tumble animation flag
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
        if (r?.ok) setLine(`There you are — finest ale in the Den! *slides a frothing mug your way* 🍺\n\nThat'll warm you right up — +${r.xp} XP and +${r.gold} gold for the road.`);
        else if (r?.error === "already") setLine("Ha! You've had your fill today. Come back tomorrow, friend.");
        else setLine("*frowns* Tap's stuck. Try again in a moment.");
    }, [act]);
    const buyRoundAct = useCallback(async () => {
        setFlash(null);
        const r = await act({ action: "round" });
        if (r?.ok) setLine(`🍻 \"A ROUND FOR THE HOUSE!\" *cheers erupt across the tavern*\n\nYou stood ${r.recipients} ${r.recipients === 1 ? "patron" : "patrons"} a drink (+${r.giftXp} XP each) and earned a hero's welcome (+${r.hostXp} XP). That makes ${r.rounds} round${r.rounds === 1 ? "" : "s"} you've bought!`);
        else if (r?.error === "insufficient_gold") setLine(`*eyes your purse* A round runs ${st?.round?.cost || 400} gold, friend — come back when you're flush.`);
        else setLine("*shrugs* Can't pour that just now.");
    }, [act, st?.round?.cost]);

    // ── Wolf's Gambit dice game ──
    const ante = useCallback(async (amount) => {
        setResult(null); setFlash(null);
        const r = await act({ action: "gambit_start", bet: amount });
        if (r?.ok) { setRolling(true); setG({ bet: r.bet, dice: r.dice, hold: [false, false, false], rerolled: false, hand: r.hand }); setTimeout(() => setRolling(false), 650); }
        else setFlash(r?.error === "insufficient_gold" ? "Not enough gold, friend." : "Couldn't ante up.");
    }, [act]);
    const toggleHold = useCallback((i) => { setG((cur) => (cur && !cur.rerolled ? { ...cur, hold: cur.hold.map((h, idx) => (idx === i ? !h : h)) } : cur)); }, []);
    const reroll = useCallback(async () => {
        if (!g || g.rerolled) return;
        setRolling(true);
        const r = await act({ action: "gambit_reroll", hold: g.hold });
        setTimeout(() => setRolling(false), 650);
        if (r?.ok) setG((cur) => (cur ? { ...cur, dice: r.dice, rerolled: true, hand: r.hand } : cur));
    }, [act, g]);
    const layDown = useCallback(async () => {
        setRolling(true);
        const r = await act({ action: "gambit_resolve" });
        setTimeout(() => setRolling(false), 650);
        if (r?.ok) {
            setResult(r); setG(null);
            setFlash(r.outcome === "win" ? (r.jackpot ? `🎉 JACKPOT — won ${r.payout.toLocaleString()} gold!` : `🎉 You win ${r.payout.toLocaleString()} gold!`)
                : r.outcome === "push" ? "🤝 A push — your ante's returned." : "😤 The Gambler takes this one. Again?");
        }
    }, [act]);

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
                        <button type="button" className="tv-back" onClick={() => { setView("bar"); setG(null); setResult(null); setFlash(null); }}>← Back to the bar</button>
                        <div className="tv-gambit-head">
                            {diceUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={diceUrl} alt="" className="tv-gambit-cup" draggable={false} />
                            ) : null}
                            <div className="tv-row-label"><strong>🎲 Wolf&apos;s Gambit</strong><span className="muted">Ante up, roll three, keep the good ones &amp; reroll once — beat the Gambler to <b>double</b> your bet (<b>triple</b> on three-of-a-kind!).</span></div>
                        </div>
                        {flash ? <div className="tv-flash">{flash}</div> : null}
                        {!g && !result ? (
                            <div className="tv-bets">
                                {[50, 200, 500].map((amt) => (
                                    <button key={amt} type="button" disabled={busy || (st?.gold || 0) < amt} onClick={() => ante(amt)}>Ante {amt}</button>
                                ))}
                                <span className="muted tv-gold">🪙 {(st?.gold || 0).toLocaleString()}</span>
                            </div>
                        ) : null}
                        {g ? (
                            <div className="tv-gambit">
                                <div className="tv-hand-label">Your hand: <strong>{g.hand}</strong>{!g.rerolled ? <span className="muted"> · tap a die to KEEP it, then reroll</span> : <span className="muted"> · reroll used — lay it down!</span>}</div>
                                <div className="tv-dice-row">
                                    {g.dice.map((v, i) => <Die key={i} value={v} held={g.hold[i]} rolling={rolling && !g.hold[i]} locked={g.rerolled} onClick={() => toggleHold(i)} />)}
                                </div>
                                <div className="tv-play-btns">
                                    {!g.rerolled ? <button type="button" className="tv-roll" disabled={busy} onClick={reroll}>🎲 Reroll the rest</button> : null}
                                    <button type="button" className="tv-cash" disabled={busy} onClick={layDown}>🃏 Lay it down</button>
                                </div>
                            </div>
                        ) : null}
                        {result ? (
                            <div className="tv-result">
                                <div className="tv-vs">
                                    <div className={`tv-vs-side${result.outcome === "win" ? " is-win" : ""}`}>
                                        <div className="tv-vs-who">You</div>
                                        <div className="tv-dice-row sm">{result.player.dice.map((v, i) => <Die key={i} value={v} small />)}</div>
                                        <div className="tv-vs-hand">{result.player.hand}</div>
                                    </div>
                                    <div className="tv-vs-x">vs</div>
                                    <div className={`tv-vs-side${result.outcome === "lose" ? " is-win" : ""}`}>
                                        <div className="tv-vs-who">🧔 Gambler</div>
                                        <div className="tv-dice-row sm">{result.gambler.dice.map((v, i) => <Die key={i} value={v} small />)}</div>
                                        <div className="tv-vs-hand">{result.gambler.hand}</div>
                                    </div>
                                </div>
                                <button type="button" className="tv-roll" onClick={() => { setResult(null); setFlash(null); }}>Play again</button>
                            </div>
                        ) : null}
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
                            <button type="button" disabled={busy || !st?.dailyPint?.available} onClick={askPint}>{st?.dailyPint?.available ? `🍺 Pour me a pint (+${st?.dailyPint?.xp || 40} XP, +${st?.dailyPint?.gold || 15} 🪙)` : "🍺 Already had my pint today"}</button>
                            <button type="button" disabled={busy || (st?.gold || 0) < (st?.round?.cost || 400)} onClick={buyRoundAct}>🍻 Buy a round for the house ({(st?.round?.cost || 400).toLocaleString()} 🪙)</button>
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

// A single clean SVG die. Tap to KEEP it (before your reroll); shows a tumble animation when rolling.
function Die({ value, held = false, rolling = false, locked = false, small = false, onClick }) {
    const size = small ? 36 : 54;
    return (
        <button type="button" onClick={onClick} disabled={!onClick || locked} className={`tv-diebtn${held ? " is-held" : ""}${rolling ? " is-rolling" : ""}${!onClick ? " is-static" : ""}`} style={{ width: size, height: size }}>
            <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
                <rect x="6" y="6" width="88" height="88" rx="18" fill="#f4ecd8" stroke="#3a2a12" strokeWidth="4" />
                {(PIP_LAYOUT[value] || []).map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r="8.5" fill="#2a1a08" />)}
            </svg>
            {held ? <span className="tv-held-tag">KEEP</span> : null}
        </button>
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
.tv-gambit-head { display: flex; align-items: center; gap: 12px; }
.tv-gambit-cup { width: 52px; height: 52px; object-fit: contain; flex: 0 0 auto; filter: drop-shadow(0 3px 4px rgba(0,0,0,0.5)); }
.tv-gambit { display: flex; flex-direction: column; gap: 12px; }
.tv-hand-label { font-size: 0.92rem; color: #f2ead9; }
.tv-hand-label strong { color: #ffe0b0; }
.tv-dice-row { display: flex; gap: 12px; justify-content: center; padding: 6px 0; }
.tv-dice-row.sm { gap: 7px; padding: 2px 0; }
.tv-diebtn { position: relative; padding: 0; border: none; background: none; cursor: pointer; border-radius: 12px; transition: transform .12s ease; }
.tv-diebtn.is-static { cursor: default; }
.tv-diebtn:not(.is-static):active { transform: scale(0.92); }
.tv-diebtn.is-held { transform: translateY(-4px); }
.tv-diebtn.is-held svg rect { fill: #fff6df; stroke: #2fae72; }
.tv-diebtn.is-rolling { animation: tvTumble .5s cubic-bezier(.3,1.4,.4,1) both; }
@keyframes tvTumble { 0% { transform: translateY(-18px) rotate(-60deg) scale(.7); } 60% { transform: translateY(3px) rotate(12deg) scale(1.08); } 100% { transform: translateY(0) rotate(0) scale(1); } }
.tv-held-tag { position: absolute; bottom: -8px; left: 50%; transform: translateX(-50%); font-size: 8.5px; font-weight: 900; letter-spacing: .04em; color: #06311f; background: #43d98a; border-radius: 999px; padding: 1px 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.4); }
.tv-result { display: flex; flex-direction: column; gap: 12px; }
.tv-vs { display: flex; align-items: stretch; gap: 8px; }
.tv-vs-side { flex: 1 1 0; text-align: center; padding: 10px 6px; border-radius: 12px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); }
.tv-vs-side.is-win { border-color: rgba(67,217,138,0.6); background: rgba(67,217,138,0.1); box-shadow: 0 0 14px rgba(67,217,138,0.25); }
.tv-vs-who { font-size: 0.78rem; font-weight: 800; color: #cbb9e0; margin-bottom: 4px; }
.tv-vs-hand { font-size: 0.78rem; font-weight: 800; color: #ffe0b0; margin-top: 4px; }
.tv-vs-x { align-self: center; font-weight: 900; color: #9aa0a6; font-size: 0.8rem; }
.tv-play-btns { display: flex; gap: 10px; }
.tv-roll { flex: 1 1 auto; padding: 12px; border-radius: 12px; border: none; cursor: pointer; font-weight: 900; font-size: 15px; color: #2a1a06; background: linear-gradient(180deg,#ffe488,#f3b23a); box-shadow: 0 3px 0 #b57f22; }
.tv-roll:active { transform: translateY(2px); box-shadow: 0 1px 0 #b57f22; }
.tv-cash { flex: 1 1 auto; padding: 12px; border-radius: 12px; border: 1px solid rgba(143,227,154,0.5); cursor: pointer; font-weight: 800; font-size: 14px; color: #b8f0c2; background: rgba(143,227,154,0.12); }
.tv-roll:disabled, .tv-cash:disabled { opacity: .5; cursor: default; }
`;
