"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import MemberHeroCard from "@/components/MemberHeroCard";
import PetArt from "@/components/PetArt";
import PetEnshrine from "@/components/PetEnshrine";
import PetStonesRow from "@/components/PetStonesRow";
import PetEnshrineReveal from "@/components/PetEnshrineReveal";
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
    { id: "raid", label: "Raid" },
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
    chest: "🎁 Chest drop", boss: "⚔️ Boss drop", raid: "🏘️ Raid-exclusive", elite: "🌟 Elite",
};

// A scannable, self-explaining group for the menagerie summary: a labeled header + one row per bonus, each
// with an accent icon badge, the value, the stat name, and a plain-English one-liner of what it actually does
// (so the meaning reads inline instead of hiding in a tooltip / collapsed accordion).
function MenagerieGroup({ title, sub, tiles, accent = "#ffd75e" }) {
    if (!tiles.length) return null;
    return (
        <div className="petsum-group" style={{ "--acc": accent }}>
            <div className="petsum-ghead"><b>{title}</b><small>{sub}</small></div>
            {tiles.map((t) => (
                <div key={t.key} className="petsum-row">
                    <span className="petsum-ico" aria-hidden="true">
                        {t.sprite ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={t.sprite} alt="" draggable={false} style={{ width: 30, height: 30, objectFit: "contain" }} />
                        ) : t.icon}
                    </span>
                    <span className="petsum-val">{t.value}</span>
                    <span className="petsum-body"><b>{t.label}</b>{t.desc ? <small>{t.desc}</small> : null}</span>
                </div>
            ))}
        </div>
    );
}

const PET_SUMMARY_CSS = `
.petsum-groups { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 12px; }
.petsum-group { --acc: #ffd75e; border-radius: 14px; padding: 11px 12px 7px;
    background: linear-gradient(180deg, color-mix(in srgb, var(--acc) 9%, transparent), rgba(255,255,255,0.015));
    border: 1px solid color-mix(in srgb, var(--acc) 30%, transparent); }
.petsum-ghead { display: flex; align-items: baseline; gap: 7px; margin-bottom: 4px; flex-wrap: wrap; }
.petsum-ghead b { font-size: 0.72rem; font-weight: 900; letter-spacing: 0.05em; text-transform: uppercase; color: var(--acc); }
.petsum-ghead small { font-size: 0.66rem; color: #9aa2ab; }
.petsum-row { display: flex; align-items: center; gap: 10px; padding: 8px 6px; border-radius: 10px; transition: background .12s ease; }
.petsum-row + .petsum-row { border-top: 1px solid rgba(255,255,255,0.055); }
.petsum-row:hover { background: rgba(255,255,255,0.045); }
.petsum-ico { flex: none; width: 31px; height: 31px; display: grid; place-items: center; font-size: 16px; border-radius: 9px;
    background: color-mix(in srgb, var(--acc) 18%, transparent); border: 1px solid color-mix(in srgb, var(--acc) 38%, transparent);
    box-shadow: 0 0 12px color-mix(in srgb, var(--acc) 20%, transparent); }
.petsum-val { flex: none; min-width: 36px; text-align: right; font-weight: 900; font-size: 1.06rem; color: var(--acc); font-variant-numeric: tabular-nums; }
.petsum-body { display: flex; flex-direction: column; min-width: 0; line-height: 1.22; }
.petsum-body b { font-size: 0.82rem; color: #f0ede6; }
.petsum-body small { font-size: 0.7rem; color: #9aa2ab; }
.petsum-progress { height: 6px; border-radius: 999px; background: rgba(255,255,255,0.08); overflow: hidden; }
.petsum-progress > span { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, #f3b23a, #ffe488); box-shadow: 0 0 10px rgba(255,215,110,0.6); transition: width .6s cubic-bezier(.3,1.2,.4,1); }
`;

