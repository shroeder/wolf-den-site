"use client";

import { useRef, useState } from "react";

const RARITY_RING = { common: "#9aa0a6", rare: "#4aa3d4", epic: "#a855f7", legendary: "#f59e0b", mythic: "#ff5cc8" };

// ── Decorate DOCK: a bottom tray you drag decorations OUT of, straight onto the farm scene (which stays fully
// visible above it). Drag a chip up, release over the field → it drops there. Also carries the placed-count,
// a Shop button, and Done. This is the "grab from a drawer while watching the farm" flow.
export function DecoDock({ deco, fieldRef, busy, onPlaceAt, onInspect, onDone }) {
    const { catalog = [], placedTotal = 0, placedCap = 500 } = deco || {};
    const atCap = placedTotal >= placedCap;
    const ownedItems = catalog.filter((d) => d.owned);
    const lockedItems = catalog.filter((d) => !d.owned);
    // Imperative ghost: we set the sprite ONCE on drag-start (one render), then move the ghost by writing
    // .style directly on every pointermove — no per-move React re-render, so it tracks the finger 1:1.
    const ghostRef = useRef(null);
    const dragRef = useRef(null); // { decoId, pointerId, el }
    const [ghost, setGhost] = useState(null); // { emoji, spriteUrl, x0, y0 } — initial paint only

    const insideField = (cx, cy) => {
        const r = fieldRef?.current?.getBoundingClientRect();
        return r ? cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom : false;
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
        e.preventDefault();
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
        dragRef.current = { decoId: o.id, pointerId: e.pointerId, el: e.currentTarget };
        setGhost({ emoji: o.emoji, spriteUrl: o.spriteUrl, x0: e.clientX, y0: e.clientY });
    };
    const onMove = (e) => {
        const d = dragRef.current;
        if (d && e.pointerId === d.pointerId) positionGhost(e.clientX, e.clientY);
    };
    const endDrag = (e) => {
        const d = dragRef.current;
        if (!d || e.pointerId !== d.pointerId) return;
        try { d.el?.releasePointerCapture?.(e.pointerId); } catch { /* noop */ }
        const r = fieldRef?.current?.getBoundingClientRect();
        if (r && insideField(e.clientX, e.clientY)) {
            const xPct = ((e.clientX - r.left) / r.width) * 100;
            const yPct = ((e.clientY - r.top) / r.height) * 100;
            onPlaceAt(d.decoId, xPct, yPct);
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
                    <button type="button" onClick={onDone} style={{ padding: "6px 16px", borderRadius: 9, border: "none", background: "linear-gradient(180deg,#8fe39a,#4bbf6a)", color: "#06311f", fontWeight: 900, fontSize: 12.5, cursor: "pointer" }}>✓ Done</button>
                </div>
                <div style={{ fontSize: 10.5, color: "#9fbf9f", padding: "0 12px 6px" }}>
                    {atCap ? "Farm full (500 placed) — tap a placed piece to pick it up." : "Drag your decorations up onto the farm. Tap a 🔒 locked one to see it & buy. Tap placed pieces to move or inspect."}
                </div>
                <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "2px 12px 10px", WebkitOverflowScrolling: "touch" }}>
                    {ownedItems.map((o) => (
                        <div
                            key={o.id}
                            onPointerDown={(e) => startDrag(e, o)}
                            onPointerMove={onMove}
                            onPointerUp={endDrag}
                            title={`Drag ${o.name} onto your farm`}
                            style={{ flex: "0 0 auto", width: 66, textAlign: "center", touchAction: "none", cursor: atCap ? "default" : "grab", opacity: atCap ? 0.5 : 1, userSelect: "none" }}
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
                            style={{ flex: "0 0 auto", width: 66, textAlign: "center", background: "none", border: "none", padding: 0, cursor: "pointer", userSelect: "none" }}
                        >
                            <span style={{ position: "relative", display: "grid", placeItems: "center", width: 58, height: 58, margin: "0 auto", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: `1px dashed ${(RARITY_RING[o.rarity] || "#555")}55` }}>
                                {o.spriteUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={o.spriteUrl} alt="" width={46} height={46} style={{ width: 46, height: 46, objectFit: "contain", filter: "grayscale(0.7) brightness(0.7)" }} />
                                ) : <span style={{ fontSize: 28, filter: "grayscale(1) brightness(0.7)" }}>{o.emoji}</span>}
                                <span style={{ position: "absolute", top: 2, right: 2, fontSize: 11 }}>🔒</span>
                            </span>
                            <span style={{ display: "block", fontSize: 10, marginTop: 2, color: "#9aa4a0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.name}</span>
                            <span style={{ display: "block", fontSize: 9, fontWeight: 800, color: o.buyable ? "#ffd75e" : "#8fb3d6" }}>{o.buyable ? `🪙 ${o.price.toLocaleString()}` : (o.source === "spin" ? "🎡 wheel" : "🏆 track")}</span>
                        </button>
                    ))}
                </div>
            </div>
        </>
    );
}

