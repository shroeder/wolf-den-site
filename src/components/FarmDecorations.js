"use client";

import { useRef, useState } from "react";

import { AskForCopy, CreationShareHub } from "@/components/CreationShare";

const RARITY_RING = { common: "#9aa0a6", rare: "#4aa3d4", epic: "#a855f7", legendary: "#f59e0b", mythic: "#ff5cc8" };

// ── Decorate DOCK: a bottom tray you drag decorations OUT of, straight onto the farm scene (which stays fully
// visible above it). Drag a chip up, release over the field → it drops there. Also carries the placed-count,
// a Shop button, and Done. This is the "grab from a drawer while watching the farm" flow.
export function DecoDock({ deco, fieldRef, busy, editing, onPlaceAt, onInspect, onOpenCreator, onDone, spriteBrightness = 1, onSpriteBrightness }) {
    const [bright, setBright] = useState(Number(spriteBrightness) || 1);
    const { catalog = [], placedTotal = 0, placedCap = 500 } = deco || {};
    const atCap = placedTotal >= placedCap;
    const ownedItems = catalog.filter((d) => d.owned);
    const lockedItems = catalog.filter((d) => !d.owned);
    // Imperative ghost: we set the sprite ONCE on drag-start (one render), then move the ghost by writing
    // .style directly on every pointermove — no per-move React re-render, so it tracks the finger 1:1.
    const ghostRef = useRef(null);
    const dragRef = useRef(null); // { decoId, pointerId, el }
    const [ghost, setGhost] = useState(null); // { emoji, spriteUrl, x0, y0 } — initial paint only

    // Robust scroll-aware field geometry: the VISIBLE viewport is the scroller (fieldRef's parent), and the
    // field's true left edge = viewport-left minus how far it's scrolled. Using offsetWidth + scrollLeft avoids
    // getBoundingClientRect quirks on a wide horizontally-scrolled element (the cause of "can't place when
    // scrolled right").
    const fieldMetrics = () => {
        const field = fieldRef?.current;
        const scroller = field?.parentElement;
        if (!field || !scroller) return null;
        const sc = scroller.getBoundingClientRect(); // the visible farm viewport
        return { sc, left: sc.left - (scroller.scrollLeft || 0), top: sc.top, width: field.offsetWidth || sc.width, height: sc.height };
    };
    // Droppable = anywhere over the VISIBLE farm viewport (you can only drop where you can see).
    const insideField = (cx, cy) => {
        const m = fieldMetrics();
        return m ? cx >= m.sc.left && cx <= m.sc.right && cy >= m.sc.top && cy <= m.sc.bottom : false;
    };
    const positionGhost = (cx, cy) => {
        const g = ghostRef.current;
        if (!g) return;
        g.style.left = `${cx}px`;
        g.style.top = `${cy}px`;
        g.style.filter = insideField(cx, cy) ? "drop-shadow(0 0 9px #7ed57e)" : "none";
    };
    const startDrag = (e, o) => {
        if (atCap || busy) return;
        // Don't capture yet — first move decides: a sideways swipe SCROLLS the tray, an upward pull PLACES.
        dragRef.current = { o, pointerId: e.pointerId, el: e.currentTarget, x0: e.clientX, y0: e.clientY, active: false };
    };
    const onMove = (e) => {
        const d = dragRef.current;
        if (!d || e.pointerId !== d.pointerId) return;
        if (!d.active) {
            const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 6) { dragRef.current = null; return; } // sideways → let the tray scroll
            if (dy < -8 && Math.abs(dy) >= Math.abs(dx)) { // pulled UP toward the farm → begin placing
                d.active = true;
                try { d.el.setPointerCapture(d.pointerId); } catch { /* older browsers */ }
                setGhost({ emoji: d.o.emoji, spriteUrl: d.o.spriteUrl, x0: d.x0, y0: d.y0 });
            } else return; // still ambiguous / tiny move
        }
        e.preventDefault();
        positionGhost(e.clientX, e.clientY);
    };
    const endDrag = (e) => {
        const d = dragRef.current;
        if (!d || e.pointerId !== d.pointerId) return;
        if (d.active) {
            try { d.el?.releasePointerCapture?.(e.pointerId); } catch { /* noop */ }
            const m = fieldMetrics();
            if (m && insideField(e.clientX, e.clientY)) {
                const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
                // % of the FULL field, scroll-aware, so it drops where you released wherever you're scrolled.
                // Near-full range so decorations can be placed across the WHOLE farm (a hair of margin keeps a
                // bottom-anchored sprite from clipping off an edge).
                const xPct = clamp(((e.clientX - m.left) / m.width) * 100, 1, 99);
                const yPct = clamp(((e.clientY - m.top) / m.height) * 100, 2, 100);
                onPlaceAt(d.o.id, xPct, yPct);
            }
        } else {
            // Never became an upward drag and wasn't a sideways scroll → a tap → inspect this owned decoration.
            onInspect?.(d.o);
        }
        dragRef.current = null;
        setGhost(null);
    };

    return (
        <>
            {/* drag ghost — base sits at the finger (matches the placed anchor), glows green over a droppable spot */}
            {ghost ? (
                <div ref={ghostRef} style={{ position: "fixed", left: ghost.x0, top: ghost.y0, transform: "translate(-50%, -100%)", zIndex: 10060, pointerEvents: "none", opacity: 0.92 }}>
                    {ghost.spriteUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={ghost.spriteUrl} alt="" width={58} height={58} style={{ width: 58, height: 58, objectFit: "contain" }} />
                    ) : <span style={{ fontSize: 46 }}>{ghost.emoji}</span>}
                </div>
            ) : null}

            <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 10040, background: "rgba(18,24,16,0.98)", borderTop: "2px solid #7ed57e", boxShadow: "0 -10px 30px rgba(0,0,0,0.55)", paddingBottom: "max(6px, env(safe-area-inset-bottom))" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px 2px" }}>
                    <strong style={{ fontSize: 14 }}>🪴 Decorating</strong>
                    <span style={{ fontSize: 12, fontWeight: 800, color: atCap ? "#ff9a9a" : "#a7e6a7" }}>{placedTotal}/{placedCap}</span>
                    <span style={{ marginLeft: "auto" }} />
                    {onOpenCreator ? (
                        <button type="button" onClick={onOpenCreator} title="Design your own decoration with AI" style={{ padding: "6px 12px", borderRadius: 9, border: "1px solid rgba(201,162,255,0.6)", background: "linear-gradient(180deg,#c9a2ff,#a56be8)", color: "#2a0f45", fontWeight: 900, fontSize: 12.5, cursor: "pointer", WebkitTapHighlightColor: "transparent", boxShadow: "0 2px 10px rgba(165,107,232,0.4)" }}>🎨 Make your own</button>
                    ) : null}
                    <button type="button" onClick={onDone} style={{ padding: "6px 16px", borderRadius: 9, border: "none", background: "linear-gradient(180deg,#8fe39a,#4bbf6a)", color: "#06311f", fontWeight: 900, fontSize: 12.5, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>✓ Done</button>
                </div>
                {onSpriteBrightness ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 12px 4px" }}>
                        <span style={{ fontSize: 11.5, fontWeight: 800, color: "#e6d7c2" }} title="Global brightness for all your farm sprites (a real filter, not an overlay)">🔆 All sprites</span>
                        <input type="range" min="0.3" max="2.2" step="0.05" value={bright} onChange={(e) => setBright(Number(e.target.value))} onPointerUp={() => onSpriteBrightness(bright)} onKeyUp={() => onSpriteBrightness(bright)} style={{ flex: 1, accentColor: "#ffd27a" }} />
                        <span style={{ fontSize: 11, fontWeight: 800, color: "#ffd27a", width: 38, textAlign: "right" }}>{Math.round(bright * 100)}%</span>
                    </div>
                ) : null}
                <div style={{ fontSize: 10.5, color: "#9fbf9f", padding: "0 12px 6px" }}>
                    {atCap ? "Farm full (500 placed) — tap a placed piece to pick it up."
                        : editing ? "Pull a decoration UP onto the farm to place it; swipe the tray sideways to browse. Drag placed pieces to move; tap for details."
                            : "🔒 Locked — tap the lock (top-right) to move pieces. Pull one up from the tray to place; swipe sideways to browse."}
                </div>
                <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "2px 12px 10px", WebkitOverflowScrolling: "touch" }}>
                    {ownedItems.map((o) => (
                        <div
                            key={o.id}
                            onPointerDown={(e) => startDrag(e, o)}
                            onPointerMove={onMove}
                            onPointerUp={endDrag}
                            onPointerCancel={() => { dragRef.current = null; setGhost(null); }}
                            title={`Drag ${o.name} up onto your farm — swipe sideways to browse`}
                            style={{ flex: "0 0 auto", width: 66, textAlign: "center", touchAction: "pan-x", cursor: atCap ? "default" : "grab", opacity: atCap ? 0.5 : 1, userSelect: "none", WebkitTapHighlightColor: "transparent" }}
                        >
                            <span style={{ display: "grid", placeItems: "center", width: 58, height: 58, margin: "0 auto", borderRadius: 12, background: "rgba(255,255,255,0.05)", border: `2px solid ${(RARITY_RING[o.rarity] || "#555")}88` }}>
                                {o.spriteUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={o.spriteUrl} alt="" width={48} height={48} style={{ width: 48, height: 48, objectFit: "contain", pointerEvents: "none" }} />
                                ) : <span style={{ fontSize: 30, pointerEvents: "none" }}>{o.emoji}</span>}
                            </span>
                            <span style={{ display: "block", fontSize: 10, marginTop: 2, color: "#dfeede", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.name}</span>
                            {o.placed ? <span style={{ display: "block", fontSize: 9, color: "#a7e6a7" }}>{o.placed} out</span> : null}
                        </div>
                    ))}
                    {ownedItems.length && lockedItems.length ? <div style={{ flex: "0 0 auto", width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.14)", margin: "4px 2px" }} /> : null}
                    {lockedItems.map((o) => (
                        <button
                            key={o.id}
                            type="button"
                            onClick={() => onInspect(o)}
                            title={`${o.name} — tap for details`}
                            style={{ flex: "0 0 auto", width: 66, textAlign: "center", background: "none", border: "none", padding: 0, cursor: "pointer", userSelect: "none", WebkitTapHighlightColor: "transparent" }}
                        >
                            <span style={{ position: "relative", display: "grid", placeItems: "center", width: 58, height: 58, margin: "0 auto", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: `1px dashed ${(RARITY_RING[o.rarity] || "#555")}55` }}>
                                {o.spriteUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={o.spriteUrl} alt="" width={46} height={46} style={{ width: 46, height: 46, objectFit: "contain", filter: "grayscale(0.7) brightness(0.7)" }} />
                                ) : <span style={{ fontSize: 28, filter: "grayscale(1) brightness(0.7)" }}>{o.emoji}</span>}
                                <span style={{ position: "absolute", top: 2, right: 2, fontSize: 11 }}>🔒</span>
                            </span>
                            <span style={{ display: "block", fontSize: 10, marginTop: 2, color: "#9aa4a0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.name}</span>
                            <span style={{ display: "block", fontSize: 9, fontWeight: 800, color: o.buyable ? "#ffd75e" : "#8fb3d6" }}>{o.buyable ? `🪙 ${o.price.toLocaleString()}` : (o.source === "spin" ? "🎡 wheel" : o.source === "glint" ? "✨ glint" : "🏆 track")}</span>
                        </button>
                    ))}
                    {onOpenCreator ? (
                        <button type="button" onClick={onOpenCreator} title="Design your own decoration" style={{ flex: "0 0 auto", width: 66, textAlign: "center", background: "none", border: "none", padding: 0, cursor: "pointer" , WebkitTapHighlightColor: "transparent" }}>
                            <span style={{ display: "grid", placeItems: "center", width: 58, height: 58, margin: "0 auto", borderRadius: 12, background: "radial-gradient(120% 120% at 50% 0%, rgba(201,162,255,0.25), rgba(255,255,255,0.03))", border: "1px dashed rgba(201,162,255,0.6)", fontSize: 26 }}>🎨</span>
                            <span style={{ display: "block", fontSize: 10, marginTop: 2, color: "#d9b8ff", fontWeight: 700 }}>Make your own</span>
                        </button>
                    ) : null}
                </div>
            </div>
        </>
    );
}

// ── Scene layer: renders a member's PLACED decorations inside the pasture field. TAP any decoration to open its
// inspect modal (details/effects + pick up). When "editing" (decorate mode), you can also DRAG to reposition —
// a short movement is treated as a tap (inspect), a longer one as a drag (move). No always-visible ✕.
export function DecoLayer({ placements = [], editing = false, fieldRef, onMove, onInspect, tod = "day", spriteBrightness = 1 }) {
    const [drag, setDrag] = useState(null); // { id, x, y } live position during an actual drag
    const gr = useRef({}); // gesture: { id, pointerId, sx, sy, moved, x, y, el }
    const suppressClick = useRef(false); // set after a real drag so the trailing click doesn't also inspect
    const start = (e, p) => {
        if (!editing) return;
        suppressClick.current = false; // fresh gesture — assume it's a tap until it moves
        e.stopPropagation();
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
        gr.current = { id: p.id, pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false, x: p.x, y: p.y, el: e.currentTarget };
    };
    const move = (e) => {
        const g = gr.current;
        if (!g.id || e.pointerId !== g.pointerId || !fieldRef?.current) return;
        if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 7) return; // still a tap until it moves enough
        g.moved = true;
        e.preventDefault();
        // Scroll-aware geometry (same as the tray drop) so moving a placed piece works wherever you're scrolled.
        const field = fieldRef.current;
        const scroller = field.parentElement;
        const sc = scroller ? scroller.getBoundingClientRect() : field.getBoundingClientRect();
        const left = sc.left - (scroller?.scrollLeft || 0);
        const width = field.offsetWidth || sc.width;
        g.x = Math.max(1, Math.min(99, ((e.clientX - left) / width) * 100));
        g.y = Math.max(2, Math.min(100, ((e.clientY - sc.top) / sc.height) * 100));
        setDrag({ id: g.id, x: g.x, y: g.y });
    };
    const end = (e) => {
        const g = gr.current;
        if (!g.id || e.pointerId !== g.pointerId) return;
        try { g.el?.releasePointerCapture?.(e.pointerId); } catch { /* noop */ }
        if (g.moved) { suppressClick.current = true; onMove?.(g.id, g.x, g.y); } // a drag — swallow the trailing click
        gr.current = {};
        setDrag(null);
    };
    // Inspect on a real click/tap. Works in BOTH modes; in move mode a click that followed a drag is suppressed.
    const clickInspect = (p) => {
        if (suppressClick.current) { suppressClick.current = false; return; }
        onInspect?.(p);
    };
    return (
        <>
            {placements.map((p) => {
                const live = drag && drag.id === p.id ? { ...p, ...drag } : p;
                const size = 66;
                return (
                    <div
                        key={p.id}
                        onPointerDown={editing ? (e) => start(e, p) : undefined}
                        onPointerMove={editing ? move : undefined}
                        onPointerUp={editing ? end : undefined}
                        onPointerCancel={editing ? () => { gr.current = {}; setDrag(null); } : undefined}
                        onClick={() => clickInspect(p)}
                        style={{
                            position: "absolute", left: `${live.x}%`, top: `${live.y}%`, transform: `translate(-50%, -100%) rotate(${live.rot || 0}deg) scale(${live.scale || 1})`,
                            zIndex: Math.round(live.y), cursor: "pointer", touchAction: editing ? "none" : "auto",
                            transition: drag && drag.id === p.id ? "none" : "left .15s ease, top .15s ease",
                            WebkitTapHighlightColor: "transparent", WebkitTouchCallout: "none", userSelect: "none", outline: "none",
                        }}
                        title={editing ? `${p.name} — drag to move, click to inspect / remove` : `${p.name} — tap for details`}
                    >
                        {/* Real ADDITIVE light (screen blend) — brightens locally, never a wash overlay. A player
                            light is always on; a decoration's intrinsic glow shows only at dusk/night. */}
                        {p.light?.on && (p.light.always || tod !== "day") ? (
                            <span aria-hidden="true" style={{
                                // The glow lives INSIDE the scale()'d container, so divide its diameter back out — otherwise a
                                // scaled-up piece balloons the screen-blend circle and washes the whole view.
                                position: "absolute", left: "50%", top: `${size * 0.42}px`, width: (p.light.radius * 2) / (live.scale || 1), height: (p.light.radius * 2) / (live.scale || 1),
                                transform: "translate(-50%, -50%)", borderRadius: "50%", pointerEvents: "none", zIndex: 0, mixBlendMode: "screen",
                                background: `radial-gradient(circle, rgba(${p.light.rgb},${(p.light.intensity ?? 0.7)}) 0%, rgba(${p.light.rgb},${(p.light.intensity ?? 0.7) * 0.45}) 32%, rgba(${p.light.rgb},0) 68%)`,
                                animation: p.light.flicker ? "decoFlicker 2.6s ease-in-out infinite" : "decoGlow 4.5s ease-in-out infinite",
                            }} />
                        ) : null}
                        {p.spriteUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.spriteUrl} alt={p.name} width={size} height={size} draggable={false} style={{ position: "relative", zIndex: 1, width: size, height: size, objectFit: "contain", transform: p.flip ? "scaleX(-1)" : "none", filter: `drop-shadow(0 3px 4px rgba(0,0,0,0.4)) brightness(${(p.brightness ?? 1) * spriteBrightness})`, pointerEvents: "none", WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" }} />
                        ) : (
                            <span style={{ position: "relative", zIndex: 1, fontSize: 40, filter: `drop-shadow(0 3px 4px rgba(0,0,0,0.4)) brightness(${(p.brightness ?? 1) * spriteBrightness})`, pointerEvents: "none" }}>{p.emoji}</span>
                        )}
                    </div>
                );
            })}
        </>
    );
}

