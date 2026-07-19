"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { itemIcon } from "@/lib/marketplace/items.js";

const RARITY = { common: "#9aa7b5", rare: "#4aa3ff", epic: "#b76bff", legendary: "#ffb52e", mythic: "#37f5c0", ascendant: "#ff7a3c", eternal: "#ff5cc8" };

function Glyph({ icon, rarity, size = 30 }) {
    const Icon = itemIcon(icon);
    return <span style={{ display: "grid", placeItems: "center", width: size + 12, height: size + 12, borderRadius: 10, background: "rgba(255,255,255,0.06)", color: RARITY[rarity] || "#fff", fontSize: size }}><Icon aria-hidden="true" /></span>;
}

// Renders another member's UN-EQUIPPED items as tappable cards; tapping one opens an offer builder to
// propose a trade (your un-equipped items and/or gold for theirs).
export default function GearTradeComposer({ targetId, targetLabel = "this member", items = [] }) {
    const [pick, setPick] = useState(null); // the target item being traded for
    const [mine, setMine] = useState(null); // { items, gold }
    const [chosen, setChosen] = useState(new Set());
    const [gold, setGold] = useState("");
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState(null);
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    async function openFor(item) {
        setPick(item); setChosen(new Set()); setGold(""); setMsg(null);
        if (!mine) {
            try {
                const r = await fetch("/api/marketplace/gear-trade", { cache: "no-store" });
                if (r.ok) setMine(await r.json());
            } catch { /* ignore */ }
        }
    }

    function toggle(id) {
        setChosen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    }

    async function send() {
        const g = Math.max(0, Math.floor(Number(gold) || 0));
        if (!chosen.size && g <= 0) { setMsg({ ok: false, text: "Offer at least one item or some gold." }); return; }
        setBusy(true); setMsg(null);
        try {
            const r = await fetch("/api/marketplace/gear-trade", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ targetId, requestedItemId: pick.id, offeredItemIds: [...chosen], offeredGold: g }),
            });
            const d = await r.json().catch(() => ({}));
            if (r.ok && d.ok) { setMsg({ ok: true, text: "Offer sent! They'll get a notification." }); setTimeout(() => setPick(null), 1200); }
            else {
                const errs = { not_enough_gold: "You don't have that much gold.", already_own: "You already own that item.", target_missing: "They no longer have that item.", empty_offer: "Offer an item or gold.", self: "That's your own item." };
                setMsg({ ok: false, text: errs[d.error] || "Couldn't send that offer." });
            }
        } catch { setMsg({ ok: false, text: "Couldn't send that offer." }); }
        finally { setBusy(false); }
    }

    if (!items.length) return null;
    const g = Math.max(0, Math.floor(Number(gold) || 0));
    const affordable = !mine || g <= (mine.gold || 0);

    const modal = pick ? (
        <div className="equip-sheet-overlay" onClick={() => setPick(null)} style={{ position: "fixed", inset: 0, zIndex: 1300, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,0.72)" }}>
            <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, maxHeight: "88vh", overflowY: "auto" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
                    <Glyph icon={pick.icon} rarity={pick.rarity} size={34} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="muted" style={{ fontSize: "0.72rem", textTransform: "uppercase" }}>Propose a trade for</div>
                        <div style={{ fontWeight: 800 }}>{pick.name}</div>
                        <div className="muted" style={{ fontSize: "0.76rem", textTransform: "capitalize" }}>{pick.rarity} · {pick.slot.replace("_", " ")} · {targetLabel}</div>
                    </div>
                </div>

                <p className="muted" style={{ margin: "0 0 6px" }}>Your offer — pick your un-equipped gear and/or add gold{mine ? ` (you have 🪙 ${(mine.gold || 0).toLocaleString()})` : ""}.</p>
                {mine && mine.myItems?.length ? (
                    <div className="equip-bag-grid" style={{ marginBottom: 10 }}>
                        {mine.myItems.map((it) => (
                            <button type="button" key={it.id} onClick={() => toggle(it.id)} className={`equip-card rar-${it.rarity}${chosen.has(it.id) ? " is-equipped" : ""}`} style={{ cursor: "pointer", outline: chosen.has(it.id) ? "2px solid #ffd75e" : "none" }}>
                                <span className="equip-card-glyph"><Glyph icon={it.icon} rarity={it.rarity} size={26} /></span>
                                <span className="equip-card-name">{it.name}</span>
                                <span className="muted" style={{ fontSize: "0.62rem", textTransform: "capitalize" }}>{it.slot.replace("_", " ")}</span>
                            </button>
                        ))}
                    </div>
                ) : mine ? <p className="muted" style={{ fontSize: "0.85rem" }}>You have no un-equipped gear to offer — you can still offer gold.</p> : <p className="muted">Loading your gear…</p>}

                <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0 12px" }}>
                    <span style={{ fontWeight: 700 }}>🪙 Gold</span>
                    <input type="number" min="0" value={gold} onChange={(e) => setGold(e.target.value)} placeholder="0" style={{ flex: 1, padding: "8px 10px", borderRadius: 8 }} />
                </label>

                {msg ? <p style={{ margin: "0 0 8px", color: msg.ok ? "var(--accent, #37e0a1)" : "#e0776a", fontWeight: 700 }}>{msg.text}</p> : null}
                <div style={{ display: "flex", gap: 10 }}>
                    <button type="button" className="button gold" style={{ flex: 1 }} disabled={busy || !affordable} onClick={send}>{busy ? "Sending…" : "Send offer →"}</button>
                    <button type="button" className="pill" onClick={() => setPick(null)}>Cancel</button>
                </div>
            </div>
        </div>
    ) : null;

    return (
        <>
            <p className="muted" style={{ margin: "12px 0 6px" }}>Inventory ({items.length}) · tap an item to propose a trade</p>
            <div className="equip-bag-grid">
                {items.map((it) => (
                    <button type="button" key={it.id} className={`equip-card rar-${it.rarity}`} style={{ cursor: "pointer" }} onClick={() => openFor(it)} title={`Propose a trade for ${it.name}`}>
                        <span className="equip-card-glyph"><Glyph icon={it.icon} rarity={it.rarity} size={30} /></span>
                        <span className="equip-card-name">{it.name}</span>
                        <span style={{ fontSize: "0.6rem", fontWeight: 800, color: "#ffd75e" }}>🤝 Trade</span>
                    </button>
                ))}
            </div>
            {mounted && modal ? createPortal(modal, document.body) : null}
        </>
    );
}
