"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";

import ChestOpener from "@/components/ChestOpener";
import CoinCta from "@/components/CoinCta";
import HelmetSprite from "@/components/HelmetSprite";
import ItemArt from "@/components/ItemArt";
import ForgeRank from "@/components/ForgeRank";
import useScrollLock from "@/lib/useScrollLock";
import { trackClient } from "@/lib/marketplace/track-client";
import { EQUIP_SLOTS, STAT_META, describeStats, describeSea, describeFarm, itemFitsSlot } from "@/lib/marketplace/items.js";
import { itemElement, ELEMENTS } from "@/lib/marketplace/boss-weakness.js";

// An item's elemental affinity chip(s) — matters against a boss weak to that element (bonus damage). Prefers the
// effective (reforged) elements passed from the server; falls back to the item's deterministic base element.
function ElBadge({ id, elements }) {
    const els = Array.isArray(elements) && elements.length
        ? elements
        : (itemElement(id) ? [{ key: itemElement(id), ...ELEMENTS[itemElement(id)] }] : []);
    if (!els.length) return null;
    return <>{els.map((el) => <span key={el.key} className="equip-el" title={`${el.label} affinity — bonus damage vs a boss weak to ${el.label}`} style={{ color: el.color }}>{el.emoji} {el.label}</span>)}</>;
}

// The Diablo-style equipment screen: a paper-doll of 9 slots around the hero portrait, a live stat total,
// the owned-item bag, and any charged in-store perks. Tapping a slot opens a picker of fitting items.
const SLOT_ICON = {
    main_hand: "⚔️", off_hand: "🛡️", helmet: "🪖", chest: "🥋", belt: "🎗️", boots: "🥾", amulet: "📿", ring1: "💍", ring2: "💍", back: "🧣",
};

// Gold-shop categories, in display order — the shop groups its gear by slot into collapsible sections. Any
// slot not listed here is appended under "Other" so nothing is ever dropped.
const SHOP_SLOT_CATS = [
    { slot: "main_hand", label: "Weapons", icon: "⚔️" },
    { slot: "off_hand", label: "Off-Hand", icon: "🛡️" },
    { slot: "helmet", label: "Helmets", icon: "🪖" },
    { slot: "chest", label: "Chest Armor", icon: "🥋" },
    { slot: "belt", label: "Belts", icon: "🎗️" },
    { slot: "boots", label: "Boots", icon: "🥾" },
    { slot: "back", label: "Backs", icon: "🧣" },
    { slot: "amulet", label: "Amulets", icon: "📿" },
    { slot: "ring", label: "Rings", icon: "💍" },
];

function ItemGlyph({ id, className = "" }) {
    return <ItemArt id={id} icon={itemDef(id)?.icon} className={className} />;
}

// Render a slot's glyph. The helmet slot uses the approved Warplate Helm die-cut sprite (never the 🪖
// army-helmet emoji as a persistent icon); every other slot uses its emoji.
function SlotIcon({ slot, size = 18 }) {
    if (slot === "helmet") return <HelmetSprite size={size} />;
    return <>{SLOT_ICON[slot] || "🎒"}</>;
}

// Resolve an item def from the loaded list (avoids re-importing ITEMS on the client render path).
let DEFS = {};
const itemDef = (id) => DEFS[id] || null;

// Rarity colors for set pieces + a helper to strip the "Full set:" prefix off a capstone description.
const SET_RARITY = { common: "#9aa0a6", rare: "#4aa3ff", epic: "#b76bff", legendary: "#ff9a3c", mythic: "#ff5a7a", ascendant: "#5ad0ff", eternal: "#ffd75e" };
const capText = (desc) => (desc || "").replace(/^Full set:\s*/i, "");
// A set tier's bonus as text — stat bonuses and/or sea affinity (the sailing set grants the latter).
const tierText = (t) => [describeStats(t.stats || {}), t.sea ? describeSea(t.sea) : "", t.farm ? describeFarm(t.farm) : ""].filter(Boolean).join(" · ") || "—";