// ── Inspect modal for a decoration — works for a PLACED piece (→ Pick up) or a LOCKED catalog item (→ Buy, or
// "win it from the wheel / level track"). `item` carries name/rarity/effect + owned/buyable/price; a placed
// instance also has `placementId`.
export function DecoInspect({ item, mine = false, gold = 0, busy, onBuy, onPickup, onTransform, onClose }) {
    const [scale, setScale] = useState(Number(item?.scale ?? 1));
    const [rot, setRot] = useState(Number(item?.rot ?? 0));
    const [flip, setFlip] = useState(Boolean(item?.flip));
    const [brightness, setBrightness] = useState(Number(item?.brightness ?? 1));
    const [lightOn, setLightOn] = useState(Boolean(item?.lightOn));
    const [lightColor, setLightColor] = useState(item?.lightColor || "#ffd27a");
    const [lightIntensity, setLightIntensity] = useState(Number(item?.lightIntensity ?? 0.7));
    const [lightRadius, setLightRadius] = useState(Number(item?.lightRadius ?? 70));
    if (!item) return null;
    const ring = item.rarityColor || RARITY_RING[item.rarity] || "#8fbf6a";
    const placed = Boolean(item.placementId);
    const commit = (s, r, f = flip) => onTransform?.(item.placementId, { scale: s, rot: r, flip: f });
    const commitLight = (patch) => onTransform?.(item.placementId, { light: { on: lightOn, color: lightColor, intensity: lightIntensity, radius: lightRadius, ...patch } });
    const LIGHT_SWATCHES = ["#ffd27a", "#fff4e0", "#ffcf3f", "#7ac8ff", "#8fe39a", "#c9a2ff", "#ff7a6b", "#ff9ecb"];
    const canBuy = !placed && !item.owned && item.buyable;
    const afford = gold >= (item.price || 0);
    return (
        <div onClick={onClose} role="presentation" style={{ position: "fixed", inset: 0, zIndex: 10055, background: "rgba(0,0,0,0.55)", display: "grid", placeItems: "center", padding: 16 }}>
            <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${item.name} details`} style={{ width: "100%", maxWidth: 320, borderRadius: 16, background: "var(--card-bg,#17181c)", border: `2px solid ${ring}`, boxShadow: "0 20px 60px rgba(0,0,0,0.5)", overflow: "hidden", animation: "pigPop .35s ease both" }}>
                <div style={{ padding: "18px 16px 10px", textAlign: "center", background: `radial-gradient(120% 90% at 50% 0%, ${ring}33, transparent 70%)` }}>
                    <span style={{ display: "grid", placeItems: "center", width: 110, height: 110, margin: "0 auto", borderRadius: 16, background: "rgba(0,0,0,0.22)", overflow: "hidden" }}>
                        {item.spriteUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.spriteUrl} alt={item.name} width={78} height={78} style={{ width: 78, height: 78, objectFit: "contain", transform: placed ? `rotate(${rot}deg) scale(${scale}) scaleX(${flip ? -1 : 1})` : "none", transition: "transform .08s linear" }} />
                        ) : <span style={{ fontSize: 54, display: "inline-block", transform: placed ? `rotate(${rot}deg) scale(${scale}) scaleX(${flip ? -1 : 1})` : "none" }}>{item.emoji}</span>}
                    </span>
                    <div style={{ fontWeight: 900, fontSize: 18, marginTop: 8 }}>{item.name}</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: ring, textTransform: "capitalize" }}>{item.rarity}{item.source === "special" ? " · premium" : ""}</div>
                    {/* A gifted copy credits the member who actually drew it — otherwise it's indistinguishable
                        from something you made yourself, and the artist gets no recognition for it. */}
                    {item.copiedFrom ? (
                        <div style={{ marginTop: 5, fontSize: 11.5, fontWeight: 700, color: "#c9a2ff" }}>
                            🎨 Copied from{" "}
                            {item.copiedFromAlias
                                ? <a href={`/marketplace/u/${item.copiedFromAlias}`} style={{ color: "#d9b8ff", textDecoration: "underline" }}>@{item.copiedFromAlias}</a>
                                : item.copiedFrom}
                        </div>
                    ) : null}
                </div>
                <div style={{ padding: "8px 16px 4px" }}>
                    {/* Standing on someone else's farm looking at a piece they made — the moment to ask for one.
                        AskForCopy checks with the server first, so it only appears when an ask is actually
                        possible, and explains itself when it isn't. */}
                    {/* Placed pieces carry `decoId`; catalog entries carry `id` — accept either. */}
                    {!mine && item.source === "custom" && (item.decoId || item.id) ? <AskForCopy decoId={item.decoId || item.id} /> : null}
                    {item.buffText ? (
                        <div style={{ padding: "10px 12px", borderRadius: 11, background: "rgba(126,213,126,0.14)", border: "1px solid rgba(126,213,126,0.5)", color: "#a7e6a7", fontSize: 13, fontWeight: 800, textAlign: "center" }}>
                            While placed: {item.buffText}
                        </div>
                    ) : (
                        <div className="muted" style={{ fontSize: 12.5, textAlign: "center", padding: "6px 0" }}>Cosmetic — looks great, no farming buff. (Epic+ decorations carry buffs.)</div>
                    )}
                </div>
                <div style={{ padding: "10px 16px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {placed && mine && onTransform ? (
                        <div style={{ padding: "2px 2px 6px", display: "flex", flexDirection: "column", gap: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 12, fontWeight: 800, width: 58 }}>📏 Size</span>
                                <input type="range" min="0.4" max="2.5" step="0.05" value={scale} onChange={(e) => setScale(Number(e.target.value))} onPointerUp={() => commit(scale, rot)} onKeyUp={() => commit(scale, rot)} style={{ flex: 1, accentColor: "#c9a2ff" }} />
                                <span style={{ fontSize: 11.5, fontWeight: 800, color: "#c9a2ff", width: 40, textAlign: "right" }}>{Math.round(scale * 100)}%</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 12, fontWeight: 800, width: 58 }}>📐 Rotate</span>
                                <input type="range" min="0" max="355" step="5" value={rot} onChange={(e) => setRot(Number(e.target.value))} onPointerUp={() => commit(scale, rot)} onKeyUp={() => commit(scale, rot)} style={{ flex: 1, accentColor: "#c9a2ff" }} />
                                <span style={{ fontSize: 11.5, fontWeight: 800, color: "#c9a2ff", width: 40, textAlign: "right" }}>{rot}°</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                <button type="button" onClick={() => { const nf = !flip; setFlip(nf); commit(scale, rot, nf); }} style={{ fontSize: 12, fontWeight: 800, color: flip ? "#c9a2ff" : "#cfd6dd", background: flip ? "rgba(201,162,255,0.16)" : "rgba(255,255,255,0.06)", border: `1px solid ${flip ? "rgba(201,162,255,0.5)" : "rgba(255,255,255,0.18)"}`, borderRadius: 9, padding: "6px 13px", cursor: "pointer" }}>↔ Flip{flip ? " · on" : ""}</button>
                                <button type="button" onClick={() => { setScale(1); setRot(0); setFlip(false); commit(1, 0, false); }} style={{ fontSize: 11.5, fontWeight: 700, color: "#9fb0c0", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Reset</button>
                            </div>
                            {/* 🔆 Per-sprite brightness — a real filter on the sprite, not an overlay. */}
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 12, fontWeight: 800, width: 58 }}>🔆 Bright</span>
                                <input type="range" min="0.3" max="2.2" step="0.05" value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} onPointerUp={() => onTransform?.(item.placementId, { brightness })} onKeyUp={() => onTransform?.(item.placementId, { brightness })} style={{ flex: 1, accentColor: "#ffd27a" }} />
                                <span style={{ fontSize: 11.5, fontWeight: 800, color: "#ffd27a", width: 40, textAlign: "right" }}>{Math.round(brightness * 100)}%</span>
                            </div>
                            {/* 💡 Light — place real additive light in the scene (color / intensity / falloff). */}
                            <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 8, marginTop: 2 }}>
                                <button type="button" onClick={() => { const on = !lightOn; setLightOn(on); commitLight({ on }); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", fontSize: 12.5, fontWeight: 800, color: lightOn ? "#ffe6a6" : "#cfd6dd", background: lightOn ? "rgba(255,207,122,0.14)" : "rgba(255,255,255,0.06)", border: `1px solid ${lightOn ? "rgba(255,207,122,0.5)" : "rgba(255,255,255,0.18)"}`, borderRadius: 9, padding: "7px 12px", cursor: "pointer" }}>
                                    <span>💡</span> Light {lightOn ? "· on" : "· off"}
                                    <span style={{ marginLeft: "auto", width: 16, height: 16, borderRadius: "50%", background: lightColor, boxShadow: lightOn ? `0 0 8px ${lightColor}` : "none", border: "1px solid rgba(255,255,255,0.3)" }} />
                                </button>
                                {lightOn ? (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                                            {LIGHT_SWATCHES.map((c) => (
                                                <button key={c} type="button" aria-label={`light ${c}`} onClick={() => { setLightColor(c); commitLight({ color: c }); }} style={{ width: 22, height: 22, borderRadius: "50%", background: c, cursor: "pointer", border: `2px solid ${lightColor.toLowerCase() === c ? "#fff" : "rgba(255,255,255,0.25)"}`, boxShadow: `0 0 6px ${c}88` }} />
                                            ))}
                                            <input type="color" value={lightColor} onChange={(e) => { setLightColor(e.target.value); }} onBlur={() => commitLight({ color: lightColor })} aria-label="custom light color" style={{ width: 26, height: 26, padding: 0, border: "none", background: "none", cursor: "pointer" }} />
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <span style={{ fontSize: 12, fontWeight: 800, width: 58 }}>Glow</span>
                                            <input type="range" min="0.15" max="1" step="0.05" value={lightIntensity} onChange={(e) => setLightIntensity(Number(e.target.value))} onPointerUp={() => commitLight({ intensity: lightIntensity })} onKeyUp={() => commitLight({ intensity: lightIntensity })} style={{ flex: 1, accentColor: lightColor }} />
                                            <span style={{ fontSize: 11.5, fontWeight: 800, color: "#e6d7c2", width: 40, textAlign: "right" }}>{Math.round(lightIntensity * 100)}%</span>
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <span style={{ fontSize: 12, fontWeight: 800, width: 58 }}>Falloff</span>
                                            <input type="range" min="30" max="260" step="5" value={lightRadius} onChange={(e) => setLightRadius(Number(e.target.value))} onPointerUp={() => commitLight({ radius: lightRadius })} onKeyUp={() => commitLight({ radius: lightRadius })} style={{ flex: 1, accentColor: lightColor }} />
                                            <span style={{ fontSize: 11.5, fontWeight: 800, color: "#e6d7c2", width: 40, textAlign: "right" }}>{lightRadius}px</span>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    ) : null}
                    {/* Close FIRST — the safe, default action sits on top. */}
                    <button type="button" onClick={onClose} style={{ width: "100%", padding: 12, fontWeight: 900, background: "rgba(255,255,255,0.12)", color: "inherit", border: "1px solid rgba(255,255,255,0.24)", borderRadius: 11, cursor: "pointer" }}>Close</button>
                    {canBuy && afford ? (
                        <button type="button" disabled={busy} onClick={() => { onBuy(item.id); onClose(); }} style={{ width: "100%", padding: 12, fontWeight: 900, background: "linear-gradient(180deg,#ffe488,#f3b23a)", color: "#3a2c08", border: "none", borderRadius: 11, cursor: busy ? "default" : "pointer", boxShadow: "0 3px 0 #b57f22", opacity: busy ? 0.6 : 1 }}>🪙 Buy · {item.price.toLocaleString()}g{item.source === "special" ? " (premium)" : ""}</button>
                    ) : null}
                    {canBuy && !afford ? (
                        <div style={{ textAlign: "center", fontSize: 12.5 }}>
                            <div className="muted">Costs {item.price.toLocaleString()}g — you have {gold.toLocaleString()}g.</div>
                            <a href="/marketplace/credit" style={{ display: "inline-block", marginTop: 6, fontWeight: 800, color: "#ffd75e" }}>Get store credit &amp; coins →</a>
                        </div>
                    ) : null}
                    {!placed && !item.owned && !item.buyable ? (
                        <div style={{ textAlign: "center", fontSize: 12.5, fontWeight: 700, color: "#8fb3d6", padding: "6px 0" }}>{item.source === "spin" ? "🎡 Win it from the Daily Spin wheel." : item.source === "glint" ? "✨ Claim the rare hidden glint that appears in Town." : "🏆 Unlock it on the Rewards Track."}</div>
                    ) : null}
                    {!placed && item.owned ? (
                        <div className="muted" style={{ textAlign: "center", fontSize: 12 }}>You own this — drag it from your tray to place it.</div>
                    ) : null}
                    {/* Destructive — plain red "Remove", below Close so it's never the reflex tap. No confirm (by design). */}
                    {placed && mine ? (
                        <button type="button" disabled={busy} onClick={() => { onPickup(item.placementId); onClose(); }} style={{ width: "100%", padding: 11, fontWeight: 800, fontSize: 13.5, background: "rgba(224,91,106,0.14)", color: "#ff6b74", border: "1px solid rgba(224,91,106,0.6)", borderRadius: 11, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>Remove</button>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

// ── Manager drawer: your decoration inventory (place) + the shop (buy) + a live buff summary. Opened from the
// farm's "Decorate" button. Placing drops the piece into an open spot on the right of the field; drag to move.
export function DecoManager({ deco, gold = 0, busy, editing, onToggleEdit, onBuy, onPlace, onClose, initialTab = "mine" }) {
    const [tab, setTab] = useState(initialTab);
    const { owned = [], shop = [], buffs = {}, buffMeta = {}, placedTotal = 0, placedCap = 500 } = deco || {};
    const activeBuffs = Object.entries(buffs).filter(([, v]) => v > 0);
    const atCap = placedTotal >= placedCap;
    return (
        <div onClick={onClose} role="presentation" style={{ position: "fixed", inset: 0, zIndex: 10001, background: "rgba(0,0,0,0.55)", display: "grid", placeItems: "end center", padding: 0 }}>
            <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Farm decorations" style={{ width: "100%", maxWidth: 560, maxHeight: "82dvh", display: "flex", flexDirection: "column", borderRadius: "18px 18px 0 0", background: "var(--card-bg,#17181c)", border: "2px solid #7ed57e", borderBottom: "none", boxShadow: "0 -12px 40px rgba(0,0,0,0.5)", animation: "pigPop .35s ease both" }}>
                <div style={{ padding: "14px 16px 8px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <strong style={{ fontSize: 17 }}>🪴 Decorate your farm</strong>
                        <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 800, color: atCap ? "#ff9a9a" : "#a7e6a7" }} title="Total items placed on your farm">🪴 {placedTotal}/{placedCap}</span>
                        <span style={{ fontWeight: 800, color: "#ffd75e", fontSize: 14 }}>🪙 {gold.toLocaleString()}</span>
                        <button type="button" onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "inherit", fontSize: 22, cursor: "pointer", opacity: 0.7, lineHeight: 1 }}>×</button>
                    </div>
                    {activeBuffs.length ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                            {activeBuffs.map(([k, v]) => (
                                <span key={k} style={{ padding: "2px 9px", borderRadius: 999, background: "rgba(126,213,126,0.14)", border: "1px solid rgba(126,213,126,0.5)", color: "#a7e6a7", fontSize: 11.5, fontWeight: 800 }}>
                                    {buffMeta[k]?.icon} +{v}{buffMeta[k]?.suffix}
                                </span>
                            ))}
                        </div>
                    ) : <p className="muted" style={{ margin: "8px 0 0", fontSize: 11.5 }}>Place epic+ decorations to earn passive farming buffs. 🌱</p>}
                    <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                        <TabBtn active={tab === "mine"} onClick={() => setTab("mine")}>My decorations ({owned.length})</TabBtn>
                        <TabBtn active={tab === "shop"} onClick={() => setTab("shop")}>Shop</TabBtn>
                        <button type="button" onClick={onToggleEdit} style={{ marginLeft: "auto", padding: "6px 12px", borderRadius: 10, border: `1px solid ${editing ? "#7ed57e" : "rgba(255,255,255,0.18)"}`, background: editing ? "rgba(126,213,126,0.16)" : "transparent", color: editing ? "#a7e6a7" : "inherit", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>
                            {editing ? "✓ Arranging" : "✋ Arrange"}
                        </button>
                    </div>
                </div>

                <div style={{ overflowY: "auto", padding: 12 }}>
                    {/* Sharing lives at the top of your own decorations: incoming gifts, people asking for your
                        art, and the one-time "share a copy" picker. Renders nothing when there's none of that. */}
                    {tab === "mine" ? <CreationShareHub /> : null}
                    {tab === "mine" ? (
                        owned.length === 0 ? (
                            <div style={{ textAlign: "center", padding: "20px 12px" }}>
                                <p className="muted" style={{ fontSize: 13, margin: "0 0 12px" }}>No decorations yet — win them on the wheel or level track, or buy some now. Once you own one, place it as many times as you like.</p>
                                <button type="button" onClick={() => setTab("shop")} style={{ padding: "10px 20px", borderRadius: 11, border: "none", fontWeight: 900, fontSize: 14, cursor: "pointer", background: "linear-gradient(180deg,#ffe488,#f3b23a)", color: "#3a2c08", boxShadow: "0 3px 0 #b57f22" }}>🛒 Browse the shop</button>
                            </div>
                        ) : (
                            <>
                                <p className="muted" style={{ margin: "0 0 10px", fontSize: 12, textAlign: "center" }}>
                                    {editing ? "Drag pieces around the field to arrange them; tap a piece to open it, then Remove to send it back to your tray." : "Place a decoration as many times as you like — you own it forever. Tap “✋ Arrange” to move or remove placed pieces."}
                                </p>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
                                    {owned.map((o) => (
                                        <div key={o.id} style={{ padding: 10, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: `1px solid ${(RARITY_RING[o.rarity] || "#555")}55` }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                <DecoIcon o={o} />
                                                <div style={{ minWidth: 0, flex: 1 }}>
                                                    <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.name}</div>
                                                    <div style={{ fontSize: 10.5, color: RARITY_RING[o.rarity] || "#9aa0a6", textTransform: "capitalize" }}>{o.rarity}{o.placed ? ` · ${o.placed} placed` : ""}</div>
                                                </div>
                                            </div>
                                            {o.buffText ? <div style={{ fontSize: 10.5, marginTop: 4, color: "#a7e6a7", fontWeight: 700 }}>{o.buffText}</div> : null}
                                            <button type="button" disabled={busy || atCap} onClick={() => onPlace(o.id)} style={{ width: "100%", marginTop: 8, padding: "7px 8px", borderRadius: 9, border: "none", fontWeight: 800, fontSize: 12, cursor: !atCap && !busy ? "pointer" : "default", background: !atCap ? "linear-gradient(180deg,#8fe39a,#4bbf6a)" : "rgba(255,255,255,0.08)", color: !atCap ? "#06311f" : "#9aa0a6", opacity: !atCap ? 1 : 0.7 }}>
                                                {atCap ? "Farm full (500)" : "＋ Place"}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )
                    ) : (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
                            {shop.map((s) => {
                                const afford = gold >= s.price;
                                return (
                                    <div key={s.id} style={{ padding: 10, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: `1px solid ${(RARITY_RING[s.rarity] || "#555")}55` }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <DecoIcon o={s} />
                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                                                <div style={{ fontSize: 10.5, color: RARITY_RING[s.rarity] || "#9aa0a6", textTransform: "capitalize" }}>{s.rarity}{s.source === "special" ? " · premium" : ""}</div>
                                            </div>
                                        </div>
                                        {s.buffText ? <div style={{ fontSize: 10.5, marginTop: 4, color: "#a7e6a7", fontWeight: 700 }}>{s.buffText}</div> : null}
                                        {s.owned ? (
                                            <button type="button" disabled style={{ width: "100%", marginTop: 8, padding: "7px 8px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "#9aa0a6", fontWeight: 800, fontSize: 12 }}>✓ Owned</button>
                                        ) : (
                                            <button type="button" disabled={busy || !afford} onClick={() => onBuy(s.id)} style={{ width: "100%", marginTop: 8, padding: "7px 8px", borderRadius: 9, border: "none", fontWeight: 800, fontSize: 12, cursor: afford && !busy ? "pointer" : "default", background: afford ? "linear-gradient(180deg,#ffe488,#f3b23a)" : "rgba(255,255,255,0.08)", color: afford ? "#3a2c08" : "#9aa0a6", opacity: afford ? 1 : 0.7 }}>
                                                🪙 {s.price.toLocaleString()}
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function DecoIcon({ o }) {
    return (
        <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 10, background: "rgba(0,0,0,0.25)", display: "grid", placeItems: "center", border: `1px solid ${(RARITY_RING[o.rarity] || "#555")}55` }}>
            {o.spriteUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={o.spriteUrl} alt="" width={36} height={36} style={{ width: 36, height: 36, objectFit: "contain" }} />
            ) : <span style={{ fontSize: 22 }}>{o.emoji}</span>}
        </span>
    );
}

function TabBtn({ active, onClick, children }) {
    return (
        <button type="button" onClick={onClick} style={{ padding: "6px 12px", borderRadius: 10, border: "none", background: active ? "rgba(126,213,126,0.18)" : "rgba(255,255,255,0.05)", color: active ? "#a7e6a7" : "inherit", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>{children}</button>
    );
}

const CINP = { width: "100%", padding: "9px 11px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.05)", color: "inherit", fontSize: 14, boxSizing: "border-box" };
const CPRIMARY = { width: "100%", padding: 12, fontWeight: 900, fontSize: 14, border: "none", borderRadius: 11, cursor: "pointer", background: "linear-gradient(180deg,#d9b8ff,#a875e6)", color: "#25103f" };
const CGHOST = { padding: "9px 14px", fontWeight: 800, fontSize: 13, borderRadius: 10, cursor: "pointer", border: "1px solid rgba(201,162,255,0.5)", background: "rgba(201,162,255,0.12)", color: "#d9b8ff" };
const customErr = (e) => ({ no_credits: "You're out of creations — grab a bundle to get more.", describe_it: "Describe your decoration first.", gen_failed: "The art pipeline hiccuped — try again (your creation was refunded).", no_attempts: "No refines left.", bad_choice: "Pick one of the options.", not_found: "That draft expired — start over." }[e] || "Something went wrong — try again.");

// ── Custom decoration creator: describe → draw 3 options → up to 2 refines → pick one. Uses a Creation
// (bought on /marketplace/creations; owner can self-grant). Never sellable — but a finished creation CAN be
// passed on to exactly one other member, once (see creation-share.js); their copy is the end of the line.
export function CustomDecoCreator({ custom, busy, onStart, onRefine, onFinalize, onSuggest, onClose }) {
    const [draft, setDraft] = useState(custom?.draft || null);
    const [credits, setCredits] = useState(custom?.credits || 0);
    const [free, setFree] = useState(Boolean(custom?.free)); // owners/admins draw without spending a token
    const [name, setName] = useState(draft?.name || "");
    const [prompt, setPrompt] = useState(draft?.prompt || "");
    const [correction, setCorrection] = useState(""); // a tweak note for a redraw; the original prompt is preserved
    const [chosen, setChosen] = useState(draft?.options?.[draft.options.length - 1]?.url || null);
    const [gen, setGen] = useState(false);
    const [suggesting, setSuggesting] = useState(false);
    const [err, setErr] = useState(null);
    const attemptsLeft = draft ? Math.max(0, (draft.maxAttempts || 4) - draft.attempts) : 4;

    const run = async (fn) => {
        setGen(true); setErr(null);
        const r = await fn();
        setGen(false);
        // Prefer a specific server reason (e.g. "blocked — names a copyrighted character") over the generic map.
        if (!r?.ok) { setErr(r?.reason || customErr(r?.error)); return r; }
        if (r.draft) { setDraft(r.draft); setChosen(r.draft.options?.[r.draft.options.length - 1]?.url || null); setCorrection(""); }
        if (r.credits != null) setCredits(r.credits);
        if (r.free != null) setFree(Boolean(r.free));
        return r;
    };
    const doSuggest = async () => {
        if (!name.trim()) { setErr("Enter a name first — then I'll suggest a description you can tweak."); return; }
        setSuggesting(true); setErr(null);
        const r = await onSuggest?.(name.trim());
        setSuggesting(false);
        if (r?.ok && r.description) setPrompt(r.description);
        else setErr("Couldn't suggest one just now — type your own description.");
    };
    const doStart = () => { if (prompt.trim().length < 4) { setErr("Describe your decoration (a few words at least)."); return; } run(() => onStart(name, prompt)); };
    const doRefine = () => { if (!correction.trim()) { setErr("Add a quick note on what to change."); return; } run(() => onRefine(draft.id, correction)); };
    const doFinalize = async () => { if (!chosen) return; setGen(true); const r = await onFinalize(draft.id, chosen); setGen(false); if (r?.ok) onClose(); else setErr(r?.reason || customErr(r?.error)); };

    return (
        <div onClick={onClose} role="presentation" style={{ position: "fixed", inset: 0, zIndex: 10058, background: "rgba(0,0,0,0.6)", display: "grid", placeItems: "center", padding: 16 }}>
            <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Make your own decoration" style={{ width: "100%", maxWidth: 420, maxHeight: "90dvh", overflowY: "auto", borderRadius: 16, background: "var(--card-bg,#17181c)", border: "2px solid #c9a2ff", boxShadow: "0 20px 60px rgba(0,0,0,0.55)", padding: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <strong style={{ fontSize: 17 }}>🎨 Make your own</strong>
                    <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 800, color: free ? "#8fe39a" : credits > 0 ? "#c9a2ff" : "#9aa0a6" }}>{free ? "Owner · free" : `${credits} creation${credits === 1 ? "" : "s"}`}</span>
                    <button type="button" onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "inherit", fontSize: 22, cursor: "pointer", opacity: 0.7 }}>×</button>
                </div>

                {gen ? (
                    <div style={{ textAlign: "center", padding: "34px 12px" }}>
                        <div style={{ fontSize: 34, animation: "farmBob 1.4s ease-in-out infinite" }}>🎨</div>
                        <div style={{ fontWeight: 800, marginTop: 8 }}>Drawing your decoration…</div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>This takes ~15 seconds — hang tight.</div>
                    </div>
                ) : !draft ? (
                    <div style={{ marginTop: 10 }}>
                        <p className="muted" style={{ fontSize: 12.5, margin: "0 0 12px" }}>Describe what you want and our art pipeline draws it. Not quite right? Add a quick tweak and it redraws — your description stays, the tweak nudges it. It&apos;s yours alone, forever.</p>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Name</label>
                        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Wolf Totem" style={CINP} />
                        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0 4px" }}>
                            <label style={{ fontSize: 12, fontWeight: 700 }}>Describe it</label>
                            <button type="button" onClick={doSuggest} disabled={suggesting || !name.trim()}
                                style={{ marginLeft: "auto", fontSize: 11, fontWeight: 800, color: "#c9a2ff", background: "rgba(201,162,255,0.12)", border: "1px solid rgba(201,162,255,0.4)", borderRadius: 8, padding: "3px 9px", cursor: suggesting || !name.trim() ? "default" : "pointer", opacity: suggesting || !name.trim() ? 0.55 : 1 }}>
                                {suggesting ? "✨ Thinking…" : "✨ Suggest from name"}
                            </button>
                        </div>
                        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={300} rows={3} placeholder="e.g. a carved wooden wolf totem with glowing blue eyes" style={{ ...CINP, resize: "vertical" }} />
                        <div className="muted" style={{ fontSize: 10.5, marginTop: 3 }}>Tip: name it, tap ✨ to draft a description, then edit it however you like.</div>
                        <div className="muted" style={{ fontSize: 11, marginTop: 5 }}>💡 Original ideas only — the art filter blocks named brands &amp; copyrighted characters (Pokémon, Nintendo, Disney, etc.). Describe your own creature or object and it&apos;ll draw.</div>
                        {err ? <div style={{ color: "#ff9a9a", fontSize: 12.5, marginTop: 8 }}>{err}</div> : null}
                        {free || credits > 0 ? (
                            <button type="button" onClick={doStart} disabled={busy} style={{ ...CPRIMARY, marginTop: 14 }}>{free ? "🎨 Draw my decoration (owner · free)" : "🎨 Draw my decoration (uses 1 creation)"}</button>
                        ) : (
                            <div style={{ marginTop: 14, textAlign: "center" }}>
                                <div className="muted" style={{ fontSize: 12.5 }}>You&apos;re out of creations. Grab a bundle — you also get coins with every buy.</div>
                                <a href="/marketplace/creations" style={{ ...CPRIMARY, display: "inline-block", width: "auto", padding: "10px 18px", marginTop: 10, textDecoration: "none" }}>🎨 Get creations →</a>
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{ marginTop: 12 }}>
                        <div style={{ fontWeight: 800, fontSize: 14 }}>{draft.name}</div>
                        <div className="muted" style={{ fontSize: 11.5, margin: "2px 0 10px", fontStyle: "italic" }}>&ldquo;{draft.prompt}&rdquo;</div>
                        {/* The generated image, big. If you redrew, earlier versions stay as thumbnails so you can pick any. */}
                        <div style={{ display: "grid", gridTemplateColumns: draft.options.length > 1 ? "repeat(auto-fill, minmax(96px, 1fr))" : "1fr", gap: 8 }}>
                            {[...draft.options].reverse().map((o) => (
                                <button key={o.url} type="button" onClick={() => setChosen(o.url)} style={{ padding: 0, borderRadius: 12, cursor: "pointer", border: `2px solid ${chosen === o.url ? "#c9a2ff" : "rgba(255,255,255,0.14)"}`, background: chosen === o.url ? "rgba(201,162,255,0.14)" : "rgba(255,255,255,0.04)", overflow: "hidden" }}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={o.url} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "contain", display: "block" }} />
                                </button>
                            ))}
                        </div>
                        {draft.options.length > 1 ? <div className="muted" style={{ fontSize: 10.5, marginTop: 4 }}>Tap any version to pick it (newest first).</div> : null}
                        {err ? <div style={{ color: "#ff9a9a", fontSize: 12.5, marginTop: 8 }}>{err}</div> : null}
                        {attemptsLeft > 0 ? (
                            <div style={{ marginTop: 12 }}>
                                <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Not quite? Add a tweak &amp; redraw ({attemptsLeft} redraw{attemptsLeft === 1 ? "" : "s"} left)</label>
                                <input value={correction} onChange={(e) => setCorrection(e.target.value)} maxLength={200} placeholder="e.g. make it bigger, add snow on top" style={CINP} />
                                <button type="button" onClick={doRefine} disabled={busy || !correction.trim()} style={{ ...CGHOST, marginTop: 8, width: "100%", opacity: correction.trim() ? 1 : 0.55 }}>🎨 Redraw with my tweak</button>
                            </div>
                        ) : <div className="muted" style={{ fontSize: 12, marginTop: 10, textAlign: "center" }}>No redraws left — pick your favorite to finish.</div>}
                        <button type="button" onClick={doFinalize} disabled={!chosen || busy} style={{ ...CPRIMARY, marginTop: 14, opacity: chosen ? 1 : 0.5 }}>✓ Use this one</button>
                    </div>
                )}
            </div>
        </div>
    );
}
