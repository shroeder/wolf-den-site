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
import { EQUIP_SLOTS, STAT_META, describeStat, describeStats, sortStatKeys, describeSea, describeFarm, describeDepth, itemFitsSlot } from "@/lib/marketplace/items.js";
import { itemElement, ELEMENTS } from "@/lib/marketplace/boss-weakness.js";
import { scoreStats, statDelta, PRIORITY_STATS } from "@/lib/marketplace/item-value.js";
import { redeemUrl } from "@/lib/marketplace/redeem-link";

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

// ── SORTING THE BAG ──────────────────────────────────────────────────────────────────────────────────────────
// Asked for by @Kaishiern in global chat, in these words: "I'd like to arrange it by rarity and then type of
// gear". That is the default, and it is first in the list.
//
// The bag arrives in whatever order the server read it — effectively acquisition order — which is the one
// ordering that tells you nothing once you own forty pieces. RARITY DESCENDING is what people actually scan
// for, and slot is the tie-break because the next question after "what is my best stuff" is always "what is
// my best HELMET".
const RARITY_ORDER = ["eternal", "ascendant", "mythic", "legendary", "epic", "rare", "common"];
const SLOT_ORDER = ["main_hand", "off_hand", "helmet", "chest", "belt", "boots", "back", "amulet", "ring"];
const rank = (list, v) => { const i = list.indexOf(v); return i < 0 ? list.length : i; };
// Power is the plain sum of a piece's stats — the same one-number reading the delve uses, so "strongest" means
// the same thing in both places.
const powerOf = (i) => Object.values(i?.stats || {}).reduce((n, v) => n + (Number(v) || 0), 0);

// What the member said they care about, and the scorer that reads it. See item-value.js for why this ranks
// rather than judges.
const PRIORITY_KEY = "wd-gear-priorities";