// A rich, tappable card for one set the player is building: piece dots, a progress bar, the tiered stat
// bonuses (active ones lit), and — the fun differentiator two sets otherwise hide — the full-set CAPSTONE.
function SetBonusCard({ set, onOpen }) {
    const complete = set.equipped >= set.total;
    const pct = Math.round((set.equipped / set.total) * 100);
    const nextTier = set.tiers.find((t) => !t.active);
    const need = nextTier ? nextTier.need - set.equipped : set.total - set.equipped;
    return (
        <button type="button" onClick={onOpen} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", marginTop: 8, borderRadius: 12, cursor: "pointer", color: "inherit", background: complete ? "linear-gradient(180deg, rgba(255,215,94,0.1), rgba(255,255,255,0.02))" : "rgba(255,255,255,0.03)", border: `1px solid ${complete ? "rgba(255,215,94,0.5)" : "rgba(255,255,255,0.1)"}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ display: "flex", gap: 3 }}>
                    {set.pieces.map((p) => (
                        <span key={p.id} title={p.equipped ? `${p.name} — equipped` : p.owned ? `${p.name} — owned, not equipped` : `${p.name} — locked`} style={{ width: 9, height: 9, borderRadius: "50%", boxSizing: "border-box", background: p.equipped ? (SET_RARITY[p.rarity] || "#ffd75e") : "transparent", border: p.equipped ? "none" : p.owned ? "1.5px solid rgba(255,255,255,0.55)" : "1.5px solid rgba(255,255,255,0.16)", boxShadow: p.equipped ? `0 0 6px ${SET_RARITY[p.rarity] || "#ffd75e"}` : "none" }} />
                    ))}
                </span>
                <strong style={{ flex: 1, minWidth: 0 }}>{set.name}{complete ? " ✨" : ""}</strong>
                <span className="muted" style={{ fontSize: "0.78rem", whiteSpace: "nowrap" }}>{set.equipped}/{set.total} worn{set.owned > set.equipped ? ` · ${set.owned} owned` : ""}</span>
                <span aria-hidden="true" style={{ opacity: 0.5 }}>›</span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden", marginTop: 8 }}>
                <div style={{ height: "100%", width: `${pct}%`, borderRadius: 999, background: complete ? "linear-gradient(90deg,#ffd75e,#ffb648)" : "linear-gradient(90deg,#4aa3ff,#8fd8ff)", transition: "width .4s ease" }} />
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 12px", marginTop: 7 }}>
                {set.tiers.map((t, i) => (
                    <span key={i} style={{ fontSize: "0.78rem", color: t.active ? "#ffd75e" : "#7f8a97", fontWeight: t.active ? 700 : 500 }}>{t.active ? "✓" : "○"} {t.need}-pc: {tierText(t)}</span>
                ))}
            </div>
            {set.capstone ? (
                <div style={{ marginTop: 7, display: "flex", gap: 6, alignItems: "flex-start", padding: "6px 9px", borderRadius: 8, background: set.capstone.active ? "linear-gradient(180deg, rgba(255,215,94,0.16), rgba(255,215,94,0.04))" : "rgba(255,255,255,0.03)", border: `1px solid ${set.capstone.active ? "rgba(255,215,94,0.5)" : "rgba(255,255,255,0.08)"}` }}>
                    <span aria-hidden="true">{set.capstone.active ? "⭐" : "🔒"}</span>
                    <span style={{ fontSize: "0.8rem", color: set.capstone.active ? "#ffe9a8" : "#9aa7b5", fontWeight: set.capstone.active ? 700 : 500 }}><strong>Full set:</strong> {capText(set.capstone.desc)}</span>
                </div>
            ) : null}
            {!complete && need > 0 ? (
                <div style={{ marginTop: 6, fontSize: "0.74rem", color: "#8fd8ff", fontWeight: 600 }}>
                    {nextTier ? `＋ Equip ${need} more to unlock the ${nextTier.need}-piece bonus` : `＋ Equip ${need} more to complete the set & unlock its capstone`}
                </div>
            ) : null}
        </button>
    );
}

