"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

function Avatar({ a, isYou, onTap }) {
    const dur = clamp((a.moveDist || 0) * 0.05, 0.4, 2.6);
    return (
        <div
            className={`tw-av${isYou ? " is-you" : ""}`}
            style={{ left: `${a.x}%`, top: `${a.y}%`, zIndex: 300 + Math.round(a.y) + (isYou ? 100 : 0), transition: `left ${dur}s linear, top ${dur}s linear` }}
            onClick={onTap ? (e) => { e.stopPropagation(); onTap(); } : undefined}
        >
            <div className="tw-bubble">{a.status || (isYou ? "🐺 you" : "🐺 around town")}</div>
            <div className={`tw-sprite${a.moving ? " is-walking" : ""}`}>
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
    const sceneRef = useRef(null);
    const moveTimer = useRef(null);
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
        if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 7) d.moved = true;
        if (d.moved) { d.lastX = e.clientX; setPanExtra((p) => clamp(followCam + p - dx, 0, maxScroll) - followCam); }
    }, [followCam, maxScroll]);
    const onPointerUp = useCallback((e) => {
        const d = drag.current; d.down = false;
        if (d.moved) return; // was a pan, not a tap
        if (e.target.closest(".tw-building") || e.target.closest(".tw-av")) return; // doors/avatars handle themselves
        const rect = sceneRef.current?.getBoundingClientRect(); if (!rect) return;
        const worldX = ((e.clientX - rect.left + cameraPx) / WORLD_W) * 100;
        const worldY = ((e.clientY - rect.top) / rect.height) * 100;
        walkToWorld(worldX, worldY);
    }, [cameraPx, followCam, maxScroll, walkToWorld]);

    const wave = useCallback(() => { setMe((m) => ({ ...m, wave: true })); setTimeout(() => setMe((m) => ({ ...m, wave: false })), 1600); }, []);

    const you = state?.you;
    const art = state?.art || {};
    const layered = Boolean(art.sky?.url && art.cobble?.url); // parallax sky + tiling cobble (reliable) vs legacy wide bg
    const buildings = state?.buildings || [];
    const otherList = useMemo(() => Object.values(others), [others]);
    const camDur = clamp((me.moveDist || 0) * 0.05, 0.4, 2.6);

    if (state && state.owner === false) {
        return <section className="card"><p className="muted" style={{ margin: 0 }}>🏘️ The Wolf Den Town is still being built — check back soon.</p></section>;
    }

    return (
        <div className="stack reveal">
            <section className="card" style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <h1 style={{ margin: 0, fontSize: "1.25rem" }}>🏘️ Wolf Den Town</h1>
                    <span className="tw-online">🟢 {state?.onlineCount ?? 1} around</span>
                    <button type="button" className="tw-roster-btn" onClick={() => setRoster(true)}>👥 Who&apos;s around</button>
                    <span style={{ marginLeft: "auto", fontSize: "0.72rem", color: "#c58b3a", fontWeight: 800 }}>OWNER PREVIEW</span>
                </div>
                <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.82rem" }}>Tap the street to walk. Tap a building to head there. Real members who are online show up here.</p>
            </section>

            <div ref={sceneRef} className="tw-scene" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { drag.current.down = false; }} role="presentation">
                {/* Far parallax SKY layer (scrolls slower). Generic + mirror-tiled → seamless. */}
                {layered ? (
                    <div className="tw-far" aria-hidden="true" style={{ transform: `translateX(${-cameraPx * 0.35}px)`, transition: `transform ${camDur}s linear` }}>
                        {[0, 1, 2, 3, 4].map((k) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={k} src={art.sky.url} alt="" draggable={false} />
                        ))}
                    </div>
                ) : (!art.background ? <><div className="tw-sky" aria-hidden="true" /><div className="tw-ground" aria-hidden="true" /></> : null)}
                {/* The wide world that scrolls under a fixed camera */}
                <div className="tw-world" style={{ width: `${WORLD_W}px`, transform: `translateX(${-cameraPx}px)`, transition: `transform ${camDur}s linear` }}>
                    {/* Ground: tiling cobblestone band (layered), else the legacy wide background image */}
                    {layered ? (
                        <div className="tw-cobble" aria-hidden="true">
                            {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => (
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
                    {/* Buildings */}
                    {buildings.map((b) => {
                        const bart = art[b.id];
                        return (
                            <Link key={b.id} href={b.href} className={`tw-building${bart ? " has-art" : ""}`} style={{ left: `${b.x}%`, top: `${GROUND}%`, zIndex: 100 + Math.round(b.x) }} onClick={(e) => e.stopPropagation()}>
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
                    {/* Other players */}
                    {otherList.map((p) => <Avatar key={p.id} a={p} isYou={false} onTap={() => walkToWorld(p.x + (p.x > me.x ? -3 : 3), p.y)} />)}
                    {/* You */}
                    {you ? <Avatar a={{ ...me, name: "You", sprite: you.sprite, flip: you.flip, status: "🐺 you" }} isYou /> : null}
                </div>

                {/* edge hints — tap to walk that way (or just drag the street to look around) */}
                {cameraPx > 4 ? <button type="button" className="tw-edge tw-edge-l" onClick={(e) => { e.stopPropagation(); walkToWorld(clamp(me.x - 22, 1, 99), me.y); }} aria-label="Walk left">‹</button> : null}
                {cameraPx < maxScroll - 4 ? <button type="button" className="tw-edge tw-edge-r" onClick={(e) => { e.stopPropagation(); walkToWorld(clamp(me.x + 22, 1, 99), me.y); }} aria-label="Walk right">›</button> : null}
            </div>

            <section className="card" style={{ padding: "10px 12px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button type="button" className="tw-emote" onClick={wave}>👋 Wave</button>
                <span className="muted" style={{ fontSize: "0.78rem" }}>Members render where they were last active; once the town ships they&apos;ll walk it live with you.</span>
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

            <style>{TOWN_CSS}</style>
        </div>
    );
}

const TOWN_CSS = `
.tw-scene { position: relative; width: 100%; height: min(66vh, 540px); border-radius: 18px; overflow: hidden; cursor: grab; touch-action: none;
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
.tw-cobble { position: absolute; left: 0; bottom: 0; height: 44%; display: flex; overflow: hidden; z-index: 1; box-shadow: inset 0 12px 26px rgba(0,0,0,0.35); }
.tw-cobble img { height: 100%; width: auto; display: block; flex: 0 0 auto; margin-right: -1px; }
.tw-cobble img:nth-child(even) { transform: scaleX(-1); }
.tw-cobble::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 30px; background: linear-gradient(180deg, rgba(30,20,45,0.5), transparent); pointer-events: none; }
/* CSS fallback backdrop (before art is generated) */
.tw-sky { position: absolute; inset: 0 0 34% 0; background: linear-gradient(180deg, #2a2140 0%, #3b2d55 42%, #6b4d7a 80%, #a56b6b 100%); }
.tw-ground { position: absolute; inset: 66% 0 0 0; background: radial-gradient(120% 80% at 50% -10%, rgba(255,190,120,0.12), transparent 60%), repeating-linear-gradient(90deg, #55402c 0 38px, #5c4630 38px 76px), linear-gradient(180deg, #6a5138, #4a381f); box-shadow: inset 0 8px 24px rgba(0,0,0,0.35); }

.tw-online { font-size: 0.72rem; font-weight: 800; color: #8fe39a; background: rgba(143,227,154,0.12); border: 1px solid rgba(143,227,154,0.35); border-radius: 999px; padding: 2px 9px; }
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
.tw-sprite.is-walking { animation: twBob .5s ease-in-out infinite; transform-origin: bottom center; }
@keyframes twBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
.tw-av.is-you .tw-sprite::after { content: ""; position: absolute; bottom: -3px; left: 50%; transform: translateX(-50%); width: 42px; height: 9px; border-radius: 50%; background: radial-gradient(ellipse, rgba(255,215,110,0.55), transparent 70%); }
.tw-name { font-size: 10px; font-weight: 800; color: #f2ead9; background: rgba(20,14,30,0.72); border-radius: 6px; padding: 0 6px; white-space: nowrap; box-shadow: 0 1px 3px rgba(0,0,0,0.4); }
.tw-av.is-you .tw-name { color: #2a1a06; background: linear-gradient(180deg,#ffe488,#f3b23a); }
.tw-bubble { font-size: 10px; font-weight: 700; color: #eadfff; background: rgba(30,20,48,0.85); border: 1px solid rgba(255,255,255,0.12); border-radius: 999px; padding: 2px 8px; margin-bottom: 3px; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.4); }
.tw-wave { position: absolute; top: -6px; right: -8px; font-size: 20px; animation: twWave .5s ease-in-out infinite; }
@keyframes twWave { 0%,100% { transform: rotate(-16deg); } 50% { transform: rotate(16deg); } }

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
`;
