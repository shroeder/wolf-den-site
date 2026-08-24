"use client";

import { useCallback, useEffect, useState } from "react";

import ItemArt from "@/components/ItemArt";
import PetArt from "@/components/PetArt";

function Side({ items = [], gold = 0, pets = [] }) {
    if (!items.length && !gold && !pets.length) return <span className="muted">nothing</span>;
    return (
        <span className="trade-side">
            {gold ? <span className="trade-gold">💰 {gold.toLocaleString()}</span> : null}
            {items.map((it) => (
                <span key={it.id} className={`trade-item rar-${it.rarity}`} title={it.collected === false ? `${it.name} — new to your compendium` : it.name}>
                    <ItemArt id={it.id} icon={it.icon} className="trade-item-art" /> {it.name}
                    {/* The INVERSE of the shelves, deliberately. On a shop the useful signal is "you already
                        have this, it fills nothing"; on an offer somebody built for you it is "this one is
                        new", because that is the reason to say yes. `=== false` and not `!it.collected`:
                        the flag is absent on the side of the trade that is already yours, and absent must
                        not read as new. */}
                    {it.collected === false ? <b className="trade-item-new" title="New to your compendium">NEW</b> : null}
                </span>
            ))}
            {pets.map((p) => (
                <span key={`pet-${p.id}`} className={`trade-item rar-${p.rarity}`} title={p.name}><span className="trade-item-art" style={{ display: "inline-grid", placeItems: "center" }}><PetArt id={p.id} /></span> 🐾 {p.name}</span>
            ))}
        </span>
    );
}

export default function TradeInbox() {
    const [data, setData] = useState(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    const load = useCallback(async () => {
        const r = await fetch("/api/marketplace/trade", { cache: "no-store" }).catch(() => null);
        setData(r && r.ok ? await r.json().catch(() => null) : { incoming: [], outgoing: [] });
    }, []);
    useEffect(() => { load(); }, [load]);

    async function act(offerId, action) {
        setBusy(true); setErr("");
        try {
            const r = await fetch("/api/marketplace/trade", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, offerId }) });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) setErr(d?.error?.replace(/_/g, " ") || "Couldn't do that.");
            await load();
        } finally { setBusy(false); }
    }

    if (!data) return <p className="muted">Loading…</p>;
    const { incoming = [], outgoing = [] } = data;

    return (
        <div className="stack">
            {err ? <p style={{ color: "#ff6b6b" }}>{err}</p> : null}
            <section className="card">
                <h2 style={{ marginTop: 0 }}>Incoming offers</h2>
                {incoming.length ? incoming.map((o) => (
                    <div key={o.id} className="trade-offer">
                        <div className="trade-offer-body">
                            <strong>{o.from.label}</strong> offers you:
                            <div className="trade-line"><span className="muted">You get:</span> <Side items={o.offeredItems} gold={o.offeredGold} pets={o.offeredPets} /></div>
                            <div className="trade-line"><span className="muted">You give:</span> <Side items={o.requestedItems} gold={o.requestedGold} pets={o.requestedPets} /></div>
                            {o.note ? <p className="muted" style={{ margin: "4px 0 0" }}>“{o.note}”</p> : null}
                        </div>
                        <div className="trade-offer-actions">
                            <button type="button" className="button primary" onClick={() => act(o.id, "accept")} disabled={busy}>Accept</button>
                            <button type="button" className="pill" onClick={() => act(o.id, "decline")} disabled={busy}>Decline</button>
                        </div>
                    </div>
                )) : <p className="muted" style={{ margin: 0 }}>No incoming offers.</p>}
            </section>
            <section className="card">
                <h2 style={{ marginTop: 0 }}>Your sent offers</h2>
                {outgoing.length ? outgoing.map((o) => (
                    <div key={o.id} className="trade-offer">
                        <div className="trade-offer-body">
                            To <strong>{o.to.label}</strong>:
                            <div className="trade-line"><span className="muted">You give:</span> <Side items={o.offeredItems} gold={o.offeredGold} pets={o.offeredPets} /></div>
                            <div className="trade-line"><span className="muted">You get:</span> <Side items={o.requestedItems} gold={o.requestedGold} pets={o.requestedPets} /></div>
                        </div>
                        <div className="trade-offer-actions">
                            <button type="button" className="pill" onClick={() => act(o.id, "cancel")} disabled={busy}>Cancel</button>
                        </div>
                    </div>
                )) : <p className="muted" style={{ margin: 0 }}>No pending sent offers.</p>}
            </section>
        </div>
    );
}