// The full set breakdown: every piece (equipped / owned / locked) plus all tiers and the capstone. Owned
// pieces can be equipped (or unequipped) right here — no need to hunt the slot in the paper-doll.
function SetDetailSheet({ set, onClose, onEquip, onUnequip, busy = false }) {
    const complete = set.equipped >= set.total;
    const pct = Math.round((set.equipped / set.total) * 100);
    return createPortal((
        <div className="equip-sheet-overlay" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1300, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.8)", padding: 16 }}>
            <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 420, margin: 0, maxHeight: "88dvh", overflowY: "auto", borderColor: complete ? "rgba(255,215,94,0.5)" : "rgba(143,216,255,0.4)", borderWidth: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span aria-hidden="true"><HelmetSprite size={22} /></span>
                    <h3 style={{ margin: 0, flex: 1 }}>{set.name}{complete ? " ✨" : ""}</h3>
                    <span className="muted" style={{ fontSize: "0.8rem", whiteSpace: "nowrap" }}>{set.equipped}/{set.total} equipped</span>
                </div>
                <div style={{ height: 7, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden", marginTop: 10 }}>
                    <div style={{ height: "100%", width: `${pct}%`, borderRadius: 999, background: complete ? "linear-gradient(90deg,#ffd75e,#ffb648)" : "linear-gradient(90deg,#4aa3ff,#8fd8ff)", transition: "width .4s ease" }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px,1fr))", gap: 8, marginTop: 12 }}>
                    {set.pieces.map((p) => (
                        <div key={p.id} title={p.statsText || ""} style={{ display: "flex", flexDirection: "column", padding: 8, borderRadius: 12, textAlign: "center", border: `1.5px solid ${p.equipped ? (SET_RARITY[p.rarity] || "#ffd75e") : "rgba(255,255,255,0.1)"}`, background: p.equipped ? "rgba(255,215,94,0.06)" : "rgba(255,255,255,0.03)", opacity: p.owned || p.equipped ? 1 : 0.55 }}>
                            <ItemArt id={p.id} icon={p.icon} className="set-tile-art" />
                            <div style={{ fontSize: "0.72rem", fontWeight: 700, marginTop: 3, color: p.equipped ? (SET_RARITY[p.rarity] || undefined) : undefined }}>{p.name}</div>
                            <div className="muted" style={{ fontSize: "0.66rem", marginTop: 1 }}>{p.equipped ? "✅ equipped" : p.owned ? "• owned" : "🔒 locked"}</div>
                            {p.equipped ? (
                                onUnequip ? <button type="button" className="pill" onClick={() => onUnequip(p)} disabled={busy} style={{ marginTop: 6, fontSize: "0.68rem", padding: "3px 8px", alignSelf: "center" }}>Unequip</button> : null
                            ) : p.owned && onEquip ? (
                                <button type="button" className="pill" onClick={() => onEquip(p)} disabled={busy} style={{ marginTop: 6, fontSize: "0.68rem", padding: "3px 8px", alignSelf: "center", background: "rgba(143,216,255,0.14)", borderColor: "rgba(143,216,255,0.5)", color: "#8fd8ff" }}>⚔️ Equip</button>
                            ) : null}
                        </div>
                    ))}
                </div>
                <div style={{ marginTop: 14 }}>
                    <div className="muted" style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 800, marginBottom: 2 }}>Set bonuses</div>
                    {set.tiers.map((t, i) => (
                        <div key={i} style={{ fontSize: "0.88rem", padding: "4px 0", color: t.active ? "#ffd75e" : "#9aa7b5", fontWeight: t.active ? 700 : 500 }}>{t.active ? "✓" : "○"} <strong>{t.need}-piece:</strong> {tierText(t)}</div>
                    ))}
                    {set.capstone ? (
                        <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: set.capstone.active ? "linear-gradient(180deg, rgba(255,215,94,0.18), rgba(255,215,94,0.05))" : "rgba(255,255,255,0.03)", border: `1px solid ${set.capstone.active ? "rgba(255,215,94,0.55)" : "rgba(255,255,255,0.1)"}` }}>
                            <div style={{ fontWeight: 800, color: set.capstone.active ? "#ffd75e" : "#c9b98a" }}>{set.capstone.active ? "⭐ Capstone — ACTIVE" : "🔒 Full-set capstone"}</div>
                            <div style={{ fontSize: "0.85rem", marginTop: 2, color: set.capstone.active ? "#ffe9a8" : "#9aa7b5" }}>{capText(set.capstone.desc)}</div>
                        </div>
                    ) : null}
                </div>
                <button type="button" className="button" onClick={onClose} style={{ marginTop: 14, width: "100%" }}>Close</button>
            </div>
        </div>
    ), document.body);
}

// Friendly text for a charge-claim mint failure.
const chargeErr = (code) => ({
    no_charges: "No charges left on this perk.",
    on_cooldown: "This perk is still on cooldown.",
    not_owned: "You don't own this perk.",
    not_chargeable: "That item has no in-store charge.",
    unauthorized: "Please sign in again.",
}[code] || "Couldn't start that redemption. Try again.");

