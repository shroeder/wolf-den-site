"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { COLLECTIBLES, collectibleById, petPassive, petActive, petPrice, petUnlockText, PET_STAT_META } from "@/lib/marketplace/collectibles";

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
            if (act === "share") setNote(`🎁 Sent — ${d.to} can accept your pet copy.`);
            if (act === "accept") { setJustEquipped(d.petId); setTimeout(() => setJustEquipped(null), 900); setNote("🎉 Pet received!"); }
            await load();
            return true;
        }
        setErr(ERRORS[d?.error] || "Something went wrong.");
        return false;
    }

    function giveCopy(petId, petName) {
        const alias = window.prompt(`Give a COPY of ${petName} to a member (enter their @handle).\n\nHeads up: after they accept, both your pet and their copy can never be traded again.`);
        if (alias && alias.trim()) action(petId, "share", { toAlias: alias.trim() });
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
                    {state?.signedIn ? <span className="pill">🪙 {state.gold.toLocaleString()}</span> : null}
                </div>
                {state ? (
                    <div className="pets-summary">
                        <span><strong>{ownedCount}</strong> / {COLLECTIBLES.length} pets</span>
                        <span>🍀 <strong>+{state.passiveTotal}</strong> Fortune passive</span>
                        {featured ? <span>★ Equipped: <strong>{featured.name}</strong> ({statText(petActive(featured))} +{petActive(featured).value}%)</span> : <span className="muted">No pet equipped</span>}
                    </div>
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
                        const active = petActive(pet);
                        const Icon = pet.Icon;
                        const canBuy = pet.source === "shop" && !owned && state.signedIn && state.gold >= petPrice(pet);
                        return (
                            <div key={pet.id} className={`pet-card rarity-${pet.rarity}${owned ? " is-owned" : " is-locked"}${isFeatured ? " is-featured" : ""}${justEquipped === pet.id ? " just-equipped" : ""}`}>
                                {isFeatured ? <span className="pet-featured-badge">★ Equipped</span> : null}
                                <div className="pet-icon" style={{ color: pet.color }}>{Icon ? <Icon /> : "🐾"}</div>
                                <div className="pet-name">{pet.name}</div>
                                <div className="pet-rarity">{pet.rarity}</div>
                                <div className="pet-buffs">
                                    <span title="Bonus just for owning this pet (stacks with your others)">Own: +{passive.value} {statText(passive)}</span>
                                    <span title="Stronger buff while this pet is equipped">Equip: +{active.value}% {statText(active)}</span>
                                </div>
                                {owned ? (
                                    <>
                                        {isFeatured ? (
                                            <button type="button" className="btn-ghost pet-btn" onClick={() => action(pet.id, "unequip")} disabled={busy === pet.id}>Unequip</button>
                                        ) : (
                                            <button type="button" className="btn-gold pet-btn" onClick={() => action(pet.id, "equip")} disabled={busy === pet.id}>{busy === pet.id ? "…" : "Equip"}</button>
                                        )}
                                        {tradeableSet.has(pet.id) ? (
                                            <button type="button" className="pet-give" onClick={() => giveCopy(pet.id, pet.name)} disabled={busy === pet.id}>🎁 Give a copy</button>
                                        ) : (
                                            <span className="pet-traded" title="Already traded once — locked">🔒 traded</span>
                                        )}
                                    </>
                                ) : pet.source === "shop" ? (
                                    <button type="button" className="btn-gold pet-btn" onClick={() => action(pet.id, "buy")} disabled={!canBuy || busy === pet.id}>
                                        {busy === pet.id ? "…" : `Buy · 🪙 ${petPrice(pet).toLocaleString()}`}
                                    </button>
                                ) : (
                                    <div className="pet-locked">🔒 {petUnlockText(pet)}</div>
                                )}
                            </div>
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
        </div>
    );
}
