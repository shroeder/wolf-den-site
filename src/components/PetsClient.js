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

    async function action(petId, act) {
        setBusy(petId);
        setErr(null);
        const r = await fetch("/api/marketplace/pets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: act, petId }) }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        setBusy(null);
        if (r?.ok && d?.ok) {
            if (act === "equip") { setJustEquipped(petId); setTimeout(() => setJustEquipped(null), 900); }
            await load();
        } else {
            setErr({ not_enough_gold: "Not enough gold.", already_owned: "You already own that pet.", not_owned: "You don't own that pet yet." }[d?.error] || "Something went wrong.");
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

            <div className="bounty-filters">
                {SOURCES.map((s) => (
                    <button type="button" key={s.id} className={`pill${filter === s.id ? " is-active" : ""}`} onClick={() => setFilter(s.id)}>{s.label}</button>
                ))}
            </div>

            {err ? <p style={{ color: "#e66" }}>{err}</p> : null}

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
                                    isFeatured ? (
                                        <button type="button" className="btn-ghost pet-btn" onClick={() => action(pet.id, "unequip")} disabled={busy === pet.id}>Unequip</button>
                                    ) : (
                                        <button type="button" className="btn-gold pet-btn" onClick={() => action(pet.id, "equip")} disabled={busy === pet.id}>{busy === pet.id ? "…" : "Equip"}</button>
                                    )
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