export default function EquipmentClient({ avatarUrl = null, spriteUrl = null, spriteFlip = false, displayLabel = "Hero", level = 1, backdropUrl = null, view = "gear" }) {
    const [data, setData] = useState(null);
    const [loaded, setLoaded] = useState(false);
    const [slot, setSlot] = useState(null); // open picker for this slot
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [detailItem, setDetailItem] = useState(null); // inventory item detail sheet (inspect → equip / sell)
    const [setDetail, setSetDetail] = useState(null); // the full set breakdown modal (from a set card or an item's set link)
    const [sellArmed, setSellArmed] = useState(false); // two-tap sell confirm inside the sheet (no native popup)
    const [salvageArmed, setSalvageArmed] = useState(false); // two-tap salvage confirm (sends the piece to the Forge for parts)
    const [salvaged, setSalvaged] = useState(null); // brief "salvaged into N parts" toast
    const [coinBurst, setCoinBurst] = useState(null); // coin-shower juice on a sale
    const burstKey = useRef(0);
    const [chargeClaim, setChargeClaim] = useState(null); // { token, qr, rewardLabel, itemName } — QR to show staff
    const [buyCele, setBuyCele] = useState(null); // purchase celebration (the item you just bought)
    useScrollLock(Boolean(detailItem) || Boolean(setDetail) || Boolean(chargeClaim) || Boolean(buyCele)); // lock bg scroll behind any sheet
    const [collapsedCats, setCollapsedCats] = useState(() => new Set()); // store: which shop slot-categories are collapsed
    const toggleCat = (slot) => setCollapsedCats((prev) => { const n = new Set(prev); if (n.has(slot)) n.delete(slot); else n.add(slot); return n; });

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

    // Member taps a READY in-store perk → mint a claim + show its QR. Staff scan it to actually use the
    // charge (nothing is burned here). The QR encodes an opaque token behind a scheme prefix the admin app
    // recognizes, so a random camera just sees harmless text.
    async function useCharge(item) {
        setBusy(true); setErr("");
        try {
            const r = await fetch("/api/marketplace/item-charge/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId: item.id }) });
            const d = await r.json().catch(() => null);
            if (!r.ok || !d?.ok) { setErr(chargeErr(d?.error)); return; }
            const qr = await QRCode.toDataURL(`WDCHG:${d.token}`, { width: 320, margin: 1 }).catch(() => null);
            setChargeClaim({ token: d.token, qr, rewardLabel: d.rewardLabel || item.charge?.rewardLabel || "Perk", itemName: item.name });
            trackClient("use_charge", { itemId: item.id, name: item.name });
        } finally { setBusy(false); }
    }
    function closeChargeClaim() { setChargeClaim(null); load(); } // reload so a just-scanned charge reflects

    async function buy(item) {
        const itemId = typeof item === "string" ? item : item?.id;
        setBusy(true); setErr("");
        try {
            const r = await fetch("/api/marketplace/shop", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId }) });
            const d = await r.json().catch(() => null);
            if (!r.ok) { setErr(d?.error === "not_enough_gold" ? "Not enough gold." : (d?.error || "Couldn't buy.")); return; }
            DEFS = Object.fromEntries((d.items || []).map((i) => [i.id, i]));
            setData(d);
            // 🎉 Buy dopamine — celebrate the new gear with a sound + a burst.
            const bought = (typeof item === "object" && item) || DEFS[itemId] || { id: itemId };
            playCoinSound();
            setBuyCele({ id: bought.id, name: bought.name || "New gear", icon: bought.icon, rarity: bought.rarity || "common", key: (burstKey.current += 1) });
        } finally { setBusy(false); }
    }

    function openDetail(item) {
        setSellArmed(false); setSalvageArmed(false); setDetailItem(item);
        trackClient("inspect_item", { itemId: item.id, name: item.name, shop: Boolean(item.shop) });
    }
    function closeDetail() { setDetailItem(null); setSellArmed(false); setSalvageArmed(false); }

    // Salvage an unequipped piece at the Forge → tiered parts (the item is consumed). Refresh the bag after.
    async function doSalvage(item) {
        if (!item || item.equipped || item.shop) return;
        setBusy(true); setErr("");
        try {
            const r = await fetch("/api/marketplace/crafting", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId: item.id, action: "salvage" }) });
            const d = await r.json().catch(() => null);
            if (!r.ok || !d?.ok) { setErr(d?.error === "equipped" ? "Unequip it first." : "Couldn't salvage that."); return; }
            closeDetail();
            await load();
            const g = d.gained;
            // Surface EVERY proc — same rewards as the Forge, just under-reported here before (looked like "less").
            const bits = [g ? `🔩 ${g.n} tier-${g.tier} part${g.n === 1 ? "" : "s"}${d.doubled ? " ✦ DOUBLED!" : ""}` : "Salvaged into parts"];
            if (d.enhanceBonus > 0) bits.push(`+${d.enhanceBonus} recovered from forging`);
            if (d.bonusTier) bits.push(`👁️ +1 tier-${d.bonusTier} (Keen Eye!)`);
            if (d.regaliaDrop) bits.push(`✨ RARE: ${d.regaliaDrop}!`);
            if (d.xp) bits.push(`+${d.xp} XP`);
            setSalvaged(bits.join(" · "));
            setTimeout(() => setSalvaged(null), d.regaliaDrop ? 5000 : 3500);
            if (typeof window !== "undefined") window.dispatchEvent(new Event("wolfden-hud-refresh"));
        } finally { setBusy(false); }
    }

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
    // Group the gold shop by slot into ordered, collapsible categories (any unlisted slot → "Other").
    const shopBySlot = (data.shop || []).reduce((acc, i) => { (acc[i.slot] = acc[i.slot] || []).push(i); return acc; }, {});
    const shopCategories = [
        ...SHOP_SLOT_CATS.filter((c) => shopBySlot[c.slot]?.length).map((c) => ({ ...c, items: shopBySlot[c.slot] })),
        ...Object.keys(shopBySlot).filter((s) => !SHOP_SLOT_CATS.some((c) => c.slot === s))
            .map((s) => ({ slot: s, label: s.replace(/_/g, " "), icon: "🎒", items: shopBySlot[s] })),
    ];

    return (
        <div className="equip">
            {view !== "store" ? (<>
            <ChestOpener onLoot={load} />
            <div className="equip-doll" style={backdropUrl ? { backgroundImage: `linear-gradient(rgba(8,6,4,0.55), rgba(8,6,4,0.7)), url(${backdropUrl})` } : undefined}>
                {EQUIP_SLOTS.map((s) => {
                    const id = equipped[s.slot];
                    const def = id ? itemDef(id) : null;
                    return (
                        <button type="button" key={s.slot} className={`equip-slot slot-${s.slot}${def ? ` filled rar-${def.rarity}` : ""}`} onClick={() => setSlot(s.slot)} title={def ? `${def.name}${def.enhanceLevel > 0 ? ` +${def.enhanceLevel}` : ""}` : s.label} style={{ position: "relative" }}>
                            {def ? <ItemGlyph id={id} className="equip-slot-glyph" /> : <span className="equip-slot-empty"><SlotIcon slot={s.slot} size={20} /></span>}
                            {def && def.enhanceLevel > 0 ? <span style={{ position: "absolute", top: -5, right: -5, zIndex: 3 }}><ForgeRank level={def.enhanceLevel} size={20} /></span> : null}
                        </button>
                    );
                })}
                <div className="equip-hero">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {/* Mirror only the sprite (not the head-on avatar fallback) when flagged backwards. */}
                    <img src={spriteUrl || avatarUrl} alt={displayLabel} style={spriteUrl && spriteFlip ? { transform: "scaleX(-1)" } : undefined} />
                    <span className="equip-hero-lv">Lv {level}</span>
                </div>
            </div>

            {/* Live stat total */}
            <div className="equip-stats card">
                <h3>⚔️ Combat stats</h3>
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

            {/* Set bonuses — the sets you're actively wearing, with progress + capstones (tap for the full set) */}
            {(() => {
                const active = (data.setsOverview || []).filter((s) => s.equipped > 0).sort((a, b) => b.equipped / b.total - a.equipped / a.total);
                if (!active.length) return null;
                return (
                    <div className="card">
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <h3 style={{ margin: 0, flex: 1, display: "inline-flex", alignItems: "center", gap: 7 }}><HelmetSprite size={20} /> Set bonuses</h3>
                            <a href="/marketplace/sets" style={{ fontSize: "0.8rem", fontWeight: 700, color: "#8fd8ff" }}>all sets →</a>
                        </div>
                        <p className="muted" style={{ margin: "4px 0 0" }}>Matching pieces stack extra stats on top of your gear — and a <strong style={{ color: "#ffd75e" }}>full set</strong> unlocks a game-changing capstone. Tap a set for the full breakdown.</p>
                        {active.map((s) => (
                            <SetBonusCard key={s.id} set={s} onOpen={() => setSetDetail(s)} />
                        ))}
                    </div>
                );
            })()}

            {/* Slot picker */}
            {slot ? (
                <div className="card equip-picker">
                    <div className="equip-picker-head">
                        <h3>{EQUIP_SLOTS.find((s) => s.slot === slot)?.label}</h3>
                        <button type="button" className="pill" onClick={() => setSlot(null)}>Close</button>
                    </div>
                    <p className="muted" style={{ margin: "0 0 8px", fontSize: "0.78rem" }}>👆 Tap an item to equip it in this slot.</p>
                    {equipped[slot] ? <button type="button" className="pill" onClick={() => unequip(slot)} disabled={busy}>✕ Unequip {itemDef(equipped[slot])?.name}</button> : null}
                    <div className="equip-bag-grid">
                        {(data.items || []).filter((i) => itemFitsSlot(i, slot)).map((i) => (
                            <button type="button" key={i.id} className={`equip-card rar-${i.rarity}${i.equipped ? " is-equipped" : ""}`} onClick={() => equip(slot, i.id)} disabled={busy}>
                                <ItemGlyph id={i.id} className="equip-card-glyph" />
                                <span className="equip-card-name">{i.name}</span>
                                <span className="equip-card-stats">{describeStats(i.stats)}</span>
                                {i.sea ? <span className="equip-card-sea">{describeSea(i.sea)}</span> : null}
                                <ElBadge id={i.id} elements={i.elements} />
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
                    <p className="muted" style={{ marginTop: 0 }}>Tap <strong>Use charge</strong> on a ready perk to get a QR — show it to staff and they&apos;ll scan it to redeem.</p>
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
                            {i.charge.available ? (
                                <button type="button" className="equip-perk-use" onClick={() => useCharge(i)} disabled={busy}>Use charge</button>
                            ) : null}
                        </div>
                    ))}
                </div>
            ) : null}

            {/* The bag */}
            <div className="card">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <h3 style={{ margin: 0, flex: 1 }}>🎒 Inventory</h3>
                    <a href="/marketplace/trade" style={{ fontSize: "0.8rem", fontWeight: 700, color: "#8fd8ff", whiteSpace: "nowrap" }}>my trades →</a>
                </div>
                <p className="muted" style={{ marginTop: 4 }}>Tap a piece of gear to see what it does — then equip, sell, or trade it.</p>
                {(data.items || []).length ? (
                    <div className="equip-bag-grid">
                        {(data.items || []).map((i) => (
                            <button type="button" key={i.id} className={`equip-card rar-${i.rarity}${i.equipped ? " is-equipped" : ""}`} onClick={() => openDetail(i)} disabled={busy} title={`${i.slot.replace("_", " ")} · ${describeStats(i.stats)}`} style={{ position: "relative" }}>
                                {i.enhanceLevel > 0 ? <span style={{ position: "absolute", top: -4, right: -4, zIndex: 3 }}><ForgeRank level={i.enhanceLevel} size={22} /></span> : null}
                                <ItemGlyph id={i.id} className="equip-card-glyph" />
                                <span className="equip-card-name">{i.name}</span>
                                <span className="muted" style={{ fontSize: "0.66rem", fontWeight: 700, textTransform: "capitalize", letterSpacing: "0.03em" }}>{i.slot.replace("_", " ")}</span>
                                <span className="equip-card-stats">{describeStats(i.stats)}</span>
                                {i.equipped ? <span style={{ fontSize: "0.62rem", fontWeight: 800, color: "#ffd75e" }}>✓ Equipped</span> : null}
                                {i.signature ? <span className="equip-card-sig">★ {i.signature.desc}</span> : null}
                                {i.farmText ? <span style={{ fontSize: "0.62rem", fontWeight: 800, color: "#8fe39a" }}>🌱 {i.farmText}</span> : null}
                                {i.util ? <span style={{ fontSize: "0.62rem", fontWeight: 800, color: "#e0c8ff" }}>🔮 +{i.util.value}{i.util.unit} {i.util.label}{i.util.level > 1 ? ` Lv${i.util.level}` : ""}</span> : null}
                            </button>
                        ))}
                    </div>
                ) : <p className="muted" style={{ margin: 0 }}>No items yet — level up, fight the boss, and check back.</p>}
            </div>
            </>) : null}

            {/* Gold shop — its own STORE view, gear grouped by slot into collapsible categories. */}
            {view !== "gear" && (data.shop || []).length ? (
                <div className="card">
                    <h3>🪙 Gold Shop</h3>
                    <p className="muted" style={{ marginTop: 0 }}>Spend gold — earned alongside your XP — on gear. Browse by slot.</p>
                    {data.coupon ? <div className="shop-coupon">🏷️ {data.coupon.pct}% off the in-game 🪙 gold shop — auto-applies to your next gold gear pick ≤ 🪙 {data.coupon.max.toLocaleString()} (one use). Not a real-store discount.</div> : null}
                    {shopCategories.map((cat) => {
                        const open = !collapsedCats.has(cat.slot);
                        return (
                            <div key={cat.slot} className="shop-cat">
                                <button type="button" className="collapse-head" onClick={() => toggleCat(cat.slot)} aria-expanded={open}>
                                    <span style={{ textTransform: "capitalize", display: "inline-flex", alignItems: "center", gap: 6 }}>{cat.slot === "helmet" ? <HelmetSprite size={16} /> : cat.icon} {cat.label}<span className="collapse-count">{cat.items.length}</span></span>
                                    <span className="collapse-chevron">{open ? "▾" : "▸"}</span>
                                </button>
                                {open ? (
                                    <div className="equip-bag-grid">
                                        {cat.items.map((i) => (
                                            <button type="button" key={i.id} className={`equip-card rar-${i.rarity}`} onClick={() => openDetail(i)} disabled={busy} title={`${i.slot.replace("_", " ")} · ${i.statsText}`}>
                                                <ItemArt id={i.id} icon={i.icon} className="equip-card-glyph" />
                                                <span className="equip-card-name">{i.name}</span>
                                                <span className="equip-card-stats">{i.statsText}</span>
                                                <ElBadge id={i.id} />
                                                {i.signature ? <span className="equip-card-sig">★ {i.signature.label}</span> : null}
                                                {i.farmText ? <span style={{ fontSize: "0.62rem", fontWeight: 800, color: "#8fe39a" }}>🌱 {i.farmText}</span> : null}
                                                {!i.signature && i.sea ? <span style={{ fontSize: "0.62rem", fontWeight: 800, color: "#7fd8ff" }}>⚓ Sea affinity</span> : null}
                                                <span style={{ fontSize: "0.72rem", fontWeight: 800, color: i.canAfford ? "#ffd75e" : "#c9a24a", marginTop: 2 }}>🪙 {i.discounted ? <><span style={{ textDecoration: "line-through", opacity: 0.55, fontWeight: 700 }}>{(i.cost || 0).toLocaleString()}</span> {(i.effectiveCost || 0).toLocaleString()}</> : (i.cost || 0).toLocaleString()}{i.canAfford ? "" : " · need more"}</span>
                                            </button>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            ) : null}

            {/* Item detail sheet — inspect, then equip or sell. In-brand modal (no native browser popup). */}
            {buyCele ? createPortal((
                <div className="buycele" key={buyCele.key} onClick={() => setBuyCele(null)}>
                    <div className="buycele-flash" />
                    <div className={`buycele-card rar-${buyCele.rarity}`} onClick={(e) => e.stopPropagation()}>
                        <div className="buycele-burst" aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <span key={i} style={{ "--i": i }} />)}</div>
                        <ItemArt id={buyCele.id} icon={buyCele.icon} className="buycele-art" />
                        <div className="buycele-title">✨ Purchased!</div>
                        <div className="buycele-name">{buyCele.name}</div>
                        <button type="button" className="button gold" onClick={() => setBuyCele(null)}>Equip it now</button>
                    </div>
                </div>
            ), document.body) : null}

            {chargeClaim ? createPortal((
                <div className="equip-sheet-overlay" onClick={closeChargeClaim} style={{ position: "fixed", inset: 0, zIndex: 1300, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.82)", padding: 20 }}>
                    <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 380, margin: 0, textAlign: "center" }}>
                        <h3 style={{ margin: "0 0 4px" }}>🎁 Show this to staff</h3>
                        <p className="muted" style={{ margin: "0 0 12px", fontSize: "0.85rem" }}>{chargeClaim.itemName} — staff will scan to redeem your perk.</p>
                        {chargeClaim.qr ? (
                            <img src={chargeClaim.qr} alt="Redemption QR code" style={{ width: "100%", maxWidth: 280, aspectRatio: "1", borderRadius: 12, background: "#fff", padding: 10 }} />
                        ) : <p className="muted">Couldn&apos;t draw the code — tap Use charge again.</p>}
                        <p style={{ margin: "12px 0 0", fontWeight: 800, color: "#ffd75e" }}>{chargeClaim.rewardLabel}</p>
                        <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.75rem" }}>Nothing is used until staff scan it. This code expires in a few minutes.</p>
                        <button type="button" className="btn" onClick={closeChargeClaim} style={{ marginTop: 14, width: "100%" }}>Done</button>
                    </div>
                </div>
            ), document.body) : null}

            {detailItem ? createPortal((
                <div className="equip-sheet-overlay" onClick={closeDetail} style={{ position: "fixed", inset: 0, zIndex: 1200, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,0.72)", padding: "0 0 env(safe-area-inset-bottom)" }}>
                    <div className={`card equip-sheet rar-${detailItem.rarity}`} onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
                        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                            <ItemArt id={detailItem.id} icon={detailItem.icon} className="equip-card-glyph" />
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontWeight: 800, fontSize: "1.1rem" }}>{detailItem.name}</div>
                                <div className="muted" style={{ fontSize: "0.8rem", textTransform: "capitalize" }}>{detailItem.rarity} · {detailItem.slot.replace("_", " ")}{detailItem.equipped ? " · Equipped ✓" : ""}</div>
                                <div style={{ marginTop: 2 }}><ElBadge id={detailItem.id} elements={detailItem.elements} /></div>
                            </div>
                        </div>
                        <p style={{ margin: "12px 0 0", fontWeight: 700 }}>{describeStats(detailItem.stats) || "No combat stats"}</p>
                        {/* Compare against whatever's equipped in this slot so you can tell if it's an upgrade. */}
                        {(() => {
                            const eqId = equipped[detailItem.slot];
                            if (detailItem.equipped || !eqId || eqId === detailItem.id) return null;
                            const cur = itemDef(eqId);
                            if (!cur) return null;
                            const keys = Array.from(new Set([...Object.keys(detailItem.stats || {}), ...Object.keys(cur.stats || {})])).filter((k) => STAT_META[k]);
                            if (!keys.length) return null;
                            let ups = 0; let downs = 0;
                            keys.forEach((k) => { const d = (detailItem.stats?.[k] || 0) - (cur.stats?.[k] || 0); if (d > 0) ups += 1; else if (d < 0) downs += 1; });
                            return (
                                <div style={{ margin: "10px 0 0", padding: "9px 11px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
                                    <div style={{ fontSize: "0.72rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "#9aa0a6", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                                        vs equipped · {cur.name}
                                        <span style={{ marginLeft: "auto", fontWeight: 900, color: ups > downs ? "#8fe39a" : downs > ups ? "#ff8f9a" : "#cdd9c6" }}>{ups > downs ? "↑ upgrade" : downs > ups ? "↓ downgrade" : "≈ sidegrade"}</span>
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                        {keys.map((k) => {
                                            const a = detailItem.stats?.[k] || 0; const b = cur.stats?.[k] || 0; const d = a - b; const suf = STAT_META[k].suffix || "";
                                            return (
                                                <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: "0.85rem", gap: 10 }}>
                                                    <span>{STAT_META[k].icon} {STAT_META[k].label}</span>
                                                    <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                                                        <span className="muted">{b}{suf} → {a}{suf}</span>{" "}
                                                        <b style={{ color: d > 0 ? "#8fe39a" : d < 0 ? "#ff8f9a" : "#9aa0a6" }}>{d > 0 ? `+${d}` : d === 0 ? "±0" : d}{suf}</b>
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })()}
                        {detailItem.sea ? <p style={{ margin: "6px 0 0", fontSize: "0.85rem", fontWeight: 800, color: "#7fd8ff" }}>⚓ Sea affinity: {describeSea(detailItem.sea)} <span className="muted" style={{ fontWeight: 600 }}>— helps you at sea (raids · digging · voyages)</span></p> : null}
                        {detailItem.farm ? <p style={{ margin: "6px 0 0", fontSize: "0.85rem", fontWeight: 800, color: "#8fe39a" }}>🌱 Farm affinity: {describeFarm(detailItem.farm)} <span className="muted" style={{ fontWeight: 600 }}>— helps you on the farm (crops · seeds · harvests)</span></p> : null}
                        {detailItem.signature ? <p style={{ margin: "6px 0 0", fontSize: "0.85rem", color: "#ffd75e" }}>★ {detailItem.signature.label} — {detailItem.signature.desc}</p> : null}
                        {detailItem.charge ? <p className="muted" style={{ margin: "6px 0 0", fontSize: "0.85rem" }}>🎁 {detailItem.charge.rewardLabel} — an in-store perk (can&apos;t be sold).</p> : null}
                        {detailItem.setId && (data.setsOverview || []).some((s) => s.id === detailItem.setId) ? (
                            <button type="button" onClick={() => { const s = (data.setsOverview || []).find((x) => x.id === detailItem.setId); if (s) setSetDetail(s); }} style={{ margin: "8px 0 0", padding: "7px 11px", borderRadius: 8, border: "1px solid rgba(143,216,255,0.45)", background: "rgba(143,216,255,0.08)", color: "#8fd8ff", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                                <HelmetSprite size={15} /> Part of the {detailItem.setName} set <span style={{ opacity: 0.7 }}>· view set ›</span>
                            </button>
                        ) : detailItem.setName ? (
                            <p style={{ margin: "6px 0 0", fontSize: "0.85rem", color: "#8fd8ff", display: "inline-flex", alignItems: "center", gap: 6 }}><HelmetSprite size={15} /> Part of the {detailItem.setName} set</p>
                        ) : null}
                        {detailItem.shop ? <p style={{ margin: "8px 0 0", fontSize: "0.95rem", fontWeight: 800, color: detailItem.canAfford ? "#ffd75e" : "#c9a24a" }}>🪙 {detailItem.discounted ? <><span style={{ textDecoration: "line-through", opacity: 0.55, fontWeight: 700 }}>{(detailItem.cost || 0).toLocaleString()}</span> {(detailItem.effectiveCost || 0).toLocaleString()}</> : (detailItem.cost || 0).toLocaleString()} gold{detailItem.discounted ? ` · ${data.coupon?.pct || 50}% off` : ""}{detailItem.canAfford ? "" : " · not enough"}</p> : null}
                        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                            {detailItem.shop ? (
                                detailItem.canAfford ? (
                                    <button type="button" className="button gold" onClick={() => { buy(detailItem); closeDetail(); }} disabled={busy}>
                                        🪙 Buy for {((detailItem.discounted ? detailItem.effectiveCost : detailItem.cost) || 0).toLocaleString()}
                                    </button>
                                ) : (
                                    <CoinCta price={detailItem.cost} label="Get coins to buy" />
                                )
                            ) : detailItem.equipped ? (
                                <button type="button" className="button" onClick={() => { const s = Object.keys(equipped).find((k) => equipped[k] === detailItem.id); if (s) unequip(s); closeDetail(); }} disabled={busy}>Unequip</button>
                            ) : (
                                <button type="button" className="button primary" onClick={() => { equipFromBag(detailItem); closeDetail(); }} disabled={busy}>⚔️ Equip</button>
                            )}
                            {!detailItem.shop && detailItem.sellValue > 0 ? (
                                sellArmed ? (
                                    <button type="button" className="button gold" onClick={() => doSell(detailItem)} disabled={busy}>Confirm — sell for 🪙 {detailItem.sellValue}</button>
                                ) : (
                                    <button type="button" className="pill" onClick={() => { setSellArmed(true); setSalvageArmed(false); }} disabled={busy}>🪙 Sell for {detailItem.sellValue}</button>
                                )
                            ) : null}
                            {!detailItem.shop && !detailItem.equipped ? (
                                salvageArmed ? (
                                    <button type="button" className="button" onClick={() => doSalvage(detailItem)} disabled={busy} style={{ borderColor: "rgba(255,154,60,0.6)", color: "#ffb877" }}>🔨 Confirm — salvage for parts</button>
                                ) : (
                                    <button type="button" className="pill" onClick={() => { setSalvageArmed(true); setSellArmed(false); }} disabled={busy} title="Break it down at the Forge into crafting parts">🔨 Salvage</button>
                                )
                            ) : null}
                            <button type="button" className="pill" onClick={closeDetail} style={{ marginLeft: "auto" }}>Close</button>
                        </div>
                    </div>
                </div>
            ), document.body) : null}

            {/* Full set breakdown (opened from a set card or an item's "part of a set" link). Read the LIVE set
                from data so equip/unequip from inside the sheet immediately flips a piece's state. */}
            {setDetail ? (
                <SetDetailSheet
                    set={(data.setsOverview || []).find((s) => s.id === setDetail.id) || setDetail}
                    onClose={() => setSetDetail(null)}
                    onEquip={(p) => equipFromBag(p)}
                    onUnequip={(p) => { const s = Object.keys(equipped).find((k) => equipped[k] === p.id); if (s) unequip(s); }}
                    busy={busy}
                />
            ) : null}

            {/* Coin-shower juice on a sale. */}
            {coinBurst ? createPortal((
                <div className="coinfx" key={coinBurst.key} aria-hidden="true">
                    {coinBurst.coins.map((c, i) => (
                        <span key={i} className="coinfx-coin" style={{ "--cx": c.x, "--cy": c.y, "--cr": c.r, animationDelay: c.d }}>🪙</span>
                    ))}
                    <div className="coinfx-amount">+{(coinBurst.amount || 0).toLocaleString()} 🪙</div>
                </div>
            ), document.body) : null}

            {err ? <p style={{ color: "#ff6b6b" }}>{err}</p> : null}
            {salvaged ? createPortal((
                <div style={{ position: "fixed", left: "50%", bottom: 84, transform: "translateX(-50%)", zIndex: 10070, padding: "10px 16px", borderRadius: 12, background: "linear-gradient(180deg,#2a180c,#160c06)", border: "1px solid rgba(255,154,60,0.5)", color: "#ffcf9a", fontWeight: 800, fontSize: 13, boxShadow: "0 8px 24px rgba(0,0,0,0.5)", maxWidth: "min(92vw, 440px)", textAlign: "center", lineHeight: 1.4 }}>🔨 {salvaged}</div>
            ), document.body) : null}
        </div>
    );
}