// SIX stars, not five. The sixth is drawn differently — hollow until it is earned — because the single most
// important thing this row has to say is "there is another one", to somebody who has spent months believing
// five was the end. A row of five full stars reads as finished; five full and one waiting reads as a road.
function Stars({ level = 1, max = 6, className = "", stone = null }) {
    return (
        <span className={`pet-stars ${className}${stone ? ` is-${stone}` : ""}`} role="img" aria-label={`Level ${level} of ${max}`}>
            {Array.from({ length: max }, (_, i) => (
                <span key={i} className={`${i < level ? "on" : "off"}${i === max - 1 ? " last" : ""}`}>
                    {i === max - 1 ? "✦" : "★"}
                </span>
            ))}
        </span>
    );
}

// The dedicated Pets page: every pet, clearly owned vs. locked, with how to unlock each, its passive (owned)
// and active (equipped) buffs, and equip / buy actions.
export default function PetsClient() {
    const [state, setState] = useState(null);
    const [filter, setFilter] = useState("");
    // "rarity" (the collection's own order) or "xp" (what you are actually levelling).
    const [sort, setSort] = useState("rarity");
    const [busy, setBusy] = useState(null);
    const [reveal, setReveal] = useState(null);
    const [err, setErr] = useState(null);
    const [justEquipped, setJustEquipped] = useState(null);
    // Pet level-up / evolution celebration is handled site-wide by <PetLevelUp> (mounted in the layout), so it
    // fires anywhere in the app — not just here.

    // ── WHICH ONE IS NEW ─────────────────────────────────────────────────────────────────────────────────
    // The server flags any pet granted since this member last opened the page (petsState.newPets). Two things
    // are done with it and they answer two different complaints: the celebration overlay — the same one a
    // gifted pet already gets — is the pop-up ValkyrieSylve asked for, and the flag on the tile is the part
    // GrayKitsune wanted, because a pop-up you dismiss still leaves you looking at a hundred identical cards.
    //
    // `newIds` is captured from the FIRST load and then held for the rest of the visit. Opening the page marks
    // it seen server-side, so a later reload returns an empty list — and the flags would vanish mid-visit.
    const [newIds, setNewIds] = useState(null);
    const newSet = useMemo(() => new Set(newIds || []), [newIds]);

    async function load() {
        const r = await fetch("/api/marketplace/pets", { cache: "no-store" }).catch(() => null);
        const d = r?.ok ? await r.json().catch(() => null) : null;
        if (!d) return;
        setState(d);
        // The FLAGS stay here — a pop-up you dismiss still leaves you looking at a hundred identical cards,
        // which was GrayKitsune's point. The CELEBRATION does not: <PetAlerts> in the layout now shows that
        // wherever you were standing when the pet actually arrived, so popping it again on arrival at this
        // page would be the same moment told twice, late.
        if (newIds === null) setNewIds((d.newPets || []).filter((id) => collectibleById(id)));
    }
    useEffect(() => { load(); }, []);

    const ownedSet = useMemo(() => new Set(state?.ownedIds || []), [state]);
    const tradeableSet = useMemo(() => new Set(state?.tradeableIds || []), [state]);
    const [note, setNote] = useState(null);
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const [modalErr, setModalErr] = useState(null);
    const [sending, setSending] = useState(false);
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

    // ── ARRIVING TO ENSHRINE ─────────────────────────────────────────────────────────────────────────────
    // The level-six celebration links in here with `?pet=<id>&enshrine=1`, and the stone panel sits well below
    // the fold of a long sheet — landing at the top of it is landing in the wrong place. Scroll to the panel
    // and flash it once, then drop the flag from the URL so a back-navigation or a refresh does not repeat a
    // movement the member did not ask for the second time.
    useEffect(() => {
        if (!detail || typeof window === "undefined") return undefined;
        if (new URLSearchParams(window.location.search).get("enshrine") !== "1") return undefined;
        // The panel renders with the sheet, but only once the pet's levels have come back from the server —
        // which on a cold load is a good deal later than this effect first runs. So watch for it for a few
        // seconds rather than looking once, and give up quietly if it never appears (an unowned pet, or one
        // that has already been enshrined and shows its done-panel instead — that one is a `.pens` too, and
        // scrolling to it is still the right answer).
        let el = null;
        let tries = 0;
        const timer = setInterval(() => {
            el = document.querySelector(".pens");
            if (!el) { if (tries++ > 50) clearInterval(timer); return; }
            clearInterval(timer);
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.classList.add("pens-called");
            const url = new URL(window.location.href);
            url.searchParams.delete("enshrine");
            window.history.replaceState({}, "", `${url.pathname}${url.search}`);
        }, 120);
        return () => { clearInterval(timer); el?.classList.remove("pens-called"); };
    }, [detail]);

    const ERRORS = {
        not_enough_gold: "Not enough gold.",
        no_power: "You need to be wearing the piece that grants the Breeder's Eye.",
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
            // Handed to the ONE celebration card, the same way a level-up is — so accepting a gift looks
            // identical to a pet arriving any other way.
            if (act === "accept" && d.petId) window.dispatchEvent(new CustomEvent("wolfden-pet-new", { detail: { petId: d.petId } }));
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

    // ── SORT BY PROGRESS ─────────────────────────────────────────────────────────────────────────────────
    // SoullessShiitake: "it would be cool if you could sort your pets by how much XP they have so you can
    // compare progress a little easier." Kaishiern, straight after: "and that would make it easier for people
    // visiting your farm to pet the ones you're working on instead of random pets."
    //
    // That second half is why this is worth more than a tidier grid — the pets you are ACTIVELY levelling are
    // invisible to a visitor, so a farm guest spends their pettings at random when they meant to help.
    //
    // Rarity stays the default: it is what the collection is FOR, and re-ordering the board under people who
    // know where their pets live would be its own small bug.
    const pets = useMemo(() => {
        let list = [...COLLECTIBLES];
        if (filter === "owned") list = list.filter((p) => ownedSet.has(p.id));
        else if (filter) list = list.filter((p) => p.source === filter);
        const xpOf = (id) => Number(state?.petLevels?.[id]?.xp) || 0;
        return list.sort((a, b) => {
            const ao = ownedSet.has(a.id) ? 0 : 1, bo = ownedSet.has(b.id) ? 0 : 1;
            if (ao !== bo) return ao - bo;
            if (sort === "xp") {
                // Most-levelled first. Falls through to rarity and name so unowned pets — which all have zero
                // — keep the ordering they had rather than shuffling into an arbitrary heap.
                const ax = xpOf(a.id), bx = xpOf(b.id);
                if (ax !== bx) return bx - ax;
            }
            const ar = RARITY_ORDER[a.rarity] ?? 0, br = RARITY_ORDER[b.rarity] ?? 0;
            if (ar !== br) return ar - br;
            return a.name.localeCompare(b.name);
        });
    }, [filter, ownedSet, sort, state?.petLevels]);

    const featured = state?.featured ? collectibleById(state.featured) : null;
    const ownedCount = state?.ownedIds?.length || 0;
    const passiveEntries = Object.entries(state?.passiveTotals || {}).sort((a, b) => b[1] - a[1]);
    // The pet's sprite at its CURRENT level (leveled/evolved art), so cards + detail show the right form —
    // not always the base level-1 sprite. Null for unowned pets → PetArt falls back to the base sprite.
    const leveledSprite = (petId) => {
        const lv = state?.petLevels?.[petId]?.level;
        return (lv && state?.petSprites?.[petId]?.[lv]) || null;
    };

    // The pet detail as a full in-flow page (breadcrumb back + normal scroll), with the give-a-copy flow
    // folded in as a member SEARCH → hero-card picker (no @handle typing).
    const renderDetail = () => {
        const p = detail;
        const owned = ownedSet.has(p.id);
        const isFeatured = state?.featured === p.id;
        const tradeable = tradeableSet.has(p.id);
        const giftPending = state?.outgoing?.[p.id] || null; // an offer of THIS pet is already awaiting acceptance
        const passive = petPassive(p);
        const perk = petPerk(p);
        const price = petPrice(p);
        const canBuy = p.source === "shop" && !owned && state?.signedIn && state.gold >= price;
        const lvl = owned ? state?.petLevels?.[p.id] : null;
        const isWished = state?.petWish === p.id;
        const pct = lvl && !lvl.maxed && lvl.span > 0 ? Math.round((lvl.into / lvl.span) * 100) : 100;
        return (
            <div className="petx-page">
                <PetEnshrineReveal open={Boolean(reveal)} pet={reveal?.pet} stone={reveal?.stone}
                    before={reveal?.before} after={reveal?.after} onClose={() => setReveal(null)} />
                <button type="button" className="petx-crumb" onClick={closeDetail}>← All pets</button>
                {note ? <p style={{ color: "#7ad07a", textAlign: "center", margin: 0, fontWeight: 700 }}>{note}</p> : null}
                <div className={`petx-detail-card rarity-${p.rarity}`}>
                    <div className="petx-hero petx-hero-big">
                        <span className="petx-hero-glow" />
                        <span className="petx-hero-icon" data-petlvl={lvl ? lvl.level : undefined} style={{ color: p.color }}><PetArt id={p.id} url={leveledSprite(p.id)?.url} flip={leveledSprite(p.id)?.flip} /></span>
                    </div>
                    <div className="petx-cele-tag">{p.rarity}</div>
                    <h2 className="petx-title">{p.name}</h2>
                    <p className="petx-sub">{p.hint || SOURCE_LABEL[p.source] || ""}</p>

                    {lvl ? (
                        <div className="petx-level">
                            <div className="petx-level-head">
                                <span><Stars level={lvl.level} className="lg" /> <strong className="muted" style={{ fontSize: "0.8rem" }}>Lv {lvl.level}/6</strong></span>
                                <span className="muted">{lvl.maxed ? "MAX" : `${lvl.into} / ${lvl.span} XP`}</span>
                            </div>
                            <div className="petx-level-bar"><span style={{ width: `${pct}%` }} /></div>
                            {/* The per-level values are a horizontal track now — as five stacked rows it was the
                                tallest, most repetitive block on the page. */}
                            <div className="petx-tiers-cap">{statText(passive)} by level</div>
                            <div className="petx-tiers">
                                {[1, 2, 3, 4, 5, 6].map((n) => (
                                    <div key={n} className={`petx-tier${n === lvl.level ? " is-current" : ""}${n < lvl.level ? " is-done" : ""}${n > lvl.level ? " is-locked" : ""}`}>
                                        <span className="petx-tier-stars">{n}★</span>
                                        <span className="petx-tier-val">+{Math.round(lvl.base * petPassiveLevelMult(n))}</span>
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

                    {/* ── LEVEL SIX ── the panel only exists once the climb is done, and it draws BOTH forms
                        before you choose, because the choice is permanent and two lines of text is not enough
                        to make one on. */}
                    {lvl ? (
                        <PetEnshrine
                            pet={p}
                            level={lvl.level}
                            sprites={state?.petSprites?.[p.id] || null}
                            stones={state?.ascension?.stones}
                            prices={state?.ascension?.prices}
                            enshrined={(state?.ascension?.enshrined || []).find((e) => e.petId === p.id)?.stone || null}
                            busy={busy === p.id}
                            onEnshrine={async (stone) => {
                                // The reveal is armed BEFORE the reload, with the sprites captured as they
                                // are right now — `load()` replaces state and the "before" form would be gone.
                                const was = state?.petSprites?.[p.id]?.[lvl.level] || null;
                                const will = state?.petSprites?.[p.id]?.[stone] || null;
                                const ok = await action(p.id, "enshrine", { stone });
                                if (ok) setReveal({ pet: p, stone, before: was, after: will });
                            }}
                        />
                    ) : null}

                    <div className="petx-abilities">
                        <div className="petx-ability petx-passive">
                            <div className="petx-ability-head">
                                <span className="petx-tag">🐾 Passive</span>
                                <span className="petx-ability-note">always on · every copy stacks</span>
                            </div>
                            <div className="petx-statline">
                                <span className="petx-statbig">+{lvl ? lvl.value : passive.value}</span>
                                <span className="petx-statname">{statText(passive)}</span>
                                {lvl && !lvl.maxed ? <span className="petx-statnext">→ +{Math.round(passive.value * petPassiveLevelMult(lvl.level + 1))} at Lv {lvl.level + 1}</span> : null}
                            </div>
                            <div className="petx-ability-body">
                                {PET_STAT_META[passive.stat]?.desc || STAT_EFFECT[passive.stat] || ""}
                                {" "}<span className="muted">Scales up to ×2 as it levels, and stacks with your whole collection.</span>
                            </div>
                        </div>
                        {(() => {
                            const sp = petSpecialPassive(p);
                            if (!sp) return null;
                            const n = lvl ? lvl.level : 1;
                            const bits = [];
                            if (sp.secondStat) bits.push(`🌟 Dual affinity — also +${Math.round(sp.secondValue * petPassiveLevelMult(n))} ${PET_STAT_META[sp.secondStat]?.label || sp.secondStat}`);
                            if (sp.aura > 0) bits.push(`✨ Menagerie Aura — +${Math.round(sp.aura * 100)}% to ALL your pets' passives`);
                            // Legendary tier has aura 0, so a legendary pet whose active stat matches its passive
                            // stat earns NEITHER bit — render nothing rather than a header over an empty box.
                            if (!bits.length) return null;
                            return (
                                <div className="petx-ability petx-special">
                                    <div className="petx-ability-head">
                                        <span className="petx-tag">💫 {p.rarity} bonus</span>
                                        <span className="petx-ability-note">always active while owned</span>
                                    </div>
                                    <div className="petx-ability-body">{bits.map((b, i) => <div key={i}>{b}</div>)}</div>
                                </div>
                            );
                        })()}
                        <div className={`petx-ability petx-active${isFeatured ? " is-live" : ""}`}>
                            <div className="petx-ability-head">
                                <span className="petx-tag">⭐ Signature</span>
                                <span className="petx-ability-note">{isFeatured ? "active now · grows as it levels" : "equip to activate · grows as it levels"}</span>
                            </div>
                            <div className="petx-perkname">{perk.icon} {perk.name}</div>
                            <div className="petx-ability-body">{perk.desc}.</div>
                        </div>
                        {petRealWorld(p) ? (
                            <div className="petx-ability petx-realworld">
                                <div className="petx-ability-head">
                                    <span className="petx-tag">🎁 Real-world perk</span>
                                    <span className="petx-ability-note">redeem in-store</span>
                                </div>
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
                                {/* A pet stays tradeable until the recipient ACCEPTS, so "tradeable" alone can't
                                    tell you an offer is already out — check the pending gift first or we'd invite
                                    a second gift that the server rejects with already_pending. */}
                                {giftPending
                                    ? <button type="button" className="btn-ghost" disabled title={`Waiting on ${giftPending.to} to accept`}>⏳ Gift pending</button>
                                    : tradeable
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
                        {/* THE BREEDER'S EYE. Only drawn for someone actually wearing the piece, and only on a
                            pet they do not own — a wish for something already in the collection can never come
                            true, and the server refuses it for the same reason. */}
                        {!owned && state?.breedersEye ? (
                            isWished
                                ? <button type="button" className="btn-ghost is-active" onClick={() => action("", "wish")} disabled={busy === p.id} style={{ width: "100%" }}>Hoping for this one · tap to clear</button>
                                : <button type="button" className="btn-ghost" onClick={() => action(p.id, "wish")} disabled={busy === p.id} style={{ width: "100%" }}>Hope for this one</button>
                        ) : null}
                    </div>

                    {giftPending ? (
                        <div className="petx-status">
                            <span className="petx-pending">⏳ You&apos;ve offered this pet to <strong>{giftPending.to}</strong> — waiting on them to accept. You can&apos;t offer another copy until they do (or decline).</span>
                        </div>
                    ) : null}

                    {owned && tradeable && !giftPending && giveOpen ? (
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

    // Which of YOUR pets could take a stone right now, and — if none can — the closest one and how far it has
    // to go. This is the answer to "what do I do with these", and it has to be specific to you or it is a
    // manual page rather than a prompt.
    const readyPets = Object.entries(state?.petLevels || {})
        .filter(([id, l]) => l?.level >= 6 && !(state?.ascension?.enshrined || []).some((e) => e.petId === id))
        .map(([id]) => ({ id, name: collectibleById(id)?.name || id }));
    const closestPet = readyPets.length ? null : Object.entries(state?.petLevels || {})
        .map(([id, l]) => ({ id, name: collectibleById(id)?.name || id, level: l?.level || 1,
            pct: Math.min(99, Math.round((((l?.level || 1) - 1) / 5) * 100 + ((l?.span ? (l.into / l.span) : 0) / 5) * 100)) }))
        .sort((a, z) => z.pct - a.pct)[0] || null;

    return (
        <div className="stack reveal">
            {!detail && (<>
            <PetStonesRow
                stones={state?.ascension?.stones}
                prices={state?.ascension?.prices}
                enshrined={state?.ascension?.enshrined || []}
                ready={readyPets}
                closest={closestPet}
                onPick={(id) => setDetail(id)}
            />
            <section className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div>
                        <h1 style={{ margin: 0 }}>🐾 Pets</h1>
                        <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.88rem" }}>
                            <strong>Every pet you own</strong> stacks a passive bonus; <strong>equip one</strong> for a much stronger active buff.
                        </p>
                    </div>
                </div>
                {state ? (
                    <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                        <style>{PET_SUMMARY_CSS}</style>
                        {/* headline: collection count + who's equipped */}
                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                            <span style={{ fontWeight: 800, fontSize: "1.05rem" }}>{ownedCount}<span className="muted" style={{ fontWeight: 600 }}> / {COLLECTIBLES.length} pets collected</span></span>
                            {featured ? (
                                <span title={petPerk(featured).desc} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 11px", borderRadius: 999, background: "rgba(255,215,94,0.12)", border: "1px solid rgba(255,215,94,0.4)", fontSize: "0.85rem", maxWidth: "100%" }}>
                                    ★ <strong>{featured.name}</strong> <span style={{ opacity: 0.9 }}>· {petPerk(featured).icon} {petPerk(featured).name}</span>
                                </span>
                            ) : <span className="muted" style={{ marginLeft: "auto" }}>No pet equipped</span>}
                        </div>
                        {/* collection progress — a little dopamine toward "gotta catch 'em all" */}
                        <div className="petsum-progress" title={`${ownedCount} of ${COLLECTIBLES.length} pets`}><span style={{ width: `${Math.round((ownedCount / Math.max(1, COLLECTIBLES.length)) * 100)}%` }} /></div>
                        {/* two self-explaining stat groups: what every pet stacks + what your earners generate */}
                        <div className="petsum-groups">
                            <MenagerieGroup
                                title="Passive bonuses" sub={`stacked from all ${ownedCount} pets you own`} accent="#ffd75e"
                                tiles={passiveEntries.map(([stat, val]) => ({ key: stat, icon: PET_STAT_META[stat]?.icon || "•", sprite: state.statSprites?.[stat], label: PET_STAT_META[stat]?.label || stat, value: `+${val}`, desc: PET_STAT_META[stat]?.desc }))}
                            />
                            <MenagerieGroup
                                title="Earning" sub="your earner pets, auto-banked" accent="#8fe39a"
                                tiles={[
                                    state.income?.xpPerHour > 0 ? { key: "xp", icon: "✨", sprite: state.statSprites?.xp, label: "XP per day", value: `+${(state.income.xpPerHour * 24).toLocaleString()}`, desc: "Passive XP, accrued around the clock and banked until you check in." } : null,
                                    state.income?.goldPerHour > 0 ? { key: "gold", icon: "🪙", sprite: state.statSprites?.gold, label: "Gold per day", value: `+${(state.income.goldPerHour * 24).toLocaleString()}`, desc: "Passive gold, accrued around the clock and banked until you check in." } : null,
                                    state.income?.raffleTickets > 0 ? { key: "tix", icon: "🎟️", sprite: state.statSprites?.tix, label: "Raffle tickets / day", value: `+${state.income.raffleTickets}`, desc: "Free weekly-boss raffle entries each day — real odds to win." } : null,
                                ].filter(Boolean)}
                            />
                        </div>
                        {state.incomeEarned && (state.incomeEarned.xp > 0 || state.incomeEarned.gold > 0) ? (
                            <div style={{ padding: "8px 12px", borderRadius: 10, background: "rgba(255,215,94,0.1)", border: "1px solid rgba(255,215,94,0.35)", color: "#ffe9a8", fontWeight: 700, fontSize: "0.88rem" }}>
                                🐾 Your pets earned you {state.incomeEarned.xp > 0 ? `+${state.incomeEarned.xp} XP` : ""}
                                {state.incomeEarned.xp > 0 && state.incomeEarned.gold > 0 ? " · " : ""}
                                {state.incomeEarned.gold > 0 ? `+${state.incomeEarned.gold} gold` : ""} since your last visit!
                            </div>
                        ) : null}
                        {/* The equipped pet is the one build-defining extra on top of the stacked passives. */}
                        <p className="muted" style={{ margin: 0, fontSize: "0.78rem", display: "flex", gap: 7, alignItems: "baseline" }}>
                            <span aria-hidden="true">⭐</span>
                            <span>Your <strong style={{ color: "#ffe9a8" }}>equipped</strong> pet fights beside you in the boss raid and adds a much bigger active buff on top of everything above.</span>
                        </p>
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
            <div className="bounty-filters petx-sort">
                <span className="petx-sort-label">Sort</span>
                <button type="button" className={`pill${sort === "rarity" ? " is-active" : ""}`} onClick={() => setSort("rarity")}>Rarity</button>
                <button type="button" className={`pill${sort === "xp" ? " is-active" : ""}`} onClick={() => setSort("xp")}>Progress</button>
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
                                {newSet.has(pet.id) ? <span className="pet-new-badge">NEW</span> : null}
                                {isFeatured ? <span className="pet-featured-badge">★ Equipped</span> : null}
                                {lvl ? <span className="pet-level-badge"><Stars level={lvl.level} /></span> : null}
                                <div className="pet-icon" data-petlvl={lvl ? lvl.level : undefined} style={{ color: pet.color }}><PetArt id={pet.id} url={leveledSprite(pet.id)?.url} flip={leveledSprite(pet.id)?.flip} /></div>
                                <div className="pet-name">{pet.name}</div>
                                <div className="pet-rarity">{pet.rarity}</div>
                                <div className="pet-buffs">
                                    <span title={`Passive (every copy you own stacks this): ${PET_STAT_META[passive.stat]?.desc || ""}`}>🐾 Owned: +{lvl ? lvl.value : passive.value} {statText(passive)}</span>
                                    <span className="pet-perk" title={`Active buff — only while equipped: ${perk.desc}`}>⭐ Equipped: {perk.icon} {perk.name}</span>
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

            {/* The receive/unlock celebration moved to <PetAlerts> in the layout, so it fires wherever the
                member happens to be when the pet lands rather than on their next visit to this page. */}

        </div>
    );
}
