"use client";

import { useEffect, useState } from "react";

import ItemArt from "@/components/ItemArt";
import PetArt from "@/components/PetArt";
import { itemById } from "@/lib/marketplace/items";

const RARITY_COLOR = { common: "#9aa0a6", rare: "#4aa3ff", epic: "#b76bff", legendary: "#ff9a3c", mythic: "#ff5a7a", ascendant: "#5ad0ff", eternal: "#ffd75e" };

function fmtCountdown(secs) {
    if (secs <= 0) return "0m";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
}

// Visual for a deal by kind: pet sprite, gear sprite, or a consumable emoji (sprite fallbacks to glyph).
function DealArt({ deal }) {
    if (deal.kind === "pet") return <PetArt id={deal.id} className="deal-art" />;
    if (deal.kind === "consumable") return <span className="deal-art">{deal.emoji || "🧪"}</span>;
    return <ItemArt id={deal.id} icon={deal.icon || itemById(deal.id)?.icon} className="deal-art" />;
}

export default function DailyDeals() {
    const [state, setState] = useState(null);
    const [busy, setBusy] = useState(null);
    const [msg, setMsg] = useState(null);
    const [secs, setSecs] = useState(0);

    async function load() {
        const r = await fetch("/api/marketplace/deals", { cache: "no-store" }).catch(() => null);
        const d = r?.ok ? await r.json().catch(() => null) : null;
        if (d) { setState(d); setSecs(d.resetInSecs || 0); }
    }
    useEffect(() => { load(); }, []);
    useEffect(() => {
        const t = setInterval(() => setSecs((s) => (s > 0 ? s - 1 : 0)), 1000);
        return () => clearInterval(t);
    }, []);

    async function buy(dealId) {
        setBusy(dealId); setMsg(null);
        const r = await fetch("/api/marketplace/deals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId }) }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        if (d?.ok) setMsg({ ok: true, text: `Got ${d.name}! 🎉` });
        else setMsg({ ok: false, text: { not_enough_gold: "Not enough gold.", already_claimed: "Already claimed today.", already_owned: "You already own that." }[d?.error] || "Couldn't buy that." });
        setBusy(null);
        await load();
    }

    if (!state || !state.deals?.length) return null;

    return (
        <section className="card deals-card">
            <div className="deals-head">
                <h2 style={{ margin: 0 }}>🔥 Today&apos;s Deals</h2>
                <span className="deals-timer">resets in {fmtCountdown(secs)}</span>
            </div>
            <p className="muted" style={{ margin: "2px 0 10px" }}>Discounted picks that rotate every day — grab them before they&apos;re gone. {state.signedIn ? <span>🪙 {state.gold.toLocaleString()}</span> : null}</p>
            {msg ? <p className={msg.ok ? "deals-ok" : "deals-err"}>{msg.text}</p> : null}
            <div className="deals-grid">
                {state.deals.map((d) => (
                    <div key={d.id} className={`deal${d.featured ? " is-featured" : ""}`}>
                        {d.featured ? <span className="deal-badge deal-featured">★ FEATURED</span> : <span className="deal-badge">-{Math.round(d.discount * 100)}%</span>}
                        <DealArt deal={d} />
                        <div className="deal-name">{d.name}</div>
                        <div className="deal-price">
                            <span className="deal-was">🪙 {d.basePrice.toLocaleString()}</span>
                            <span className="deal-now">🪙 {d.price.toLocaleString()}</span>
                        </div>
                        {d.owned ? (
                            <button type="button" className="deal-btn" disabled>Owned</button>
                        ) : d.claimed ? (
                            <button type="button" className="deal-btn" disabled>✓ Claimed</button>
                        ) : (
                            <button type="button" className="deal-btn" onClick={() => buy(d.id)} disabled={!state.signedIn || busy === d.id || state.gold < d.price}>
                                {busy === d.id ? "…" : state.gold < d.price ? "Need gold" : "Buy"}
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </section>
    );
}
