"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import SceneMusic from "@/components/SceneMusic";

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
const isEmote = (s) => Boolean(s && [...s.trim()].length <= 4 && !/[a-z0-9]/i.test(s) && /\p{Extended_Pictographic}/u.test(s));
const EMOTES = ["👋", "🍻", "😄", "🎵", "❤️", "🎲"];

const WORLD_W = 1240;   // width of the scrollable room (px)
const FLOOR_Y = 95;     // % of scene height where characters stand (on the plank floor)
// NPC characters placed along the room (x = % of the world width).
const NPCS = [
    { key: "bar", art: "barkeep", emoji: "🧔", label: "Barkeep", x: 16 },
    { key: "dice", art: "gambler", emoji: "🎲", label: "Gambler", x: 84 },
];

function Die({ value, held = false, rolling = false, locked = false, small = false, onClick }) {
    const size = small ? 30 : 54;
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

// A member standing/walking in the room (positioned by world x %). Shows their chat bubble / emote; tap another
// member to open a quick action sheet.
function TavAvatar({ a, you = false, onTap }) {
    const t = spriteFlip(a.flip, a.facing);
    const emote = a.chat && isEmote(a.chat);
    return (
        <div className={`tv-av${you ? " is-you" : ""}${a.moving ? " is-walking" : ""}`} style={{ left: `${a.x}%`, top: `${a.y || FLOOR_Y}%` }} onClick={onTap ? (e) => { e.stopPropagation(); onTap(a); } : undefined}>
            {a.chat ? (emote ? <span className="tv-emote" aria-hidden="true">{a.chat}</span> : <span className="tv-bubble">{a.chat}</span>) : null}
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

export default function TavernInterior({ bgUrl, diceUrl, npcArt, iconArt, me, onLeave }) {
    const [st, setSt] = useState(null);
    const [viewportW, setViewportW] = useState(360);
    const [pos, setPos] = useState({ x: 50, y: FLOOR_Y, facing: 1, moving: false });
    const [myChat, setMyChat] = useState(null);   // my optimistic speech bubble / emote
    const [chatText, setChatText] = useState("");
    const [menuFor, setMenuFor] = useState(null);  // tapped another member → action sheet
    const [panExtra, setPanExtra] = useState(0);
    const [dragging, setDragging] = useState(false);
    const [station, setStation] = useState(null); // open panel: "dice" (the gambler minigame)
    const [barkeep, setBarkeep] = useState(null); // in-scene barkeep chat { line } — NO modal
    const [drinkFx, setDrinkFx] = useState(null); // big drink/round celebration { type, xp, gold, key }
    const [busy, setBusy] = useState(false);
    const [g, setG] = useState(null);
    const [result, setResult] = useState(null);
    const [rolling, setRolling] = useState(false);
    const [flash, setFlash] = useState(null);
    const drinkFxClear = useRef(null);
    const sceneRef = useRef(null);
    const drag = useRef({ down: false, moved: false, startX: 0, startY: 0, lastX: 0, lastT: 0, vx: 0 });
    const momentumRef = useRef(0);
    const moveTimer = useRef(null);
    const greeted = useRef(false);
    const overlayRef = useRef(false); // true while a station/member panel is open → the room ignores its own taps/drags

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

    // Social: chat + quick emotes (shared chat store → everyone in the tavern sees your bubble/emote).
    const chatClear = useRef(null);
    const showMyChat = useCallback((text) => { setMyChat(text); clearTimeout(chatClear.current); chatClear.current = setTimeout(() => setMyChat(null), 7000); }, []);
    const postChat = useCallback((body) => { fetch("/api/marketplace/tavern", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "chat", body }) }).catch(() => {}); }, []);
    const sendChat = useCallback((e) => { if (e) e.preventDefault(); const body = chatText.trim(); if (!body) return; setChatText(""); showMyChat(body.slice(0, 200)); postChat(body); }, [chatText, showMyChat, postChat]);
    const quickEmote = useCallback((emoji) => { showMyChat(emoji); postChat(emoji); }, [showMyChat, postChat]);

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
        if (overlayRef.current) return; // a panel is open — don't start a room drag behind it
        cancelAnimationFrame(momentumRef.current);
        drag.current = { down: true, moved: false, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastT: e.timeStamp || 0, vx: 0 };
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ok */ }
    }, []);
    const onPointerMove = useCallback((e) => {
        if (overlayRef.current) return;
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
        if (overlayRef.current) { setDragging(false); return; } // panel open → ignore
        if (d.moved) {
            let v = d.vx * 16;
            const glide = () => { v *= 0.94; if (Math.abs(v) < 0.4) { setDragging(false); return; } setPanExtra((p) => clamp(followCam + p - v, 0, maxScroll) - followCam); momentumRef.current = requestAnimationFrame(glide); };
            if (Math.abs(v) > 0.8) momentumRef.current = requestAnimationFrame(glide); else setDragging(false);
            return;
        }
        setDragging(false);
        // NPCs, avatars, the emote bar, Leave — any button/link handles itself; don't ALSO walk the hero there.
        if (e.target.closest("button, a, .tv-av")) return;
        const rect = sceneRef.current?.getBoundingClientRect(); if (!rect) return;
        const worldX = ((e.clientX - rect.left + cameraPx) / WORLD_W) * 100;
        walkToWorld(worldX);
    }, [cameraPx, followCam, maxScroll, walkToWorld]);

    // ── The Barkeep — talked to IN the scene (bubble over his head), not a modal ──
    const barSay = useCallback((line) => setBarkeep({ line }), []);
    const triggerDrinkFx = useCallback((fx) => {
        const key = Date.now();
        setDrinkFx({ ...fx, key });
        clearTimeout(drinkFxClear.current);
        drinkFxClear.current = setTimeout(() => setDrinkFx((f) => (f && f.key === key ? null : f)), 1900);
    }, []);
    const engageBarkeep = useCallback(() => {
        barSay(pick(GREET));
        // Slide the camera over to the barkeep so you're "at the bar".
        const target = clampN((NPCS[0].x / 100) * WORLD_W - viewportW / 2, 0, Math.max(0, WORLD_W - viewportW));
        setPanExtra(target - clampN((pos.x / 100) * WORLD_W - viewportW / 2, 0, Math.max(0, WORLD_W - viewportW)));
    }, [barSay, viewportW, pos.x]);
    const askNews = useCallback(() => { const rumors = st?.rumors || []; barSay(rumors.length ? `*leans in* ${rumors[Math.floor(Math.random() * rumors.length)]}` : "*shrugs* Quiet night so far, friend."); }, [st?.rumors, barSay]);
    const askPint = useCallback(async () => {
        const r = await act({ action: "pint" });
        if (r?.ok) { barSay(`Finest ale in the Den! 🍺 +${r.xp} XP, +${r.gold} gold. Drink up!`); triggerDrinkFx({ type: "pint", xp: r.xp, gold: r.gold }); }
        else if (r?.error === "already") barSay("Ha! You've had your daily pint — back tomorrow, friend.");
        else barSay("*frowns* Tap's stuck. Try again in a moment.");
    }, [act, barSay, triggerDrinkFx]);
    const buyRoundAct = useCallback(async () => {
        const r = await act({ action: "round" });
        if (r?.ok) { barSay(`🍻 A ROUND FOR THE HOUSE! You treated ${r.recipients} ${r.recipients === 1 ? "wolf" : "wolves"} — a hero's welcome (+${r.hostXp} XP)!`); triggerDrinkFx({ type: "round", recipients: r.recipients, hostXp: r.hostXp }); }
        else if (r?.error === "insufficient_gold") barSay(`*eyes your purse* A round's ${st?.round?.cost || 400} gold, friend — come back flush.`);
        else barSay("*shrugs* Can't pour that just now.");
    }, [act, barSay, triggerDrinkFx, st?.round?.cost]);

    // ── Wolf's Gambit dice ──
    const ante = useCallback(async (amount) => {
        setResult(null); setFlash(null);
        const r = await act({ action: "gambit_start", bet: amount });
        if (r?.ok) { setRolling(true); setG({ bet: r.bet, dice: r.dice, hold: [false, false, false], rerolled: false, hand: r.hand }); setTimeout(() => setRolling(false), 650); }
        else setFlash(r?.error === "insufficient_gold" ? "Not enough gold, friend." : r?.error === "daily_limit" ? "That's your five rolls for today — the Gambler's cashing out. Back tomorrow!" : "Couldn't ante up.");
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

    const openStation = useCallback((key) => { setFlash(null); if (key === "dice") { setG(null); setResult(null); } setStation(key); }, []);
    const others = st?.occupants || [];
    const here = others.length + 1;
    overlayRef.current = Boolean(station || menuFor); // keep the pointer-guard in sync (barkeep is in-scene, not blocking)
    const roundCost = st?.round?.cost || 400;
    const pintAvail = Boolean(st?.dailyPint?.available);
    const dicePlaysLeft = st?.dice?.playsLeft ?? st?.dice?.dailyCap ?? 5;
    const diceCap = st?.dice?.dailyCap ?? 5;

    return (
        <div className="stack reveal">
            <div ref={sceneRef} className="tv-scene" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { drag.current.down = false; setDragging(false); }} role="presentation">
                <button type="button" className="tv-leave" onClick={onLeave}>← Leave</button>
                <SceneMusic vibe="tavern" />
                <div className="tv-world" style={{ width: `${WORLD_W}px`, transform: `translateX(${-cameraPx}px)`, transition: dragging ? "none" : `transform ${camDur}s linear` }}>
                    {bgUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="tv-bg" src={bgUrl} alt="" draggable={false} />
                    ) : <div className="tv-scene-fallback">🍺 The Wolf&apos;s Rest</div>}
                    <div className="tv-fire" aria-hidden="true" />
                    <div className="tv-vignette" aria-hidden="true" />
                    {/* NPC characters */}
                    {NPCS.map((n, i) => {
                        const url = n.art ? npcArt?.[n.art] : null;
                        const isBar = n.key === "bar";
                        return (
                            <button key={n.key} type="button" className="tv-npc" style={{ left: `${n.x}%`, top: `${FLOOR_Y}%` }} onClick={(e) => { e.stopPropagation(); if (isBar) engageBarkeep(); else openStation(n.key); }}>
                                {/* Barkeep talks IN the scene — a speech bubble over his head, plus a big drink/round splash */}
                                {isBar && barkeep ? <span className="tv-keeper-bubble">{barkeep.line}</span> : null}
                                {isBar && drinkFx ? (
                                    <span className="tv-drinkfx" key={drinkFx.key} aria-hidden="true">
                                        {drinkFx.type === "round" ? (
                                            iconArt?.round ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={iconArt.round} alt="" className="tv-drinkfx-mug" draggable={false} />
                                            ) : <span className="tv-drinkfx-emoji">🍻</span>
                                        ) : (
                                            iconArt?.pint ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={iconArt.pint} alt="" className="tv-drinkfx-mug" draggable={false} />
                                            ) : <span className="tv-drinkfx-emoji">🍺</span>
                                        )}
                                        <span className="tv-drinkfx-reward">{drinkFx.type === "round" ? `🍻 +${drinkFx.hostXp} XP` : `+${drinkFx.xp} XP · +${drinkFx.gold}🪙`}</span>
                                        {[...Array(8)].map((_, k) => <span key={k} className="tv-foam" style={{ "--a": `${k * 45}deg` }} />)}
                                    </span>
                                ) : null}
                                <span className="tv-npc-label">{n.label}{isBar && pintAvail ? " •" : ""}</span>
                                {url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img className={`tv-npc-sprite${isBar && drinkFx ? " is-cheering" : ""}`} src={url} alt={n.label} draggable={false} style={{ animationDelay: `${i * 0.85}s` }} />
                                ) : <span className="tv-npc-emoji">{n.emoji}</span>}
                            </button>
                        );
                    })}
                    {/* other members here now */}
                    {others.map((o) => <TavAvatar key={o.id} a={o} onTap={(m) => setMenuFor(m)} />)}
                    {/* you */}
                    <TavAvatar a={{ x: pos.x, y: pos.y, facing: pos.facing, moving: pos.moving, sprite: me?.sprite, flip: me?.flip, chat: myChat }} you />
                </div>
                {here > 1 ? <div className="tv-hint">{here} here now</div> : null}

                {/* Barkeep order tray — an in-scene dialogue bar (NOT a modal). Appears when you step up to him. */}
                {barkeep ? (
                    <div className="tv-keeper-tray" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="tv-order tv-order-pint" disabled={busy || !pintAvail} onClick={askPint} title={pintAvail ? "Daily Hearty Pint" : "Had yours today"}>
                            {iconArt?.pint ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={iconArt.pint} alt="" draggable={false} />
                            ) : <span className="tv-order-emoji">🍺</span>}
                            <span className="tv-order-lbl">Hearty Pint<small>{pintAvail ? `+${st?.dailyPint?.xp || 40} XP` : "tomorrow"}</small></span>
                        </button>
                        <button type="button" className="tv-order tv-order-round" disabled={busy || (st?.gold || 0) < roundCost} onClick={buyRoundAct} title="Buy a round for everyone here">
                            {iconArt?.round ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={iconArt.round} alt="" draggable={false} />
                            ) : <span className="tv-order-emoji">🍻</span>}
                            <span className="tv-order-lbl">Round · {roundCost.toLocaleString()}🪙<small>+XP for all</small></span>
                        </button>
                        <button type="button" className="tv-order tv-order-mini" onClick={askNews} title="Ask for gossip">🗞️</button>
                        <button type="button" className="tv-order tv-order-mini" onClick={() => setBarkeep(null)} aria-label="Step away">✕</button>
                    </div>
                ) : (
                    /* Quick emotes — float above your head + broadcast to the room */
                    <div className="tv-emotebar" onClick={(e) => e.stopPropagation()}>
                        {EMOTES.map((em) => <button key={em} type="button" onClick={() => quickEmote(em)}>{em}</button>)}
                    </div>
                )}

                {/* Tap another member → quick actions */}
                {menuFor ? (
                    <div className="tv-panel-wrap" onClick={() => setMenuFor(null)} role="presentation">
                        <div className="tv-panel" onClick={(e) => e.stopPropagation()}>
                            <div className="tv-panel-head"><strong>{menuFor.name}</strong><button type="button" onClick={() => setMenuFor(null)} aria-label="Close">✕</button></div>
                            <div className="tv-menu">
                                <button type="button" className="tv-menu-item" onClick={() => { quickEmote("👋"); setMenuFor(null); }}><span className="tv-menu-ic">👋</span><span className="tv-menu-body"><b>Wave</b><small>Say hi to {menuFor.name}</small></span></button>
                                {menuFor.alias ? <Link href={`/marketplace/u/${menuFor.alias}`} className="tv-menu-item"><span className="tv-menu-ic">👤</span><span className="tv-menu-body"><b>View profile</b><small>@{menuFor.alias}</small></span></Link> : null}
                                {menuFor.alias ? <Link href={`/marketplace/trade/new?to=${encodeURIComponent(menuFor.alias)}`} className="tv-menu-item"><span className="tv-menu-ic">🤝</span><span className="tv-menu-body"><b>Trade</b><small>Start a trade</small></span></Link> : null}
                            </div>
                        </div>
                    </div>
                ) : null}

                {/* Interaction overlay — happens INSIDE the scene pane for immersion */}
                {station ? (
                    <div className="tv-panel-wrap" onClick={() => { setStation(null); setFlash(null); }} role="presentation">
                    <div className="tv-panel" onClick={(e) => e.stopPropagation()}>
                        <div className="tv-panel-head">
                            <strong>🎲 The Gambler</strong>
                            <button type="button" onClick={() => { setStation(null); setFlash(null); }} aria-label="Close">✕</button>
                        </div>

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
                                    dicePlaysLeft > 0 ? (
                                        <>
                                            <div className="tv-bets">
                                                {[50, 200, 500].map((amt) => <button key={amt} type="button" disabled={busy || (st?.gold || 0) < amt} onClick={() => ante(amt)}>Ante {amt}</button>)}
                                                <span className="muted tv-gold">🪙 {(st?.gold || 0).toLocaleString()}</span>
                                            </div>
                                            <div className="tv-dice-left muted">🎲 {dicePlaysLeft} of {diceCap} rolls left today</div>
                                        </>
                                    ) : (
                                        <div className="tv-flash">🎲 That&apos;s your {diceCap} rolls for today — the Gambler&apos;s calling it a night. Come back tomorrow!</div>
                                    )
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
            </div>

            {/* Chat to the tavern */}
            <form className="tv-chatbar" onSubmit={sendChat}>
                <input value={chatText} onChange={(e) => setChatText(e.target.value)} placeholder="Say something to the tavern…" maxLength={200} aria-label="Tavern chat" />
                <button type="submit" aria-label="Send" disabled={!chatText.trim()}>➤</button>
            </form>

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
.tv-npc-sprite { width: 168px; height: 168px; object-fit: contain; filter: drop-shadow(0 6px 8px rgba(0,0,0,0.6)); transform-origin: 50% 100%; animation: tvBreathe 3s ease-in-out infinite; }
.tv-npc-emoji { font-size: 66px; filter: drop-shadow(0 3px 5px rgba(0,0,0,0.6)); }
/* Avatars — sized to read as real inhabitants next to the room's furniture */
.tv-av { position: absolute; transform: translate(-50%, -100%); z-index: 6; display: flex; flex-direction: column; align-items: center; transition: left .3s linear, top .3s linear; }
.tv-av-sprite { width: 132px; height: 132px; display: grid; place-items: center; transform-origin: 50% 100%; }
.tv-av:not(.is-walking) .tv-av-sprite { animation: tvBreathe 2.8s ease-in-out infinite; }
@keyframes tvBreathe { 0%,100% { transform: scaleY(1) scaleX(1); } 48% { transform: scaleY(0.955) scaleX(1.035); } }
.tv-av-sprite img { width: 132px; height: 132px; object-fit: contain; filter: drop-shadow(0 5px 7px rgba(0,0,0,0.6)); }
.tv-av-fallback { font-size: 94px; }
.tv-av-name { font-size: 10px; font-weight: 800; color: #f2ead9; background: rgba(30,18,50,0.85); border-radius: 999px; padding: 1px 8px; margin-bottom: 2px; white-space: nowrap; }
.tv-bubble { max-width: 150px; font-size: 11px; font-weight: 600; color: #2a1a06; background: #fbf2dc; border-radius: 12px; padding: 4px 9px; margin-bottom: 4px; box-shadow: 0 2px 6px rgba(0,0,0,0.4); white-space: normal; text-align: center; line-height: 1.25; }
.tv-emote { font-size: 30px; margin-bottom: 2px; animation: tvEmote 1.4s ease-out; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.5)); }
@keyframes tvEmote { 0% { transform: translateY(6px) scale(.5); opacity: 0; } 25% { transform: translateY(0) scale(1.15); opacity: 1; } 100% { transform: translateY(-8px) scale(1); opacity: 1; } }
/* Quick-emote bar (bottom of the scene) */
.tv-emotebar { position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); z-index: 8; display: flex; gap: 4px; background: rgba(20,10,4,0.6); border: 1px solid rgba(255,215,110,0.28); border-radius: 999px; padding: 4px 6px; }
.tv-emotebar button { width: 30px; height: 30px; border: none; background: rgba(255,255,255,0.06); border-radius: 999px; font-size: 17px; cursor: pointer; line-height: 1; }
.tv-emotebar button:active { transform: scale(0.9); }
/* Chat bar */
.tv-chatbar { display: flex; gap: 8px; margin-top: 10px; }
.tv-chatbar input { flex: 1 1 auto; min-width: 0; padding: 11px 14px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.06); color: #f2ead9; font-size: 0.9rem; }
.tv-chatbar button { flex: 0 0 auto; width: 44px; border-radius: 999px; border: none; background: linear-gradient(180deg,#ffd75e,#f3b23a); color: #2a1a06; font-weight: 900; cursor: pointer; }
.tv-chatbar button:disabled { opacity: .5; cursor: default; }
/* Station panel — an overlay INSIDE the scene pane, for immersion */
.tv-panel-wrap { position: absolute; inset: 0; z-index: 10; display: grid; place-items: center; padding: 14px; background: rgba(8,4,2,0.55); }
.tv-panel { width: 100%; max-width: 330px; max-height: 90%; overflow-y: auto; overflow-x: hidden; border-radius: 16px; background: rgba(23,18,14,0.98); border: 1px solid rgba(255,215,110,0.4); box-shadow: 0 14px 40px rgba(0,0,0,0.6); padding: 14px; animation: tvPanelPop .28s cubic-bezier(.2,1.2,.3,1) both; }
@keyframes tvPanelPop { 0% { transform: scale(.9); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
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
.tv-dice-row.sm { gap: 5px; padding: 2px 0; }
.tv-diebtn { position: relative; padding: 0; border: none; background: none; cursor: pointer; border-radius: 12px; transition: transform .12s ease; }
.tv-diebtn.is-static { cursor: default; }
.tv-diebtn:not(.is-static):active { transform: scale(0.92); }
.tv-diebtn.is-held { transform: translateY(-4px); }
.tv-diebtn.is-held svg rect { fill: #fff6df; stroke: #2fae72; }
.tv-diebtn.is-rolling { animation: tvTumble .5s cubic-bezier(.3,1.4,.4,1) both; }
@keyframes tvTumble { 0% { transform: translateY(-18px) rotate(-60deg) scale(.7); } 60% { transform: translateY(3px) rotate(12deg) scale(1.08); } 100% { transform: translateY(0) rotate(0) scale(1); } }
.tv-held-tag { position: absolute; bottom: -8px; left: 50%; transform: translateX(-50%); font-size: 8.5px; font-weight: 900; letter-spacing: .04em; color: #06311f; background: #43d98a; border-radius: 999px; padding: 1px 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.4); }
.tv-result { display: flex; flex-direction: column; gap: 12px; }
.tv-vs { display: flex; align-items: stretch; gap: 6px; }
.tv-vs-side { flex: 1 1 0; min-width: 0; overflow: hidden; text-align: center; padding: 9px 4px; border-radius: 12px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); }
.tv-vs-side.is-win { border-color: rgba(67,217,138,0.6); background: rgba(67,217,138,0.1); box-shadow: 0 0 14px rgba(67,217,138,0.25); }
.tv-vs-who { font-size: 0.76rem; font-weight: 800; color: #cbb9e0; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tv-vs-hand { font-size: 0.74rem; font-weight: 800; color: #ffe0b0; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tv-vs-x { align-self: center; font-weight: 900; color: #9aa0a6; font-size: 0.8rem; flex: 0 0 auto; }
.tv-dice-left { text-align: center; font-size: 0.76rem; margin-top: -4px; }
.tv-play-btns { display: flex; gap: 10px; }
.tv-roll { flex: 1 1 auto; padding: 12px; border-radius: 12px; border: none; cursor: pointer; font-weight: 900; font-size: 15px; color: #2a1a06; background: linear-gradient(180deg,#ffe488,#f3b23a); box-shadow: 0 3px 0 #b57f22; }
.tv-roll:active { transform: translateY(2px); box-shadow: 0 1px 0 #b57f22; }
.tv-cash { flex: 1 1 auto; padding: 12px; border-radius: 12px; border: 1px solid rgba(143,227,154,0.5); cursor: pointer; font-weight: 800; font-size: 14px; color: #b8f0c2; background: rgba(143,227,154,0.12); }
.tv-roll:disabled, .tv-cash:disabled { opacity: .5; cursor: default; }

/* ── Barkeep talked to IN the scene (no modal) ── */
.tv-keeper-bubble { position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); margin-bottom: 6px; width: max-content; max-width: 210px; font-size: 12px; font-weight: 700; line-height: 1.3; color: #241206; background: linear-gradient(180deg,#fff,#ffe9b0); border-radius: 12px; padding: 7px 11px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); text-align: center; z-index: 20; animation: tvBubblePop .28s cubic-bezier(.2,1.3,.3,1) both; }
.tv-keeper-bubble::after { content: ""; position: absolute; top: 100%; left: 50%; transform: translateX(-50%); border: 7px solid transparent; border-top-color: #ffe9b0; }
@keyframes tvBubblePop { 0% { transform: translateX(-50%) scale(.6); opacity: 0; } 100% { transform: translateX(-50%) scale(1); opacity: 1; } }
.tv-npc-sprite.is-cheering { animation: tvCheer .5s ease-in-out 2 !important; }
@keyframes tvCheer { 0%,100% { transform: translateY(0) rotate(0); } 30% { transform: translateY(-10px) rotate(-4deg); } 60% { transform: translateY(-4px) rotate(4deg); } }
/* Big drink / round splash over the barkeep */
.tv-drinkfx { position: absolute; bottom: 60%; left: 50%; transform: translateX(-50%); z-index: 25; pointer-events: none; display: grid; place-items: center; }
.tv-drinkfx-mug { width: 92px; height: 92px; object-fit: contain; filter: drop-shadow(0 6px 12px rgba(0,0,0,0.6)); animation: tvMugPop 1.9s ease-out forwards; }
.tv-drinkfx-emoji { font-size: 72px; animation: tvMugPop 1.9s ease-out forwards; }
@keyframes tvMugPop { 0% { transform: scale(0) rotate(-20deg); opacity: 0; } 15% { transform: scale(1.25) rotate(6deg); opacity: 1; } 40% { transform: scale(1) rotate(0); } 80% { opacity: 1; transform: translateY(-6px) scale(1); } 100% { opacity: 0; transform: translateY(-26px) scale(.9); } }
.tv-drinkfx-reward { position: absolute; top: -18px; left: 50%; transform: translateX(-50%); white-space: nowrap; font-weight: 900; font-size: 15px; color: #fff; text-shadow: 0 2px 4px rgba(0,0,0,0.85); animation: tvRewardFloat 1.9s ease-out forwards; }
@keyframes tvRewardFloat { 0% { opacity: 0; transform: translate(-50%, 8px) scale(.6); } 25% { opacity: 1; transform: translate(-50%, 0) scale(1.1); } 100% { opacity: 0; transform: translate(-50%, -34px) scale(1); } }
.tv-foam { position: absolute; top: 50%; left: 50%; width: 8px; height: 8px; border-radius: 50%; background: #ffe9b0; box-shadow: 0 0 6px rgba(255,233,176,0.9); transform: rotate(var(--a)) translateY(0); animation: tvFoam .9s ease-out forwards; }
@keyframes tvFoam { 0% { transform: rotate(var(--a)) translateY(0) scale(1); opacity: 0; } 20% { opacity: 1; } 100% { transform: rotate(var(--a)) translateY(-52px) scale(.3); opacity: 0; } }
/* In-scene order tray (replaces the emote bar while at the bar) */
.tv-keeper-tray { position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); z-index: 12; display: flex; gap: 6px; align-items: stretch; max-width: 96%; background: rgba(20,10,4,0.72); border: 1px solid rgba(255,215,110,0.4); border-radius: 14px; padding: 6px; box-shadow: 0 6px 20px rgba(0,0,0,0.5); animation: tvBubblePop .26s cubic-bezier(.2,1.2,.3,1) both; }
.tv-order { display: flex; align-items: center; gap: 8px; padding: 7px 11px; border-radius: 11px; border: 1px solid rgba(255,215,110,0.35); background: linear-gradient(180deg, rgba(70,44,20,0.9), rgba(44,26,10,0.9)); color: #ffe9c4; cursor: pointer; font: inherit; }
.tv-order:hover:not(:disabled) { border-color: rgba(255,215,110,0.7); }
.tv-order:active:not(:disabled) { transform: translateY(1px); }
.tv-order:disabled { opacity: .45; cursor: default; }
.tv-order img { width: 34px; height: 34px; object-fit: contain; flex: 0 0 auto; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.5)); }
.tv-order-emoji { font-size: 26px; }
.tv-order-lbl { display: flex; flex-direction: column; line-height: 1.1; font-weight: 900; font-size: 13px; text-align: left; }
.tv-order-lbl small { font-weight: 700; font-size: 10px; color: #c8a86a; }
.tv-order-mini { padding: 7px 12px; font-size: 17px; font-weight: 900; }
.tv-order-round { border-color: rgba(255,180,90,0.5); }
`;
