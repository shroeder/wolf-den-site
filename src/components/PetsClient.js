"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import MemberHeroCard from "@/components/MemberHeroCard";
import PetArt from "@/components/PetArt";
import { COLLECTIBLES, collectibleById, petPassive, petSpecialPassive, petPassiveLevelMult, petPrice, petUnlockText, PET_STAT_META } from "@/lib/marketplace/collectibles";
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
    fortune: "Bonus raffle tickets in the weekly boss prize draw — real extra odds to win.",
    xp_gain: "An earner: passively generates XP for you over time (paid out when you check in).",
    gold_find: "An earner: passively generates gold for you over time (paid out when you check in).",
};

const SOURCE_LABEL = {
    level: "🎮 Leveling reward", shop: "🛒 Shop", achievement: "🏅 Achievement",
    chest: "🎁 Chest drop", boss: "⚔️ Boss drop", elite: "🌟 Elite",
};

// A 1–5 star meter for a pet's level (filled = reached).
function Stars({ level = 1, max = 5, className = "" }) {
    return (
        <span className={`pet-stars ${className}`} role="img" aria-label={`Level ${level} of ${max}`}>
            {Array.from({ length: max }, (_, i) => (
                <span key={i} className={i < level ? "on" : "off"}>★</span>
            ))}
        </span>
    );
}

// A short, self-contained "level up!" chime via the Web Audio API (no asset — CSP-safe). Best-effort;
// browsers may block audio without a prior user gesture (e.g. on page load), which is fine.
function playLevelUpChime() {
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const now = ctx.currentTime;
        // A bright rising arpeggio (C5–E5–G5–C6) — a classic "reward" flourish.
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "triangle";
            osc.frequency.value = freq;
            const t = now + i * 0.09;
            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.3);
        });
        setTimeout(() => ctx.close().catch(() => {}), 1200);
    } catch {
        /* audio unavailable — no-op */
    }
}

