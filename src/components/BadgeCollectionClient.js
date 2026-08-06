"use client";

import { useMemo, useState } from "react";

import BadgeArt from "@/components/BadgeArt";
import { bonusChips, BONUS_META } from "@/lib/marketplace/badge-bonus-meta.js";

// The Badges collection hub — collection milestones, a "closest to unlocking" spotlight, and a filterable grid
// where every badge shows what it does + the system bonus it grants. Replaces the old never-ending flat list.

const CHEST_TONE = { wooden: "#b07a43", iron: "#c7d0d8", gold: "#ffd75e", mythic: "#33e0a1", ascendant: "#ff7a3c", eternal: "#ff5cc8" };

// Total bonus magnitude across all domains — for sorting earned badges by "buff strength".
const bonusWeight = (b) => {
    if (!b) return 0;
    let n = 0;
    for (const dom of Object.keys(BONUS_META)) for (const v of Object.values(b[dom] || {})) n += v || 0;
    return n;
};

// ── HOW MANY OTHERS HAVE THIS ────────────────────────────────────────────────────────────────────────────────
// Asked for by a member, and it is the fact that turns a wall of 210 badges into a scoreboard: without it you
// cannot tell the badge everyone gets on day one from the one three people in the Den have ever earned.
//
// The wording changes with WHO holds it, because "1 other" and "nobody else" are different pieces of news:
// holding something alone is the brag, and an unearned badge nobody has is a target rather than a failure.
const RARITY_BANDS = [
    { max: 5, label: "Almost nobody", tone: "myth" },
    { max: 15, label: "Rare", tone: "rare" },
    { max: 40, label: "Uncommon", tone: "unc" },
    { max: 101, label: "Common", tone: "com" },
];
function RarityLine({ b }) {
    if (b.holders == null) return null; // an older payload — say nothing rather than "0 have this"
    const band = RARITY_BANDS.find((r) => b.pct < r.max) || RARITY_BANDS[RARITY_BANDS.length - 1];
    const who = b.earned
        ? (b.others === 0 ? "Only you have this" : `${b.others.toLocaleString()} other${b.others === 1 ? "" : "s"} have this`)
        : (b.holders === 0 ? "Nobody has this yet" : `${b.holders.toLocaleString()} ${b.holders === 1 ? "member has" : "members have"} this`);
    // Holding something ALONE is the loudest fact a badge can carry, so that is the one that gets the gold.
    // "Nobody has this yet" is true of 134 of the 252 badges — it is a target, and if it shouted, half the
    // wall would be shouting.
    const tone = b.earned && b.others === 0 ? "solo" : b.holders === 0 ? "none" : band.tone;
    return (
        <span className={`bc-rare tone-${tone}`}>
            {who}
            {b.holders > 0 ? <em>{b.pct < 1 ? "<1" : b.pct}% of the Den</em> : null}
        </span>
    );
}

function BadgeCard({ b, featured = false }) {
    const chips = bonusChips(b.bonus);
    return (
        <div className={`bc-card${b.earned ? " is-earned" : " is-locked"}${featured ? " is-featured" : ""}`} style={b.earned && b.color ? { borderColor: `${b.color}66` } : undefined}>
            <span className="bc-art" style={{ background: b.earned ? `radial-gradient(circle at 50% 32%, ${b.color || "#3a3a3a"}44, rgba(0,0,0,0.25))` : undefined }}>
                <BadgeArt slug={b.slug} icon={b.icon || "🏅"} className="bc-art-emoji" />
            </span>
            <span className="bc-name">{b.label}</span>
            {b.description ? <span className="bc-desc">{b.description}</span> : null}
            {chips.length ? (
                <span className="bc-bonus">{chips.map((c, i) => <span key={i} className={`bc-bonus-chip dom-${c.domain}`}><span className="bc-chip-ico">{c.icon}</span>{c.text}</span>)}</span>
            ) : null}
            <RarityLine b={b} />
            {b.earned ? (
                <span className="bc-status is-earned">Earned ✓</span>
            ) : b.progress ? (
                <span className="bc-prog">
                    <span className="bc-bar"><span style={{ width: `${b.progress.pct}%` }} /></span>
                    <span className="bc-prog-txt">{b.progress.current.toLocaleString()} / {b.progress.target.toLocaleString()} · {b.progress.pct}%</span>
                </span>
            ) : b.goldPrice != null ? (
                <span className="bc-status muted">🪙 {b.goldPrice.toLocaleString()} · in shop</span>
            ) : b.dropOnly ? (
                <span className="bc-status muted">Drop only 🎁</span>
            ) : (
                <span className="bc-status muted">{b.adminOnly ? "Awarded by staff" : "Locked"}</span>
            )}
        </div>
    );
}

