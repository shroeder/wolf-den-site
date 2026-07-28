"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import TavernInterior from "@/components/TavernInterior";

// ── THE WOLF DEN TOWN — side-scrolling social plaza ───────────────────────────────────────────────────────
// A wide cobblestone street you scroll along (camera follows your hero sprite). Other recently-active members
// walk it too, as their own hero sprites, with a live status. Buildings line the street and fast-travel into
// each system. A roster overlay lets you see who's doing what without walking. Movement is smooth via CSS
// transitions (poll + tween — no canvas / websockets). Positions are % of the WIDE world; y is a ground band.

const WORLD_W = 2200;   // px width of the whole street (x = 0..100 maps across this)
const GROUND = 72;      // % from top where building BASES sit (avatars walk in front, lower/foreground)
const spriteTransform = (flip, facing) => ((Boolean(flip) !== (facing === -1)) ? "scaleX(-1)" : "none");
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// Mirror-tiled parallax rows: enough tiles to always span the full WORLD_W (2200px) even when the scene is short
// (tiles are sized by height, so a small phone viewport → narrow tiles → need more of them). Over-tiling is free —
// extras just overflow the world and are clipped by the scene.
const TILES = (n) => Array.from({ length: n }, (_, i) => i);
// Which town-art sprite each raid kind uses (falls back to the event emoji until the art is generated).
const EVENT_ART = { bandit_raid: "bandit", goblin_swarm: "goblin", treasure_golem: "golem" };
// A message that's just emoji (a reaction/emote) pops as a floating emote instead of a text bubble.
const isEmoteMsg = (s) => Boolean(s && [...s.trim()].length <= 4 && !/[a-z0-9]/i.test(s) && /\p{Extended_Pictographic}/u.test(s));

function Avatar({ a, isYou, onTap }) {
    const dur = clamp((a.moveDist || 0) * 0.05, 0.4, 2.6);
    return (
        <div
            className={`tw-av${isYou ? " is-you" : ""}${a.friend ? " is-friend" : ""}`}
            style={{ left: `${a.x}%`, top: `${a.y}%`, zIndex: 300 + Math.round(a.y) + (isYou ? 100 : 0), transition: `left ${dur}s linear, top ${dur}s linear` }}
            onClick={onTap ? (e) => { e.stopPropagation(); onTap(); } : undefined}
        >
            {a.chat ? (
                isEmoteMsg(a.chat) ? (
                    <div className="tw-emote-pop">{a.chat}</div>
                ) : (
                    <div className="tw-bubble tw-chat">{a.chat}</div>
                )
            ) : a.typing ? (
                <div className="tw-bubble tw-typing-bubble" aria-label="typing"><span /><span /><span /></div>
            ) : (
                <div className="tw-bubble">{a.status || (isYou ? "🐺 you" : "🐺 around town")}</div>
            )}
            <div className={`tw-sprite${a.moving ? " is-walking" : ""}`}>
                {a.pet ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="tw-pet" src={a.pet} alt="" draggable={false} style={{ transform: spriteTransform(a.petFlip, a.facing) }} />
                ) : null}
                {a.sprite ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.sprite} alt={a.name} draggable={false} style={{ transform: spriteTransform(a.flip, a.facing) }} />
                ) : (
                    <span className="tw-sprite-fallback" style={{ transform: spriteTransform(a.flip, a.facing) }}>🐺</span>
                )}
                {a.wave ? <span className="tw-wave">👋</span> : null}
            </div>
            <div className="tw-name">{isYou ? "You" : a.name}</div>
        </div>
    );
}

