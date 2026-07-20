"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { COLLECTIBLES, collectibleById, petPassive, petPrice, petUnlockText, PET_STAT_META } from "@/lib/marketplace/collectibles";
import { petPerk, petRealWorld } from "@/lib/marketplace/pet-perks";

const SOURCES = [
    { id: "", label: "All" },
    { id: "owned", label: "★ Owned" },
    { id: "level", label: "Leveling" },
    { id: "shop", label: "Shop" },
    { id: "achievement", label: "Achievements" },
    { id: "chest", label: "Chests" },
    { id: "boss", label: "Boss" },
    { id: "elite", label: "Elite" },
];

const RARITY_ORDER = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4, ascendant: 5, eternal: 6 };

function statText(s) {
    const m = PET_STAT_META[s.stat] || { label: s.stat, icon: "" };
    return `${m.icon} ${m.label}`;
}

// What each passive stat actually does, for the detail modal.
const STAT_EFFECT = {
    might: "Boosts your boss attack damage.",
    crit_chance: "Raises your chance to land a critical hit.",
    crit_power: "Increases your critical-hit damage.",
    ferocity: "Adds ferocious power to your strike.",
    fortune: "More raffle tickets toward the weekly boss prize.",
    xp_gain: "Earn more XP from everything you do.",
    gold_find: "Find more gold from chests and sales.",
};

const SOURCE_LABEL = {
    level: "🎮 Leveling reward", shop: "🛒 Shop", achievement: "🏅 Achievement",
    chest: "🎁 Chest drop", boss: "⚔️ Boss drop", elite: "🌟 Elite",
};