export default function BadgeCollectionClient({ badges = [], initialMilestones = null, earnedCount = 0, totalCount = 0 }) {
    const [milestones, setMilestones] = useState(initialMilestones);
    const [claiming, setClaiming] = useState(null);
    const [flash, setFlash] = useState(null);
    const [tab, setTab] = useState("progress");
    const [q, setQ] = useState("");

    // Closest-to-unlocking spotlight: unearned unlockables with progress, most-complete first (skip 0%).
    const closest = useMemo(
        () => badges.filter((b) => !b.earned && b.progress && b.progress.pct > 0).sort((a, z) => z.progress.pct - a.progress.pct).slice(0, 6),
        [badges]
    );

    const inProgress = useMemo(
        () => badges.filter((b) => !b.earned && b.progress).sort((a, z) => z.progress.pct - a.progress.pct),
        [badges]
    );
    const earned = useMemo(
        () => badges.filter((b) => b.earned).sort((a, z) => bonusWeight(z.bonus) - bonusWeight(a.bonus) || a.label.localeCompare(z.label)),
        [badges]
    );

    const list = tab === "earned" ? earned : tab === "all" ? badges : inProgress;
    const shown = useMemo(() => {
        const needle = q.trim().toLowerCase();
        if (!needle) return list;
        return list.filter((b) => b.label.toLowerCase().includes(needle) || (b.description || "").toLowerCase().includes(needle));
    }, [list, q]);

    const claim = async (count) => {
        setClaiming(count);
        try {
            const r = await fetch("/api/marketplace/badge-milestones", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ count }) }).then((x) => x.json()).catch(() => null);
            if (r?.ok) {
                if (r.milestones) setMilestones(r.milestones);
                const t = (initialMilestones?.tiers || milestones?.tiers || []).find((x) => x.count === count);
                setFlash({ count, gold: BADGE_GOLD[count], chest: t?.chestLabel, chestCount: t?.chestCount || 1 });
                setTimeout(() => setFlash(null), 3200);
            }
        } finally { setClaiming(null); }
    };

    const tiers = milestones?.tiers || [];
    const msEarned = milestones?.earnedCount ?? earnedCount; // the milestone board's own count (matches tier.reached)

    return (
        <div className="bc-root">
            {/* ── Collection milestones ── */}
            {tiers.length ? (
                <section className="card bc-ms-card">
                    <div className="bc-ms-head">
                        <h2 style={{ margin: 0 }}>🏆 Collection milestones</h2>
                        <span className="bc-ms-count">{msEarned} / {totalCount} badges earned</span>
                    </div>
                    <p className="muted" style={{ margin: "2px 0 12px" }}>Grow your collection to unlock big gold + chest rewards.</p>
                    <div className="bc-ms-row">
                        {tiers.map((t) => (
                            <div key={t.count} className={`bc-ms-tier${t.claimed ? " is-claimed" : t.claimable ? " is-claimable" : t.reached ? " is-reached" : ""}`} style={{ "--chest": CHEST_TONE[t.chest] || "#c7d0d8" }}>
                                <div className="bc-ms-target">{t.count}<span>badges</span></div>
                                <div className="bc-ms-reward">
                                    <span className="bc-ms-gold">🪙 {t.gold.toLocaleString()}</span>
                                    <span className="bc-ms-chest">{t.chestCount > 1 ? `${t.chestCount}× ` : ""}{t.chestLabel} chest{t.chestCount > 1 ? "s" : ""}</span>
                                </div>
                                {t.claimed ? <span className="bc-ms-state done">Claimed ✓</span>
                                    : t.claimable ? <button type="button" className="bc-ms-claim" disabled={claiming === t.count} onClick={() => claim(t.count)}>{claiming === t.count ? "…" : "Claim"}</button>
                                        : <span className="bc-ms-state">{Math.max(0, t.count - msEarned)} to go</span>}
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}

            {/* ── Closest to unlocking ── */}
            {closest.length ? (
                <section className="card">
                    <h2 style={{ marginTop: 0 }}>🔥 Closest to unlocking</h2>
                    <p className="muted" style={{ marginTop: 0 }}>You&apos;re nearly there — a nudge on each and it&apos;s yours.</p>
                    <div className="bc-grid bc-grid-feature">
                        {closest.map((b) => <BadgeCard key={b.slug} b={b} featured />)}
                    </div>
                </section>
            ) : null}

            {/* ── The full collection: filter + search ── */}
            <section className="card">
                <div className="bc-tabs-row">
                    <div className="bc-tabs">
                        <button type="button" className={tab === "progress" ? "is-on" : ""} onClick={() => setTab("progress")}>In progress <span>{inProgress.length}</span></button>
                        <button type="button" className={tab === "earned" ? "is-on" : ""} onClick={() => setTab("earned")}>Earned <span>{earned.length}</span></button>
                        <button type="button" className={tab === "all" ? "is-on" : ""} onClick={() => setTab("all")}>All <span>{badges.length}</span></button>
                    </div>
                    <input className="bc-search" type="search" placeholder="Search badges…" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                {shown.length ? (
                    <div className="bc-grid">
                        {shown.map((b) => <BadgeCard key={b.slug} b={b} />)}
                    </div>
                ) : (
                    <p className="muted" style={{ textAlign: "center", padding: "24px 0" }}>
                        {tab === "progress" ? "No badges in progress right now — every earnable one is either done or waiting on an action. Check “All” to see what to aim for." : "Nothing matches your search."}
                    </p>
                )}
            </section>

            {flash ? (
                <div className="bc-flash" role="status">
                    <div className="bc-flash-card">
                        <div className="bc-flash-emoji">🏆</div>
                        <b>Milestone claimed!</b>
                        <span>{flash.count} badges → 🪙 {flash.gold?.toLocaleString()}{flash.chest ? ` + ${flash.chestCount > 1 ? `${flash.chestCount} ${flash.chest} chests` : `a ${flash.chest} chest`}` : ""}</span>
                    </div>
                </div>
            ) : null}

            <style>{BC_CSS}</style>
        </div>
    );
}

// Static gold-per-count lookup for the claim flash (mirrors BADGE_MILESTONES on the server).
const BADGE_GOLD = { 10: 100, 25: 250, 50: 500, 100: 1000, 250: 2500, 500: 5000 };

const BC_CSS = `
.bc-root { display: flex; flex-direction: column; gap: 16px; }

/* Milestones */
.bc-ms-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.bc-ms-count { font-size: 12px; font-weight: 800; color: #ffd75e; }
.bc-ms-row { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(128px, 1fr); gap: 10px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: thin; }
.bc-ms-tier { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; padding: 12px 10px; border-radius: 13px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.03); }
.bc-ms-tier.is-reached { border-color: var(--chest); }
.bc-ms-tier.is-claimable { border-color: var(--chest); background: radial-gradient(120% 100% at 50% 0%, color-mix(in srgb, var(--chest) 22%, transparent), rgba(255,255,255,0.02)); box-shadow: 0 0 0 1px var(--chest), 0 6px 18px -6px var(--chest); animation: bcPulse 2.4s ease-in-out infinite; }
.bc-ms-tier.is-claimed { opacity: 0.7; }
@keyframes bcPulse { 0%,100% { box-shadow: 0 0 0 1px var(--chest), 0 4px 14px -8px var(--chest); } 50% { box-shadow: 0 0 0 1px var(--chest), 0 6px 22px -4px var(--chest); } }
.bc-ms-target { font-size: 1.5rem; font-weight: 900; line-height: 1; color: #fff; }
.bc-ms-target span { display: block; font-size: 9.5px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #9aa2ab; margin-top: 2px; }
.bc-ms-reward { display: flex; flex-direction: column; gap: 2px; }
.bc-ms-gold { font-size: 12.5px; font-weight: 800; color: #ffd75e; }
.bc-ms-chest { font-size: 10.5px; font-weight: 700; color: var(--chest); }
.bc-ms-state { font-size: 10.5px; font-weight: 700; color: #9aa2ab; }
.bc-ms-state.done { color: #7dbf72; }
.bc-ms-claim { padding: 6px 16px; border-radius: 9px; border: none; cursor: pointer; font-weight: 900; font-size: 12px; color: #221204; background: linear-gradient(180deg, #ffe08a, #ffb020); box-shadow: 0 2px 0 #b47a12; }
.bc-ms-claim:disabled { opacity: 0.7; cursor: default; }

/* Grids of badge cards */
.bc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; margin-top: 12px; }
.bc-grid-feature { grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); }
.bc-card { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; padding: 14px 11px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.03); }
.bc-card.is-locked { opacity: 0.82; }
.bc-card.is-featured { border-color: rgba(255,215,94,0.35); background: linear-gradient(180deg, rgba(255,215,94,0.06), rgba(255,255,255,0.02)); }
.bc-art { width: 72px; height: 72px; border-radius: 50%; display: grid; place-items: center; font-size: 2rem; background: rgba(255,255,255,0.06); }
.bc-card.is-locked .bc-art { filter: grayscale(0.85); opacity: 0.75; }
.bc-art-emoji { font-size: 2rem; line-height: 1; }
.bc-art .badge-art-img { height: 3.1em !important; width: auto !important; vertical-align: middle !important; }
.bc-name { font-weight: 800; font-size: 0.9rem; line-height: 1.15; }
.bc-desc { font-size: 0.74rem; line-height: 1.32; color: #aeb4bc; }
.bc-bonus { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; }
.bc-bonus-chip { display: inline-flex; align-items: center; gap: 3px; font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 999px; color: var(--chip, #ffd9a1); background: color-mix(in srgb, var(--chip) 15%, transparent); border: 1px solid color-mix(in srgb, var(--chip) 42%, transparent); }
.bc-chip-ico { font-size: 10px; }
.bc-bonus-chip.dom-combat { --chip: #ff9a5c; }
.bc-bonus-chip.dom-sea { --chip: #66d6ff; }
.bc-bonus-chip.dom-farm { --chip: #8fe08f; }
.bc-bonus-chip.dom-forge { --chip: #ffc24a; }
/* How many others hold it. Coloured by how rare that makes it, so the wall can be read at a glance without
   anybody doing arithmetic — the four bands are the same idea as item rarity, applied to achievement. */
.bc-rare { display: flex; flex-direction: column; align-items: center; gap: 1px; margin-top: 1px;
    font-size: 0.68rem; font-weight: 800; line-height: 1.2; }
.bc-rare em { font-style: normal; font-size: 0.62rem; font-weight: 700; color: #7f868e; }
.bc-rare.tone-myth { color: #ff8fd0; }   /* under 5% of the Den */
.bc-rare.tone-rare { color: #8fd8ff; }
.bc-rare.tone-unc  { color: #8fe39a; }
.bc-rare.tone-com  { color: #93999f; }
.bc-rare.tone-solo { color: #ffd75e; text-shadow: 0 0 14px rgba(255,215,94,0.4); } /* you are the only one */
.bc-rare.tone-none { color: #6f767e; }   /* nobody has it yet — a target, and true of half the wall */
.bc-status { font-size: 0.76rem; font-weight: 800; margin-top: 2px; }
.bc-status.is-earned { color: #7dbf72; }
.bc-status.muted { color: #9aa2ab; }
.bc-prog { display: flex; flex-direction: column; gap: 3px; width: 100%; margin-top: 2px; }
.bc-bar { height: 6px; border-radius: 999px; background: rgba(255,255,255,0.12); overflow: hidden; }
.bc-bar span { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, #d4af37, #ffd75e); }
.bc-prog-txt { font-size: 10.5px; font-weight: 700; color: #c9b989; }

/* Tabs + search */
.bc-tabs-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.bc-tabs { display: inline-flex; gap: 4px; padding: 3px; border-radius: 11px; background: rgba(255,255,255,0.05); }
.bc-tabs button { border: none; background: transparent; color: #b6bcc4; font-weight: 800; font-size: 12.5px; padding: 6px 12px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.bc-tabs button span { font-size: 10.5px; font-weight: 800; padding: 1px 6px; border-radius: 999px; background: rgba(255,255,255,0.1); }
.bc-tabs button.is-on { background: rgba(255,215,94,0.16); color: #ffe0a8; }
.bc-tabs button.is-on span { background: rgba(255,215,94,0.28); color: #ffe9c2; }
.bc-search { flex: 1; min-width: 140px; max-width: 260px; padding: 8px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.14); background: rgba(0,0,0,0.25); color: inherit; font-size: 13px; }
.bc-search::placeholder { color: #7c828b; }

/* Claim flash */
.bc-flash { position: fixed; inset: 0; z-index: 300; display: grid; place-items: center; pointer-events: none; }
.bc-flash-card { display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; padding: 22px 30px; border-radius: 18px; background: linear-gradient(180deg, #2a1c06, #140d03); border: 1px solid rgba(255,200,90,0.5); box-shadow: 0 24px 70px rgba(0,0,0,0.6), 0 0 40px rgba(255,180,60,0.35); animation: bcPop .4s cubic-bezier(.2,1.4,.35,1) both; }
.bc-flash-emoji { font-size: 44px; animation: bcSpin .6s ease both; }
.bc-flash-card b { font-size: 1.1rem; color: #ffe0a8; }
.bc-flash-card span { font-size: 13px; color: #ecd6bc; }
@keyframes bcPop { from { opacity: 0; transform: scale(.85) translateY(12px); } to { opacity: 1; transform: scale(1) translateY(0); } }
@keyframes bcSpin { from { transform: rotate(-25deg) scale(.6); } to { transform: rotate(0) scale(1); } }
`;
