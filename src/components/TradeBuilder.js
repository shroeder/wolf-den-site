"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import ItemArt from "@/components/ItemArt";
import PetArt from "@/components/PetArt";
import { statParts } from "@/lib/marketplace/items.js";

export function ItemToggle({ item, on, onClick, blocked = false, bound = false }) {
    const stats = item.stats && typeof item.stats === "object" ? Object.entries(item.stats) : [];
    return (
        <button
            type="button"
            className={`equip-card rar-${item.rarity}${on ? " is-equipped" : ""}`}
            onClick={blocked ? undefined : onClick}
            disabled={blocked}
            aria-disabled={blocked}
            title={bound ? "Bound — Ascendant+ gear can't be traded" : blocked ? "Equipped — unequip it on your Gear screen before you can trade it" : (item.chargeLabel ? `Charged perk: ${item.chargeLabel}` : item.name)}
            style={blocked ? { opacity: 0.55, cursor: "not-allowed" } : undefined}
        >
            <ItemArt id={item.id} icon={item.icon} className="equip-card-glyph" elements={item.elements} />
            <span className="equip-card-name">{item.name}</span>
            {stats.length ? (
                <span style={{ display: "flex", flexWrap: "wrap", gap: "3px 7px", justifyContent: "center", fontSize: "0.66rem", fontWeight: 800, color: "#dfe8d6", lineHeight: 1.3, margin: "1px 0 2px" }}>
                    {stats.map(([k, v]) => {
                        const p = statParts(k, v);
                        return <span key={k} title={`${p.value} ${p.label}`} style={p.intrinsic ? { color: "#ffd98a" } : undefined}>{p.icon} {p.value}</span>;
                    })}
                </span>
            ) : <span style={{ fontSize: "0.62rem", opacity: 0.55, margin: "1px 0 2px" }}>cosmetic</span>}
            {item.enhanceLevel > 0 ? <span style={{ fontSize: "0.6rem", color: "#8fe39a", fontWeight: 800 }}>⚒️ +{item.enhanceLevel} forged</span> : null}
            {item.util ? <span style={{ fontSize: "0.6rem", color: "#e0c8ff", fontWeight: 800 }}>🔮 +{item.util.value}{item.util.unit} {item.util.label}{item.util.level > 1 ? ` Lv${item.util.level}` : ""}</span> : null}
            {item.signature ? <span style={{ fontSize: "0.58rem", color: "#ffd75e", fontWeight: 800, lineHeight: 1.25 }}>★ {item.signature.label}</span> : null}
            {(item.charged || item.sea) ? (
                <span style={{ fontSize: "0.6rem", color: "#ffd75e", fontWeight: 700 }}>{item.charged ? "🔋 perk" : ""}{item.charged && item.sea ? " · " : ""}{item.sea ? "🌊 sea" : ""}</span>
            ) : null}
            {bound ? <span style={{ fontSize: "0.6rem", fontWeight: 800, color: "#ff9a5a" }}>🔒 bound</span> : blocked ? <span style={{ fontSize: "0.6rem", fontWeight: 800, color: "#ffd75e" }}>✓ equipped</span> : null}
            <span className="equip-card-stats">{bound ? "can't be traded" : blocked ? "unequip to trade" : on ? "✓ in trade" : "tap to add"}</span>
        </button>
    );
}

function PetToggle({ pet, on, onClick }) {
    return (
        <button type="button" className={`equip-card rar-${pet.rarity}${on ? " is-equipped" : ""}`} onClick={onClick}>
            <span className="equip-card-glyph" style={{ display: "grid", placeItems: "center" }}><PetArt id={pet.id} /></span>
            <span className="equip-card-name">🐾 {pet.name}</span>
            <span className="equip-card-stats">{on ? "✓ in trade" : "tap to add"}</span>
        </button>
    );
}

