"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
    const [detailItem, setDetailItem] = useState(null); // inventory item detail sheet (inspect → equip / sell)
    const [sellArmed, setSellArmed] = useState(false); // two-tap sell confirm inside the sheet (no native popup)
    const [coinBurst, setCoinBurst] = useState(null); // coin-shower juice on a sale
    const burstKey = useRef(0);

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

    function openDetail(item) { setSellArmed(false); setDetailItem(item); }
    function closeDetail() { setDetailItem(null); setSellArmed(false); }

    // A quick, bright "coin" chime via Web Audio (no asset, CSP-safe). Best-effort — silent if blocked.
    function playCoinSound() {
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            const ctx = new AC();
            if (ctx.resume) ctx.resume().catch(() => {});
            [987.77, 1318.51].forEach((freq, i) => { // B5 -> E6, the classic coin blip
                const t = ctx.currentTime + i * 0.08;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = "square";
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0, t);
                gain.gain.linearRampToValueAtTime(0.18, t + 0.01);
                gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
                osc.connect(gain).connect(ctx.destination);
                osc.start(t); osc.stop(t + 0.2);
            });
            setTimeout(() => ctx.close().catch(() => {}), 500);
        } catch { /* audio blocked — no problem */ }
    }

    // Shower of coins bursting outward + a "+N gold" pop when a sale lands.
    function celebrateCoins(amount) {
        const coins = Array.from({ length: 22 }, () => {
            const ang = Math.random() * Math.PI * 2;
            const dist = 80 + Math.random() * 180;
            return { x: `${Math.round(Math.cos(ang) * dist)}px`, y: `${Math.round(Math.sin(ang) * dist - 40)}px`, r: `${Math.round(Math.random() * 720 - 360)}deg`, d: `${(Math.random() * 0.12).toFixed(2)}s` };
        });
        setCoinBurst({ amount, coins, key: burstKey.current++ });
        playCoinSound();
        setTimeout(() => setCoinBurst(null), 1300);
    }

    async function doSell(item) {
        if (!item || item.sellValue <= 0) return;
        setBusy(true); setErr("");
        try {
            const r = await fetch("/api/marketplace/shop", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId: item.id, action: "sell" }) });
            const d = await r.json().catch(() => null);
            if (!r.ok) { setErr(d?.error || "Couldn't sell."); return; }
            DEFS = Object.fromEntries((d.items || []).map((i) => [i.id, i]));
            setData(d);
            closeDetail();
            celebrateCoins(d?.sold ?? item.sellValue);
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

            {/* Set bonuses */}
            {(data.setBonuses || []).length ? (
                <div className="card">
                    <h3>🧩 Set bonuses</h3>
                    <p className="muted" style={{ marginTop: 0 }}>Equip matching pieces of a set to unlock bonuses — they stack on top of your gear.</p>
                    {(data.setBonuses || []).map((s) => (
                        <div key={s.id} style={{ padding: "8px 0", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                                <strong>{s.name}</strong>
                                <span className="muted" style={{ fontSize: "0.8rem" }}>{s.equipped}/{s.total} equipped</span>
                            </div>
                            {s.tiers.map((t, i) => (
                                <div key={i} style={{ fontSize: "0.82rem", marginTop: 3, color: t.active ? "#ffd75e" : "#9aa7b5", fontWeight: t.active ? 700 : 400 }}>
                                    {t.active ? "✓" : "○"} {t.need}-piece: {describeStats(t.stats)}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            ) : null}

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
                <h3>🎒 Inventory</h3>
                <p className="muted" style={{ marginTop: 0 }}>Tap a piece of gear to see what it does — then equip or sell it.</p>
                {(data.items || []).length ? (
                    <div className="equip-bag-grid">
                        {(data.items || []).map((i) => (
                            <button type="button" key={i.id} className={`equip-card rar-${i.rarity}${i.equipped ? " is-equipped" : ""}`} onClick={() => openDetail(i)} disabled={busy} title={describeStats(i.stats)}>
                                <ItemGlyph id={i.id} className="equip-card-glyph" />
                                <span className="equip-card-name">{i.name}</span>
                                <span className="equip-card-stats">{describeStats(i.stats)}</span>
                                {i.equipped ? <span style={{ fontSize: "0.62rem", fontWeight: 800, color: "#ffd75e" }}>✓ Equipped</span> : null}
                                {i.signature ? <span className="equip-card-sig">★ {i.signature.desc}</span> : null}
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

            {/* Item detail sheet — inspect, then equip or sell. In-brand modal (no native browser popup). */}
            {detailItem ? (
                <div className="equip-sheet-overlay" onClick={closeDetail} style={{ position: "fixed", inset: 0, zIndex: 1200, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,0.72)", padding: "0 0 env(safe-area-inset-bottom)" }}>
                    <div className={`card equip-sheet rar-${detailItem.rarity}`} onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
                        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                            <ItemGlyph id={detailItem.id} className="equip-card-glyph" />
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontWeight: 800, fontSize: "1.1rem" }}>{detailItem.name}</div>
                                <div className="muted" style={{ fontSize: "0.8rem", textTransform: "capitalize" }}>{detailItem.rarity} · {detailItem.slot.replace("_", " ")}{detailItem.equipped ? " · Equipped ✓" : ""}</div>
                            </div>
                        </div>
                        <p style={{ margin: "12px 0 0", fontWeight: 700 }}>{describeStats(detailItem.stats) || "No combat stats"}</p>
                        {detailItem.signature ? <p style={{ margin: "6px 0 0", fontSize: "0.85rem", color: "#ffd75e" }}>★ {detailItem.signature.label} — {detailItem.signature.desc}</p> : null}
                        {detailItem.charge ? <p className="muted" style={{ margin: "6px 0 0", fontSize: "0.85rem" }}>🎁 {detailItem.charge.rewardLabel} — an in-store perk (can&apos;t be sold).</p> : null}
                        {detailItem.setName ? <p style={{ margin: "6px 0 0", fontSize: "0.85rem", color: "#8fd8ff" }}>🧩 Part of the {detailItem.setName} set</p> : null}
                        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                            {detailItem.equipped ? (
                                <button type="button" className="button" onClick={() => { const s = Object.keys(equipped).find((k) => equipped[k] === detailItem.id); if (s) unequip(s); closeDetail(); }} disabled={busy}>Unequip</button>
                            ) : (
                                <button type="button" className="button primary" onClick={() => { equipFromBag(detailItem); closeDetail(); }} disabled={busy}>⚔️ Equip</button>
                            )}
                            {detailItem.sellValue > 0 ? (
                                sellArmed ? (
                                    <button type="button" className="button gold" onClick={() => doSell(detailItem)} disabled={busy}>Confirm — sell for 🪙 {detailItem.sellValue}</button>
                                ) : (
                                    <button type="button" className="pill" onClick={() => setSellArmed(true)} disabled={busy}>💰 Sell for {detailItem.sellValue}</button>
                                )
                            ) : null}
                            <button type="button" className="pill" onClick={closeDetail} style={{ marginLeft: "auto" }}>Close</button>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* Coin-shower juice on a sale. */}
            {coinBurst ? (
                <div className="coinfx" key={coinBurst.key} aria-hidden="true">
                    {coinBurst.coins.map((c, i) => (
                        <span key={i} className="coinfx-coin" style={{ "--cx": c.x, "--cy": c.y, "--cr": c.r, animationDelay: c.d }}>🪙</span>
                    ))}
                    <div className="coinfx-amount">+{(coinBurst.amount || 0).toLocaleString()} 🪙</div>
                </div>
            ) : null}

            {err ? <p style={{ color: "#ff6b6b" }}>{err}</p> : null}
        </div>
    );
}
