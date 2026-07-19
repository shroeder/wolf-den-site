"use client";

import { useCallback, useEffect, useState } from "react";

import { itemIcon } from "@/lib/marketplace/items.js";

const RARITY = { common: "#9aa7b5", rare: "#4aa3ff", epic: "#b76bff", legendary: "#ffb52e", mythic: "#37f5c0", ascendant: "#ff7a3c", eternal: "#ff5cc8" };

function ItemPill({ it }) {
    const Icon = itemIcon(it.icon);
    return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 8px", borderRadius: 8, background: "rgba(255,255,255,0.05)", border: `1px solid ${RARITY[it.rarity] || "#333"}`, fontSize: "0.8rem", fontWeight: 700 }}>
            <span style={{ color: RARITY[it.rarity] || "#fff", display: "grid", placeItems: "center" }}><Icon aria-hidden="true" /></span>
            {it.name}
        </span>
    );
}

// The member's pending gear trades — accept/decline incoming, cancel outgoing. Lives on the gear page.
export default function GearTradesInbox() {
    const [trades, setTrades] = useState(null);
    const [busy, setBusy] = useState("");

    const load = useCallback(async () => {
        try {
            const r = await fetch("/api/marketplace/gear-trade", { cache: "no-store" });
            if (r.ok) { const d = await r.json(); setTrades(d.trades || []); }
        } catch { /* ignore */ }
    }, []);
    useEffect(() => { load(); }, [load]);

    async function respond(id, action) {
        setBusy(`${action}:${id}`);
        try {
            await fetch(`/api/marketplace/gear-trade/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
            await load();
        } catch { /* ignore */ }
        finally { setBusy(""); }
    }

    if (!trades || !trades.length) return null;

    return (
        <section className="card" id="trades">
            <h3 style={{ marginTop: 0 }}>🤝 Trade offers</h3>
            <div style={{ display: "grid", gap: 10 }}>
                {trades.map((t) => (
                    <div key={t.id} style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 12, background: t.direction === "incoming" ? "rgba(255,215,94,0.06)" : "rgba(255,255,255,0.02)" }}>
                        <div style={{ fontSize: "0.72rem", fontWeight: 800, color: t.direction === "incoming" ? "#ffd75e" : "#9aa4b2", letterSpacing: "0.04em", marginBottom: 6 }}>
                            {t.direction === "incoming" ? `INCOMING · ${t.withName} wants` : `OUTGOING · you offered ${t.withName}`}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 8 }}>
                            {t.requested ? <ItemPill it={t.requested} /> : null}
                            <span className="muted" style={{ fontWeight: 800 }}>⇄</span>
                            {t.offered.map((o) => <ItemPill key={o.id} it={o} />)}
                            {t.gold > 0 ? <span style={{ fontWeight: 800, color: "#ffd75e" }}>🪙 {t.gold.toLocaleString()}</span> : null}
                            {!t.offered.length && !t.gold ? <span className="muted">nothing</span> : null}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                            {t.direction === "incoming" ? (
                                <>
                                    <button type="button" className="button gold" disabled={!!busy} onClick={() => respond(t.id, "accept")}>{busy === `accept:${t.id}` ? "…" : "Accept"}</button>
                                    <button type="button" className="pill" disabled={!!busy} onClick={() => respond(t.id, "decline")}>Decline</button>
                                </>
                            ) : (
                                <button type="button" className="pill" disabled={!!busy} onClick={() => respond(t.id, "cancel")}>Cancel offer</button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
