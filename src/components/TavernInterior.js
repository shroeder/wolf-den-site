"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// The enterable Tavern — a SCROLLABLE, walkable room like the plaza. Your hero walks the floor (tap to move,
// drag to look around), other members inside show up live, and you walk up to NPC characters — the BARKEEP and
// the GAMBLER — to interact. Owner-gated during the Town build.
const PIP_LAYOUT = { 1: [[50, 50]], 2: [[30, 30], [70, 70]], 3: [[30, 30], [50, 50], [70, 70]], 4: [[30, 30], [70, 30], [30, 70], [70, 70]], 5: [[30, 30], [70, 30], [50, 50], [30, 70], [70, 70]], 6: [[30, 28], [70, 28], [30, 50], [70, 50], [30, 72], [70, 72]] };
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
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const spriteFlip = (flip, facing) => ((Boolean(flip) !== (facing === -1)) ? "scaleX(-1)" : "none");

const WORLD_W = 1240;   // width of the scrollable room (px)
const FLOOR_Y = 80;     // % of scene height where characters stand
// NPCs / spots placed along the room (x = % of the world width).
const NPCS = [
    { key: "bar", art: "barkeep", emoji: "🧔", label: "Barkeep", x: 15 },
    { key: "hearth", art: null, emoji: "🔥", label: "Hearth", x: 48 },
    { key: "dice", art: "gambler", emoji: "🎲", label: "Gambler", x: 84 },
];

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

// A member standing/walking in the room (positioned by world x %).
function TavAvatar({ a, you = false }) {
    const t = spriteFlip(a.flip, a.facing);
    return (
        <div className={`tv-av${you ? " is-you" : ""}${a.moving ? " is-walking" : ""}`} style={{ left: `${a.x}%`, top: `${a.y || FLOOR_Y}%` }}>
            <span className="tv-av-name">{you ? "🐺 you" : a.name}</span>
            <div className="tv-av-sprite">
                {a.sprite ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.sprite} alt="" draggable={false} style={{ transform: t }} />
                ) : <span className="tv-av-fallback" style={{ transform: t }}>🐺</span>}
            </div>
        </div>
    );
}