// ── Scene layer: renders a member's PLACED decorations inside the pasture field. TAP any decoration to open its
// inspect modal (details/effects + pick up). When "editing" (decorate mode), you can also DRAG to reposition —
// a short movement is treated as a tap (inspect), a longer one as a drag (move). No always-visible ✕.
export function DecoLayer({ placements = [], editing = false, fieldRef, onMove, onInspect }) {
    const [drag, setDrag] = useState(null); // { id, x, y } live position during an actual drag
    const gr = useRef({}); // gesture: { id, pointerId, sx, sy, moved, x, y, el }
    const start = (e, p) => {
        if (!editing) return;
        e.preventDefault();
        e.stopPropagation();
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
        gr.current = { id: p.id, pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false, x: p.x, y: p.y, el: e.currentTarget };
    };
    const move = (e) => {
        const g = gr.current;
        if (!g.id || e.pointerId !== g.pointerId || !fieldRef?.current) return;
        if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 7) return; // still a tap until it moves enough
        g.moved = true;
        const rect = fieldRef.current.getBoundingClientRect();
        g.x = Math.max(2, Math.min(98, ((e.clientX - rect.left) / rect.width) * 100));
        g.y = Math.max(4, Math.min(98, ((e.clientY - rect.top) / rect.height) * 100));
        setDrag({ id: g.id, x: g.x, y: g.y });
    };
    const end = (e) => {
        const g = gr.current;
        if (!g.id || e.pointerId !== g.pointerId) return;
        try { g.el?.releasePointerCapture?.(e.pointerId); } catch { /* noop */ }
        if (g.moved) onMove?.(g.id, g.x, g.y);
        else onInspect?.(placements.find((p) => p.id === g.id));
        gr.current = {};
        setDrag(null);
    };
    return (
        <>
            {placements.map((p) => {
                const live = drag && drag.id === p.id ? drag : p;
                const size = 66;
                return (
                    <div
                        key={p.id}
                        onPointerDown={editing ? (e) => start(e, p) : undefined}
                        onPointerMove={editing ? move : undefined}
                        onPointerUp={editing ? end : undefined}
                        onClick={editing ? undefined : () => onInspect?.(p)}
                        style={{
                            position: "absolute", left: `${live.x}%`, top: `${live.y}%`, transform: "translate(-50%, -100%)",
                            zIndex: Math.round(live.y), cursor: "pointer", touchAction: editing ? "none" : "auto",
                            transition: drag && drag.id === p.id ? "none" : "left .15s ease, top .15s ease",
                        }}
                        title={editing ? `${p.name} — drag to move, tap for details` : `${p.name} — tap for details`}
                    >
                        {p.spriteUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.spriteUrl} alt={p.name} width={size} height={size} style={{ width: size, height: size, objectFit: "contain", transform: p.flip ? "scaleX(-1)" : "none", filter: "drop-shadow(0 3px 4px rgba(0,0,0,0.4))", pointerEvents: "none" }} />
                        ) : (
                            <span style={{ fontSize: 40, filter: "drop-shadow(0 3px 4px rgba(0,0,0,0.4))", pointerEvents: "none" }}>{p.emoji}</span>
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
export function DecoInspect({ item, mine = false, gold = 0, busy, onBuy, onPickup, onClose }) {
    if (!item) return null;
    const ring = item.rarityColor || RARITY_RING[item.rarity] || "#8fbf6a";
    const placed = Boolean(item.placementId);
    const canBuy = !placed && !item.owned && item.buyable;
    const afford = gold >= (item.price || 0);
    return (
        <div onClick={onClose} role="presentation" style={{ position: "fixed", inset: 0, zIndex: 10055, background: "rgba(0,0,0,0.55)", display: "grid", placeItems: "center", padding: 16 }}>
            <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${item.name} details`} style={{ width: "100%", maxWidth: 320, borderRadius: 16, background: "var(--card-bg,#17181c)", border: `2px solid ${ring}`, boxShadow: "0 20px 60px rgba(0,0,0,0.5)", overflow: "hidden", animation: "pigPop .35s ease both" }}>
                <div style={{ padding: "18px 16px 10px", textAlign: "center", background: `radial-gradient(120% 90% at 50% 0%, ${ring}33, transparent 70%)` }}>
                    <span style={{ display: "grid", placeItems: "center", width: 96, height: 96, margin: "0 auto", borderRadius: 16, background: "rgba(0,0,0,0.22)" }}>
                        {item.spriteUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.spriteUrl} alt={item.name} width={84} height={84} style={{ width: 84, height: 84, objectFit: "contain" }} />
                        ) : <span style={{ fontSize: 54 }}>{item.emoji}</span>}
                    </span>
                    <div style={{ fontWeight: 900, fontSize: 18, marginTop: 8 }}>{item.name}</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: ring, textTransform: "capitalize" }}>{item.rarity}{item.source === "special" ? " · premium" : ""}</div>
                </div>
                <div style={{ padding: "8px 16px 4px" }}>
                    {item.buffText ? (
                        <div style={{ padding: "10px 12px", borderRadius: 11, background: "rgba(126,213,126,0.14)", border: "1px solid rgba(126,213,126,0.5)", color: "#a7e6a7", fontSize: 13, fontWeight: 800, textAlign: "center" }}>
                            While placed: {item.buffText}
                        </div>
                    ) : (
                        <div className="muted" style={{ fontSize: 12.5, textAlign: "center", padding: "6px 0" }}>Cosmetic — looks great, no farming buff. (Epic+ decorations carry buffs.)</div>
                    )}
                </div>
                <div style={{ padding: "10px 16px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {placed && mine ? (
                        <button type="button" disabled={busy} onClick={() => { onPickup(item.placementId); onClose(); }} style={{ width: "100%", padding: 12, fontWeight: 900, background: "linear-gradient(180deg,#ff9ec2,#e0559a)", color: "#3a0a22", border: "none", borderRadius: 11, cursor: busy ? "default" : "pointer", boxShadow: "0 3px 0 #a83b73", opacity: busy ? 0.6 : 1 }}>✋ Pick up (back to your tray)</button>
                    ) : null}
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
                        <div style={{ textAlign: "center", fontSize: 12.5, fontWeight: 700, color: "#8fb3d6", padding: "6px 0" }}>{item.source === "spin" ? "🎡 Win it from the Daily Spin wheel." : "🏆 Unlock it on the Rewards Track."}</div>
                    ) : null}
                    {!placed && item.owned ? (
                        <div className="muted" style={{ textAlign: "center", fontSize: 12 }}>You own this — drag it from your tray to place it.</div>
                    ) : null}
                    <button type="button" onClick={onClose} style={{ width: "100%", padding: 10, fontWeight: 800, background: "transparent", color: "inherit", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 11, cursor: "pointer" }}>Close</button>
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
                    {tab === "mine" ? (
                        owned.length === 0 ? (
                            <div style={{ textAlign: "center", padding: "20px 12px" }}>
                                <p className="muted" style={{ fontSize: 13, margin: "0 0 12px" }}>No decorations yet — win them on the wheel or level track, or buy some now. Once you own one, place it as many times as you like.</p>
                                <button type="button" onClick={() => setTab("shop")} style={{ padding: "10px 20px", borderRadius: 11, border: "none", fontWeight: 900, fontSize: 14, cursor: "pointer", background: "linear-gradient(180deg,#ffe488,#f3b23a)", color: "#3a2c08", boxShadow: "0 3px 0 #b57f22" }}>🛒 Browse the shop</button>
                            </div>
                        ) : (
                            <>
                                <p className="muted" style={{ margin: "0 0 10px", fontSize: 12, textAlign: "center" }}>
                                    {editing ? "Drag pieces around the field to arrange them; tap the ✕ to pick one up (not over your crops)." : "Place a decoration as many times as you like — you own it forever. Tap “✋ Arrange” to move or pick up placed pieces."}
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
