"use client";

import { useRef, useState } from "react";

const RARITY_RING = { common: "#9aa0a6", rare: "#4aa3d4", epic: "#a855f7", legendary: "#f59e0b", mythic: "#ff5cc8" };

// ── Scene layer: renders a member's PLACED decorations inside the pasture field. On your own farm, toggling
// "edit" makes them draggable (pointer drag maps to field %) and shows a pick-up ✕. Read-only elsewhere.
export function DecoLayer({ placements = [], editing = false, fieldRef, onMove, onPickup }) {
    const [drag, setDrag] = useState(null); // { id, x, y } live position while dragging
    const startDrag = (e, p) => {
        if (!editing) return;
        e.preventDefault();
        e.stopPropagation();
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
        setDrag({ id: p.id, x: p.x, y: p.y });
    };
    const onDrag = (e) => {
        if (!drag || !fieldRef?.current) return;
        const rect = fieldRef.current.getBoundingClientRect();
        const x = Math.max(2, Math.min(98, ((e.clientX - rect.left) / rect.width) * 100));
        const y = Math.max(4, Math.min(98, ((e.clientY - rect.top) / rect.height) * 100));
        setDrag((d) => (d ? { ...d, x, y } : d));
    };
    const endDrag = (e) => {
        if (!drag) return;
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
        onMove?.(drag.id, drag.x, drag.y);
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
                        onPointerDown={(e) => startDrag(e, p)}
                        onPointerMove={onDrag}
                        onPointerUp={endDrag}
                        style={{
                            position: "absolute", left: `${live.x}%`, top: `${live.y}%`, transform: "translate(-50%, -100%)",
                            zIndex: Math.round(live.y), cursor: editing ? "grab" : "default", touchAction: editing ? "none" : "auto",
                            filter: editing ? "drop-shadow(0 0 0 rgba(0,0,0,0))" : "none",
                            transition: drag && drag.id === p.id ? "none" : "left .15s ease, top .15s ease",
                        }}
                        title={p.name}
                    >
                        <div style={{ position: "relative", width: size, display: "flex", justifyContent: "center" }}>
                            {p.spriteUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={p.spriteUrl} alt={p.name} width={size} height={size} style={{ width: size, height: size, objectFit: "contain", transform: p.flip ? "scaleX(-1)" : "none", filter: "drop-shadow(0 3px 4px rgba(0,0,0,0.4))", pointerEvents: "none" }} />
                            ) : (
                                <span style={{ fontSize: 40, filter: "drop-shadow(0 3px 4px rgba(0,0,0,0.4))", pointerEvents: "none" }}>{p.emoji}</span>
                            )}
                            {editing ? (
                                <button
                                    type="button"
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => { e.stopPropagation(); onPickup?.(p.id); }}
                                    aria-label={`Pick up ${p.name}`}
                                    style={{ position: "absolute", top: -6, right: 2, width: 22, height: 22, borderRadius: "50%", border: "none", background: "#e0559a", color: "#fff", fontWeight: 900, fontSize: 13, cursor: "pointer", boxShadow: "0 2px 6px rgba(0,0,0,0.45)", lineHeight: 1 }}
                                >×</button>
                            ) : null}
                        </div>
                    </div>
                );
            })}
        </>
    );
}

// ── Manager drawer: your decoration inventory (place) + the shop (buy) + a live buff summary. Opened from the
// farm's "Decorate" button. Placing drops the piece into an open spot on the right of the field; drag to move.
export function DecoManager({ deco, gold = 0, busy, editing, onToggleEdit, onBuy, onPlace, onClose }) {
    const [tab, setTab] = useState("mine");
    const { owned = [], shop = [], buffs = {}, buffMeta = {} } = deco || {};
    const activeBuffs = Object.entries(buffs).filter(([, v]) => v > 0);
    const freeToPlace = owned.filter((o) => o.free > 0);
    return (
        <div onClick={onClose} role="presentation" style={{ position: "fixed", inset: 0, zIndex: 10001, background: "rgba(0,0,0,0.55)", display: "grid", placeItems: "end center", padding: 0 }}>
            <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Farm decorations" style={{ width: "100%", maxWidth: 560, maxHeight: "82dvh", display: "flex", flexDirection: "column", borderRadius: "18px 18px 0 0", background: "var(--card-bg,#17181c)", border: "2px solid #7ed57e", borderBottom: "none", boxShadow: "0 -12px 40px rgba(0,0,0,0.5)", animation: "pigPop .35s ease both" }}>
                <div style={{ padding: "14px 16px 8px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <strong style={{ fontSize: 17 }}>🎀 Decorate your farm</strong>
                        <span style={{ marginLeft: "auto", fontWeight: 800, color: "#ffd75e", fontSize: 14 }}>🪙 {gold.toLocaleString()}</span>
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
                            <Empty>No decorations yet — win them on the wheel, the level track, or buy some in the Shop tab.</Empty>
                        ) : (
                            <>
                                {editing ? <p className="muted" style={{ margin: "0 0 10px", fontSize: 12, textAlign: "center" }}>Drag pieces around the field to arrange them; tap the ✕ to pick one up. (Not over your crops.)</p> : null}
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
                                    {owned.map((o) => (
                                        <div key={o.id} style={{ padding: 10, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: `1px solid ${(RARITY_RING[o.rarity] || "#555")}55` }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                <DecoIcon o={o} />
                                                <div style={{ minWidth: 0, flex: 1 }}>
                                                    <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.name}</div>
                                                    <div style={{ fontSize: 10.5, color: RARITY_RING[o.rarity] || "#9aa0a6", textTransform: "capitalize" }}>{o.rarity}{o.qty > 1 ? ` ·×${o.qty}` : ""}</div>
                                                </div>
                                            </div>
                                            {o.buffText ? <div style={{ fontSize: 10.5, marginTop: 4, color: "#a7e6a7", fontWeight: 700 }}>{o.buffText}</div> : null}
                                            <button type="button" disabled={busy || o.free <= 0} onClick={() => onPlace(o.id)} style={{ width: "100%", marginTop: 8, padding: "7px 8px", borderRadius: 9, border: "none", fontWeight: 800, fontSize: 12, cursor: o.free > 0 && !busy ? "pointer" : "default", background: o.free > 0 ? "linear-gradient(180deg,#8fe39a,#4bbf6a)" : "rgba(255,255,255,0.08)", color: o.free > 0 ? "#06311f" : "#9aa0a6", opacity: o.free > 0 ? 1 : 0.7 }}>
                                                {o.free > 0 ? `Place${o.placed ? ` (${o.free} left)` : ""}` : "All placed"}
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

function Empty({ children }) {
    return <p className="muted" style={{ textAlign: "center", fontSize: 13, padding: "24px 12px" }}>{children}</p>;
}
