"use client";

import { useCallback, useEffect, useState } from "react";

import ChestOpener from "@/components/ChestOpener";
import { EQUIP_SLOTS, STAT_META, describeStats, itemFitsSlot, itemIcon } from "@/lib/marketplace/items.js";

// The Diablo-style equipment screen: a paper-doll of 9 slots around the hero portrait, a live stat total,
// the owned-item bag, and any charged in-store perks. Tapping a slot opens a picker of fitting items.
const SLOT_ICON = {
    main_hand: "⚔️", off_hand: "🛡️", helmet: "🪖", chest: "🥋", belt: "🎗️", boots: "🥾", amulet: "📿", ring1: "💍", ring2: "💍",
};

function ItemGlyph({ id, className = "" }) {
    const Icon = itemIcon(itemDef(id)?.icon);
    return <span className={className}><Icon aria-hidden="true" /></span>;
}

// Resolve an item def from the loaded list (avoids re-importing ITEMS on the client render path).
let DEFS = {};
const itemDef = (id) => DEFS[id] || null;

export default function EquipmentClient({ avatarUrl = null, spriteUrl = null, displayLabel = "Hero", level = 1, backdropUrl = null }) {
    const [data, setData] = useState(null);
    const [loaded, setLoaded] = useState(false);
    const [slot, setSlot] = useState(null); // open picker for this slot
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [sellMode, setSellMode] = useState(false); // tap-to-sell instead of tap-to-equip

    const load = useCallback(async () => {
        const r = await fetch("/api/marketplace/inventory", { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        if (d) { DEFS = Object.fromEntries((d.items || []).map((i) => [i.id, i])); setData(d); }
        setLoaded(true);
    }, []);
    useEffect(() => { load(); }, [load]);

    async function post(body) {
        setBusy(true); setErr("");
        try {
            const r = await fetch("/api/marketplace/inventory", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
            const d = await r.json().catch(() => null);
            if (!r.ok) { setErr(d?.error || "Couldn't update."); return; }
            DEFS = Object.fromEntries((d.items || []).map((i) => [i.id, i]));
            setData(d);
        } finally { setBusy(false); }
    }

    function equip(slotKey, itemId) { setSlot(null); post({ slot: slotKey, itemId }); }
    function unequip(slotKey) { setSlot(null); post({ slot: slotKey, itemId: null }); }

    async function buy(itemId) {
        setBusy(true); setErr("");
        try {
            const r = await fetch("/api/marketplace/shop", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId }) });
            const d = await r.json().catch(() => null);
            if (!r.ok) { setErr(d?.error === "not_enough_gold" ? "Not enough gold." : (d?.error || "Couldn't buy.")); return; }
            DEFS = Object.fromEntries((d.items || []).map((i) => [i.id, i]));
            setData(d);
        } finally { setBusy(false); }
    }

    async function sell(item) {
        if (!item || item.sellValue <= 0) return;
        if (typeof window !== "undefined" && !window.confirm(`Sell ${item.name} for ${item.sellValue} gold? This can't be undone.`)) return;
        setBusy(true); setErr("");
        try {
            const r = await fetch("/api/marketplace/shop", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId: item.id, action: "sell" }) });
            const d = await r.json().catch(() => null);
            if (!r.ok) { setErr(d?.error || "Couldn't sell."); return; }
            DEFS = Object.fromEntries((d.items || []).map((i) => [i.id, i]));
            setData(d);
        } finally { setBusy(false); }
    }

    // Bag click: equip to its slot; rings go to the first free ring slot.
    function equipFromBag(item) {
        if (item.slot === "ring") {
            const target = !data.equipped.ring1 ? "ring1" : (!data.equipped.ring2 && data.equipped.ring1 !== item.id ? "ring2" : "ring1");
            equip(target, item.id);
        } else {
            equip(item.slot, item.id);
        }
    }

    if (!loaded) return <p className="muted">Opening your pack…</p>;
    if (!data) return <p className="muted">Sign in to view your gear.</p>;

    const equipped = data.equipped || {};
    const stats = data.stats || {};
    const statEntries = Object.entries(stats).filter(([, v]) => v);
    const charged = (data.items || []).filter((i) => i.charge);

    return (
        <div className="equip">
            <ChestOpener onLoot={load} />
            <div className="equip-doll" style={backdropUrl ? { backgroundImage: `linear-gradient(rgba(8,6,4,0.55), rgba(8,6,4,0.7)), url(${backdropUrl})` } : undefined}>
                {EQUIP_SLOTS.map((s) => {
                    const id = equipped[s.slot];
                    const def = id ? itemDef(id) : null;
                    return (
                        <button type="button" key={s.slot} className={`equip-slot slot-${s.slot}${def ? ` filled rar-${def.rarity}` : ""}`} onClick={() => setSlot(s.slot)} title={def ? def.name : s.label}>
                            {def ? <ItemGlyph id={id} className="equip-slot-glyph" /> : <span className="equip-slot-empty">{SLOT_ICON[s.slot]}</span>}
                        </button>
                    );
                })}
                <div className="equip-hero">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={spriteUrl || avatarUrl} alt={displayLabel} />
                    <span className="equip-hero-lv">Lv {level}</span>
                </div>
            </div>

            {/* Live stat total */}
            <div className="equip-stats card">
                <h3>⚔️ Combat stats <span className="equip-gold">🪙 {(data.gold || 0).toLocaleString()}</span></h3>
                {statEntries.length ? (
                    <div className="equip-stat-grid">
                        {statEntries.map(([k, v]) => (
                            <span key={k} className="equip-stat" title={STAT_META[k]?.desc || ""}>{STAT_META[k]?.icon || ""} <strong>+{v}{STAT_META[k]?.suffix || ""}</strong> {STAT_META[k]?.label || k}</span>
                        ))}
                    </div>
                ) : <p className="muted" style={{ margin: 0 }}>Equip gear to boost your boss fight — Might, crit, ferocity and more.</p>}
            </div>

            {/* Plain-English guide — so a player actually knows what each stat does for them. */}
            <details className="card" style={{ padding: "12px 16px" }}>
                <summary style={{ cursor: "pointer", fontWeight: 700 }}>❔ What do these stats do?</summary>
                <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "grid", gap: 10 }}>
                    {Object.entries(STAT_META).map(([k, m]) => (
                        <li key={k} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                            <strong style={{ minWidth: 120, whiteSpace: "nowrap" }}>{m.icon} {m.label}</strong>
                            <span className="muted" style={{ fontSize: "0.85rem" }}>{m.desc}</span>
                        </li>
                    ))}
                </ul>
            </details>

            {/* Slot picker */}
            {slot ? (
                <div className="card equip-picker">
                    <div className="equip-picker-head">
                        <h3>{EQUIP_SLOTS.find((s) => s.slot === slot)?.label}</h3>
                        <button type="button" className="pill" onClick={() => setSlot(null)}>Close</button>
                    </div>
                    {equipped[slot] ? <button type="button" className="pill" onClick={() => unequip(slot)} disabled={busy}>✕ Unequip {itemDef(equipped[slot])?.name}</button> : null}
                    <div className="equip-bag-grid">
                        {(data.items || []).filter((i) => itemFitsSlot(i, slot)).map((i) => (
                            <button type="button" key={i.id} className={`equip-card rar-${i.rarity}${i.equipped ? " is-equipped" : ""}`} onClick={() => equip(slot, i.id)} disabled={busy}>
                                <ItemGlyph id={i.id} className="equip-card-glyph" />
                                <span className="equip-card-name">{i.name}</span>
                                <span className="equip-card-stats">{describeStats(i.stats)}</span>
                            </button>
                        ))}
                        {!(data.items || []).some((i) => itemFitsSlot(i, slot)) ? <p className="muted" style={{ margin: 0 }}>No gear for this slot yet.</p> : null}
                    </div>
                </div>
            ) : null}

            {/* Charged perks */}
            {charged.length ? (
                <div className="card">
                    <h3>🎁 In-store perks</h3>
                    <p className="muted" style={{ marginTop: 0 }}>Show these to staff at the register to redeem — they&apos;ll use a charge for you.</p>
                    {charged.map((i) => (
                        <div key={i.id} className={`equip-perk rar-${i.rarity}`}>
                            <ItemGlyph id={i.id} className="equip-perk-glyph" />
                            <div className="equip-perk-body">
                                <strong>{i.name}</strong>
                                <span className="muted">{i.charge.rewardLabel}</span>
                                <span className="equip-perk-state">
                                    {i.charge.left > 0
                                        ? (i.charge.available ? `${i.charge.left} charge${i.charge.left === 1 ? "" : "s"} ready ✅` : `On cooldown · ${i.charge.left} left`)
                                        : "All used up"}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            ) : null}

            {/* The bag */}
            <div className="card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <h3 style={{ margin: 0 }}>🎒 Inventory</h3>
                    {(data.items || []).some((i) => i.sellValue > 0) ? (
                        <button type="button" className="pill" onClick={() => setSellMode((s) => !s)} disabled={busy}>{sellMode ? "✓ Done" : "💰 Sell gear"}</button>
                    ) : null}
                </div>
                {sellMode ? <p className="muted" style={{ margin: "6px 0 0" }}>Tap gear to sell it for gold. Worn items unequip automatically. Sold starter gear won&apos;t come back.</p> : null}
                {(data.items || []).length ? (
                    <div className="equip-bag-grid">
                        {(data.items || []).map((i) => (
                            <button type="button" key={i.id} className={`equip-card rar-${i.rarity}${i.equipped ? " is-equipped" : ""}`} onClick={() => (sellMode ? sell(i) : equipFromBag(i))} disabled={busy || (sellMode && i.sellValue <= 0)} title={i.signature ? `${i.signature.label}: ${i.signature.desc}` : describeStats(i.stats)}>
                                <ItemGlyph id={i.id} className="equip-card-glyph" />
                                <span className="equip-card-name">{i.name}</span>
                                <span className="equip-card-stats">{describeStats(i.stats)}</span>
                                {!sellMode && i.equipped ? <span style={{ fontSize: "0.62rem", fontWeight: 800, color: "#ffd75e" }}>✓ Equipped</span> : null}
                                {sellMode && i.sellValue > 0 ? <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "#ffd75e" }}>💰 Sell · {i.sellValue}</span> : null}
                                {sellMode && i.sellValue <= 0 ? <span style={{ fontSize: "0.6rem", color: "#9aa7b5" }}>Not sellable</span> : null}
                                {!sellMode && i.signature ? <span className="equip-card-sig">★ {i.signature.desc}</span> : null}
                            </button>
                        ))}
                    </div>
                ) : <p className="muted" style={{ margin: 0 }}>No items yet — level up, fight the boss, and check back.</p>}
            </div>

            {/* Gold shop */}
            {(data.shop || []).length ? (
                <div className="card">
                    <h3>🪙 Shop <span className="equip-gold">{(data.gold || 0).toLocaleString()} gold</span></h3>
                    <p className="muted" style={{ marginTop: 0 }}>Spend gold — earned alongside your XP — on gear.</p>
                    <div className="equip-bag-grid">
                        {(data.shop || []).map((i) => {
                            const Icon = itemIcon(i.icon);
                            return (
                                <button type="button" key={i.id} className={`equip-card rar-${i.rarity}`} onClick={() => buy(i.id)} disabled={busy || !i.canAfford} title={i.statsText}>
                                    <span className="equip-card-glyph"><Icon aria-hidden="true" /></span>
                                    <span className="equip-card-name">{i.name}</span>
                                    <span className="equip-card-stats">{i.statsText}</span>
                                    <span style={{ fontSize: "0.72rem", fontWeight: 800, color: i.canAfford ? "#ffd75e" : "#c9a24a", marginTop: 2 }}>🪙 {(i.cost || 0).toLocaleString()}{i.canAfford ? "" : " · need more"}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            ) : null}

            {err ? <p style={{ color: "#ff6b6b" }}>{err}</p> : null}
        </div>
    );
}