export default function TownClient({ initial }) {
    const [state, setState] = useState(initial || null);
    const [me, setMe] = useState(() => ({ x: initial?.you?.x ?? 50, y: initial?.you?.y ?? 80, facing: initial?.you?.facing ?? 1, moving: false, moveDist: 0, wave: false }));
    const [others, setOthers] = useState({});
    const [viewportW, setViewportW] = useState(360);
    const [roster, setRoster] = useState(false);
    const [panExtra, setPanExtra] = useState(0); // manual drag-to-pan offset on top of the follow-camera
    const [dragging, setDragging] = useState(false); // true mid-drag → camera follows the finger instantly (no ease)
    const [chatText, setChatText] = useState("");    // town chat composer
    const [myChat, setMyChat] = useState(null);      // my own speech bubble (optimistic, clears after a few s)
    const [menuFor, setMenuFor] = useState(null);    // tapped another player → action sheet
    const [boardOpen, setBoardOpen] = useState(false); // Town Hall (events + plaza fund) panel
    const [contribBusy, setContribBusy] = useState(false);
    const [inTavern, setInTavern] = useState(false);  // stepped inside the Tavern interior
    const [merchantOpen, setMerchantOpen] = useState(false);
    const [merchantBusy, setMerchantBusy] = useState(false);
    const [merchantFlash, setMerchantFlash] = useState(null);
    const [crierMsg, setCrierMsg] = useState(0);      // which rotating announcement the crier is shouting
    const [evHp, setEvHp] = useState(null);          // optimistic event HP (drops instantly on your hit)
    const [evFlash, setEvFlash] = useState(null);    // brief hit / "defeated" feedback
    const evIdRef = useRef(null);
    const lastAtk = useRef(0);
    const sceneRef = useRef(null);
    const moveTimer = useRef(null);
    const chatClear = useRef(null);
    const lastTyping = useRef(0);
    const drag = useRef({ down: false, moved: false, startX: 0, startY: 0, lastX: 0 });

    // Measure the viewport so the camera can keep the player centered.
    useEffect(() => {
        const el = sceneRef.current; if (!el) return undefined;
        const set = () => setViewportW(el.clientWidth || 360);
        set();
        const ro = new ResizeObserver(set); ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const load = useCallback(async () => {
        const r = await fetch("/api/marketplace/town", { cache: "no-store" }).catch(() => null);
        const d = r?.ok ? await r.json().catch(() => null) : null;
        if (!d) return;
        setState(d);
        setOthers((prev) => {
            const next = {};
            for (const p of d.players || []) {
                const cur = prev[p.id];
                const home = { x: p.x, y: p.y };
                if (p.walking) next[p.id] = { ...p, home, x: p.x, y: p.y, facing: p.facing, moving: cur ? dist(cur, p) > 1 : false, moveDist: cur ? dist(cur, p) : 0 };
                else if (cur) next[p.id] = { ...cur, ...p, home, x: cur.x, y: cur.y, facing: cur.facing };
                else next[p.id] = { ...p, home, moving: false, moveDist: 0 };
            }
            return next;
        });
    }, []);

    useEffect(() => { load(); const t = setInterval(load, 2500); return () => clearInterval(t); }, [load]);

    // Ambient wander for idle players.
    useEffect(() => {
        const t = setInterval(() => {
            setOthers((prev) => {
                const next = { ...prev };
                for (const [id, p] of Object.entries(prev)) {
                    if (p.walking) continue;
                    if (Math.random() < 0.5) {
                        const nx = clamp((p.home?.x ?? p.x) + (Math.random() - 0.5) * 12, 3, 97);
                        const ny = clamp((p.home?.y ?? p.y) + (Math.random() - 0.5) * 6, 72, 86);
                        next[id] = { ...p, x: nx, y: ny, facing: nx < p.x ? -1 : 1, moving: true, moveDist: dist(p, { x: nx, y: ny }) };
                    } else if (p.moving) next[id] = { ...p, moving: false };
                }
                return next;
            });
        }, 2800);
        return () => clearInterval(t);
    }, []);

    // Keep the optimistic event HP in sync with the poll: reset on a new event, else take the lower (server
    // is authoritative as it drops, and never let it bounce back up between my clicks).
    useEffect(() => {
        const ev = state?.event;
        if (!ev) { evIdRef.current = null; setEvHp(null); return; }
        if (evIdRef.current !== ev.id) { evIdRef.current = ev.id; setEvHp(ev.hp); }
        else setEvHp((cur) => (cur == null ? ev.hp : Math.min(cur, ev.hp)));
    }, [state?.event]);

    const walkToWorld = useCallback((worldXPct, worldYPct) => {
        setPanExtra(0); // walking re-centres the camera on you
        setMe((m) => {
            const x = clamp(worldXPct, 1, 99);
            const y = clamp(worldYPct ?? m.y, 74, 90);
            const facing = x < m.x ? -1 : 1;
            const d = dist(m, { x, y });
            clearTimeout(moveTimer.current);
            moveTimer.current = setTimeout(() => {
                fetch("/api/marketplace/town", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ x, y, facing }) }).catch(() => {});
            }, 250);
            return { ...m, x, y, facing, moving: true, moveDist: d };
        });
    }, []);

    // Camera = follow you, plus any manual drag-to-pan, clamped to the world.
    const maxScroll = Math.max(0, WORLD_W - viewportW);
    const followCam = clamp((me.x / 100) * WORLD_W - viewportW / 2, 0, maxScroll);
    const cameraPx = clamp(followCam + panExtra, 0, maxScroll);

    // Pointer: a DRAG pans the street (free look); a TAP walks you there.
    const onPointerDown = useCallback((e) => {
        drag.current = { down: true, moved: false, startX: e.clientX, startY: e.clientY, lastX: e.clientX };
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ok */ }
    }, []);
    const onPointerMove = useCallback((e) => {
        const d = drag.current; if (!d.down) return;
        const dx = e.clientX - d.lastX;
        // Only treat as a horizontal pan once it's clearly horizontal — otherwise let the page scroll vertically.
        if (!d.moved && Math.abs(e.clientX - d.startX) > 8 && Math.abs(e.clientX - d.startX) > Math.abs(e.clientY - d.startY)) { d.moved = true; setDragging(true); }
        if (d.moved) { d.lastX = e.clientX; setPanExtra((p) => clamp(followCam + p - dx, 0, maxScroll) - followCam); }
    }, [followCam, maxScroll]);
    const onPointerUp = useCallback((e) => {
        const d = drag.current; d.down = false;
        setDragging(false);
        if (d.moved) return; // was a pan, not a tap
        if (e.target.closest(".tw-building") || e.target.closest(".tw-av")) return; // doors/avatars handle themselves
        const rect = sceneRef.current?.getBoundingClientRect(); if (!rect) return;
        const worldX = ((e.clientX - rect.left + cameraPx) / WORLD_W) * 100;
        const worldY = ((e.clientY - rect.top) / rect.height) * 100;
        walkToWorld(worldX, worldY);
    }, [cameraPx, followCam, maxScroll, walkToWorld]);

    const wave = useCallback(() => { setMe((m) => ({ ...m, wave: true })); setTimeout(() => setMe((m) => ({ ...m, wave: false })), 1600); }, []);

    // Fire-and-forget town action (chat / typing).
    const postAction = useCallback((payload) => {
        fetch("/api/marketplace/town", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }).catch(() => {});
    }, []);
    // Pop my own speech bubble immediately (optimistic), auto-clearing so it matches the ~8s server window.
    const showMyChat = useCallback((text) => {
        setMyChat(text);
        clearTimeout(chatClear.current);
        chatClear.current = setTimeout(() => setMyChat(null), 7000);
    }, []);
    const sendChat = useCallback((e) => {
        if (e) e.preventDefault();
        const body = chatText.trim();
        if (!body) return;
        setChatText("");
        showMyChat(body.slice(0, 200));
        postAction({ action: "chat", body });
    }, [chatText, showMyChat, postAction]);
    const quickEmote = useCallback((emoji) => { showMyChat(emoji); postAction({ action: "chat", body: emoji }); }, [showMyChat, postAction]);
    const onChatChange = useCallback((e) => {
        setChatText(e.target.value);
        const now = Date.now();
        if (now - lastTyping.current > 2500) { lastTyping.current = now; postAction({ action: "typing" }); } // throttle typing pings
    }, [postAction]);
    // Contribute gold to the collective plaza fund, then refresh the coin HUD + town state.
    const contribute = useCallback(async (amount) => {
        setContribBusy(true);
        const r = await fetch("/api/marketplace/town", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "contribute", amount }) }).catch(() => null);
        setContribBusy(false);
        if (r?.ok) { try { window.dispatchEvent(new Event("wolfden-hud-refresh")); } catch { /* ok */ } load(); }
    }, [load]);
    // Attack the active town event — optimistic HP drop + a hit flash; the server is authoritative.
    const attackEvent = useCallback(async () => {
        const ev = state?.event; if (!ev) return;
        const now = Date.now();
        if (now - lastAtk.current < 380) return; // matches the server-side throttle
        lastAtk.current = now;
        setEvHp((h) => Math.max(0, (h ?? ev.hp) - 12));
        setEvFlash({ k: now });
        setTimeout(() => setEvFlash((f) => (f && f.k === now ? null : f)), 320);
        const r = await fetch("/api/marketplace/town", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "attack", eventId: ev.id }) }).then((x) => x.json()).catch(() => null);
        if (r?.ok) {
            setEvHp(r.hp);
            if (r.defeated) { setEvFlash({ defeated: true, k: now }); try { window.dispatchEvent(new Event("wolfden-hud-refresh")); } catch { /* ok */ } setTimeout(() => load(), 500); }
        } else if (r?.hp != null) setEvHp(r.hp);
    }, [state?.event, load]);
    // Owner test control: spawn an event from inside the Town (real trigger is the admin app).
    const spawnEvent = useCallback(async (kind) => {
        await fetch("/api/marketplace/town", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "spawn_event", kind }) }).catch(() => {});
        load();
    }, [load]);

    const you = state?.you;
    const art = state?.art || {};
    const layered = Boolean(art.sky?.url && art.cobble?.url); // parallax sky + tiling cobble (reliable) vs legacy wide bg
    const buildings = state?.buildings || [];
    const unlocked = useMemo(() => new Set(state?.upgrade?.unlocked || []), [state?.upgrade]);
    const otherList = useMemo(() => Object.values(others), [others]);
    // The Town Crier's rotating live announcements (assembled from the current town state).
    const crierLines = useMemo(() => {
        const lines = [];
        if (state?.event) lines.push(`${state.event.name} in the plaza — to arms!`);
        if (state?.store?.open) lines.push(`The Den is OPEN til ${state.store.closesLabel} — come on down!`);
        else if (state?.store?.nextOpenLabel) lines.push(`Shop's closed — opens ${state.store.nextOpenLabel}!`);
        lines.push(`${state?.onlineCount ?? 1} wolves about the Den tonight!`);
        if (state?.upgrade?.next) lines.push(`Chip in to build the ${state.upgrade.next.name}!`);
        lines.push("The tavern's warm — pull up a stool!");
        lines.push("Hear ye! Fresh happenings on the board!");
        return lines;
    }, [state?.event, state?.onlineCount, state?.upgrade]);
    useEffect(() => { const t = setInterval(() => setCrierMsg((m) => m + 1), 4500); return () => clearInterval(t); }, []);
    // Buy a chest from the Traveling Merchant.
    const buyChest = useCallback(async (tier) => {
        setMerchantBusy(true);
        const r = await fetch("/api/marketplace/town", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "merchant_buy", tier }) }).then((x) => x.json()).catch(() => null);
        setMerchantBusy(false);
        if (r?.ok) { setMerchantFlash(`🎁 Bought a ${r.label}! Open it over in your Gear.`); try { window.dispatchEvent(new Event("wolfden-hud-refresh")); } catch { /* ok */ } load(); }
        else setMerchantFlash(r?.error === "insufficient_gold" ? "Not enough gold, friend." : "Couldn't buy that.");
    }, [load]);
    const camDur = clamp((me.moveDist || 0) * 0.05, 0.4, 2.6);

    if (state && state.owner === false) {
        return <section className="card"><p className="muted" style={{ margin: 0 }}>🏘️ The Wolf Den Town is still being built — check back soon.</p></section>;
    }

    // Stepped inside the Tavern — swap the plaza for the cozy interior.
    if (inTavern) {
        return (
            <div className="stack reveal">
                <TavernInterior bgUrl={art.tavern_interior?.url} onLeave={() => setInTavern(false)} />
            </div>
        );
    }

    return (
        <div className="stack reveal">
            <section className="card" style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <h1 style={{ margin: 0, fontSize: "1.25rem" }}>🏘️ Wolf Den Town</h1>
                    <span className="tw-online">🟢 {state?.onlineCount ?? 1} around</span>
                    {state?.store ? (
                        <span className={`tw-openchip${state.store.open ? " is-open" : ""}`} title="The physical shop's hours">
                            {state.store.open ? `🟢 Den open til ${state.store.closesLabel}` : `🔴 Closed · opens ${state.store.nextOpenLabel}`}
                        </span>
                    ) : null}
                    <button type="button" className="tw-roster-btn" onClick={() => setRoster(true)}>👥 Who&apos;s around</button>
                    <button type="button" className="tw-roster-btn" onClick={() => setBoardOpen(true)}>🏛️ Town Hall</button>
                    <span style={{ marginLeft: "auto", fontSize: "0.72rem", color: "#c58b3a", fontWeight: 800 }}>OWNER PREVIEW</span>
                </div>
                <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.82rem" }}>Tap the street to walk. Tap a building to head there. Real members who are online show up here.</p>
            </section>

            <div ref={sceneRef} className="tw-scene" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { drag.current.down = false; setDragging(false); }} role="presentation">
                {/* Far parallax SKY layer (scrolls slower). Generic + mirror-tiled → seamless. */}
                {layered ? (
                    <div className="tw-far" aria-hidden="true" style={{ transform: `translateX(${-cameraPx * 0.3}px)`, transition: dragging ? "none" : `transform ${camDur}s linear` }}>
                        {TILES(8).map((k) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={k} src={art.sky.url} alt="" draggable={false} />
                        ))}
                    </div>
                ) : (!art.background ? <><div className="tw-sky" aria-hidden="true" /><div className="tw-ground" aria-hidden="true" /></> : null)}
                {/* The wide world that scrolls under a fixed camera */}
                <div className="tw-world" style={{ width: `${WORLD_W}px`, transform: `translateX(${-cameraPx}px)`, transition: dragging ? "none" : `transform ${camDur}s linear` }}>
                    {/* Ground: tiling cobblestone band (layered), else the legacy wide background image */}
                    {layered ? (
                        <div className="tw-cobble" aria-hidden="true">
                            {TILES(14).map((k) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={k} src={art.cobble.url} alt="" draggable={false} />
                            ))}
                        </div>
                    ) : art.background ? (
                        <div className="tw-bg" aria-hidden="true">
                            {[0, 1, 2, 3].map((k) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={k} src={art.background.url} alt="" draggable={false} />
                            ))}
                        </div>
                    ) : null}
                    {/* Foreground border wall — sits at the mid/street seam so the horizon line reads as a defined
                        plaza edge (buildings & avatars draw in front of it). Ground-locked (moves with the street). */}
                    {layered && art.fg?.url ? (
                        <div className="tw-fg" aria-hidden="true">
                            {TILES(18).map((k) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={k} src={art.fg.url} alt="" draggable={false} />
                            ))}
                        </div>
                    ) : null}
                    {/* Buildings */}
                    {buildings.map((b) => {
                        const bart = art[b.id];
                        return (
                            <Link key={b.id} href={b.href} className={`tw-building${bart ? " has-art" : ""}`} style={{ left: `${b.x}%`, top: `${GROUND}%`, zIndex: 100 + Math.round(b.x) }} onClick={b.id === "tavern" ? (e) => { e.preventDefault(); e.stopPropagation(); setInTavern(true); } : (e) => e.stopPropagation()}>
                                {bart ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img className="tw-building-art" src={bart.url} alt={b.label} draggable={false} style={bart.flip ? { transform: "translateX(-50%) scaleX(-1)" } : undefined} />
                                ) : (
                                    <span className="tw-building-card"><span className="tw-building-emoji">{b.emoji}</span></span>
                                )}
                                <span className="tw-building-label">{b.emoji} {b.label}</span>
                            </Link>
                        );
                    })}
                    {/* Blacksmith NPC standing by the Forge */}
                    {art.smith?.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="tw-npc" src={art.smith.url} alt="" draggable={false} style={{ left: "45%", top: `${GROUND}%` }} />
                    ) : null}
                    {/* Town Crier — shouts rotating live news; tap to open the Town Hall */}
                    <button type="button" className="tw-npc-btn" style={{ left: "32%", top: `${GROUND}%` }} onClick={(e) => { e.stopPropagation(); setBoardOpen(true); }} aria-label="Town Crier">
                        {crierLines.length ? <span className="tw-npc-bubble">📣 {crierLines[crierMsg % crierLines.length]}</span> : null}
                        {art.crier?.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={art.crier.url} alt="Town Crier" draggable={false} />
                        ) : <span className="tw-npc-emoji">📣</span>}
                    </button>
                    {/* Traveling Merchant — tap to browse wares */}
                    <button type="button" className="tw-npc-btn" style={{ left: "66%", top: `${GROUND}%` }} onClick={(e) => { e.stopPropagation(); setMerchantFlash(null); setMerchantOpen(true); }} aria-label="Traveling Merchant">
                        <span className="tw-npc-bubble">🧳 Wares for sale!</span>
                        {art.merchant?.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={art.merchant.url} alt="Traveling Merchant" draggable={false} />
                        ) : <span className="tw-npc-emoji">🧳</span>}
                    </button>
                    {/* Collective-upgrade decorations that scroll with the street */}
                    {unlocked.has("statue") ? <div className="tw-deco tw-deco-statue" style={{ left: "16%", top: `${GROUND}%` }} aria-hidden="true">🐺</div> : null}
                    {unlocked.has("fountain") ? <div className="tw-deco tw-deco-fountain" style={{ left: "48%", top: `${GROUND}%` }} aria-hidden="true">⛲</div> : null}
                    {unlocked.has("garden") ? ["30%", "64%", "84%"].map((lx, i) => <div key={i} className="tw-deco tw-deco-garden" style={{ left: lx, top: `${GROUND}%` }} aria-hidden="true">🌷</div>) : null}
                    {/* Other players */}
                    {otherList.map((p) => <Avatar key={p.id} a={p} isYou={false} onTap={() => setMenuFor(p)} />)}
                    {/* You */}
                    {you ? <Avatar a={{ ...me, name: "You", sprite: you.sprite, flip: you.flip, status: "🐺 you", chat: myChat, pet: you.pet, petFlip: you.petFlip }} isYou /> : null}
                </div>

                {/* Live town event (bandit raid, etc.) — a shared enemy the whole plaza attacks together */}
                {state?.event ? (() => {
                    const ev = state.event;
                    const hp = evHp ?? ev.hp;
                    const pct = Math.max(0, Math.min(100, Math.round((hp / ev.hpMax) * 100)));
                    return (
                        <div className="tw-event">
                            <div className="tw-event-bar">
                                <div className="tw-event-name">{ev.emoji} {ev.name}</div>
                                <div className="tw-event-hpbar"><span style={{ width: `${pct}%` }} /></div>
                                <div className="tw-event-hptext">{Math.max(0, hp).toLocaleString()} / {ev.hpMax.toLocaleString()} HP · {ev.fighterCount} fighting</div>
                            </div>
                            <button type="button" className={`tw-event-target${evFlash ? " is-hit" : ""}`} onClick={attackEvent} aria-label={`Attack the ${ev.name}`}>
                                {art[EVENT_ART[ev.kind]]?.url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={art[EVENT_ART[ev.kind]].url} alt={ev.name} draggable={false} />
                                ) : <span className="tw-event-emoji">{ev.emoji}</span>}
                                {evFlash && !evFlash.defeated ? <span className="tw-event-hitfx">💥</span> : null}
                            </button>
                            {evFlash?.defeated ? (
                                <div className="tw-event-defeated">✅ Driven off! Gold paid to all who fought.</div>
                            ) : (
                                <button type="button" className="tw-event-attack" onClick={attackEvent}>⚔️ Attack! <small>you: {ev.myHits} hits</small></button>
                            )}
                        </div>
                    );
                })() : null}

                {/* Collective-upgrade overlays that span the plaza (don't scroll — they hang over the whole view) */}
                {unlocked.has("lights") ? <div className="tw-lights" aria-hidden="true" /> : null}
                {unlocked.has("banners") ? <div className="tw-banners" aria-hidden="true" /> : null}

                {/* edge hints — tap to walk that way (or just drag the street to look around) */}
                {cameraPx > 4 ? <button type="button" className="tw-edge tw-edge-l" onClick={(e) => { e.stopPropagation(); walkToWorld(clamp(me.x - 22, 1, 99), me.y); }} aria-label="Walk left">‹</button> : null}
                {cameraPx < maxScroll - 4 ? <button type="button" className="tw-edge tw-edge-r" onClick={(e) => { e.stopPropagation(); walkToWorld(clamp(me.x + 22, 1, 99), me.y); }} aria-label="Walk right">›</button> : null}
            </div>

            <section className="card tw-chatbar">
                <form onSubmit={sendChat} className="tw-chat-form">
                    <input value={chatText} onChange={onChatChange} placeholder="Say something to the plaza…" maxLength={200} aria-label="Town chat message" />
                    <button type="submit" className="tw-chat-send" disabled={!chatText.trim()} aria-label="Send">➤</button>
                </form>
                <div className="tw-emote-row">
                    <button type="button" onClick={wave} title="Wave">👋</button>
                    {["❤️", "😂", "🔥", "👍", "😮", "✨", "🐺"].map((em) => (
                        <button type="button" key={em} onClick={() => quickEmote(em)} aria-label={`Send ${em}`}>{em}</button>
                    ))}
                </div>
                {state?.owner && !state?.event ? (
                    <div className="tw-owner-spawn">
                        <span className="muted">Owner · silent test (no push):</span>
                        <button type="button" onClick={() => spawnEvent("bandit_raid")}>🗡️ Bandits</button>
                        <button type="button" onClick={() => spawnEvent("goblin_swarm")}>👺 Goblins</button>
                        <button type="button" onClick={() => spawnEvent("treasure_golem")}>💎 Golem</button>
                    </div>
                ) : null}
            </section>

            {/* Roster overlay — see who's doing what without walking */}
            {roster ? (
                <div className="tw-roster" onClick={() => setRoster(false)} role="presentation">
                    <div className="tw-roster-panel" onClick={(e) => e.stopPropagation()}>
                        <div className="tw-roster-head"><strong>👥 Around town — {otherList.length + 1}</strong><button type="button" onClick={() => setRoster(false)} aria-label="Close">✕</button></div>
                        <div className="tw-roster-list">
                            <div className="tw-roster-row is-you"><span className="tw-roster-name">You</span><span className="tw-roster-status">🐺 walking around</span></div>
                            {otherList.length === 0 ? <div className="muted" style={{ padding: "10px 4px", fontSize: "0.85rem" }}>Nobody else is around right now.</div> : null}
                            {otherList.map((p) => (
                                <div key={p.id} className="tw-roster-row">
                                    <span className="tw-roster-name">{p.name}</span>
                                    <span className="tw-roster-status">{p.status}</span>
                                    <button type="button" className="tw-roster-go" onClick={() => { walkToWorld(p.x + (p.x > me.x ? -3 : 3), p.y); setRoster(false); }}>Walk over →</button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : null}

            {/* Traveling Merchant wares */}
            {merchantOpen ? (
                <div className="tw-roster" onClick={() => setMerchantOpen(false)} role="presentation">
                    <div className="tw-roster-panel" onClick={(e) => e.stopPropagation()}>
                        <div className="tw-roster-head"><strong>🧳 Traveling Merchant</strong><button type="button" onClick={() => setMerchantOpen(false)} aria-label="Close">✕</button></div>
                        <p className="muted" style={{ margin: "-2px 2px 8px", fontSize: "0.85rem", fontStyle: "italic" }}>&ldquo;Rare goods, fair prices! Fancy a chest, friend?&rdquo;</p>
                        {merchantFlash ? <div className="tw-merchant-flash">{merchantFlash}</div> : null}
                        <div className="tw-wares">
                            {(state?.merchant || []).map((w) => {
                                const afford = (you?.gold || 0) >= w.price;
                                return (
                                    <button key={w.tier} type="button" className="tw-ware" disabled={!afford || merchantBusy} onClick={() => buyChest(w.tier)}>
                                        <span className="tw-ware-emoji" aria-hidden="true">{w.emoji}</span>
                                        <span className="tw-ware-label">{w.label}</span>
                                        <span className="tw-ware-price">🪙 {w.price.toLocaleString()}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <p className="muted" style={{ fontSize: "0.8rem", margin: "10px 2px 0" }}>🪙 You have {(you?.gold || 0).toLocaleString()} gold · chests open in your Gear.</p>
                    </div>
                </div>
            ) : null}

            {/* Tap-a-player action sheet */}
            {menuFor ? (
                <div className="tw-roster" onClick={() => setMenuFor(null)} role="presentation">
                    <div className="tw-roster-panel tw-menu-panel" onClick={(e) => e.stopPropagation()}>
                        <div className="tw-roster-head"><strong>{menuFor.friend ? "⭐ " : ""}{menuFor.name}</strong><button type="button" onClick={() => setMenuFor(null)} aria-label="Close">✕</button></div>
                        <div className="muted" style={{ fontSize: "0.82rem", margin: "-2px 2px 8px" }}>{menuFor.status}</div>
                        <div className="tw-menu-actions">
                            <button type="button" className="tw-menu-btn" onClick={() => { walkToWorld(menuFor.x + (menuFor.x > me.x ? -3 : 3), menuFor.y); setMenuFor(null); }}>🚶 Walk over</button>
                            <button type="button" className="tw-menu-btn" onClick={() => { quickEmote("👋"); setMenuFor(null); }}>👋 Wave</button>
                            {menuFor.alias ? <Link href={`/marketplace/u/${menuFor.alias}`} className="tw-menu-btn">👤 View profile</Link> : null}
                            {menuFor.alias ? <Link href={`/marketplace/trade/new?to=${encodeURIComponent(menuFor.alias)}`} className="tw-menu-btn">🤝 Trade</Link> : null}
                        </div>
                    </div>
                </div>
            ) : null}

            {/* Town Hall — what's happening + collective plaza fund */}
            {boardOpen ? (
                <div className="tw-roster" onClick={() => setBoardOpen(false)} role="presentation">
                    <div className="tw-roster-panel" onClick={(e) => e.stopPropagation()}>
                        <div className="tw-roster-head"><strong>🏛️ Town Hall</strong><button type="button" onClick={() => setBoardOpen(false)} aria-label="Close">✕</button></div>

                        <div className="tw-board-section">
                            <div className="tw-board-title">📣 What&apos;s happening</div>
                            <div className="tw-board-grid">
                                {[["/marketplace/boss", "⚔️", "Boss Fight"], ["/marketplace/sailing", "⛵", "Sailing"], ["/marketplace/farm", "🌾", "Farm"], ["/marketplace/store", "🛒", "Store"], ["/marketplace/track", "🎁", "Rewards"], ["/marketplace/bounties", "🎯", "Bounties"]].map(([href, ic, label]) => (
                                    <Link key={href} href={href} className="tw-board-tile"><span aria-hidden="true">{ic}</span>{label}</Link>
                                ))}
                            </div>
                            <p className="muted" style={{ fontSize: "0.8rem", margin: "8px 2px 0" }}>🟢 {state?.onlineCount ?? 1} online in the Den right now.</p>
                        </div>

                        {state?.upgrade ? (() => {
                            const up = state.upgrade;
                            const next = up.next;
                            const pct = next ? Math.min(100, Math.round((up.total / next.at) * 100)) : 100;
                            return (
                                <div className="tw-board-section">
                                    <div className="tw-board-title">🏗️ Fund the plaza</div>
                                    <div className="tw-fund-bar"><span style={{ width: `${pct}%` }} /></div>
                                    <p className="muted" style={{ fontSize: "0.82rem", margin: "6px 2px 2px" }}>
                                        🪙 {up.total.toLocaleString()} pooled{next ? ` · next: ${next.name} at ${next.at.toLocaleString()}` : " · every upgrade unlocked!"}
                                    </p>
                                    {next ? <p style={{ fontSize: "0.8rem", margin: "0 2px 8px", color: "#cbb9e0" }}>{next.blurb}</p> : null}
                                    <div className="tw-fund-btns">
                                        {[100, 500, 2500].map((amt) => (
                                            <button key={amt} type="button" disabled={contribBusy} onClick={() => contribute(amt)}>+{amt.toLocaleString()}</button>
                                        ))}
                                    </div>
                                    <div className="tw-fund-chips">
                                        {up.tiers.map((t) => (
                                            <span key={t.key} className={`tw-fund-chip${up.unlocked.includes(t.key) ? " is-on" : ""}`}>{up.unlocked.includes(t.key) ? "✅" : "🔒"} {t.name}</span>
                                        ))}
                                    </div>
                                </div>
                            );
                        })() : null}
                    </div>
                </div>
            ) : null}

            <style>{TOWN_CSS}</style>
        </div>
    );
}

const TOWN_CSS = `
.tw-scene { position: relative; width: 100%; height: min(66vh, 540px); border-radius: 18px; overflow: hidden; cursor: grab; touch-action: pan-y;
    box-shadow: inset 0 -30px 60px rgba(0,0,0,0.28), 0 10px 30px rgba(0,0,0,0.35); user-select: none; -webkit-user-select: none; background: #1a1330; }
.tw-scene:active { cursor: grabbing; }
.tw-world { position: absolute; top: 0; left: 0; height: 100%; will-change: transform; }
.tw-bg { position: absolute; inset: 0; display: flex; height: 100%; }
.tw-bg img { height: 100%; width: auto; display: block; flex: 0 0 auto; margin-right: -1px; }
.tw-bg img:nth-child(even) { transform: scaleX(-1); }
/* Layered parallax: far sky (slow) behind the world + a tiling cobble ground band inside it. */
.tw-far { position: absolute; top: 0; left: 0; height: 64%; display: flex; z-index: 0; }
.tw-far img { height: 100%; width: auto; display: block; flex: 0 0 auto; margin-right: -1px; }
.tw-far img:nth-child(even) { transform: scaleX(-1); }
/* Foreground plaza border wall — ground-locked, sits over the sky/street seam. */
.tw-fg { position: absolute; left: 0; bottom: 37.5%; height: 34%; display: flex; z-index: 90; pointer-events: none; }
.tw-fg img { height: 100%; width: auto; display: block; flex: 0 0 auto; margin-right: -1px; }
.tw-fg img:nth-child(even) { transform: scaleX(-1); }
.tw-cobble { position: absolute; left: 0; bottom: 0; height: 44%; display: flex; overflow: hidden; z-index: 1; box-shadow: inset 0 12px 26px rgba(0,0,0,0.35); }
.tw-cobble img { height: 100%; width: auto; display: block; flex: 0 0 auto; margin-right: -1px; }
.tw-cobble img:nth-child(even) { transform: scaleX(-1); }
/* Softer, taller shadow where the street meets the buildings behind it — dissolves the seam. */
.tw-cobble::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 68px; background: linear-gradient(180deg, rgba(26,17,40,0.9), rgba(26,17,40,0.28) 55%, transparent); pointer-events: none; }
/* CSS fallback backdrop (before art is generated) */
.tw-sky { position: absolute; inset: 0 0 34% 0; background: linear-gradient(180deg, #2a2140 0%, #3b2d55 42%, #6b4d7a 80%, #a56b6b 100%); }
.tw-ground { position: absolute; inset: 66% 0 0 0; background: radial-gradient(120% 80% at 50% -10%, rgba(255,190,120,0.12), transparent 60%), repeating-linear-gradient(90deg, #55402c 0 38px, #5c4630 38px 76px), linear-gradient(180deg, #6a5138, #4a381f); box-shadow: inset 0 8px 24px rgba(0,0,0,0.35); }

.tw-online { font-size: 0.72rem; font-weight: 800; color: #8fe39a; background: rgba(143,227,154,0.12); border: 1px solid rgba(143,227,154,0.35); border-radius: 999px; padding: 2px 9px; }
.tw-openchip { font-size: 0.7rem; font-weight: 800; border-radius: 999px; padding: 2px 9px; color: #e69a9a; background: rgba(224,67,63,0.1); border: 1px solid rgba(224,67,63,0.32); }
.tw-openchip.is-open { color: #8fe39a; background: rgba(143,227,154,0.12); border-color: rgba(143,227,154,0.35); }
.tw-roster-btn { font-size: 0.74rem; font-weight: 800; color: #ffe0b0; background: rgba(255,215,110,0.12); border: 1px solid rgba(255,215,110,0.4); border-radius: 999px; padding: 3px 11px; cursor: pointer; }

.tw-building { position: absolute; transform: translateX(-50%); bottom: auto; display: flex; flex-direction: column; align-items: center; gap: 3px; text-decoration: none; color: #ffe9b0; transition: transform .12s ease; }
.tw-building { transform: translate(-50%, -100%); }
.tw-building:hover { transform: translate(-50%, -100%) translateY(-4px); }
/* contact shadow so the building reads as sitting ON the cobblestones */
.tw-building::after { content: ""; position: absolute; bottom: -7px; left: 50%; transform: translateX(-50%); width: 72%; height: 18px; border-radius: 50%; background: radial-gradient(ellipse, rgba(0,0,0,0.5), transparent 72%); z-index: -1; pointer-events: none; }
.tw-building-art { display: block; height: 190px; width: auto; max-width: 260px; object-fit: contain; filter: drop-shadow(0 10px 14px rgba(0,0,0,0.5)); }
.tw-building-art[style*="scaleX"] { transform-origin: bottom center; }
.tw-building-card { display: grid; place-items: center; width: 96px; height: 120px; border-radius: 12px; background: linear-gradient(180deg, rgba(40,28,58,0.94), rgba(26,18,40,0.96)); border: 1px solid rgba(255,215,110,0.4); box-shadow: 0 10px 22px rgba(0,0,0,0.5); }
.tw-building-emoji { font-size: 46px; filter: drop-shadow(0 3px 4px rgba(0,0,0,0.5)); }
.tw-building-label { position: absolute; bottom: -22px; font-size: 10.5px; font-weight: 800; white-space: nowrap; background: rgba(20,14,30,0.75); border-radius: 6px; padding: 1px 7px; }

.tw-av { position: absolute; transform: translate(-50%, -100%); display: flex; flex-direction: column; align-items: center; cursor: pointer; }
.tw-sprite { position: relative; width: 60px; height: 60px; display: grid; place-items: center; }
.tw-sprite img { width: 60px; height: 60px; object-fit: contain; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.55)); }
.tw-sprite-fallback { font-size: 42px; }
.tw-pet { position: absolute; bottom: -2px; left: -20px; width: 32px; height: 32px; object-fit: contain; z-index: -1; filter: drop-shadow(0 3px 4px rgba(0,0,0,0.5)); }
.tw-sprite.is-walking { animation: twBob .5s ease-in-out infinite; transform-origin: bottom center; }
@keyframes twBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
.tw-av.is-you .tw-sprite::after { content: ""; position: absolute; bottom: -3px; left: 50%; transform: translateX(-50%); width: 42px; height: 9px; border-radius: 50%; background: radial-gradient(ellipse, rgba(255,215,110,0.55), transparent 70%); }
.tw-name { font-size: 10px; font-weight: 800; color: #f2ead9; background: rgba(20,14,30,0.72); border-radius: 6px; padding: 0 6px; white-space: nowrap; box-shadow: 0 1px 3px rgba(0,0,0,0.4); }
.tw-av.is-you .tw-name { color: #2a1a06; background: linear-gradient(180deg,#ffe488,#f3b23a); }
.tw-bubble { font-size: 10px; font-weight: 700; color: #eadfff; background: rgba(30,20,48,0.85); border: 1px solid rgba(255,255,255,0.12); border-radius: 999px; padding: 2px 8px; margin-bottom: 3px; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.4); }
.tw-wave { position: absolute; top: -6px; right: -8px; font-size: 20px; animation: twWave .5s ease-in-out infinite; }
@keyframes twWave { 0%,100% { transform: rotate(-16deg); } 50% { transform: rotate(16deg); } }

/* Chat speech bubbles + typing dots above avatars, and the composer bar below the scene. */
.tw-chat { background: #fff; color: #1a1206; font-size: 11px; font-weight: 700; white-space: normal; max-width: 180px; text-align: center; border: 1px solid rgba(0,0,0,0.12); box-shadow: 0 3px 10px rgba(0,0,0,0.45); }
.tw-av.is-you .tw-chat { background: linear-gradient(180deg,#ffe488,#f3b23a); color: #2a1a06; }
.tw-typing-bubble { display: inline-flex; gap: 3px; align-items: center; padding: 5px 9px; }
.tw-typing-bubble span { width: 5px; height: 5px; border-radius: 50%; background: #cbb9e0; animation: twType 1.2s infinite; }
.tw-typing-bubble span:nth-child(2) { animation-delay: .2s; }
.tw-typing-bubble span:nth-child(3) { animation-delay: .4s; }
@keyframes twType { 0%,60%,100% { opacity: .3; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-3px); } }
.tw-chatbar { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; }
.tw-chat-form { display: flex; gap: 8px; }
.tw-chat-form input { flex: 1 1 auto; min-width: 0; padding: 10px 14px; border-radius: 999px; border: 1px solid rgba(255,215,110,0.35); background: rgba(255,255,255,0.05); color: #f2ead9; font-size: 14px; }
.tw-chat-form input::placeholder { color: #9a8fb0; }
.tw-chat-send { flex: 0 0 auto; width: 44px; border-radius: 999px; border: none; background: linear-gradient(180deg,#ffd75e,#f3b23a); color: #1c130a; font-weight: 900; font-size: 15px; cursor: pointer; }
.tw-chat-send:disabled { opacity: .5; cursor: default; }
.tw-emote-row { display: flex; gap: 6px; flex-wrap: wrap; }
.tw-emote-row button { flex: 0 0 auto; width: 38px; height: 38px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.05); font-size: 19px; line-height: 1; cursor: pointer; }
.tw-emote-row button:active { transform: translateY(1px); }

.tw-edge { position: absolute; top: 50%; transform: translateY(-50%); width: 40px; height: 60px; display: grid; place-items: center; font-size: 30px;
    color: rgba(255,255,255,0.7); background: rgba(0,0,0,0.28); border: none; border-radius: 10px; cursor: pointer; z-index: 500; animation: twEdge 1.4s ease-in-out infinite; }
.tw-edge:hover { color: #fff; background: rgba(0,0,0,0.45); }
.tw-edge-l { left: 8px; } .tw-edge-r { right: 8px; }
@keyframes twEdge { 0%,100% { opacity: .5; } 50% { opacity: .9; } }

.tw-emote { padding: 8px 14px; border-radius: 10px; border: 1px solid rgba(255,215,110,0.5); background: linear-gradient(180deg, rgba(44,34,64,0.96), rgba(28,22,42,0.96)); color: #ffe9b0; font-weight: 800; font-size: 13px; cursor: pointer; }
.tw-emote:active { transform: translateY(1px); }

.tw-roster { position: fixed; inset: 0; z-index: 400; display: flex; align-items: flex-end; justify-content: center; background: rgba(6,4,12,0.6); backdrop-filter: blur(3px); }
.tw-roster-panel { width: 100%; max-width: 480px; max-height: 70dvh; overflow-y: auto; background: linear-gradient(180deg, #1c1436, #120c22); border: 1px solid rgba(255,215,110,0.3); border-radius: 18px 18px 0 0; padding: 14px 14px 20px; box-shadow: 0 -16px 44px rgba(0,0,0,0.6); animation: twUp .26s cubic-bezier(.2,1,.3,1) both; }
@keyframes twUp { from { transform: translateY(30px); opacity: .5; } to { transform: none; opacity: 1; } }
.tw-roster-head { display: flex; align-items: center; margin-bottom: 8px; color: #ffe0b0; }
.tw-roster-head button { margin-left: auto; background: rgba(255,255,255,0.08); border: none; color: #e8e2d6; width: 28px; height: 28px; border-radius: 999px; font-size: 15px; cursor: pointer; }
.tw-roster-row { display: flex; align-items: center; gap: 8px; padding: 9px 4px; border-top: 1px solid rgba(255,255,255,0.06); }
.tw-roster-row.is-you .tw-roster-name { color: #ffe488; }
.tw-roster-name { font-weight: 800; font-size: 0.9rem; color: #f0ede6; min-width: 90px; }
.tw-roster-status { font-size: 0.82rem; color: #cbb9e0; flex: 1; }
.tw-roster-go { font-size: 0.76rem; font-weight: 800; color: #2a1a06; background: linear-gradient(180deg,#ffe488,#f3b23a); border: none; border-radius: 8px; padding: 5px 10px; cursor: pointer; white-space: nowrap; }

/* Emote pop (emoji-only chat) + friend highlight ring under the sprite */
.tw-emote-pop { font-size: 30px; line-height: 1; margin-bottom: 2px; filter: drop-shadow(0 3px 5px rgba(0,0,0,0.5)); animation: twEmote 2.4s ease-out infinite; transform-origin: bottom center; }
@keyframes twEmote { 0% { transform: translateY(6px) scale(.4); opacity: 0; } 18% { transform: translateY(0) scale(1.15); opacity: 1; } 30% { transform: scale(1); } 85% { opacity: 1; } 100% { transform: translateY(-6px); opacity: .85; } }
.tw-av.is-friend .tw-sprite::before { content: ""; position: absolute; left: 0; right: 0; bottom: -4px; margin: 0 auto; width: 46px; height: 10px; border-radius: 50%; box-shadow: 0 0 0 2px rgba(120,200,255,0.8), 0 0 10px rgba(120,200,255,0.7); }

/* Collective-upgrade decorations */
.tw-npc { position: absolute; transform: translate(-50%, -100%); height: 92px; width: auto; z-index: 97; pointer-events: none; filter: drop-shadow(0 6px 8px rgba(0,0,0,0.55)); }
/* Interactive plaza NPCs (crier / merchant) — a tappable button with a sprite + a speech bubble. */
.tw-npc-btn { position: absolute; transform: translate(-50%, -100%); background: none; border: none; padding: 0; cursor: pointer; z-index: 99; display: flex; flex-direction: column; align-items: center; }
.tw-npc-btn img { height: 86px; width: auto; filter: drop-shadow(0 6px 8px rgba(0,0,0,0.55)); }
.tw-npc-emoji { font-size: 50px; line-height: 1; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.5)); }
.tw-npc-btn:hover img, .tw-npc-btn:hover .tw-npc-emoji { filter: drop-shadow(0 0 8px rgba(255,215,110,0.8)); }
.tw-npc-bubble { max-width: 155px; font-size: 10px; font-weight: 800; line-height: 1.2; text-align: center; color: #241206; background: linear-gradient(180deg,#fff,#ffe9b0); border-radius: 9px; padding: 4px 9px; margin-bottom: 5px; box-shadow: 0 2px 6px rgba(0,0,0,0.45); }
.tw-merchant-flash { text-align: center; font-weight: 800; color: #ffe0b0; background: rgba(255,215,110,0.12); border: 1px solid rgba(255,215,110,0.35); border-radius: 10px; padding: 8px 12px; margin-bottom: 10px; }
.tw-wares { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; }
.tw-ware { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 12px 6px; border-radius: 14px; border: 1px solid rgba(255,215,110,0.3); background: rgba(255,255,255,0.05); color: #f2ead9; cursor: pointer; }
.tw-ware:hover:not(:disabled) { border-color: rgba(255,215,110,0.6); }
.tw-ware:disabled { opacity: .45; cursor: default; }
.tw-ware-emoji { font-size: 30px; line-height: 1; }
.tw-ware-label { font-size: 0.74rem; font-weight: 800; text-align: center; }
.tw-ware-price { font-size: 0.72rem; color: #ffd75e; font-weight: 800; }
.tw-deco { position: absolute; transform: translate(-50%, -100%); pointer-events: none; z-index: 96; line-height: 1; filter: drop-shadow(0 6px 8px rgba(0,0,0,0.5)); }
.tw-deco-fountain { font-size: 54px; }
.tw-deco-statue { font-size: 46px; }
.tw-deco-garden { font-size: 24px; transform: translate(-50%, -30%); }
.tw-lights { position: absolute; top: 6px; left: 0; right: 0; height: 16px; z-index: 40; pointer-events: none; background-image: radial-gradient(circle, #ffe488 2.5px, transparent 3px); background-size: 26px 16px; filter: drop-shadow(0 0 4px rgba(255,215,110,0.85)); opacity: .92; }
.tw-banners { position: absolute; top: 24px; left: 0; right: 0; height: 15px; z-index: 40; pointer-events: none;
    background: repeating-linear-gradient(90deg,#e0433f 0 18px,#47b866 18px 36px,#3a86ff 36px 54px,#ffd75e 54px 72px);
    -webkit-mask: repeating-linear-gradient(90deg,#000 0 9px, transparent 12px 18px); mask: repeating-linear-gradient(90deg,#000 0 9px, transparent 12px 18px); opacity: .85; }

/* Tap-a-player menu + Town Hall panel */
.tw-menu-panel { max-width: 360px; }
.tw-menu-actions { display: flex; flex-direction: column; gap: 8px; }
.tw-menu-btn { display: block; text-align: left; text-decoration: none; padding: 11px 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #f2ead9; font-weight: 700; font-size: 0.9rem; cursor: pointer; }
.tw-menu-btn:hover { border-color: rgba(255,215,110,0.5); }
.tw-board-section { margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 12px; }
.tw-board-section:first-of-type { border-top: none; padding-top: 0; }
.tw-board-title { font-size: 0.8rem; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; color: #9fb0c0; margin-bottom: 8px; }
.tw-board-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.tw-board-tile { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 12px 4px; border-radius: 12px; text-decoration: none; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); color: #eef2f7; font-size: 0.75rem; font-weight: 700; }
.tw-board-tile span { font-size: 22px; }
.tw-board-tile:hover { border-color: rgba(255,215,110,0.5); }
.tw-fund-bar { height: 12px; border-radius: 999px; background: rgba(255,255,255,0.08); overflow: hidden; }
.tw-fund-bar span { display: block; height: 100%; background: linear-gradient(90deg,#ffd75e,#f3b23a); border-radius: 999px; transition: width .4s ease; }
.tw-fund-btns { display: flex; gap: 8px; margin: 8px 0; }
.tw-fund-btns button { flex: 1 1 auto; padding: 9px 4px; border-radius: 10px; border: none; background: linear-gradient(180deg,#ffd75e,#f3b23a); color: #1c130a; font-weight: 800; font-size: 0.85rem; cursor: pointer; }
.tw-fund-btns button:disabled { opacity: .5; cursor: default; }
.tw-fund-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.tw-fund-chip { font-size: 0.72rem; padding: 3px 9px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.12); color: #9a8fb0; }
.tw-fund-chip.is-on { color: #8fe39a; border-color: rgba(143,227,154,0.4); background: rgba(143,227,154,0.1); }

/* Live town event (raid) overlay */
.tw-event { position: absolute; inset: 0; z-index: 500; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding-top: 10px; pointer-events: none; }
.tw-event-bar { width: min(88%, 420px); background: rgba(20,10,14,0.82); border: 1px solid rgba(224,67,63,0.55); border-radius: 12px; padding: 7px 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.5); }
.tw-event-name { font-size: 0.85rem; font-weight: 900; color: #ffd0c8; text-align: center; }
.tw-event-hpbar { height: 12px; margin: 5px 0 3px; border-radius: 999px; background: rgba(255,255,255,0.1); overflow: hidden; }
.tw-event-hpbar span { display: block; height: 100%; background: linear-gradient(90deg,#e0433f,#ff7a3c); border-radius: 999px; transition: width .2s ease; }
.tw-event-hptext { font-size: 0.68rem; color: #e8c9c4; text-align: center; }
.tw-event-target { pointer-events: auto; margin-top: auto; margin-bottom: 6px; background: none; border: none; cursor: pointer; position: relative; padding: 0; }
.tw-event-target img { height: 150px; width: auto; filter: drop-shadow(0 8px 12px rgba(0,0,0,0.6)); }
.tw-event-emoji { font-size: 90px; filter: drop-shadow(0 8px 12px rgba(0,0,0,0.6)); }
.tw-event-target.is-hit { animation: twHit .2s ease; }
@keyframes twHit { 0% { transform: translateX(0); } 25% { transform: translateX(-4px) scale(1.02); } 75% { transform: translateX(4px); } 100% { transform: translateX(0); } }
.tw-event-hitfx { position: absolute; top: 18%; left: 50%; transform: translateX(-50%); font-size: 34px; animation: twHitFx .35s ease-out; pointer-events: none; }
@keyframes twHitFx { 0% { opacity: 0; transform: translate(-50%, 6px) scale(.6); } 40% { opacity: 1; transform: translate(-50%, -6px) scale(1.2); } 100% { opacity: 0; transform: translate(-50%, -18px) scale(1); } }
.tw-event-attack { pointer-events: auto; margin-bottom: 14px; padding: 11px 26px; border-radius: 999px; border: none; cursor: pointer; font-weight: 900; font-size: 15px; color: #2a0d0a; background: linear-gradient(180deg,#ff9a3c,#e0433f); box-shadow: 0 4px 0 #a12723, 0 6px 16px rgba(0,0,0,0.5); }
.tw-event-attack:active { transform: translateY(2px); box-shadow: 0 2px 0 #a12723; }
.tw-event-attack small { font-weight: 700; opacity: .85; }
.tw-event-defeated { pointer-events: none; margin-bottom: 20px; padding: 8px 16px; border-radius: 999px; background: rgba(20,40,24,0.9); border: 1px solid rgba(143,227,154,0.5); color: #b8f0c2; font-weight: 800; font-size: 0.85rem; }
.tw-owner-spawn { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: 4px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,0.12); }
.tw-owner-spawn .muted { font-size: 0.72rem; }
.tw-owner-spawn button { flex: 0 0 auto; padding: 5px 10px; border-radius: 8px; border: 1px solid rgba(224,67,63,0.4); background: rgba(224,67,63,0.12); color: #ffcabf; font-size: 0.76rem; font-weight: 700; cursor: pointer; }
`;
