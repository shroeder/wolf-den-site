"use client";

import { useCallback, useEffect, useState } from "react";

const KIND_LABEL = { potion: "Potion", scroll: "Scroll", stone: "Magic Stone" };

// Consumables: buy one-shot boosts with gold and use them from your stash. Potions/stones buff your boss
// fight (more damage / more attacks); scrolls give instant XP. Lives on the gear page.
export default function ConsumablesClient() {
    const [state, setState] = useState(null);
    const [busy, setBusy] = useState("");
    const [msg, setMsg] = useState(null);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/marketplace/consumables", { cache: "no-store" });
            if (res.ok) setState(await res.json());
        } catch {
            /* leave prior state */
        }
    }, []);
    useEffect(() => { load(); }, [load]);

    async function act(id, action, label) {
        if (busy) return;
        setBusy(`${action}:${id}`);
        setMsg(null);
        try {
            const res = await fetch("/api/marketplace/consumables", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, action }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.ok) {
                if (action === "use") setMsg({ ok: true, text: `${data.emoji || "✨"} ${data.name}: ${data.applied}!` });
                if (data.stash) setState(data.stash);
            } else {
                const errs = { not_enough_gold: "Not enough gold.", none_owned: "You don't have any of those.", unknown: "That item doesn't exist." };
                setMsg({ ok: false, text: errs[data.error] || "Couldn't do that right now." });
            }
        } catch {
            setMsg({ ok: false, text: "Couldn't do that right now." });
        } finally {
            setBusy("");
        }
    }

    if (!state) return null;
    const owned = (state.items || []).filter((i) => i.owned > 0);
    const active = state.active || [];

    return (
        <section className="card">
            <h2 style={{ marginTop: 0 }}>🧪 Consumables <span className="equip-gold">{(state.gold || 0).toLocaleString()} gold</span></h2>
            <p className="muted" style={{ marginTop: 0 }}>One-shot boosts for the boss fight. Potions &amp; stones buff your damage or attacks; scrolls give instant XP.</p>

            {active.length ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                    {active.map((b, i) => (
                        <span key={i} style={{ fontWeight: 800, fontSize: "0.85rem", color: "#37e0a1", background: "rgba(55,224,161,0.12)", border: "1px solid rgba(55,224,161,0.4)", borderRadius: 999, padding: "4px 12px" }}>
                            ⏳ {b.label} active
                        </span>
                    ))}
                </div>
            ) : null}

            {msg ? <p style={{ marginTop: 0, color: msg.ok ? "var(--accent, #37e0a1)" : "#e0776a", fontWeight: 700 }}>{msg.text}</p> : null}

            {owned.length ? (
                <>
                    <h3 style={{ margin: "6px 0" }}>Your stash</h3>
                    <div className="badge-board" style={{ marginBottom: 14 }}>
                        {owned.map((i) => (
                            <div key={i.id} className="badge-tile is-earned">
                                <span className="badge-tile-icon" aria-hidden="true">{i.emoji}</span>
                                <span className="badge-tile-label">{i.name} ×{i.owned}</span>
                                <span className="badge-tile-desc muted">{i.desc}</span>
                                <button type="button" className="btn btn-small" disabled={busy === `use:${i.id}`} onClick={() => act(i.id, "use", i.name)} style={{ marginTop: 6 }}>
                                    {busy === `use:${i.id}` ? "Using…" : "Use"}
                                </button>
                            </div>
                        ))}
                    </div>
                </>
            ) : null}

            <h3 style={{ margin: "6px 0" }}>🪙 Shop</h3>
            <div className="badge-board">
                {(state.items || []).map((i) => (
                    <div key={i.id} className="badge-tile">
                        <span className="badge-tile-icon" aria-hidden="true">{i.emoji}</span>
                        <span className="badge-tile-label">{i.name}</span>
                        <span className="badge-tile-desc muted">{KIND_LABEL[i.kind] || ""} · {i.desc}</span>
                        <button type="button" className="btn btn-small" disabled={!i.canAfford || busy === `buy:${i.id}`} onClick={() => act(i.id, "buy", i.name)} style={{ marginTop: 6 }}>
                            {busy === `buy:${i.id}` ? "Buying…" : i.canAfford ? `Buy · 🪙 ${i.price.toLocaleString()}` : `🪙 ${i.price.toLocaleString()}`}
                        </button>
                    </div>
                ))}
            </div>
        </section>
    );
}