// Build a trade: pick items + gold YOU give, and items + gold you want from THEM.
export default function TradeBuilder({ me, them, preselectWant = null, preselectWantPet = null }) {
    const router = useRouter();
    const mePets = me.pets || [];
    const themPets = them.pets || [];
    const [give, setGive] = useState(new Set());
    const [get, setGet] = useState(() => (preselectWant && them.items.some((i) => i.id === preselectWant) ? new Set([preselectWant]) : new Set()));
    const [givePets, setGivePets] = useState(new Set());
    const [getPets, setGetPets] = useState(() => (preselectWantPet && themPets.some((p) => p.id === preselectWantPet) ? new Set([preselectWantPet]) : new Set()));
    const [giveGold, setGiveGold] = useState("");
    const [getGold, setGetGold] = useState("");
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    const toggle = (setFn) => (id) => setFn((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const gGold = Math.max(0, Math.floor(Number(giveGold) || 0));
    const empty = give.size === 0 && get.size === 0 && givePets.size === 0 && getPets.size === 0 && gGold === 0 && (Number(getGold) || 0) === 0;

    async function propose() {
        if (empty || busy) return;
        if (gGold > (me.gold || 0)) { setErr("You don't have that much gold."); return; }
        setBusy(true); setErr("");
        try {
            const r = await fetch("/api/marketplace/trade", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    action: "propose", toUserId: them.id,
                    offeredItems: [...give], offeredGold: gGold, offeredPets: [...givePets],
                    requestedItems: [...get], requestedGold: Math.max(0, Math.floor(Number(getGold) || 0)), requestedPets: [...getPets], note,
                }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) {
                const MSG = {
                    item_equipped: `${d?.itemName || "That item"} is equipped — unequip it on your Gear screen first, then trade it.`,
                    item_in_pending_trade: `${d?.itemName || "That item"} is already tied up in a pending trade — resolve or cancel that one first.`,
                    pet_in_pending_trade: `${d?.itemName || "That pet"} is already in a pending trade — resolve that one first.`,
                    they_dont_own_requested: "They no longer have that item.",
                    you_dont_own_offered: "You no longer have one of those items.",
                    collection_piece: `${d?.itemName || "That piece"} is a collection piece — its bonus is permanent for whoever found it, so it can't be traded away.`,
                    pet_not_tradeable: "One of your pets can't be traded (only earned pets you haven't already traded).",
                    their_pet_not_tradeable: "One of their pets isn't tradeable.",
                    they_already_own_pet: "They already own a pet you're offering.",
                    you_already_own_pet: "You already own a pet you're requesting.",
                    not_enough_gold: "You don't have enough gold to escrow.",
                    empty_trade: "Add something to the trade first.",
                    invalid_target: "You can't trade with that member.",
                };
                setErr(MSG[d?.error] || d?.error?.replace(/_/g, " ") || "Couldn't send offer.");
                return;
            }
            router.push("/marketplace/trade");
        } finally { setBusy(false); }
    }

    return (
        <div className="stack">
            <div className="grid two-col">
                <section className="card" style={{ borderColor: "rgba(255,215,94,0.28)" }}>
                    <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#ffd75e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
                        <span style={{ color: "#ffd75e" }}>You give</span>
                        <span className="equip-gold" style={{ marginLeft: "auto" }}>💰 {(me.gold || 0).toLocaleString()}</span>
                    </h2>
                    <label className="cart-field cart-field-full"><span>Gold to give</span>
                        <input type="number" min="0" value={giveGold} onChange={(e) => setGiveGold(e.target.value)} placeholder="0" />
                    </label>
                    <div className="equip-bag-grid" style={{ marginTop: 10 }}>
                        {me.items.length ? me.items.map((i) => <ItemToggle key={i.id} item={i} on={give.has(i.id)} blocked={Boolean(i.equipped || i.bound)} bound={Boolean(i.bound)} onClick={() => toggle(setGive)(i.id)} />)
                            : <p className="muted" style={{ margin: 0 }}>You have no items to give.</p>}
                    </div>
                    {mePets.length ? (
                        <>
                            <p className="muted" style={{ margin: "12px 0 6px", fontSize: "0.82rem" }}>🐾 Pets to give <span style={{ opacity: 0.7 }}>(they get a fresh copy; both become non-tradeable)</span></p>
                            <div className="equip-bag-grid">{mePets.map((p) => <PetToggle key={p.id} pet={p} on={givePets.has(p.id)} onClick={() => toggle(setGivePets)(p.id)} />)}</div>
                        </>
                    ) : null}
                </section>
                <section className="card" style={{ borderColor: "rgba(55,224,161,0.3)" }}>
                    <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#37e0a1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>
                        <span style={{ color: "#37e0a1" }}>You get</span> <span className="muted" style={{ fontSize: "0.85rem", fontWeight: 600 }}>from {them.label}</span>
                    </h2>
                    <label className="cart-field cart-field-full"><span>Gold to request</span>
                        <input type="number" min="0" value={getGold} onChange={(e) => setGetGold(e.target.value)} placeholder="0" />
                    </label>
                    <div className="equip-bag-grid" style={{ marginTop: 10 }}>
                        {them.items.length ? them.items.map((i) => <ItemToggle key={i.id} item={i} on={get.has(i.id)} onClick={() => toggle(setGet)(i.id)} />)
                            : <p className="muted" style={{ margin: 0 }}>They have no items to request.</p>}
                    </div>
                    {themPets.length ? (
                        <>
                            <p className="muted" style={{ margin: "12px 0 6px", fontSize: "0.82rem" }}>🐾 Pets to request <span style={{ opacity: 0.7 }}>(their earned pets you don&apos;t own)</span></p>
                            <div className="equip-bag-grid">{themPets.map((p) => <PetToggle key={p.id} pet={p} on={getPets.has(p.id)} onClick={() => toggle(setGetPets)(p.id)} />)}</div>
                        </>
                    ) : null}
                </section>
            </div>
            <section className="card">
                <label style={{ display: "block", marginBottom: 12 }}>
                    <span style={{ fontWeight: 800, fontSize: "0.82rem", color: "#cdbfa6", letterSpacing: "0.03em" }}>💬 ADD A NOTE (OPTIONAL)</span>
                    <input type="text" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Say something…"
                        style={{ width: "100%", marginTop: 8, padding: "13px 15px", borderRadius: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.14)", color: "#fff", fontSize: "0.98rem" }} />
                </label>
                {err ? <p style={{ color: "#ffb020", fontWeight: 700 }}>{err}</p> : null}
                <button type="button" onClick={propose} disabled={busy || empty}
                    style={{
                        width: "100%", padding: "15px", borderRadius: 999, border: "none",
                        fontWeight: 900, fontSize: "1.05rem", cursor: empty || busy ? "not-allowed" : "pointer",
                        background: empty || busy ? "rgba(255,255,255,0.1)" : "linear-gradient(90deg, #ffe08a, #ffb52e)",
                        color: empty || busy ? "#7a7a7a" : "#1a1206",
                        boxShadow: empty || busy ? "none" : "0 8px 24px -8px rgba(255,183,46,0.7)",
                        transition: "transform 0.08s ease",
                    }}>
                    {busy ? "Sending…" : empty ? "Add something to trade first" : `Send trade offer to ${them.label}`}
                </button>
            </section>
        </div>
    );
}
