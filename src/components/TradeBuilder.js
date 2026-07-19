"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { itemIcon } from "@/lib/marketplace/items.js";

function ItemToggle({ item, on, onClick }) {
    const Icon = itemIcon(item.icon);
    return (
        <button type="button" className={`equip-card rar-${item.rarity}${on ? " is-equipped" : ""}`} onClick={onClick}>
            <span className="equip-card-glyph"><Icon aria-hidden="true" /></span>
            <span className="equip-card-name">{item.name}</span>
            <span className="equip-card-stats">{on ? "✓ in trade" : "tap to add"}</span>
        </button>
    );
}

// Build a trade: pick items + gold YOU give, and items + gold you want from THEM.
export default function TradeBuilder({ me, them, preselectWant = null }) {
    const router = useRouter();
    const [give, setGive] = useState(new Set());
    const [get, setGet] = useState(() => (preselectWant && them.items.some((i) => i.id === preselectWant) ? new Set([preselectWant]) : new Set()));
    const [giveGold, setGiveGold] = useState("");
    const [getGold, setGetGold] = useState("");
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    const toggle = (setFn) => (id) => setFn((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const gGold = Math.max(0, Math.floor(Number(giveGold) || 0));
    const empty = give.size === 0 && get.size === 0 && gGold === 0 && (Number(getGold) || 0) === 0;

    async function propose() {
        if (empty || busy) return;
        if (gGold > (me.gold || 0)) { setErr("You don't have that much gold."); return; }
        setBusy(true); setErr("");
        try {
            const r = await fetch("/api/marketplace/trade", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    action: "propose", toUserId: them.id,
                    offeredItems: [...give], offeredGold: gGold,
                    requestedItems: [...get], requestedGold: Math.max(0, Math.floor(Number(getGold) || 0)), note,
                }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) { setErr(d?.error?.replace(/_/g, " ") || "Couldn't send offer."); return; }
            router.push("/marketplace/trade");
        } finally { setBusy(false); }
    }

    return (
        <div className="stack">
            <div className="grid two-col">
                <section className="card" style={{ borderColor: "rgba(224,68,58,0.35)" }}>
                    <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: "#ff7a6a" }}>📤 You give</span> <span className="equip-gold" style={{ marginLeft: "auto" }}>🪙 {(me.gold || 0).toLocaleString()}</span></h2>
                    <label className="cart-field cart-field-full"><span>Gold to give</span>
                        <input type="number" min="0" value={giveGold} onChange={(e) => setGiveGold(e.target.value)} placeholder="0" />
                    </label>
                    <div className="equip-bag-grid" style={{ marginTop: 10 }}>
                        {me.items.length ? me.items.map((i) => <ItemToggle key={i.id} item={i} on={give.has(i.id)} onClick={() => toggle(setGive)(i.id)} />)
                            : <p className="muted" style={{ margin: 0 }}>You have no items to give.</p>}
                    </div>
                </section>
                <section className="card" style={{ borderColor: "rgba(55,224,161,0.35)" }}>
                    <h2 style={{ marginTop: 0 }}><span style={{ color: "#37e0a1" }}>📥 You get</span> <span className="muted" style={{ fontSize: "0.85rem", fontWeight: 600 }}>from {them.label}</span></h2>
                    <label className="cart-field cart-field-full"><span>Gold to request</span>
                        <input type="number" min="0" value={getGold} onChange={(e) => setGetGold(e.target.value)} placeholder="0" />
                    </label>
                    <div className="equip-bag-grid" style={{ marginTop: 10 }}>
                        {them.items.length ? them.items.map((i) => <ItemToggle key={i.id} item={i} on={get.has(i.id)} onClick={() => toggle(setGet)(i.id)} />)
                            : <p className="muted" style={{ margin: 0 }}>They have no items to request.</p>}
                    </div>
                </section>
            </div>
            <section className="card">
                <label style={{ display: "block", marginBottom: 12 }}>
                    <span style={{ fontWeight: 800, fontSize: "0.82rem", color: "#cdbfa6", letterSpacing: "0.03em" }}>💬 ADD A NOTE (OPTIONAL)</span>
                    <input type="text" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Say something…"
                        style={{ width: "100%", marginTop: 8, padding: "13px 15px", borderRadius: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.14)", color: "#fff", fontSize: "0.98rem" }} />
                </label>
                {err ? <p style={{ color: "#ff6b6b", fontWeight: 700 }}>{err}</p> : null}
                <button type="button" onClick={propose} disabled={busy || empty}
                    style={{
                        width: "100%", padding: "15px", borderRadius: 999, border: "none",
                        fontWeight: 900, fontSize: "1.05rem", cursor: empty || busy ? "not-allowed" : "pointer",
                        background: empty || busy ? "rgba(255,255,255,0.1)" : "linear-gradient(90deg, #ffe08a, #ffb52e)",
                        color: empty || busy ? "#7a7a7a" : "#1a1206",
                        boxShadow: empty || busy ? "none" : "0 8px 24px -8px rgba(255,183,46,0.7)",
                        transition: "transform 0.08s ease",
                    }}>
                    {busy ? "Sending…" : empty ? "Add something to trade first" : `🔄 Send trade offer to ${them.label}`}
                </button>
            </section>
        </div>
    );
}
