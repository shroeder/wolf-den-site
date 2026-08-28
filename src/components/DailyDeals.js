"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import CoinCta from "@/components/CoinCta";
import ConsumableArt from "@/components/ConsumableArt";
import ItemArt from "@/components/ItemArt";
import PetArt from "@/components/PetArt";
import { itemById } from "@/lib/marketplace/items";
import { GiOpenBook } from "react-icons/gi";
import Coin from "@/components/Coin";

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
    if (deal.kind === "consumable") return <ConsumableArt id={deal.id} emoji={deal.emoji || "🧪"} className="deal-art" />;
    return <ItemArt id={deal.id} icon={deal.icon || itemById(deal.id)?.icon} className="deal-art" />;
}

export default function DailyDeals() {
    const [state, setState] = useState(null);
    const [busy, setBusy] = useState(null);
    const [msg, setMsg] = useState(null);
    const [secs, setSecs] = useState(0);
    const [inspect, setInspect] = useState(null); // deal being inspected
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

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

    async function reroll() {
        if (busy || !state?.canReset) return;
        setBusy("reroll"); setMsg(null);
        const r = await fetch("/api/marketplace/deals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reset" }) }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        if (!d?.ok) setMsg({ ok: false, text: { not_enough_gold: "Not enough gold.", already_reset: "Already rerolled today." }[d?.error] || "Couldn't reroll." });
        setBusy(null);
        await load();
    }

    if (!state || !state.deals?.length) return null;

    return (
        <section className="card deals-card">
            <div className="deals-head" style={{ marginBottom: 12 }}>
                <h2 style={{ margin: 0 }}>🔥 Today&apos;s Deals</h2>
                <span className="deals-timer">resets in {fmtCountdown(secs)}</span>
            </div>
            {state.signedIn && !state.resetUsed ? (
                <button type="button" className="quest-reroll" style={{ marginBottom: 14 }} onClick={reroll} disabled={busy === "reroll" || !state.canReset} title={state.canReset ? "" : "Not enough gold"}>
                    Reroll deals · <Coin /> {(state.resetCost || 1500).toLocaleString()}
                </button>
            ) : state.resetUsed ? <p className="muted" style={{ fontSize: "0.72rem", margin: "0 0 8px" }}>rerolled today — fresh deals tomorrow</p> : null}
            <p className="muted" style={{ margin: "2px 0 10px" }}>Discounted picks that rotate every day — grab them before they&apos;re gone.</p>
            {msg ? <p className={msg.ok ? "deals-ok" : "deals-err"}>{msg.text}</p> : null}
            <div className="deals-grid">
                {state.deals.map((d) => (
                    <div key={d.id} className={`deal${d.featured ? " is-featured" : ""}`}>
                        {d.featured ? <span className="deal-badge deal-featured">★ FEATURED</span> : <span className="deal-badge">-{Math.round(d.discount * 100)}%</span>}
                        {/* Same chip, same class, same corner as the gold shop's tiles and the auction's
                            cards — three shelves asking one question should not answer it three ways.
                            Top-right because .deal-badge already owns top-left. */}
                        {d.collected && !d.owned ? (
                            <span className="equip-dex" title="Already in your compendium — buying this again won't add to it">
                                <GiOpenBook aria-hidden="true" />logged
                            </span>
                        ) : null}
                        <button type="button" className="deal-inspect" onClick={() => setInspect(d)} title="Tap to see what it does">
                            <DealArt deal={d} />
                            <div className="deal-name">{d.name}</div>
                        </button>
                        <div className="deal-price">
                            <span className="deal-was"><Coin /> {d.basePrice.toLocaleString()}</span>
                            <span className="deal-now"><Coin /> {d.price.toLocaleString()}</span>
                        </div>
                        {d.owned ? (
                            <button type="button" className="deal-btn" disabled>Owned</button>
                        ) : d.claimed ? (
                            <button type="button" className="deal-btn" disabled>✓ Claimed</button>
                        ) : state.signedIn && state.gold < d.price ? (
                            <CoinCta price={d.price} />
                        ) : (
                            <button type="button" className="deal-btn" onClick={() => buy(d.id)} disabled={!state.signedIn || busy === d.id}>
                                {busy === d.id ? "…" : "Buy"}
                            </button>
                        )}
                    </div>
                ))}
            </div>
            {mounted && inspect ? createPortal((
                <div className="deal-sheet-overlay" onClick={() => setInspect(null)}>
                    <div className={`card deal-sheet rar-${inspect.rarity || "common"}`} onClick={(e) => e.stopPropagation()} style={{ borderColor: RARITY_COLOR[inspect.rarity] || "#3a3f47" }}>
                        <DealArt deal={inspect} />
                        <div className="deal-sheet-name" style={{ color: RARITY_COLOR[inspect.rarity] || "#fff" }}>{inspect.name}</div>
                        {inspect.rarity ? <div className="muted" style={{ fontSize: "0.72rem", textTransform: "capitalize", fontWeight: 700 }}>{inspect.rarity} {inspect.kind}</div> : <div className="muted" style={{ fontSize: "0.72rem" }}>{inspect.kind}</div>}
                        <p style={{ margin: "8px 0 0", fontSize: "0.9rem", fontWeight: 600 }}>{inspect.desc || "—"}</p>
                        <p className="deal-price" style={{ justifyContent: "center", marginTop: 10 }}>
                            <span className="deal-was"><Coin /> {inspect.basePrice.toLocaleString()}</span>
                            <span className="deal-now"><Coin /> {inspect.price.toLocaleString()}</span>
                        </p>
                        {inspect.owned ? <div className="muted">You own this.</div> : inspect.claimed ? <div className="muted">Claimed today.</div> : state.signedIn && state.gold < inspect.price ? (
                            <div style={{ marginTop: 8 }}><CoinCta price={inspect.price} label="Get coins to buy" /></div>
                        ) : (
                            <button type="button" className="button gold" style={{ marginTop: 8 }} onClick={() => { buy(inspect.id); setInspect(null); }} disabled={!state.signedIn}>
                                {`Buy · ${inspect.price.toLocaleString()} gold`}
                            </button>
                        )}
                    </div>
                </div>
            ), document.body) : null}
        </section>
    );
}