const BAG_SORTS = {
    rarity: {
        label: "Rarity, then type",
        cmp: (a, b) => rank(RARITY_ORDER, a.rarity) - rank(RARITY_ORDER, b.rarity)
            || rank(SLOT_ORDER, a.slot) - rank(SLOT_ORDER, b.slot)
            || a.name.localeCompare(b.name),
    },
    slot: {
        label: "Type, then rarity",
        cmp: (a, b) => rank(SLOT_ORDER, a.slot) - rank(SLOT_ORDER, b.slot)
            || rank(RARITY_ORDER, a.rarity) - rank(RARITY_ORDER, b.rarity)
            || a.name.localeCompare(b.name),
    },
    power: { label: "Strongest", cmp: (a, b) => powerOf(b) - powerOf(a) || a.name.localeCompare(b.name) },
    name: { label: "Name", cmp: (a, b) => a.name.localeCompare(b.name) },
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

function ItemGlyph({ id, className = "", elements = null, gem = null, socket = false }) {
    return <ItemArt id={id} icon={itemDef(id)?.icon} className={className} elements={elements} gem={gem} socket={socket} />;
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

// EFFECTIVE stats = the base line PLUS whatever the forge added. The compare panel used the bare definition
// for the equipped side, so a Legendary forged to +1 was weighed at its unforged value — an axe that was
// genuinely a downgrade read "≈ SIDEGRADE", and the +1 the player had paid for was invisible in the one place
// it mattered. `owned` carries forgeBonus; a shop preview or a plain def has none, which is correct.
const effStats = (item, ownedById) => {
    if (!item) return {};
    const mine = ownedById?.get?.(item.id) || item;
    const out = { ...(item.stats || {}) };
    for (const [k, v] of Object.entries(mine?.forgeBonus || {})) out[k] = (out[k] || 0) + v;
    return out;
};

// Rarity colors for set pieces + a helper to strip the "Full set:" prefix off a capstone description.
const SET_RARITY = { common: "#9aa0a6", rare: "#4aa3ff", epic: "#b76bff", legendary: "#ff9a3c", mythic: "#ff5a7a", ascendant: "#5ad0ff", eternal: "#ffd75e" };
const capText = (desc) => (desc || "").replace(/^Full set:\s*/i, "");
// A set tier's bonus as text — stat bonuses and/or sea affinity (the sailing set grants the latter).
// THE SERVER ALREADY WROTE THIS LINE. sets.js renders every tier to text with a describer that knows all six
// kinds of bonus (stats, sea, farm, depth, wheel, forge) and sends it as `text`. This function was a second,
// client-side copy that only knew four of them — so Blacksmith's Regalia, whose 3-piece bonus is a `forge`
// bonus, rendered its set-bonus line as a bare em-dash: a set with a real bonus telling you it had none.
// sets.js is server-only and cannot be imported here, which is why the copy existed; using what it sends
// means there is nothing left to drift.
const tierText = (t) => t.text
    || [describeStats(t.stats || {}), t.sea ? describeSea(t.sea) : "", t.farm ? describeFarm(t.farm) : "",
        t.depth ? describeDepth(t.depth) : ""].filter(Boolean).join(" · ")
    || "—";

// A rich, tappable card for one set the player is building: piece dots, a progress bar, the tiered stat
// bonuses (active ones lit), and — the fun differentiator two sets otherwise hide — the full-set CAPSTONE.
function SetBonusCard({ set, onOpen }) {
    // A COLLECTION set (farm / mine / wheel / sailing) counts what you OWN; a combat set counts what you
    // wear. `have` is the server's answer to which — reading `equipped` here would tell somebody their farm
    // bonus is off while the farm is busy applying it.
    const have = set.have ?? set.equipped;
    const complete = have >= set.total;
    const pct = Math.round((have / set.total) * 100);
    const nextTier = set.tiers.find((t) => !t.active);
    const need = nextTier ? nextTier.need - have : set.total - have;
    return (
        <button type="button" onClick={onOpen} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", marginTop: 8, borderRadius: 12, cursor: "pointer", color: "inherit", background: complete ? "linear-gradient(180deg, rgba(255,215,94,0.1), rgba(255,255,255,0.02))" : "rgba(255,255,255,0.03)", border: `1px solid ${complete ? "rgba(255,215,94,0.5)" : "rgba(255,255,255,0.1)"}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ display: "flex", gap: 3 }}>
                    {/* A dot is LIT by whatever makes the bonus live: collected for a collection, worn for a
                        combat set. Lighting it on "equipped" for a farm set would show four dark dots beside
                        a bar reading 4/4 collected. */}
                    {set.pieces.map((p) => (
                        <span key={p.id} title={(set.collection ? p.owned : p.equipped) ? `${p.name} — ${set.collection ? "collected" : "equipped"}` : p.owned ? `${p.name} — owned, not equipped` : `${p.name} — locked`} style={{ width: 9, height: 9, borderRadius: "50%", boxSizing: "border-box", background: (set.collection ? p.owned : p.equipped) ? (SET_RARITY[p.rarity] || "#ffd75e") : "transparent", border: (set.collection ? p.owned : p.equipped) ? "none" : p.owned ? "1.5px solid rgba(255,255,255,0.55)" : "1.5px solid rgba(255,255,255,0.16)", boxShadow: (set.collection ? p.owned : p.equipped) ? `0 0 6px ${SET_RARITY[p.rarity] || "#ffd75e"}` : "none" }} />
                    ))}
                </span>
                <strong style={{ flex: 1, minWidth: 0 }}>{set.name}{complete ? " ✨" : ""}</strong>
                <span className="muted" style={{ fontSize: "0.78rem", whiteSpace: "nowrap" }}>{have}/{set.total} {set.collection ? "collected" : "worn"}{!set.collection && set.owned > set.equipped ? ` · ${set.owned} owned` : ""}</span>
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
    const have = set.have ?? set.equipped;
    const complete = have >= set.total;
    const pct = Math.round((have / set.total) * 100);
    return createPortal((
        <div className="equip-sheet-overlay" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1300, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.8)", padding: 16 }}>
            <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 420, margin: 0, maxHeight: "88dvh", overflowY: "auto", borderColor: complete ? "rgba(255,215,94,0.5)" : "rgba(143,216,255,0.4)", borderWidth: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span aria-hidden="true"><HelmetSprite size={22} /></span>
                    <h3 style={{ margin: 0, flex: 1 }}>{set.name}{complete ? " ✨" : ""}</h3>
                    <span className="muted" style={{ fontSize: "0.8rem", whiteSpace: "nowrap" }}>{have}/{set.total} {set.collection ? "collected" : "equipped"}</span>
                </div>
                <div style={{ height: 7, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden", marginTop: 10 }}>
                    <div style={{ height: "100%", width: `${pct}%`, borderRadius: 999, background: complete ? "linear-gradient(90deg,#ffd75e,#ffb648)" : "linear-gradient(90deg,#4aa3ff,#8fd8ff)", transition: "width .4s ease" }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px,1fr))", gap: 8, marginTop: 12 }}>
                    {set.pieces.map((p) => (
                        <div key={p.id} title={p.statsText || ""} style={{ display: "flex", flexDirection: "column", padding: 8, borderRadius: 12, textAlign: "center", border: `1.5px solid ${(set.collection ? p.owned : p.equipped) ? (SET_RARITY[p.rarity] || "#ffd75e") : "rgba(255,255,255,0.1)"}`, background: (set.collection ? p.owned : p.equipped) ? "rgba(255,215,94,0.06)" : "rgba(255,255,255,0.03)", opacity: p.owned || p.equipped ? 1 : 0.55 }}>
                            <ItemArt id={p.id} icon={p.icon} className="set-tile-art" />
                            <div style={{ fontSize: "0.72rem", fontWeight: 700, marginTop: 3, color: p.equipped ? (SET_RARITY[p.rarity] || undefined) : undefined }}>{p.name}</div>
                            <div className="muted" style={{ fontSize: "0.66rem", marginTop: 1 }}>{set.collection ? (p.owned ? "✅ collected" : "🔒 not found yet") : p.equipped ? "✅ equipped" : p.owned ? "• owned" : "🔒 locked"}</div>
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
    // The chosen order survives a reload, because re-picking it on every visit is the same chore as not
    // having it. Read lazily so the server render and the first client render agree.
    const [bagSort, setBagSort] = useState("rarity");
    // ── WHAT YOU CARE ABOUT ──────────────────────────────────────────────────────────────────────────────
    // Luke: "maybe we could make a feature that lets you select the stats you care about and it can help you
    // out?" Kept in localStorage rather than on the account: it is a way of LOOKING at your gear, not part of
    // your character, and a preference that needs no migration and no round trip is one that can be changed
    // while you are standing in the picker deciding.
    const [priorities, setPriorities] = useState(() => new Set());
    const [pickerOpen, setPickerOpen] = useState(false);
    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(PRIORITY_KEY);
            const list = raw ? JSON.parse(raw) : null;
            if (Array.isArray(list)) setPriorities(new Set(list.filter((k) => PRIORITY_STATS.includes(k))));
        } catch { /* private mode */ }
    }, []);
    const togglePriority = (k) => setPriorities((prev) => {
        const n = new Set(prev);
        if (n.has(k)) n.delete(k); else n.add(k);
        try { window.localStorage.setItem(PRIORITY_KEY, JSON.stringify([...n])); } catch { /* private mode */ }
        return n;
    });
    useEffect(() => {
        try { const v = window.localStorage.getItem("wd-bag-sort"); if (v && BAG_SORTS[v]) setBagSort(v); } catch { /* private mode */ }
    }, []);
    const chooseSort = (k) => {
        setBagSort(k);
        try { window.localStorage.setItem("wd-bag-sort", k); } catch { /* private mode */ }
    };
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [detailItem, setDetailItem] = useState(null); // inventory item detail sheet (inspect → equip / sell)
    const [setDetail, setSetDetail] = useState(null); // the full set breakdown modal (from a set card or an item's set link)
    const [sellArmed, setSellArmed] = useState(false); // two-tap sell confirm inside the sheet (no native popup)
    const [salvageArmed, setSalvageArmed] = useState(false); // two-tap salvage confirm (sends the piece to the Forge for parts)
    const [glossOpen, setGlossOpen] = useState(false); // "what do these stats do?" — folded away by default
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
    // charge (nothing is burned here). The QR encodes an https link the admin app claims as a verified App
    // Link, so scanning with any camera opens the app straight on the redeem screen; a phone without the app
    // just lands on a page telling them to show it to staff.
    async function redeemCharge(item) {
        setBusy(true); setErr("");
        try {
            const r = await fetch("/api/marketplace/item-charge/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId: item.id }) });
            const d = await r.json().catch(() => null);
            if (!r.ok || !d?.ok) { setErr(chargeErr(d?.error)); return; }
            const qr = await QRCode.toDataURL(redeemUrl("charge", d.token), { width: 320, margin: 1 }).catch(() => null);
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
        setSellArmed(false); setSalvageArmed(false); setGlossOpen(false); setDetailItem(item);
        trackClient("inspect_item", { itemId: item.id, name: item.name, shop: Boolean(item.shop) });
    }
    function closeDetail() { setDetailItem(null); setSellArmed(false); setSalvageArmed(false); setGlossOpen(false); }

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
    const statEntries = sortStatKeys(Object.keys(stats)).map((k) => [k, stats[k]]).filter(([, v]) => v);
    // Damage per second, from the two numbers already on the panel. Only shown when both exist — bare-handed
    // or shield-only there is nothing to multiply and a "0 damage a second" line would be noise.
    const dps = Number(stats.base_damage) > 0 && Number(stats.speed) > 0
        ? { damage: Math.round(Number(stats.base_damage)), speed: Number(stats.speed).toFixed(2),
            perSecond: Math.round(Number(stats.base_damage) * Number(stats.speed) * 10) / 10 }
        : null;
    const charged = (data.items || []).filter((i) => i.charge);
    // Trophies are not gear. They live in their own section below the bag: you cannot wear, sell, salvage or
    // trade one, so listing them among the things you can is the screen telling you something untrue.
    // Equipped pieces float to the top whatever the order: the first thing anybody wants from a bag screen is
    // "what am I wearing", and hunting a worn piece through forty tiles was half of why this screen felt like
    // a mess. Everything below them is in the order you chose.
    // ── THE BAG IS WHAT YOU ARE NOT WEARING ──────────────────────────────────────────────────────────────
    // Equipped pieces used to be sorted to the FRONT of the bag, so the first thing in the list of gear you
    // are choosing between was the gear you had already chosen — drawn twice on one screen, since the doll at
    // the top is the same nine items. Luke: "I dont think we should show our equipped items in the area we
    // look at our gear we are considering equipping. plus we already show it up top."
    const gearItems = (data.items || []).filter((i) => !i.collectionPiece && !i.equipped)
        .slice()
        .sort((a, b) => (BAG_SORTS[bagSort] || BAG_SORTS.rarity).cmp(a, b));
    // Trophies come down as their OWN list now that they are not items — filtering the bag for them returned
    // nothing the moment they moved out of it, which is what emptied everyone's collections on screen.
    const trophyItems = data.pieces || [];
    // Your OWNED copies, by id — these carry forgeBonus, util and enhanceLevel, which the bare ITEMS
    // definition does not. The compare panel has to weigh the equipped piece as YOU have it, not as it ships.
    //
    // Deliberately NOT useMemo: this sits below `if (!loaded) return` and `if (!data) return`, so a hook here
    // is a CONDITIONAL hook — the first render (loading) never reaches it and the second one does, which is a
    // different hook count and React throws. It crashed the whole Store page. A Map over a few dozen items is
    // not worth a hook anyway.
    const ownedById = new Map((data.items || []).map((i) => [i.id, i]));
    // Group the gold shop by slot into ordered, collapsible categories (any unlisted slot → "Other").
    // The shop stocks GEAR (which has a slot) and COLLECTION PIECES (which do not — a trophy is never worn).
    // Grouping everything by slot filed the trophies under the key "null" and then called null.replace() on it,
    // which is the crash three members hit on /marketplace/store. Trophies get their own category instead.
    const shopGear = (data.shop || []).filter((i) => !i.collectionPiece && i.slot);
    const shopTrophies = (data.shop || []).filter((i) => i.collectionPiece || !i.slot);
    const shopBySlot = shopGear.reduce((acc, i) => { (acc[i.slot] = acc[i.slot] || []).push(i); return acc; }, {});
    const shopCategories = [
        ...SHOP_SLOT_CATS.filter((c) => shopBySlot[c.slot]?.length).map((c) => ({ ...c, items: shopBySlot[c.slot] })),
        ...Object.keys(shopBySlot).filter((s) => !SHOP_SLOT_CATS.some((c) => c.slot === s))
            .map((s) => ({ slot: s, label: String(s).replace(/_/g, " "), icon: "🎒", items: shopBySlot[s] })),
        ...(shopTrophies.length ? [{ slot: "__collection", label: "Collection pieces", icon: "🏆", items: shopTrophies }] : []),
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
                            {def ? <ItemGlyph id={id} className="equip-slot-glyph" elements={def.elements} gem={def.gem} socket={def.socket} /> : <span className="equip-slot-empty"><SlotIcon slot={s.slot} size={20} /></span>}
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

            {/* ── SAY WHAT THE DOLL IS FOR ────────────────────────────────────────────────────────────────
                Nine slots that look like a display of what you own, and the one thing they actually DO —
                open a ranked comparison against everything else that fits — was discoverable only by
                tapping one on the off chance. Luke: "make the equipment screen cta for clicking your gear
                more apparent." A line under the doll costs nothing and answers it before the guess. */}
            <p className="equip-doll-cta">
                <b>Tap any slot</b>{" "}
                to compare it against everything else you own &mdash; ranked, with what each swap changes.
            </p>

            {/* Live stat total */}
            <div className="equip-stats card">
                <h3>⚔️ Combat stats</h3>
                {statEntries.length ? (
                    <div className="equip-stat-grid">
                        {statEntries.map(([k, v]) => (
                            // Formatted by the SAME helper the item cards use. This panel did its own `+{v}{suffix}`,
                            // which printed a shield's 0.2 block chance as "+0.2%" instead of 20%, and put a plus on
                            // Damage and Armour — which are the totals you HAVE, not a bonus on top of something.
                            <span key={k} className="equip-stat" title={STAT_META[k]?.desc || ""}>{STAT_META[k]?.icon || ""} <strong>{describeStat(k, v).replace(` ${STAT_META[k]?.label || k}`, "")}</strong> {STAT_META[k]?.label || k}</span>
                        ))}
                    </div>
                ) : null}
                {/* ── THE ONE NUMBER THAT COMPARES TWO WEAPONS ────────────────────────────────────────────
                    Damage and attack speed are both on the card and neither answers "is this sword better".
                    GrayKitsune: "I'm trying to figure out.. is 0.8 attack speed or 1.2 attack speed better
                    lol / Is that 0.8 seconds to make an attack, or 0.8 attacks per second" — and then he
                    asked for exactly this: "I feel like it would be better to have some metric listed that
                    does attack x attack speed to give a basic dps idea to determine which weapon is better."
                    It also settles the units by showing its working: 24 x 0.74/s reads only one way. */}
                {dps ? (
                    <p className="equip-dps" title="Your damage multiplied by how many times a second you swing. The higher number is the better weapon, all else equal.">
                        ⚔️ <strong>{dps.perSecond}</strong> damage a second <em>— {dps.damage} per swing × {dps.speed}/s</em>
                    </p>
                ) : null}
                {statEntries.length ? null : <p className="muted" style={{ margin: 0 }}>Equip gear to boost your boss fight — Might, crit, ferocity and more.</p>}
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

            {/* ── THE SLOT PICKER, AS A COMPARISON ────────────────────────────────────────────────────────
                It was a list of everything that fits, in bag order, each card printing its own stats and
                nothing else — so working out whether any of them beat the thing you had on meant reading two
                stat strings in two places and doing the subtraction in your head. Luke: "its so hard to
                compare items with what I have equipped."

                Now: what you are wearing sits at the top as the thing to beat, the candidates are RANKED, and
                every row states WHAT CHANGES rather than what it is. The scoring is a sort order and says so
                — see item-value.js. */}
            {slot && typeof document !== "undefined" ? createPortal((
                <div className="gearpick-scrim" role="dialog" aria-modal="true" onClick={() => { setSlot(null); setPickerOpen(false); }}>
                    <div className="gearpick" onClick={(e) => e.stopPropagation()}>
                        {(() => {
                            const slotLabel = EQUIP_SLOTS.find((x) => x.slot === slot)?.label || slot;
                            const wornId = equipped[slot];
                            const worn = wornId ? ownedById.get(wornId) || itemDef(wornId) : null;
                            // ── AS YOU HAVE IT, NOT AS IT SHIPS ─────────────────────────────────────────
                            // effStats exists in this file for exactly this, and its comment says why: the
                            // compare panel once weighed a forged Legendary at its unforged value. This
                            // picker was written using `i.stats` — the bare catalogue line — and so
                            // reintroduced the same bug one panel over. Kaishiern, hours after it shipped:
                            // "The equipment compare screen doesn’t show any of the gears enhancement levels
                            // or boosted stats." A +7 rare could rank below an unforged epic.
                            const wornStats = worn ? effStats(worn, ownedById) : {};
                            const wornScore = worn ? scoreStats(wornStats, priorities) : 0;
                            // Trophies never appear in a slot picker: their bonus is already yours, so
                            // offering one here is offering to waste a slot. See isCollectionItem in items.js.
                            const candidates = (data.items || [])
                                .filter((i) => itemFitsSlot(i, slot) && !i.collectionPiece && i.id !== wornId)
                                .map((i) => { const st = effStats(i, ownedById); return { ...i, eff: st, score: scoreStats(st, priorities) }; })
                                .sort((a, b) => b.score - a.score);
                            return (
                                <>
                                    <div className="gearpick-head">
                                        <b>{slotLabel}</b>
                                        <button type="button" className="gearpick-x" onClick={() => { setSlot(null); setPickerOpen(false); }}>Close</button>
                                    </div>

                                    {worn ? (
                                        <div className="gearpick-worn">
                                            <span className="gearpick-worn-kick">Wearing now</span>
                                            <div className="gearpick-worn-row">
                                                <ItemGlyph id={worn.id} className="gearpick-glyph" elements={worn.elements} gem={worn.gem} socket={worn.socket} />
                                                <div className="gearpick-worn-body">
                                                    <b>{worn.name}{worn.enhanceLevel > 0 ? <em className="gearpick-forge">+{worn.enhanceLevel}</em> : null}</b>
                                                    <span>{describeStats(wornStats)}</span>
                                                </div>
                                                <button type="button" className="gearpick-off" onClick={() => { unequip(slot); setSlot(null); }} disabled={busy}>Take off</button>
                                            </div>
                                        </div>
                                    ) : <p className="gearpick-empty">Nothing in this slot.</p>}

                                    {/* The chooser lives HERE, beside the decision it changes, rather than in
                                        a settings screen you would have to leave the picker to reach. */}
                                    <div className="gearpick-prio">
                                        <button type="button" className="gearpick-prio-head" onClick={() => setPickerOpen((v) => !v)}>
                                            <span>What matters to you</span>
                                            <em>{priorities.size ? [...priorities].map((k) => STAT_META[k]?.label || k).join(", ") : "everything, evenly"}</em>
                                            <i aria-hidden="true">{pickerOpen ? "▲" : "▼"}</i>
                                        </button>
                                        {pickerOpen ? (
                                            <div className="gearpick-prio-chips">
                                                {PRIORITY_STATS.map((k) => (
                                                    <button type="button" key={k} className={`gearpick-chip${priorities.has(k) ? " is-on" : ""}`}
                                                        onClick={() => togglePriority(k)}>
                                                        {STAT_META[k]?.icon || ""} {STAT_META[k]?.label || k}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>

                                    <div className="gearpick-list">
                                        {candidates.length ? candidates.map((i, n) => {
                                            const rows = statDelta(wornStats, i.eff || {});
                                            const up = i.score - wornScore;
                                            return (
                                                <button type="button" key={i.id} className={`gearpick-row rar-${i.rarity}${n === 0 && up > 0 ? " is-best" : ""}`}
                                                    onClick={() => { equip(slot, i.id); setSlot(null); }} disabled={busy}>
                                                    <ItemGlyph id={i.id} className="gearpick-glyph" elements={i.elements} gem={i.gem} socket={i.socket} />
                                                    <div className="gearpick-row-body">
                                                        <b>{i.name}{i.enhanceLevel > 0 ? <em className="gearpick-forge">+{i.enhanceLevel}</em> : null}{n === 0 && up > 0 ? <em className="gearpick-best">best pick</em> : null}</b>
                                                        {/* WHAT CHANGES, not what it is. The stat string is on
                                                            the item everywhere else; the only thing this screen
                                                            can add is the subtraction. */}
                                                        <span className="gearpick-deltas">
                                                            {rows.length ? rows.slice(0, 5).map((d) => (
                                                                <em key={d.stat} className={d.diff > 0 ? "is-up" : "is-down"}>
                                                                    {d.diff > 0 ? "+" : "−"}{Math.abs(Math.round(d.diff * 10) / 10)} {STAT_META[d.stat]?.label || d.stat}
                                                                </em>
                                                            )) : <em className="is-same">identical stats</em>}
                                                        </span>
                                                    </div>
                                                    <span className={`gearpick-score${up > 0 ? " is-up" : up < 0 ? " is-down" : ""}`} aria-hidden="true">
                                                        {up > 0 ? "▲" : up < 0 ? "▼" : "="}
                                                    </span>
                                                </button>
                                            );
                                        }) : <p className="gearpick-empty">No other gear for this slot yet.</p>}
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </div>
            ), document.body) : null}

            {/* Charged perks */}
            {charged.length ? (
                <div className="card">
                    <h3>🎁 In-store perks</h3>
                    <p className="muted" style={{ marginTop: 0 }}>Tap <strong>Use charge</strong> on a ready perk to get a QR — show it to staff and they&apos;ll scan it to redeem.</p>
                    {charged.map((i) => (
                        <div key={i.id} className={`equip-perk rar-${i.rarity}`}>
                            <ItemGlyph id={i.id} className="equip-perk-glyph" elements={i.elements} />
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
                                <button type="button" className="equip-perk-use" onClick={() => redeemCharge(i)} disabled={busy}>Use charge</button>
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
                <p className="muted" style={{ marginTop: 4 }}>Tap a piece to see what it does. Anything you can wear has an Equip button right on it.</p>
                {/* The order, as a row of pills rather than a select: a native select on a phone is a
                    full-screen wheel for four options (see the mobile conventions note in globals.css). */}
                <div className="equip-sortbar">
                    {Object.entries(BAG_SORTS).map(([k, v]) => (
                        <button type="button" key={k} className={`equip-sort${bagSort === k ? " is-on" : ""}`}
                            onClick={() => chooseSort(k)}>{v.label}</button>
                    ))}
                </div>
                {gearItems.length ? (
                    <div className="equip-bag-grid">
                        {gearItems.map((i) => (
                            <div key={i.id} className="equip-cardwrap">
                            <button type="button" className={`equip-card rar-${i.rarity}${i.equipped ? " is-equipped" : ""}`} onClick={() => openDetail(i)} disabled={busy} title={`${i.slot ? i.slot.replace("_", " ") : "collection"} · ${describeStats(i.stats)}`} style={{ position: "relative" }}>
                                {i.enhanceLevel > 0 ? <span style={{ position: "absolute", top: -4, right: -4, zIndex: 3 }}><ForgeRank level={i.enhanceLevel} size={22} /></span> : null}
                                <ItemGlyph id={i.id} className="equip-card-glyph" elements={i.elements} />
                                <span className="equip-card-name">{i.name}</span>
                                <span className="muted" style={{ fontSize: "0.66rem", fontWeight: 700, textTransform: "capitalize", letterSpacing: "0.03em" }}>{i.slot ? i.slot.replace("_", " ") : (i.setName || "collection")}</span>
                                <span className="equip-card-stats">{describeStats(i.stats)}</span>
                                {i.equipped ? <span style={{ fontSize: "0.62rem", fontWeight: 800, color: "#ffd75e" }}>✓ Equipped</span> : null}
                                {i.signature ? <span className="equip-card-sig">★ {i.signature.desc}</span> : null}
                                {i.farmText ? <span style={{ fontSize: "0.62rem", fontWeight: 800, color: "#8fe39a" }}>🌱 {i.farmText}</span> : null}
                                {i.util ? <span style={{ fontSize: "0.62rem", fontWeight: 800, color: "#e0c8ff" }}>🔮 +{i.util.value}{i.util.unit} {i.util.label}{i.util.level > 1 ? ` Lv${i.util.level}` : ""}</span> : null}
                            </button>
                            {/* ONE TAP TO WEAR IT. Equipping used to mean opening the piece, reading a sheet
                                and finding the button on it — or leaving the bag entirely and hunting the slot
                                on the paper-doll. The detail sheet is still there for everything else it does
                                (sell, salvage, trade, compare); it is just no longer the only way in. */}
                            {i.slot ? (
                                i.equipped
                                    ? <button type="button" className="equip-quick is-off" disabled={busy}
                                        onClick={() => unequip(i.slot)}>Unequip</button>
                                    : <button type="button" className="equip-quick" disabled={busy}
                                        onClick={() => equip(i.slot, i.id)}>Equip</button>
                            ) : null}
                            </div>
                        ))}
                    </div>
                ) : <p className="muted" style={{ margin: 0 }}>No items yet — level up, fight the boss, and check back.</p>}

                {/* TROPHIES, not gear. Kept on this screen because it is where you look for things you own —
                    but out of the bag, because you cannot wear, sell, salvage or trade one, and listing them
                    among the things you can is how a member ends up tapping equip three times and asking the
                    whole Den what is wrong with their belt. */}
                {trophyItems.length ? (
                    <div className="equip-trophies">
                        <div className="equip-trophies-head">
                            <b>Collections</b>
                            <span>{trophyItems.length} found</span>
                        </div>
                        <p className="muted equip-trophies-note">
                            Finding these is what pays — their bonus is permanent and applies whether or not you are
                            wearing anything. They are never worn, sold, salvaged or traded. Each one belongs to a set
                            you can see on the screen it pays out on: the farm, the mine, the Helm or the wheel.
                        </p>
                        <div className="equip-bag-grid">
                            {trophyItems.map((i) => (
                                <button type="button" key={i.id} className={`equip-card rar-${i.rarity} is-trophy`} onClick={() => openDetail(i)} disabled={busy}>
                                    <ItemGlyph id={i.id} className="equip-card-glyph" />
                                    <span className="equip-card-name">{i.name}</span>
                                    <span className="equip-card-trophy">✓ collected</span>
                                    {i.util ? <span style={{ fontSize: "0.62rem", fontWeight: 800, color: "#e0c8ff" }}>🔮 +{i.util.value}{i.util.unit} {i.util.label}</span> : null}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : null}
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
                                            <button type="button" key={i.id} className={`equip-card rar-${i.rarity}`} onClick={() => openDetail(i)} disabled={busy} title={`${i.slot ? i.slot.replace("_", " ") : (i.setName || "collection")} · ${i.statsText}`}>
                                                <ItemArt id={i.id} icon={i.icon} className="equip-card-glyph" elements={i.elements}
                                                    gem={i.gem} socket={i.socket} />
                                                <span className="equip-card-name">{i.name}</span>
                                                <span className="equip-card-stats">{i.statsText}</span>
                                                <ElBadge id={i.id} elements={i.elements} />
                                                {i.signature ? <span className="equip-card-sig">★ {i.signature.label}</span> : null}
                                                {i.farmText ? <span style={{ fontSize: "0.62rem", fontWeight: 800, color: "#8fe39a" }}>🌱 {i.farmText}</span> : null}
                                                {!i.signature && i.sea ? <span style={{ fontSize: "0.62rem", fontWeight: 800, color: "#7fd8ff" }}>⚓ Sea affinity</span> : null}
                                                {!i.signature && !i.sea && i.depth ? <span style={{ fontSize: "0.62rem", fontWeight: 800, color: "#ffb45e" }}>⛏️ Depths affinity</span> : null}
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

            {detailItem ? createPortal((() => {
                const it = detailItem;
                // Slots this piece could go in. Rings accept TWO, so both are compared and each gets its own
                // "equip here" — otherwise you can't say WHICH ring you meant to replace.
                // A collection piece has no loadout question attached to it, so the whole compare/equip half
                // of this sheet is meaningless for one.
                const slotDefs = (it.equipped || it.collectionPiece) ? [] : EQUIP_SLOTS.filter((s) => s.accepts === it.slot);
                const multi = slotDefs.length > 1;
                const canEquip = !it.shop; // shop preview compares, but you buy before you can equip
                const statKeys = Object.keys(it.stats || {}).filter((k) => STAT_META[k]);
                // Every comparison this sheet will draw, worked out ONCE so the header can carry the verdict.
                const comps = slotDefs.map((sd) => {
                    const eqId = equipped[sd.slot];
                    if (eqId === it.id) return null; // already sitting in this slot
                    const curDef = eqId ? itemDef(eqId) : null;
                    const cur = curDef ? (ownedById.get(eqId) || curDef) : null;
                    // Both sides at their REAL numbers — base plus forge.
                    const mineStats = effStats(it, ownedById);
                    const curStats = cur ? effStats(cur, ownedById) : {};
                    const keys = Array.from(new Set([...Object.keys(mineStats), ...Object.keys(curStats)])).filter((k) => STAT_META[k]);
                    // The verdict weighs the SIZE of the change, not how many stats moved. Counting winners
                    // made "+1 Might, −2 Ferocity" a sidegrade.
                    let net = 0;
                    keys.forEach((k) => { net += (mineStats[k] || 0) - (curStats[k] || 0); });
                    // What swapping COSTS you that isn't a number. Only the losses live here: everything the new
                    // piece brings is already spelled out in its own traits above, and printing both sides meant
                    // the sheet said "Wyrmscale · Dragonlord's set" twice inside one screenful.
                    const lose = [];
                    if (cur?.util) lose.push({ icon: "🔮", text: `+${cur.util.value}${cur.util.unit} ${cur.util.label}`, note: "attunement" });
                    if (cur?.enhanceLevel > 0) lose.push({ icon: "★", text: `Forged to +${cur.enhanceLevel}`, note: "enhancement stays with the piece" });
                    if (cur?.signature) lose.push({ icon: "☆", text: cur.signature.label, note: cur.signature.desc });
                    if (cur?.setName && cur.setId !== it.setId) lose.push({ icon: "🛡", text: `${cur.setName} set piece`, note: "may break a set bonus" });
                    const verdict = !cur ? { label: "FREE SLOT", color: "#8fe39a" }
                        : net > 0 ? { label: "UPGRADE", color: "#8fe39a" }
                        : net < 0 ? { label: "DOWNGRADE", color: "#ff8f9a" }
                        : { label: "SIDEGRADE", color: "#cdd9c6" };
                    return { sd, cur, mineStats, curStats, keys, net, lose, verdict };
                }).filter(Boolean);
                // One slot, one verdict → it belongs in the header, next to the name. Two rings disagree with
                // each other, so each card keeps its own.
                const headVerdict = comps.length === 1 ? comps[0].verdict : null;
                const headNet = comps.length === 1 ? comps[0].net : 0;
                // A table already prints "equipped → new → change" for every stat, so repeating the raw stat
                // line above it was pure duplication. Chips only show when nothing is being replaced.
                const showStatChips = !comps.some((c) => c.cur);

                return (
                <div className="equip-sheet-overlay" onClick={closeDetail} style={{ position: "fixed", inset: 0, zIndex: 1200, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,0.72)" }}>
                    <div className={`card equip-sheet has-panes rar-${it.rarity}`} onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
                        <div className="equip-sheet-grip" aria-hidden="true" />
                        {/* HEADER — pinned. Who the piece is, and the one-word answer to "should I wear it?". */}
                        <div className="equip-sheet-head">
                            <ItemArt id={it.id} icon={it.icon} className="equip-card-glyph" />
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div className="equip-sheet-name">{it.name}</div>
                                <div className="equip-sheet-sub">
                                    <span style={{ textTransform: "capitalize" }}>{it.rarity}{it.slot ? ` · ${it.slot.replace("_", " ")}` : (it.setName ? ` · ${it.setName}` : "")}</span>
                                    {it.enhanceLevel > 0 ? <span className="equip-sheet-forge"><ForgeRank level={it.enhanceLevel} size={13} /> +{it.enhanceLevel}</span> : null}
                                    {it.equipped ? <span style={{ color: "#8fe39a", fontWeight: 800 }}>Equipped</span> : null}
                                    <ElBadge id={it.id} elements={it.elements} />
                                </div>
                            </div>
                            {headVerdict ? (
                                <span className="eqcmp-verdict" style={{ "--v": headVerdict.color }}>
                                    {headVerdict.label}{headNet ? ` ${headNet > 0 ? "▲" : "▼"}${Math.abs(headNet)}` : ""}
                                </span>
                            ) : null}
                        </div>

                        {/* BODY — the only thing that scrolls. */}
                        <div className="equip-sheet-body">
                            {showStatChips ? (
                                <div className="eqstats">
                                    {statKeys.length ? statKeys.map((k) => (
                                        <span key={k} className="eqstat">{STAT_META[k].icon} <b>+{it.stats[k]}{STAT_META[k].suffix || ""}</b> {STAT_META[k].label}</span>
                                    )) : <span className="muted" style={{ fontSize: "0.82rem" }}>No combat stats</span>}
                                </div>
                            ) : null}

                            {/* Compare against whatever's equipped in the slot(s) this item accepts. */}
                            {comps.length ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: showStatChips ? 10 : 0 }}>
                                    {multi ? <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "#9aa0a6" }}>Two {it.slot} slots — choose which to fill:</div> : null}
                                    {comps.map(({ sd, cur, mineStats, curStats, keys, lose, verdict }) => (
                                        <div key={sd.slot} className="eqcmp">
                                            <div className="eqcmp-head">
                                                <span className="eqcmp-title">{multi ? sd.label : "Replacing"}</span>
                                                <span className="eqcmp-cur">{cur ? cur.name : "empty slot"}</span>
                                                {multi ? <span className="eqcmp-verdict" style={{ "--v": verdict.color }}>{verdict.label}</span> : null}
                                            </div>

                                            {cur && keys.length ? (
                                                <>
                                                    <div className="eqcmp-cols">
                                                        <span />
                                                        <span>Equipped</span>
                                                        <span />
                                                        <span>New</span>
                                                        <span>Change</span>
                                                    </div>
                                                    {keys.map((k) => {
                                                        const a = mineStats[k] || 0; const b = curStats[k] || 0;
                                                        const d = a - b; const suf = STAT_META[k].suffix || "";
                                                        return (
                                                            <div key={k} className={`eqcmp-row${d > 0 ? " is-up" : d < 0 ? " is-down" : ""}`}>
                                                                <span className="eqcmp-stat">{STAT_META[k].icon} {STAT_META[k].label}</span>
                                                                <span className="eqcmp-was">{b}{suf}</span>
                                                                <span className="eqcmp-arrow" aria-hidden="true">&rarr;</span>
                                                                <span className="eqcmp-now">{a}{suf}</span>
                                                                <span className="eqcmp-delta">{d > 0 ? `+${d}` : d === 0 ? "±0" : d}{suf}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </>
                                            ) : !cur ? <div className="muted" style={{ fontSize: "0.8rem" }}>Nothing equipped here — a pure gain.</div> : null}

                                            {lose.length ? (
                                                <div className="eqcmp-extras">
                                                    <div className="eqcmp-ex is-lose">
                                                        <b>You&rsquo;d lose</b>
                                                        {lose.map((x, n) => <span key={n}>{x.icon} {x.text}<em>{x.note}</em></span>)}
                                                    </div>
                                                </div>
                                            ) : null}

                                            {canEquip ? (
                                                <button type="button" className="eqcmp-go" disabled={busy} onClick={() => { equip(sd.slot, it.id); closeDetail(); }}>
                                                    Equip{multi ? ` to ${sd.label}` : ""}{cur ? ` — replace ${cur.name}` : ""}
                                                </button>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            ) : null}

                            {/* WHAT MAKES IT SPECIAL — forge, attunement, signature, affinities, set, perk. Each
                                said exactly once, in one column, instead of scattered down the sheet AND repeated
                                inside the comparison's "you'd gain" box. */}
                            <div className="eqtraits">
                                {it.enhanceLevel > 0 && it.forgeStats ? (
                                    <div className="eqtrait t-forge"><span aria-hidden="true"><ForgeRank level={it.enhanceLevel} size={15} /></span><span><b>Forged to +{it.enhanceLevel}</b><em>{it.forgeStats} — already counted in the stats above</em></span></div>
                                ) : null}
                                {it.util ? (
                                    <div className="eqtrait t-att"><span aria-hidden="true">🔮</span><span><b>+{it.util.value}{it.util.unit} {it.util.label}{it.util.level > 1 ? ` Lv${it.util.level}` : ""}</b><em>attunement — a bonus rolled at the Forge</em></span></div>
                                ) : null}
                                {it.signature ? (
                                    <div className="eqtrait t-sig"><span aria-hidden="true">★</span><span><b>{it.signature.label}</b><em>{it.signature.desc}</em></span></div>
                                ) : null}
                                {it.sea ? <div className="eqtrait t-sea"><span aria-hidden="true">⚓</span><span><b>{describeSea(it.sea)}</b><em>at sea — raids · digging · voyages</em></span></div> : null}
                                {it.depth ? <div className="eqtrait t-depth"><span aria-hidden="true">⛏️</span><span><b>{describeDepth(it.depth)}</b><em>underground — delving · mining · smelting</em></span></div> : null}
                                {it.farm ? <div className="eqtrait t-farm"><span aria-hidden="true">🌱</span><span><b>{describeFarm(it.farm)}</b><em>on the farm — crops · seeds · harvests</em></span></div> : null}
                                {it.charge ? <div className="eqtrait t-charge"><span aria-hidden="true">🎁</span><span><b>{it.charge.rewardLabel}</b><em>an in-store perk — can&apos;t be sold</em></span></div> : null}
                                {it.collectionPiece ? (
                                    <div className="eqtrait t-set"><span aria-hidden="true">🏆</span><span><b>Collection piece</b><em>Owning it is enough — the bonus is permanent and it never needs to be worn, sold or salvaged.</em></span></div>
                                ) : null}
                                {it.setName ? (
                                    (data.setsOverview || []).some((s) => s.id === it.setId) ? (
                                        <button type="button" className="eqtrait t-set is-link" onClick={() => { const s = (data.setsOverview || []).find((x) => x.id === it.setId); if (s) setSetDetail(s); }}>
                                            <span aria-hidden="true"><HelmetSprite size={15} /></span>
                                            <span><b>{it.setName} set piece</b><em>see the whole set and its bonuses ›</em></span>
                                        </button>
                                    ) : (
                                        <div className="eqtrait t-set"><span aria-hidden="true"><HelmetSprite size={15} /></span><span><b>{it.setName} set piece</b><em>counts toward that set</em></span></div>
                                    )
                                ) : null}
                            </div>

                            {/* The plain-English "what is Ferocity" block was five lines of teaching stacked on
                                top of the numbers every single time. Folded away — read once, then never again. */}
                            {statKeys.length ? (
                                <div className="eqgloss">
                                    <button type="button" className="eqgloss-btn" onClick={() => setGlossOpen((v) => !v)} aria-expanded={glossOpen}>
                                        {glossOpen ? "▾" : "▸"} What do these stats do?
                                    </button>
                                    {glossOpen ? (
                                        <div className="eqgloss-list">
                                            {statKeys.map((k) => (
                                                <div key={k}><b>{STAT_META[k].icon} {STAT_META[k].label}</b> — {STAT_META[k].desc}</div>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>

                        {/* FOOTER — pinned, so buy/sell/close never scroll out of reach. */}
                        <div className="equip-sheet-foot">
                            {it.shop ? (
                                <span className="equip-sheet-price" style={{ color: it.canAfford ? "#ffd75e" : "#c9a24a" }}>
                                    🪙 {it.discounted ? <><span style={{ textDecoration: "line-through", opacity: 0.55 }}>{(it.cost || 0).toLocaleString()}</span> {(it.effectiveCost || 0).toLocaleString()}</> : (it.cost || 0).toLocaleString()}
                                    {it.discounted ? <em> {data.coupon?.pct || 50}% off</em> : null}
                                    {it.canAfford ? null : <em> not enough</em>}
                                </span>
                            ) : null}
                            {it.shop ? (
                                it.canAfford ? (
                                    <button type="button" className="button gold" onClick={() => { buy(it); closeDetail(); }} disabled={busy}>
                                        🪙 Buy for {((it.discounted ? it.effectiveCost : it.cost) || 0).toLocaleString()}
                                    </button>
                                ) : (
                                    <CoinCta price={it.cost} label="Get coins to buy" />
                                )
                            ) : it.equipped ? (
                                <button type="button" className="button" onClick={() => { const s = Object.keys(equipped).find((k) => equipped[k] === it.id); if (s) unequip(s); closeDetail(); }} disabled={busy}>Unequip</button>
                            ) : !slotDefs.length ? (
                                // Equippable gear equips via the per-slot buttons in the comparison above; this is a fallback only.
                                <button type="button" className="button primary" onClick={() => { equipFromBag(it); closeDetail(); }} disabled={busy}>⚔️ Equip</button>
                            ) : null}
                            {!it.shop && !it.collectionPiece && it.sellValue > 0 ? (
                                sellArmed ? (
                                    <button type="button" className="button gold" onClick={() => doSell(it)} disabled={busy}>Confirm — sell for 🪙 {it.sellValue}</button>
                                ) : (
                                    <button type="button" className="pill" onClick={() => { setSellArmed(true); setSalvageArmed(false); }} disabled={busy}>🪙 Sell for {it.sellValue}</button>
                                )
                            ) : null}
                            {!it.shop && !it.equipped && !it.collectionPiece ? (
                                salvageArmed ? (
                                    <button type="button" className="button" onClick={() => doSalvage(it)} disabled={busy} style={{ borderColor: "rgba(255,154,60,0.6)", color: "#ffb877" }}>🔨 Confirm — salvage for parts</button>
                                ) : (
                                    <button type="button" className="pill" onClick={() => { setSalvageArmed(true); setSellArmed(false); }} disabled={busy} title="Break it down at the Forge into crafting parts">🔨 Salvage</button>
                                )
                            ) : null}
                            <button type="button" className="pill" onClick={closeDetail} style={{ marginLeft: "auto" }}>Close</button>
                        </div>
                    </div>
                </div>
                );
            })(), document.body) : null}

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