export default function TavernInterior({ bgUrl, diceUrl, npcArt, me, onLeave }) {
    const [st, setSt] = useState(null);
    const [viewportW, setViewportW] = useState(360);
    const [pos, setPos] = useState({ x: 50, y: FLOOR_Y, facing: 1, moving: false });
    const [panExtra, setPanExtra] = useState(0);
    const [dragging, setDragging] = useState(false);
    const [station, setStation] = useState(null); // open panel: "bar" | "dice" | "hearth"
    const [busy, setBusy] = useState(false);
    const [line, setLine] = useState(GREET[0]);
    const [g, setG] = useState(null);
    const [result, setResult] = useState(null);
    const [rolling, setRolling] = useState(false);
    const [flash, setFlash] = useState(null);
    const sceneRef = useRef(null);
    const drag = useRef({ down: false, moved: false, startX: 0, startY: 0, lastX: 0, lastT: 0, vx: 0 });
    const momentumRef = useRef(0);
    const moveTimer = useRef(null);
    const greeted = useRef(false);

    useEffect(() => {
        const el = sceneRef.current; if (!el) return undefined;
        const set = () => setViewportW(el.clientWidth || 360);
        set(); const ro = new ResizeObserver(set); ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const load = useCallback(async () => {
        const r = await fetch("/api/marketplace/tavern", { cache: "no-store" }).catch(() => null);
        const d = r?.ok ? await r.json().catch(() => null) : null;
        if (d && d.owner !== false) setSt(d);
    }, []);
    useEffect(() => { load(); const t = setInterval(load, 2500); return () => clearInterval(t); }, [load]);
    useEffect(() => { if (!greeted.current) { greeted.current = true; setLine(pick(GREET)); } }, []);

    const postMove = useCallback((x, y, facing) => {
        fetch("/api/marketplace/tavern", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "move", x, y, facing }) }).catch(() => {});
    }, []);
    useEffect(() => { postMove(50, FLOOR_Y, 1); }, [postMove]);

    const act = useCallback(async (payload) => {
        setBusy(true);
        const r = await fetch("/api/marketplace/tavern", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }).then((x) => x.json()).catch(() => null);
        setBusy(false);
        try { window.dispatchEvent(new Event("wolfden-hud-refresh")); } catch { /* ok */ }
        await load();
        return r;
    }, [load]);

    // Camera: follow you + manual drag-pan, clamped to the room.
    const maxScroll = Math.max(0, WORLD_W - viewportW);
    const followCam = clamp((pos.x / 100) * WORLD_W - viewportW / 2, 0, maxScroll);
    const cameraPx = clamp(followCam + panExtra, 0, maxScroll);
    const camDur = clamp((pos.moveDist || 0) * 0.05, 0.4, 2.2);

    const walkToWorld = useCallback((worldXpct) => {
        const x = clamp(worldXpct, 3, 97);
        setPos((p) => ({ x, y: FLOOR_Y, facing: x < p.x ? -1 : 1, moving: true, moveDist: Math.abs(x - p.x) }));
        clearTimeout(moveTimer.current);
        moveTimer.current = setTimeout(() => { setPos((p) => ({ ...p, moving: false })); postMove(x, FLOOR_Y, x < pos.x ? -1 : 1); }, 320);
    }, [postMove, pos.x]);

    // Pointer: DRAG pans the room (with flick momentum); a TAP walks you / opens an NPC.
    const onPointerDown = useCallback((e) => {
        cancelAnimationFrame(momentumRef.current);
        drag.current = { down: true, moved: false, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastT: e.timeStamp || 0, vx: 0 };
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ok */ }
    }, []);
    const onPointerMove = useCallback((e) => {
        const d = drag.current; if (!d.down) return;
        const dx = e.clientX - d.lastX;
        if (!d.moved && Math.abs(e.clientX - d.startX) > 4 && Math.abs(e.clientX - d.startX) > Math.abs(e.clientY - d.startY) * 0.8) { d.moved = true; setDragging(true); }
        if (d.moved) {
            const t = e.timeStamp || 0; const dt = Math.max(1, t - d.lastT);
            d.vx = dx / dt; d.lastX = e.clientX; d.lastT = t;
            setPanExtra((p) => clamp(followCam + p - dx, 0, maxScroll) - followCam);
        }
    }, [followCam, maxScroll]);
    const onPointerUp = useCallback((e) => {
        const d = drag.current; d.down = false;
        if (d.moved) {
            let v = d.vx * 16;
            const glide = () => { v *= 0.94; if (Math.abs(v) < 0.4) { setDragging(false); return; } setPanExtra((p) => clamp(followCam + p - v, 0, maxScroll) - followCam); momentumRef.current = requestAnimationFrame(glide); };
            if (Math.abs(v) > 0.8) momentumRef.current = requestAnimationFrame(glide); else setDragging(false);
            return;
        }
        setDragging(false);
        if (e.target.closest(".tv-npc")) return; // NPC handles itself
        const rect = sceneRef.current?.getBoundingClientRect(); if (!rect) return;
        const worldX = ((e.clientX - rect.left + cameraPx) / WORLD_W) * 100;
        walkToWorld(worldX);
    }, [cameraPx, followCam, maxScroll, walkToWorld]);

    // ── Dialogue (barkeep + hearth) ──
    const askNews = useCallback(() => {
        const rumors = st?.rumors || [];
        setFlash(null);
        setLine(rumors.length ? `*leans in* Word around the Den?\n\n${rumors.join("\n")}` : "*shrugs* Quiet night so far, friend.");
    }, [st?.rumors]);
    const askLore = useCallback(() => { setFlash(null); setLine(pick(LORE)); }, []);
    const askPint = useCallback(async () => {
        setFlash(null);
        const r = await act({ action: "pint" });
        if (r?.ok) setLine(`There you are — finest ale in the Den! 🍺 *slides a frothing mug your way*\n\nThat perks you right up: +${r.xp} XP and +${r.gold} gold.`);
        else if (r?.error === "already") setLine("Ha! You've had your daily pint. Come back tomorrow, friend.");
        else setLine("*frowns* Tap's stuck. Try again in a moment.");
    }, [act]);
    const buyRoundAct = useCallback(async () => {
        setFlash(null);
        const r = await act({ action: "round" });
        if (r?.ok) setLine(`🍻 \"A ROUND FOR THE HOUSE!\" *cheers erupt*\n\nYou treated ${r.recipients} ${r.recipients === 1 ? "patron" : "patrons"} (+${r.giftXp} XP each) and earned a hero's welcome (+${r.hostXp} XP). ${r.rounds} rounds bought!`);
        else if (r?.error === "insufficient_gold") setLine(`*eyes your purse* A round's ${st?.round?.cost || 400} gold, friend — come back when you're flush.`);
        else setLine("*shrugs* Can't pour that just now.");
    }, [act, st?.round?.cost]);

    // ── Wolf's Gambit dice ──
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

    const openStation = useCallback((key) => { setFlash(null); if (key === "dice") { setG(null); setResult(null); } if (key === "bar" || key === "hearth") setLine(pick(key === "bar" ? GREET : LORE)); setStation(key); }, []);
    const others = st?.occupants || [];
    const here = others.length + 1;

    return (
        <div className="stack reveal">
            <div ref={sceneRef} className="tv-scene" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { drag.current.down = false; setDragging(false); }} role="presentation">
                <button type="button" className="tv-leave" onClick={onLeave}>← Leave</button>
                <div className="tv-world" style={{ width: `${WORLD_W}px`, transform: `translateX(${-cameraPx}px)`, transition: dragging ? "none" : `transform ${camDur}s linear` }}>
                    {bgUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="tv-bg" src={bgUrl} alt="" draggable={false} />
                    ) : <div className="tv-scene-fallback">🍺 The Wolf&apos;s Rest</div>}
                    <div className="tv-fire" aria-hidden="true" />
                    <div className="tv-vignette" aria-hidden="true" />
                    {/* NPCs / spots */}
                    {NPCS.map((n) => {
                        const url = n.art ? npcArt?.[n.art] : null;
                        return (
                            <button key={n.key} type="button" className="tv-npc" style={{ left: `${n.x}%`, top: `${FLOOR_Y}%` }} onClick={(e) => { e.stopPropagation(); openStation(n.key); }}>
                                <span className="tv-npc-label">{n.label}{n.key === "bar" && st?.dailyPint?.available ? " •" : ""}</span>
                                {url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img className="tv-npc-sprite" src={url} alt={n.label} draggable={false} />
                                ) : <span className="tv-npc-emoji">{n.emoji}</span>}
                            </button>
                        );
                    })}
                    {/* other members here now */}
                    {others.map((o) => <TavAvatar key={o.id} a={o} />)}
                    {/* you */}
                    <TavAvatar a={{ x: pos.x, y: pos.y, facing: pos.facing, moving: pos.moving, sprite: me?.sprite, flip: me?.flip }} you />
                </div>
                <div className="tv-hint">Tap the floor to walk · drag to look around · tap the barkeep or gambler{here > 1 ? ` · ${here} here now` : ""}</div>
            </div>

            {/* Station panel */}
            {station ? (
                <div className="tv-panel-wrap">
                    <div className="tv-panel">
                        <div className="tv-panel-head">
                            <strong>{station === "bar" ? "🍺 The Barkeep" : station === "dice" ? "🎲 The Gambler" : "🔥 The Hearth"}</strong>
                            <button type="button" onClick={() => { setStation(null); setFlash(null); }} aria-label="Close">✕</button>
                        </div>

                        {station === "bar" ? (
                            <div className="tv-dialogue">
                                <div className="tv-keeper"><span className="tv-keeper-ic" aria-hidden="true">🧔</span><div className="tv-speech">{line}</div></div>
                                {flash ? <div className="tv-flash">{flash}</div> : null}
                                <div className="tv-menu">
                                    <button type="button" className="tv-menu-item" disabled={busy || !st?.dailyPint?.available} onClick={askPint}>
                                        <span className="tv-menu-ic">🍺</span>
                                        <span className="tv-menu-body"><b>Hearty Pint</b><small>{st?.dailyPint?.available ? `Once a day — +${st?.dailyPint?.xp || 40} XP & +${st?.dailyPint?.gold || 15} gold` : "You've had yours today — back tomorrow"}</small></span>
                                    </button>
                                    <button type="button" className="tv-menu-item" disabled={busy || (st?.gold || 0) < (st?.round?.cost || 400)} onClick={buyRoundAct}>
                                        <span className="tv-menu-ic">🍻</span>
                                        <span className="tv-menu-body"><b>Round for the House · {(st?.round?.cost || 400).toLocaleString()}🪙</b><small>Everyone here gets +XP, you earn a hero&apos;s welcome + rep</small></span>
                                    </button>
                                    <button type="button" className="tv-menu-item" onClick={askNews}>
                                        <span className="tv-menu-ic">🗞️</span>
                                        <span className="tv-menu-body"><b>Ask for gossip</b><small>The latest word around the Den</small></span>
                                    </button>
                                </div>
                            </div>
                        ) : null}

                        {station === "hearth" ? (
                            <div className="tv-dialogue">
                                <div className="tv-keeper"><span className="tv-keeper-ic" aria-hidden="true">🔥</span><div className="tv-speech">{line}</div></div>
                                <div className="tv-menu">
                                    <button type="button" className="tv-menu-item" onClick={askNews}><span className="tv-menu-ic">🗞️</span><span className="tv-menu-body"><b>Rumors by the fire</b><small>What&apos;s happening in the Den</small></span></button>
                                    <button type="button" className="tv-menu-item" onClick={askLore}><span className="tv-menu-ic">🏰</span><span className="tv-menu-body"><b>Tell me about this place</b><small>Tavern lore</small></span></button>
                                </div>
                            </div>
                        ) : null}

                        {station === "dice" ? (
                            <div className="tv-diceview">
                                <div className="tv-gambit-head">
                                    {diceUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={diceUrl} alt="" className="tv-gambit-cup" draggable={false} />
                                    ) : null}
                                    <span className="muted" style={{ fontSize: "0.82rem" }}>Ante up, roll three, keep the good ones &amp; reroll once — beat the Gambler to <b>double</b> your bet (<b>triple</b> on three-of-a-kind!).</span>
                                </div>
                                {flash ? <div className="tv-flash">{flash}</div> : null}
                                {!g && !result ? (
                                    <div className="tv-bets">
                                        {[50, 200, 500].map((amt) => <button key={amt} type="button" disabled={busy || (st?.gold || 0) < amt} onClick={() => ante(amt)}>Ante {amt}</button>)}
                                        <span className="muted tv-gold">🪙 {(st?.gold || 0).toLocaleString()}</span>
                                    </div>
                                ) : null}
                                {g ? (
                                    <div className="tv-gambit">
                                        <div className="tv-hand-label">Your hand: <strong>{g.hand}</strong>{!g.rerolled ? <span className="muted"> · tap a die to KEEP it, then reroll</span> : <span className="muted"> · reroll used — lay it down!</span>}</div>
                                        <div className="tv-dice-row">{g.dice.map((v, i) => <Die key={i} value={v} held={g.hold[i]} rolling={rolling && !g.hold[i]} locked={g.rerolled} onClick={() => toggleHold(i)} />)}</div>
                                        <div className="tv-play-btns">
                                            {!g.rerolled ? <button type="button" className="tv-roll" disabled={busy} onClick={reroll}>🎲 Reroll the rest</button> : null}
                                            <button type="button" className="tv-cash" disabled={busy} onClick={layDown}>🃏 Lay it down</button>
                                        </div>
                                    </div>
                                ) : null}
                                {result ? (
                                    <div className="tv-result">
                                        <div className="tv-vs">
                                            <div className={`tv-vs-side${result.outcome === "win" ? " is-win" : ""}`}><div className="tv-vs-who">You</div><div className="tv-dice-row sm">{result.player.dice.map((v, i) => <Die key={i} value={v} small />)}</div><div className="tv-vs-hand">{result.player.hand}</div></div>
                                            <div className="tv-vs-x">vs</div>
                                            <div className={`tv-vs-side${result.outcome === "lose" ? " is-win" : ""}`}><div className="tv-vs-who">🧔 Gambler</div><div className="tv-dice-row sm">{result.gambler.dice.map((v, i) => <Die key={i} value={v} small />)}</div><div className="tv-vs-hand">{result.gambler.hand}</div></div>
                                        </div>
                                        <button type="button" className="tv-roll" onClick={() => { setResult(null); setFlash(null); }}>Play again</button>
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}

            <style>{TV_CSS}</style>
        </div>
    );
}

const TV_CSS = `
.tv-scene { position: relative; width: 100%; height: min(58vh, 460px); border-radius: 18px; overflow: hidden; cursor: grab; touch-action: pan-y;
    background: #241206; user-select: none; -webkit-user-select: none; box-shadow: inset 0 -40px 80px rgba(60,20,0,0.5), 0 10px 30px rgba(0,0,0,0.45); }
.tv-scene:active { cursor: grabbing; }
.tv-world { position: absolute; top: 0; left: 0; height: 100%; will-change: transform; }
.tv-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.tv-scene-fallback { position: absolute; inset: 0; display: grid; place-items: center; font-size: 1.4rem; color: #ffcf8a; }
.tv-fire { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(90% 80% at 48% 88%, rgba(255,140,40,0.34), transparent 60%); mix-blend-mode: screen; animation: tvFlicker 2.6s ease-in-out infinite; }
@keyframes tvFlicker { 0%,100% { opacity: .8; } 45% { opacity: 1; } 70% { opacity: .7; } }
.tv-vignette { position: absolute; inset: 0; pointer-events: none; box-shadow: inset 0 0 130px 30px rgba(20,8,0,0.55); }
.tv-leave { position: absolute; top: 10px; left: 10px; z-index: 8; padding: 7px 13px; border-radius: 999px; border: none; cursor: pointer; font-weight: 800; font-size: 13px; color: #2a1a06; background: linear-gradient(180deg,#ffd75e,#f3b23a); box-shadow: 0 2px 8px rgba(0,0,0,0.45); }
.tv-hint { position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); z-index: 8; font-size: 11px; font-weight: 700; color: #ffe0b0; background: rgba(20,10,4,0.62); border: 1px solid rgba(255,215,110,0.25); border-radius: 999px; padding: 3px 12px; white-space: nowrap; pointer-events: none; max-width: 94%; overflow: hidden; text-overflow: ellipsis; }
/* NPCs */
.tv-npc { position: absolute; transform: translate(-50%, -100%); z-index: 5; display: flex; flex-direction: column; align-items: center; gap: 2px; background: none; border: none; cursor: pointer; padding: 0; }
.tv-npc-label { font-size: 11px; font-weight: 800; color: #ffe6b3; background: rgba(20,10,4,0.8); border: 1px solid rgba(255,215,110,0.45); border-radius: 999px; padding: 2px 10px; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.5); }
.tv-npc-sprite { width: 92px; height: 92px; object-fit: contain; filter: drop-shadow(0 5px 7px rgba(0,0,0,0.6)); }
.tv-npc-emoji { font-size: 42px; filter: drop-shadow(0 3px 5px rgba(0,0,0,0.6)); }
/* Avatars */
.tv-av { position: absolute; transform: translate(-50%, -100%); z-index: 6; display: flex; flex-direction: column; align-items: center; transition: left .3s linear, top .3s linear; }
.tv-av-sprite { width: 64px; height: 64px; display: grid; place-items: center; transform-origin: 50% 100%; }
.tv-av:not(.is-walking) .tv-av-sprite { animation: tvBreathe 2.8s ease-in-out infinite; }
@keyframes tvBreathe { 0%,100% { transform: scaleY(1) scaleX(1); } 48% { transform: scaleY(0.955) scaleX(1.035); } }
.tv-av-sprite img { width: 64px; height: 64px; object-fit: contain; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.6)); }
.tv-av-fallback { font-size: 46px; }
.tv-av-name { font-size: 10px; font-weight: 800; color: #f2ead9; background: rgba(30,18,50,0.85); border-radius: 999px; padding: 1px 8px; margin-bottom: 2px; white-space: nowrap; }
/* Station panel */
.tv-panel-wrap { margin-top: 12px; }
.tv-panel { border-radius: 16px; background: var(--card-bg,#17181c); border: 1px solid rgba(255,215,110,0.3); box-shadow: 0 10px 30px rgba(0,0,0,0.4); padding: 14px; }
.tv-panel-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.tv-panel-head strong { font-size: 1rem; color: #ffe0b0; flex: 1; }
.tv-panel-head button { background: none; border: none; color: inherit; font-size: 18px; cursor: pointer; opacity: 0.7; }
.tv-dialogue { display: flex; flex-direction: column; gap: 12px; }
.tv-keeper { display: flex; gap: 12px; align-items: flex-start; }
.tv-keeper-ic { font-size: 40px; flex: 0 0 auto; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.4)); }
.tv-speech { position: relative; flex: 1 1 auto; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,215,110,0.25); border-radius: 12px; padding: 10px 13px; font-size: 0.92rem; color: #eadfce; line-height: 1.4; font-style: italic; white-space: pre-line; }
.tv-flash { text-align: center; font-weight: 800; color: #ffe0b0; background: rgba(255,215,110,0.12); border: 1px solid rgba(255,215,110,0.35); border-radius: 10px; padding: 8px 12px; }
.tv-menu { display: flex; flex-direction: column; gap: 8px; }
.tv-menu-item { display: flex; align-items: center; gap: 11px; text-align: left; padding: 11px 13px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #f2ead9; cursor: pointer; }
.tv-menu-item:hover:not(:disabled) { border-color: rgba(255,215,110,0.5); }
.tv-menu-item:disabled { opacity: .5; cursor: default; }
.tv-menu-ic { font-size: 24px; flex: 0 0 auto; }
.tv-menu-body { display: flex; flex-direction: column; gap: 1px; }
.tv-menu-body b { font-size: 0.92rem; }
.tv-menu-body small { font-size: 0.76rem; color: #b7ad9a; }
.tv-diceview { display: flex; flex-direction: column; gap: 12px; }
.tv-gambit-head { display: flex; align-items: center; gap: 12px; }
.tv-gambit-cup { width: 52px; height: 52px; object-fit: contain; flex: 0 0 auto; filter: drop-shadow(0 3px 4px rgba(0,0,0,0.5)); }
.tv-bets { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.tv-bets button { padding: 9px 16px; border-radius: 10px; border: 1px solid rgba(255,215,110,0.4); background: rgba(255,215,110,0.12); color: #ffe0b0; font-weight: 800; font-size: 0.85rem; cursor: pointer; }
.tv-bets button:disabled { opacity: .45; cursor: default; }
.tv-gold { margin-left: auto; font-size: 0.85rem; }
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
