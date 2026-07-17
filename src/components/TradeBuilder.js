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
export default function TradeBuilder({ me, them }) {
    const router = useRouter();
    const [give, setGive] = useState(new Set());
    const [get, setGet] = useState(new Set());
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
                <section className="card">
                    <h2 style={{ marginTop: 0 }}>You give <span className="equip-gold">🪙 {(me.gold || 0).toLocaleString()}</span></h2>
                    <label className="cart-field cart-field-full"><span>Gold to give</span>
                        <input type="number" min="0" value={giveGold} onChange={(e) => setGiveGold(e.target.value)} placeholder="0" />
                    </label>
                    <div className="equip-bag-grid" style={{ marginTop: 10 }}>
                        {me.items.length ? me.items.map((i) => <ItemToggle key={i.id} item={i} on={give.has(i.id)} onClick={() => toggle(setGive)(i.id)} />)
                            : <p className="muted" style={{ margin: 0 }}>You have no items to give.</p>}
                    </div>
                </section>
                <section className="card">
                    <h2 style={{ marginTop: 0 }}>You get — from {them.label}</h2>
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
                <label className="cart-field cart-field-full"><span>Note (optional)</span>
                    <input type="text" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Say something…" />
                </label>
                {err ? <p style={{ color: "#ff6b6b" }}>{err}</p> : null}
                <button type="button" className="button primary" onClick={propose} disabled={busy || empty}>
                    {busy ? "Sending…" : `🔄 Send trade offer to ${them.label}`}
                </button>
            </section>
        </div>
    );
}