// The dedicated Pets page: every pet, clearly owned vs. locked, with how to unlock each, its passive (owned)
// and active (equipped) buffs, and equip / buy actions.
export default function PetsClient() {
    const [state, setState] = useState(null);
    const [filter, setFilter] = useState("");
    const [busy, setBusy] = useState(null);
    const [err, setErr] = useState(null);
    const [justEquipped, setJustEquipped] = useState(null);
    const [levelUp, setLevelUp] = useState(null); // { pet, to } — a pet that leveled up since last visit

    // Detect pets that gained a level since the member last looked (covers levels earned while away via the
    // XP-share/trickle) → fire a dopamine celebration + chime. Seen levels are remembered per pet locally.
    function detectLevelUps(d) {
        if (!d?.petLevels || typeof window === "undefined") return;
        let seen = {};
        try { seen = JSON.parse(localStorage.getItem("wd_pet_levels_seen") || "{}"); } catch { seen = {}; }
        const gained = [];
        const now = {};
        for (const [pid, info] of Object.entries(d.petLevels)) {
            now[pid] = info.level;
            const prev = Number.isFinite(seen[pid]) ? seen[pid] : 1;
            if (info.level > prev) gained.push({ petId: pid, from: prev, to: info.level });
        }
        try { localStorage.setItem("wd_pet_levels_seen", JSON.stringify(now)); } catch { /* ignore */ }
        if (gained.length) {
            const top = gained.sort((a, b) => b.to - a.to)[0];
            const pet = collectibleById(top.petId);
            // Sprite art at the old + new level, for the evolution reveal (may be null if not generated yet).
            const sprites = d.petSprites?.[top.petId] || {};
            if (pet) { setLevelUp({ pet, from: top.from, to: top.to, oldArt: sprites[top.from] || null, newArt: sprites[top.to] || null }); playLevelUpChime(); }
        }
    }

    async function load() {
        const r = await fetch("/api/marketplace/pets", { cache: "no-store" }).catch(() => null);
        const d = r?.ok ? await r.json().catch(() => null) : null;
        if (!d) return;
        detectLevelUps(d);
        setState(d);
    }
    useEffect(() => { load(); }, []);

    const ownedSet = useMemo(() => new Set(state?.ownedIds || []), [state]);
    const tradeableSet = useMemo(() => new Set(state?.tradeableIds || []), [state]);
    const [note, setNote] = useState(null);
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const [modalErr, setModalErr] = useState(null);
    const [sending, setSending] = useState(false);
    const [celebrate, setCelebrate] = useState(null); // pet to show a receive/unlock celebration for
    const [detail, setDetail] = useState(null); // pet whose detail PAGE is open (in-flow, not a modal)
    // Give-a-copy: folded into the detail page as an expandable member-search panel (no more @handle typing).
    const [giveOpen, setGiveOpen] = useState(false);
    const [memberQuery, setMemberQuery] = useState("");
    const [memberResults, setMemberResults] = useState([]);
    const [memberSearching, setMemberSearching] = useState(false);

    // Open a pet as a full page (breadcrumb back), syncing to ?pet=<id> so the browser back button works and
    // the view is linkable/scrollable — fixes the tall-modal scroll trap.
    const openDetail = useCallback((pet) => {
        setDetail(pet);
        setGiveOpen(false);
        setErr(null);
        setNote(null);
        if (typeof window !== "undefined") {
            window.history.pushState({ pet: pet.id }, "", `?pet=${encodeURIComponent(pet.id)}`);
            window.scrollTo(0, 0);
        }
    }, []);
    const closeDetail = useCallback(() => {
        setDetail(null);
        setGiveOpen(false);
        if (typeof window !== "undefined") window.history.pushState({}, "", window.location.pathname);
    }, []);
    // Reflect the URL: back/forward (popstate) and the initial ?pet= deep-link both drive which pet is open.
    useEffect(() => {
        const fromUrl = () => {
            const id = new URLSearchParams(window.location.search).get("pet");
            setDetail(id ? collectibleById(id) || null : null);
            setGiveOpen(false);
        };
        fromUrl();
        window.addEventListener("popstate", fromUrl);
        return () => window.removeEventListener("popstate", fromUrl);
    }, []);

    const ERRORS = {
        not_enough_gold: "Not enough gold.",
        already_owned: "You already own that pet.",
        not_owned: "You don't own that pet yet.",
        not_tradeable: "That pet has already been traded once — it can't be traded again.",
        recipient_not_found: "No member with that @handle.",
        cannot_share_self: "You can't give a pet to yourself.",
        already_pending: "You already have a pending gift of this pet — wait for it to be accepted or declined first.",
        recipient_has_pet: "They already have that pet.",
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

    // Debounced member search for the give-a-copy panel → hero-card results (reuses the SocialHub endpoint,
    // so you pick a person from their card instead of typing an @handle).
    useEffect(() => {
        if (!giveOpen) return undefined;
        setMemberSearching(true);
        const t = setTimeout(async () => {
            const r = await fetch(`/api/marketplace/members?q=${encodeURIComponent(memberQuery.trim())}`, { cache: "no-store" }).catch(() => null);
            const d = r ? await r.json().catch(() => null) : null;
            setMemberResults(d?.members || []);
            setMemberSearching(false);
        }, 250);
        return () => clearTimeout(t);
    }, [giveOpen, memberQuery]);

    async function sendGiftTo(member) {
        if (!detail || !member?.alias) return;
        setSending(member.id);
        setModalErr(null);
        const r = await fetch("/api/marketplace/pets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "share", petId: detail.id, toAlias: member.alias }) }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        setSending(false);
        if (r?.ok && d?.ok) {
            setGiveOpen(false);
            setNote(`🎁 Gift sent — ${d.to || member.displayLabel} can accept a fresh Lv 1 copy of ${detail.name}.`);
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

    // The pet detail as a full in-flow page (breadcrumb back + normal scroll), with the give-a-copy flow
    // folded in as a member SEARCH → hero-card picker (no @handle typing).
    const renderDetail = () => {
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
        return (
            <div className="petx-page">
                <button type="button" className="petx-crumb" onClick={closeDetail}>← All pets</button>
                {note ? <p style={{ color: "#7ad07a", textAlign: "center", margin: 0, fontWeight: 700 }}>{note}</p> : null}
                <div className={`petx-detail-card rarity-${p.rarity}`}>
                    <div className="petx-hero petx-hero-big">
                        <span className="petx-hero-glow" />
                        <span className="petx-hero-icon" data-petlvl={lvl ? lvl.level : undefined} style={{ color: p.color }}><PetArt id={p.id} /></span>
                    </div>
                    <div className="petx-cele-tag">{p.rarity}</div>
                    <h2 className="petx-title">{p.name}</h2>
                    <p className="petx-sub">{p.hint || SOURCE_LABEL[p.source] || ""}</p>

                    {lvl ? (
                        <div className="petx-level">
                            <div className="petx-level-head">
                                <span><Stars level={lvl.level} className="lg" /> <strong className="muted" style={{ fontSize: "0.8rem" }}>Lv {lvl.level}/5</strong></span>
                                <span className="muted">{lvl.maxed ? "MAX" : `${lvl.into} / ${lvl.span} XP`}</span>
                            </div>
                            <div className="petx-level-bar"><span style={{ width: `${pct}%` }} /></div>
                            <div className="petx-tiers">
                                {[1, 2, 3, 4, 5].map((n) => (
                                    <div key={n} className={`petx-tier${n === lvl.level ? " is-current" : ""}${n < lvl.level ? " is-done" : ""}${n > lvl.level ? " is-locked" : ""}`}>
                                        <span className="petx-tier-stars">{"★".repeat(n)}</span>
                                        <span className="petx-tier-val">+{Math.round(lvl.base * petPassiveLevelMult(n))} {statText(passive)}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="muted" style={{ fontSize: "0.78rem", marginTop: 6 }}>
                                {isFeatured
                                    ? "Equipped — earns 12% of your XP + a little over time. Leveling boosts its ⭐ signature (active)."
                                    : "Equip this pet to level it up (12% of your XP + a trickle over time)."}
                            </div>
                        </div>
                    ) : null}

                    <div className="petx-abilities">
                        <div className="petx-ability">
                            <div className="petx-ability-head">🐾 Passive <span className="muted">· always active while owned</span></div>
                            <div className="petx-ability-body">
                                <strong>+{lvl ? lvl.value : passive.value} {statText(passive)}</strong>
                                {lvl && !lvl.maxed ? <span className="muted"> → +{Math.round(passive.value * petPassiveLevelMult(lvl.level + 1))} at Lv {lvl.level + 1}</span> : null}
                                {" "}— {STAT_EFFECT[passive.stat] || ""} <span className="muted">Scales gently (up to ×2) as this pet levels. Stacks with your whole collection.</span>
                            </div>
                        </div>
                        {(() => {
                            const sp = petSpecialPassive(p);
                            if (!sp) return null;
                            const n = lvl ? lvl.level : 1;
                            const bits = [];
                            if (sp.secondStat) bits.push(`🌟 Dual affinity — also +${Math.round(sp.secondValue * petPassiveLevelMult(n))} ${PET_STAT_META[sp.secondStat]?.label || sp.secondStat}`);
                            if (sp.aura > 0) bits.push(`✨ Menagerie Aura — +${Math.round(sp.aura * 100)}% to ALL your pets' passives`);
                            return (
                                <div className="petx-ability petx-special">
                                    <div className="petx-ability-head">💫 {p.rarity} bonus <span className="muted">· always active while owned</span></div>
                                    <div className="petx-ability-body">{bits.map((b, i) => <div key={i}>{b}</div>)}</div>
                                </div>
                            );
                        })()}
                        <div className="petx-ability">
                            <div className="petx-ability-head">⭐ Signature <span className="muted">· when equipped, grows as you level this pet</span></div>
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
                                    ? <button type="button" className={`btn-ghost${giveOpen ? " is-active" : ""}`} onClick={() => { setGiveOpen((v) => !v); setModalErr(null); }}>{giveOpen ? "✕ Cancel gift" : "🎁 Give a copy"}</button>
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

                    {owned && tradeable && giveOpen ? (
                        <div className="petx-give">
                            <div className="petx-warn">🔒 Once they accept, <strong>both</strong> your pet and their copy can never be traded again. They receive a <strong>fresh Lv&nbsp;1</strong> copy — your leveled pet stays yours.</div>
                            <label className="petx-label" htmlFor="petx-search">Give to which member?</label>
                            <input id="petx-search" className="petx-input" value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} placeholder="Search members by name or @handle…" autoComplete="off" autoFocus />
                            {modalErr ? <p className="petx-err">{modalErr}</p> : null}
                            <div className="petx-give-results">
                                {memberSearching && !memberResults.length ? <p className="muted" style={{ margin: 0 }}>Searching…</p> : null}
                                {!memberSearching && !memberResults.length ? <p className="muted" style={{ margin: 0 }}>No members found.</p> : null}
                                {memberResults.map((m) => (
                                    <MemberHeroCard
                                        key={m.id}
                                        member={m}
                                        compact
                                        action={<button type="button" className="social-mini-btn is-primary" disabled={sending === m.id} onClick={() => sendGiftTo(m)}>{sending === m.id ? "Sending…" : "🎁 Give"}</button>}
                                    />
                                ))}
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
        );
    };

    return (
        <div className="stack reveal">
            {!detail && (<>
            <section className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div>
                        <h1 style={{ margin: 0 }}>🐾 Pets</h1>
                        <p className="muted" style={{ margin: "4px 0 0" }}>
                            Collect companions from leveling, the shop, achievements, chests, and boss drops. <strong>Every pet you own</strong> adds a passive bonus that stacks — fighters buff your boss strike, earners generate XP &amp; gold over time. <strong>Equip one</strong> for a much stronger active buff.
                        </p>
                    </div>
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
                        {state.income && (state.income.xpPerHour > 0 || state.income.goldPerHour > 0 || state.income.raffleTickets > 0) ? (
                            <div className="pets-passives" style={{ marginTop: 8 }}>
                                <span className="muted" style={{ fontSize: "0.8rem" }}>Your earner pets generate:</span>
                                {state.income.xpPerHour > 0 ? <span className="pet-passive-chip">✨ +{state.income.xpPerHour} XP/hr</span> : null}
                                {state.income.goldPerHour > 0 ? <span className="pet-passive-chip">🪙 +{state.income.goldPerHour} gold/hr</span> : null}
                                {state.income.raffleTickets > 0 ? <span className="pet-passive-chip">🎟️ +{state.income.raffleTickets} boss raffle tickets</span> : null}
                            </div>
                        ) : null}
                        {state.incomeEarned && (state.incomeEarned.xp > 0 || state.incomeEarned.gold > 0) ? (
                            <p style={{ margin: "8px 0 0", color: "#ffd75e", fontWeight: 600 }}>
                                🐾 Your pets earned you {state.incomeEarned.xp > 0 ? `+${state.incomeEarned.xp} XP` : ""}
                                {state.incomeEarned.xp > 0 && state.incomeEarned.gold > 0 ? " and " : ""}
                                {state.incomeEarned.gold > 0 ? `+${state.incomeEarned.gold} gold` : ""} since your last visit!
                            </p>
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
                            <button type="button" key={pet.id} onClick={() => openDetail(pet)} className={`pet-card pet-card-btn rarity-${pet.rarity}${owned ? " is-owned" : " is-locked"}${isFeatured ? " is-featured" : ""}${justEquipped === pet.id ? " just-equipped" : ""}`}>
                                {isFeatured ? <span className="pet-featured-badge">★ Equipped</span> : null}
                                {lvl ? <span className="pet-level-badge"><Stars level={lvl.level} /></span> : null}
                                <div className="pet-icon" data-petlvl={lvl ? lvl.level : undefined} style={{ color: pet.color }}><PetArt id={pet.id} /></div>
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
            </>)}

            {/* Pet detail — a full in-flow PAGE (breadcrumb back), not a modal, so it scrolls normally. */}
            {mounted && detail ? renderDetail() : null}

            {/* Receive/unlock celebration. */}
            {mounted && celebrate ? createPortal(
                <div className="petx-overlay petx-celebrate" onClick={() => setCelebrate(null)}>
                    <div className={`petx-cele rarity-${celebrate.rarity}`} onClick={(e) => e.stopPropagation()}>
                        <div className="petx-confetti" aria-hidden="true">{Array.from({ length: 14 }).map((_, i) => <span key={i} style={{ "--i": i }}>{["✨", "🎉", "⭐", "🌟"][i % 4]}</span>)}</div>
                        <div className="petx-hero petx-hero-big">
                            <span className="petx-hero-glow" />
                            <span className="petx-hero-icon" style={{ color: celebrate.color }}><PetArt id={celebrate.id} /></span>
                        </div>
                        <div className="petx-cele-tag">New pet!</div>
                        <h2 className="petx-title">{celebrate.name}</h2>
                        <p className="petx-sub">{celebrate.rarity} companion added to your collection.</p>
                        <button type="button" className="btn-gold" onClick={() => setCelebrate(null)}>Awesome</button>
                    </div>
                </div>, document.body) : null}

            {/* Level-up celebration — fires when a pet gained a level since the member last looked. */}
            {mounted && levelUp ? createPortal(
                <div className="petx-overlay petx-celebrate" onClick={() => setLevelUp(null)}>
                    <div className={`petx-cele petx-levelup rarity-${levelUp.pet.rarity}`} onClick={(e) => e.stopPropagation()}>
                        <div className="petx-confetti" aria-hidden="true">{Array.from({ length: 16 }).map((_, i) => <span key={i} style={{ "--i": i }}>{["✨", "🎉", "⭐", "🌟"][i % 4]}</span>)}</div>
                        {(() => {
                            const oldA = levelUp.oldArt, newA = levelUp.newArt;
                            const evolves = oldA?.url && newA?.url && oldA.url !== newA.url;
                            if (evolves) {
                                // Pokémon-style reveal: old form flashes out, new evolved sprite bursts in.
                                return (
                                    <div className="petx-hero petx-hero-big petx-evo">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img className="petx-evo-img petx-evo-old" src={oldA.url} alt="" style={oldA.flip ? { transform: "scaleX(-1)" } : undefined} />
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img className="petx-evo-img petx-evo-new" src={newA.url} alt="" style={newA.flip ? { transform: "scaleX(-1)" } : undefined} />
                                        <span className="petx-evo-flash" aria-hidden="true" />
                                    </div>
                                );
                            }
                            if (newA?.url) {
                                return (
                                    <div className="petx-hero petx-hero-big petx-evo">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img className="petx-evo-img petx-evo-new" src={newA.url} alt="" style={newA.flip ? { transform: "scaleX(-1)" } : undefined} />
                                    </div>
                                );
                            }
                            return (
                                <div className="petx-hero petx-hero-big">
                                    <span className="petx-hero-glow" />
                                    <span className="petx-hero-icon" data-petlvl={levelUp.to} style={{ color: levelUp.pet.color }}><PetArt id={levelUp.pet.id} /></span>
                                </div>
                            );
                        })()}
                        <div className="petx-cele-tag">{levelUp.oldArt?.url && levelUp.newArt?.url && levelUp.oldArt.url !== levelUp.newArt.url ? "✨ Evolved!" : "⬆️ Level up!"}</div>
                        <h2 className="petx-title">{levelUp.pet.name} reached Lv {levelUp.to}</h2>
                        <Stars level={levelUp.to} className="lg" />
                        {(() => {
                            const info = state?.petLevels?.[levelUp.pet.id];
                            if (!info) return null;
                            return <p className="petx-sub">Passive now <strong>+{info.value} {statText({ stat: info.stat })}</strong>{levelUp.to >= 5 ? " — MAX level! 🏆" : ""}</p>;
                        })()}
                        <button type="button" className="btn-gold" onClick={() => setLevelUp(null)}>Nice!</button>
                    </div>
                </div>, document.body) : null}

        </div>
    );
}