// The dedicated Pets page: every pet, clearly owned vs. locked, with how to unlock each, its passive (owned)
// and active (equipped) buffs, and equip / buy actions.
export default function PetsClient() {
    const [state, setState] = useState(null);
    const [filter, setFilter] = useState("");
    const [busy, setBusy] = useState(null);
    const [err, setErr] = useState(null);
    const [justEquipped, setJustEquipped] = useState(null);

    async function load() {
        const r = await fetch("/api/marketplace/pets", { cache: "no-store" }).catch(() => null);
        const d = r?.ok ? await r.json().catch(() => null) : null;
        if (d) setState(d);
    }
    useEffect(() => { load(); }, []);

    const ownedSet = useMemo(() => new Set(state?.ownedIds || []), [state]);
    const tradeableSet = useMemo(() => new Set(state?.tradeableIds || []), [state]);
    const [note, setNote] = useState(null);
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const [giving, setGiving] = useState(null); // pet being gifted (opens the gift modal)
    const [recipient, setRecipient] = useState("");
    const [modalErr, setModalErr] = useState(null);
    const [sending, setSending] = useState(false);
    const [celebrate, setCelebrate] = useState(null); // pet to show a receive/unlock celebration for
    const [detail, setDetail] = useState(null); // pet whose detail modal is open

    const ERRORS = {
        not_enough_gold: "Not enough gold.",
        already_owned: "You already own that pet.",
        not_owned: "You don't own that pet yet.",
        not_tradeable: "That pet has already been traded once — it can't be traded again.",
        recipient_not_found: "No member with that @handle.",
        cannot_share_self: "You can't give a pet to yourself.",
        already_pending: "You've already offered this pet to them.",
        not_pending: "That gift is no longer available.",
    };

    async function action(petId, act, extra) {
        setBusy(petId || act);
        setErr(null);
        setNote(null);
        const r = await fetch("/api/marketplace/pets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: act, petId, ...extra }) }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        setBusy(null);
        if (r?.ok && d?.ok) {
            if (act === "equip") { setJustEquipped(petId); setTimeout(() => setJustEquipped(null), 900); }
            if (act === "accept") setCelebrate(collectibleById(d.petId) || null);
            await load();
            return true;
        }
        setErr(ERRORS[d?.error] || "Something went wrong.");
        return false;
    }

    function openGive(pet) {
        setGiving(pet);
        setRecipient("");
        setModalErr(null);
    }

    async function sendGift() {
        const alias = recipient.trim();
        if (!alias) { setModalErr("Enter a member's @handle."); return; }
        setSending(true);
        setModalErr(null);
        const r = await fetch("/api/marketplace/pets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "share", petId: giving.id, toAlias: alias }) }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        setSending(false);
        if (r?.ok && d?.ok) {
            setGiving(null);
            setNote(`🎁 Gift sent — ${d.to} can accept your copy of ${giving.name}.`);
            await load();
        } else {
            setModalErr(ERRORS[d?.error] || "Couldn't send that gift.");
        }
    }

    const pets = useMemo(() => {
        let list = [...COLLECTIBLES];
        if (filter === "owned") list = list.filter((p) => ownedSet.has(p.id));
        else if (filter) list = list.filter((p) => p.source === filter);
        // Owned first, then by rarity, then by name.
        return list.sort((a, b) => {
            const ao = ownedSet.has(a.id) ? 0 : 1, bo = ownedSet.has(b.id) ? 0 : 1;
            if (ao !== bo) return ao - bo;
            const ar = RARITY_ORDER[a.rarity] ?? 0, br = RARITY_ORDER[b.rarity] ?? 0;
            if (ar !== br) return ar - br;
            return a.name.localeCompare(b.name);
        });
    }, [filter, ownedSet]);

    const featured = state?.featured ? collectibleById(state.featured) : null;
    const ownedCount = state?.ownedIds?.length || 0;
    const passiveEntries = Object.entries(state?.passiveTotals || {}).sort((a, b) => b[1] - a[1]);

    return (
        <div className="stack reveal">
            <section className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div>
                        <h1 style={{ margin: 0 }}>🐾 Pets</h1>
                        <p className="muted" style={{ margin: "4px 0 0" }}>
                            Collect companions from leveling, the shop, achievements, chests, and boss drops. <strong>Every pet you own</strong> adds a passive Fortune bonus that stacks — <strong>equip one</strong> for a stronger active buff.
                        </p>
                    </div>
                    {state?.signedIn ? <span className="pill">💰 {state.gold.toLocaleString()}</span> : null}
                </div>
                {state ? (
                    <>
                        <div className="pets-summary">
                            <span><strong>{ownedCount}</strong> / {COLLECTIBLES.length} pets</span>
                            {featured ? <span>★ Equipped: <strong>{featured.name}</strong> — {petPerk(featured).icon} {petPerk(featured).name} <span className="muted">({petPerk(featured).desc})</span></span> : <span className="muted">No pet equipped</span>}
                        </div>
                        {passiveEntries.length ? (
                            <div className="pets-passives">
                                <span className="muted" style={{ fontSize: "0.8rem" }}>Menagerie passive bonuses:</span>
                                {passiveEntries.map(([stat, val]) => <span key={stat} className="pet-passive-chip">{statText({ stat })} +{val}</span>)}
                            </div>
                        ) : null}
                    </>
                ) : null}
            </section>

            {state?.incoming?.length ? (
                <section className="card" style={{ borderColor: "#ffd75e" }}>
                    <h3 style={{ marginTop: 0 }}>🎁 Pet gifts for you</h3>
                    <div className="stack" style={{ gap: 8 }}>
                        {state.incoming.map((g) => (
                            <div key={g.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                                <span><strong>{g.from}</strong> wants to give you <strong>{g.petName}</strong>.</span>
                                <span style={{ display: "flex", gap: 8 }}>
                                    <button type="button" className="btn-gold pet-btn" onClick={() => action(null, "accept", { shareId: g.id })} disabled={busy === "accept"}>Accept</button>
                                    <button type="button" className="btn-ghost pet-btn" onClick={() => action(null, "decline", { shareId: g.id })} disabled={busy === "accept"}>Decline</button>
                                </span>
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}

            <div className="bounty-filters">
                {SOURCES.map((s) => (
                    <button type="button" key={s.id} className={`pill${filter === s.id ? " is-active" : ""}`} onClick={() => setFilter(s.id)}>{s.label}</button>
                ))}
            </div>

            {err ? <p style={{ color: "#e66" }}>{err}</p> : null}
            {note ? <p style={{ color: "#7ad07a" }}>{note}</p> : null}

            {!state ? (
                <section className="card"><p className="muted" style={{ margin: 0 }}>Loading pets…</p></section>
            ) : (
                <div className="pets-grid">
                    {pets.map((pet) => {
                        const owned = ownedSet.has(pet.id);
                        const isFeatured = state.featured === pet.id;
                        const passive = petPassive(pet);
                        const perk = petPerk(pet);
                        const Icon = pet.Icon;
                        const lvl = owned ? state.petLevels?.[pet.id] : null;
                        return (
                            <button type="button" key={pet.id} onClick={() => setDetail(pet)} className={`pet-card pet-card-btn rarity-${pet.rarity}${owned ? " is-owned" : " is-locked"}${isFeatured ? " is-featured" : ""}${justEquipped === pet.id ? " just-equipped" : ""}`}>
                                {isFeatured ? <span className="pet-featured-badge">★ Equipped</span> : null}
                                {lvl ? <span className="pet-level-badge">Lv {lvl.level}</span> : null}
                                <div className="pet-icon" style={{ color: pet.color }}>{Icon ? <Icon /> : "🐾"}</div>
                                <div className="pet-name">{pet.name}</div>
                                <div className="pet-rarity">{pet.rarity}</div>
                                <div className="pet-buffs">
                                    <span>Own: +{lvl ? lvl.value : passive.value} {statText(passive)}</span>
                                    <span className="pet-perk">{perk.icon} {perk.name}</span>
                                </div>
                                {owned ? (
                                    <span className="pet-status-owned">✓ Owned{isFeatured ? " · Equipped" : ""}</span>
                                ) : (
                                    <div className="pet-locked">🔒 {petUnlockText(pet)}</div>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}

            <section className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <span className="muted">Level up, fight the boss, and complete quests to collect more companions.</span>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Link href="/marketplace/boss" className="pill">⚔️ Boss</Link>
                    <Link href="/marketplace/quests" className="pill">📜 Quests</Link>
                </div>
            </section>

            {/* Give-a-copy modal — a proper in-app dialog, not a browser prompt. */}
            {mounted && giving ? createPortal(
                <div className="petx-overlay" onClick={() => !sending && setGiving(null)}>
                    <div className={`petx-modal rarity-${giving.rarity}`} onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="petx-close" aria-label="Close" onClick={() => setGiving(null)}>×</button>
                        <div className="petx-hero">
                            <span className="petx-hero-glow" />
                            <span className="petx-hero-icon" style={{ color: giving.color }}>{giving.Icon ? <giving.Icon /> : "🐾"}</span>
                        </div>
                        <h2 className="petx-title">Give a copy of {giving.name}</h2>
                        <p className="petx-sub">Send a copy to another member — <strong>you keep yours</strong>.</p>
                        <div className="petx-warn">🔒 Once they accept, <strong>both</strong> your pet and their copy can never be traded again.</div>
                        <label className="petx-label" htmlFor="petx-to">Send to</label>
                        <input id="petx-to" className="petx-input" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="@handle" autoComplete="off" autoFocus onKeyDown={(e) => e.key === "Enter" && sendGift()} />
                        {modalErr ? <p className="petx-err">{modalErr}</p> : null}
                        <div className="petx-actions">
                            <button type="button" className="btn-ghost" onClick={() => setGiving(null)} disabled={sending}>Cancel</button>
                            <button type="button" className="btn-gold" onClick={sendGift} disabled={sending || !recipient.trim()}>{sending ? "Sending…" : "🎁 Send gift"}</button>
                        </div>
                    </div>
                </div>, document.body) : null}

            {/* Receive/unlock celebration. */}
            {mounted && celebrate ? createPortal(
                <div className="petx-overlay petx-celebrate" onClick={() => setCelebrate(null)}>
                    <div className={`petx-cele rarity-${celebrate.rarity}`} onClick={(e) => e.stopPropagation()}>
                        <div className="petx-confetti" aria-hidden="true">{Array.from({ length: 14 }).map((_, i) => <span key={i} style={{ "--i": i }}>{["✨", "🎉", "⭐", "🌟"][i % 4]}</span>)}</div>
                        <div className="petx-hero petx-hero-big">
                            <span className="petx-hero-glow" />
                            <span className="petx-hero-icon" style={{ color: celebrate.color }}>{celebrate.Icon ? <celebrate.Icon /> : "🐾"}</span>
                        </div>
                        <div className="petx-cele-tag">New pet!</div>
                        <h2 className="petx-title">{celebrate.name}</h2>
                        <p className="petx-sub">{celebrate.rarity} companion added to your collection.</p>
                        <button type="button" className="btn-gold" onClick={() => setCelebrate(null)}>Awesome</button>
                    </div>
                </div>, document.body) : null}

            {/* Pet detail modal — full display + abilities + actions (equip / buy / give). */}
            {mounted && detail ? (() => {
                const p = detail;
                const owned = ownedSet.has(p.id);
                const isFeatured = state?.featured === p.id;
                const tradeable = tradeableSet.has(p.id);
                const passive = petPassive(p);
                const perk = petPerk(p);
                const price = petPrice(p);
                const canBuy = p.source === "shop" && !owned && state?.signedIn && state.gold >= price;
                const lvl = owned ? state?.petLevels?.[p.id] : null;
                const pct = lvl && !lvl.maxed && lvl.span > 0 ? Math.round((lvl.into / lvl.span) * 100) : 100;
                return createPortal(
                    <div className="petx-overlay" onClick={() => setDetail(null)}>
                        <div className={`petx-modal petx-detail rarity-${p.rarity}`} onClick={(e) => e.stopPropagation()}>
                            <button type="button" className="petx-close" aria-label="Close" onClick={() => setDetail(null)}>×</button>
                            <div className="petx-hero petx-hero-big">
                                <span className="petx-hero-glow" />
                                <span className="petx-hero-icon" style={{ color: p.color }}>{p.Icon ? <p.Icon /> : "🐾"}</span>
                            </div>
                            <div className="petx-cele-tag">{p.rarity}</div>
                            <h2 className="petx-title">{p.name}</h2>
                            <p className="petx-sub">{p.hint || SOURCE_LABEL[p.source] || ""}</p>

                            {lvl ? (
                                <div className="petx-level">
                                    <div className="petx-level-head">
                                        <strong>Level {lvl.level}<span className="muted"> / 5</span></strong>
                                        <span className="muted">{lvl.maxed ? "MAX" : `${lvl.into} / ${lvl.span} XP`}</span>
                                    </div>
                                    <div className="petx-level-bar"><span style={{ width: `${pct}%` }} /></div>
                                    <div className="muted" style={{ fontSize: "0.78rem", marginTop: 4 }}>
                                        {isFeatured
                                            ? "Equipped — earns 25% of your XP + a little over time."
                                            : "Equip this pet to level it up (25% of your XP + a trickle over time)."}
                                    </div>
                                </div>
                            ) : null}

                            <div className="petx-abilities">
                                <div className="petx-ability">
                                    <div className="petx-ability-head">🐾 Passive <span className="muted">· always active while owned</span></div>
                                    <div className="petx-ability-body">
                                        <strong>+{lvl ? lvl.value : passive.value} {statText(passive)}</strong>
                                        {lvl && !lvl.maxed ? <span className="muted"> → +{passive.value * (lvl.level + 1)} at Lv {lvl.level + 1}</span> : null}
                                        {" "}— {STAT_EFFECT[passive.stat] || ""} <span className="muted">Scales up to ×5 as this pet levels. Stacks with your whole collection.</span>
                                    </div>
                                </div>
                                <div className="petx-ability">
                                    <div className="petx-ability-head">⭐ Signature <span className="muted">· when equipped</span></div>
                                    <div className="petx-ability-body"><strong>{perk.icon} {perk.name}</strong> — {perk.desc}.</div>
                                </div>
                                {petRealWorld(p) ? (
                                    <div className="petx-ability petx-realworld">
                                        <div className="petx-ability-head">🎁 Real-world perk</div>
                                        <div className="petx-ability-body">
                                            {petRealWorld(p)}
                                            {owned ? (() => {
                                                const rw = state?.realWorld?.[p.id];
                                                if (!rw) return null;
                                                return rw.available
                                                    ? <div style={{ marginTop: 6, color: "#7ad07a", fontWeight: 700 }}>✅ Ready — ask staff to redeem it in-store.</div>
                                                    : <div style={{ marginTop: 6, color: "#9a93a6" }}>⏳ Redeemed — available again {rw.cooldownUntil ? new Date(rw.cooldownUntil).toLocaleDateString() : "next month"}.</div>;
                                            })() : null}
                                        </div>
                                    </div>
                                ) : null}
                            </div>

                            <div className="petx-status">
                                {owned ? <span className="petx-owned">✓ You own this pet{isFeatured ? " · equipped" : ""}</span> : <span className="petx-lockrow">🔒 {SOURCE_LABEL[p.source] || "Unlock"}: {petUnlockText(p)}</span>}
                            </div>

                            {err ? <p className="petx-err">{err}</p> : null}
                            <div className="petx-actions">
                                {owned ? (
                                    <>
                                        {isFeatured
                                            ? <button type="button" className="btn-ghost" onClick={() => action(p.id, "unequip")} disabled={busy === p.id}>Unequip</button>
                                            : <button type="button" className="btn-gold" onClick={() => action(p.id, "equip")} disabled={busy === p.id}>{busy === p.id ? "…" : "⭐ Equip"}</button>}
                                        {tradeable
                                            ? <button type="button" className="btn-ghost" onClick={() => { setDetail(null); openGive(p); }}>🎁 Give a copy</button>
                                            : <button type="button" className="btn-ghost" disabled title="Already traded once">🔒 Traded</button>}
                                    </>
                                ) : p.source === "shop" ? (
                                    <button type="button" className="btn-gold" onClick={() => action(p.id, "buy")} disabled={!canBuy || busy === p.id} style={{ width: "100%" }}>
                                        {busy === p.id ? "…" : canBuy ? `Unlock · 💰 ${price.toLocaleString()}` : `Need 💰 ${price.toLocaleString()}`}
                                    </button>
                                ) : (
                                    <button type="button" className="btn-ghost" disabled style={{ width: "100%" }}>🔒 {petUnlockText(p)}</button>
                                )}
                            </div>
                        </div>
                    </div>, document.body);
            })() : null}
        </div>
    );
}
