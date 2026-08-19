"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import useScrollLock from "@/lib/useScrollLock";
import { RARITIES, RARITY_META, rarityRank } from "@/lib/marketplace/rarity.js";

// ── THE COMPENDIUM ───────────────────────────────────────────────────────────────────────────────────────────
// Every piece of gear in the game, and whether you have ever held it.
//
// A COLLECTION SCREEN IS A WALL OF THINGS YOU HAVE NOT GOT. That is the whole appeal and it is also the whole
// design problem: the uncollected have to be present enough to want and quiet enough not to drown the ones you
// own. So a missing item is its own silhouette — the real sprite, blacked out — rather than a grey box or an
// empty slot. You can see the shape of what you are missing, which is the thing that makes a collection pull.
//
// Everything here reads off one fetch. The sort is fixed (rarity, then slot, then name) because a compendium
// is a reference and a reference that reorders itself is a worse reference; the FILTERS are where the control
// belongs.
//
// ── THE LADDER COMES FROM rarity.js, AND USED NOT TO ─────────────────────────────────────────────────────────
// This screen carried its own copy of the rarity order and its own colour table, and both had drifted from the
// one in @/lib/marketplace/rarity.js — a file that exists, in its own words, because that map had been
// copy-pasted into a dozen places and adding two tiers above eternal silently broke every copy. This was the
// thirteenth. It ranked eternal ABOVE primordial and celestial (the real ladder puts those two on top), and it
// had mythic and eternal wearing each other's colours — so the rarest gear in the game sorted into the wrong
// place and the wall was tinted in colours that matched nothing else in the Den.
//
// Ordered COMMON FIRST now, and grouped under a heading per tier, so the wall reads as a ladder you climb
// rather than one flat run of a hundred tiles.
const SLOT_LABEL = {
    main_hand: "Weapon", off_hand: "Off-hand", helmet: "Helmet", chest: "Chest", belt: "Belt",
    boots: "Boots", back: "Back", amulet: "Amulet", ring: "Ring",
};
import { describeStats } from "@/lib/marketplace/items.js";
const tint = (r) => RARITY_META[r]?.color || "#9aa0a6";
// TWO DIFFERENT QUESTIONS on this screen: the milestone line is a bonus you have EARNED, and the sheet is
// an ITEM, whose damage and armour are the thing itself. Only the caller can tell them apart.
const describe = (stats, opts) => describeStats(stats, opts);

export default function CompendiumClient() {
    const [data, setData] = useState(null);
    const [filter, setFilter] = useState("all");
    const [slot, setSlot] = useState("all");
    const [inspect, setInspect] = useState(null);
    useScrollLock(Boolean(inspect));

    useEffect(() => {
        let alive = true;
        fetch("/api/marketplace/compendium", { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => { if (alive && d) setData(d); })
            .catch(() => { /* the page says so below */ });
        return () => { alive = false; };
    }, []);

    // Grouped by tier, common first. The count on each heading is of the WHOLE tier, not of what the filters
    // left standing — "3 of 14 Legendary" is the fact you came for, and it must not change meaning when you tap
    // "Missing".
    const groups = useMemo(() => {
        if (!data?.items) return [];
        const shown = data.items
            .filter((i) => (filter === "all" ? true : filter === "have" ? i.collected : !i.collected))
            .filter((i) => (slot === "all" ? true : i.slot === slot))
            .slice()
            .sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity)
                || String(a.slot).localeCompare(String(b.slot))
                || a.name.localeCompare(b.name));
        const whole = data.items.filter((i) => (slot === "all" ? true : i.slot === slot));
        return RARITIES
            .map((r) => {
                const items = shown.filter((i) => i.rarity === r);
                const all = whole.filter((i) => i.rarity === r);
                return { rarity: r, items, have: all.filter((i) => i.collected).length, total: all.length };
            })
            .filter((g) => g.items.length);
    }, [data, filter, slot]);

    const shownCount = groups.reduce((n, g) => n + g.items.length, 0);

    if (!data) return <section className="card"><p className="muted" style={{ margin: 0 }}>Opening the compendium…</p></section>;

    const pct = data.total ? Math.round((data.count / data.total) * 100) : 0;
    const slots = ["all", ...Object.keys(SLOT_LABEL)];

    return (
        <div className="stack cmp">
            {/* ── WHERE YOU ARE ── the count, the bar, and the next milestone, because the next milestone is the
                only reason to look at the count. */}
            <section className="card cmp-head">
                <div className="cmp-head-top">
                    <div>
                        <h1>The Compendium</h1>
                        <p className="muted">
                            Every piece of gear in the Den. Collected is forever — sell it, salvage it or trade
                            it away and it still counts.
                        </p>
                    </div>
                    <div className="cmp-score">
                        <b>{data.count}</b><span>/ {data.total}</span>
                        <em>{pct}%</em>
                    </div>
                </div>
                <div className="cmp-bar"><i style={{ width: `${pct}%` }} /></div>
                {data.next ? (
                    <p className="cmp-next">
                        <b>{data.next.toGo}</b> more to reach <b>{data.next.at}</b> — {data.next.label}
                    </p>
                ) : <p className="cmp-next">Every milestone reached. There is nothing left to find.</p>}
            </section>

            {/* ── WHAT IT HAS PAID ── permanent, passive, and owed to nothing but the count. */}
            <section className="card">
                <div className="cmp-sec-head"><b>Milestones</b><em>Permanent, and you never wear them</em></div>
                <div className="cmp-miles">
                    {data.milestones.map((m) => (
                        <div key={m.at} className={`cmp-mile${m.reached ? " is-on" : ""}`}>
                            <b>{m.at}</b>
                            <span>{m.label}</span>
                        </div>
                    ))}
                </div>
                {Object.keys(data.bonus || {}).length ? (
                    <p className="cmp-bonus">Currently earning <b>{describe(data.bonus, { bonus: true })}</b> on everything you do.</p>
                ) : null}
            </section>

            {/* ── THE WALL ── */}
            <section className="card">
                {/* Two rows of identical gold pills, unlabelled, was most of what read as jank: twelve controls
                    with no indication that they were two independent axes. They are named now, and the slot
                    row is visibly the quieter of the two. */}
                <div className="cmp-filter-row">
                    <span className="cmp-filter-lab">Show</span>
                    <div className="cmp-filters">
                        {[["all", `All ${data.total}`], ["have", `Collected ${data.count}`], ["missing", `Missing ${data.total - data.count}`]].map(([k, label]) => (
                            <button type="button" key={k} className={`cmp-pill${filter === k ? " is-on" : ""}`} onClick={() => setFilter(k)}>{label}</button>
                        ))}
                    </div>
                </div>
                <div className="cmp-filter-row">
                    <span className="cmp-filter-lab">Slot</span>
                    <div className="cmp-filters">
                        {slots.map((sk) => (
                            <button type="button" key={sk} className={`cmp-pill is-slot${slot === sk ? " is-on" : ""}`} onClick={() => setSlot(sk)}>
                                {sk === "all" ? "Every slot" : SLOT_LABEL[sk]}
                            </button>
                        ))}
                    </div>
                </div>

                {shownCount ? groups.map((g) => (
                    <div key={g.rarity} className="cmp-tier" style={{ "--r": tint(g.rarity) }}>
                        {/* The tier's own progress, on the tier. A single bar over a hundred items cannot tell
                            you that you have every Common and no Mythic, which is the actual state of play. */}
                        <div className="cmp-tier-head">
                            <b>{RARITY_META[g.rarity]?.label || g.rarity}</b>
                            <span className="cmp-tier-count">{g.have}<i>/{g.total}</i></span>
                            <span className="cmp-tier-bar"><i style={{ width: `${g.total ? (g.have / g.total) * 100 : 0}%` }} /></span>
                        </div>
                        <div className="cmp-grid">
                            {g.items.map((i) => (
                                <button type="button" key={i.id}
                                    className={`cmp-tile${i.collected ? " is-have" : " is-missing"}`}
                                    style={{ "--r": tint(i.rarity) }}
                                    onClick={() => setInspect(i)}
                                    title={i.collected ? i.name : "Not yet collected"}>
                                    <span className="cmp-tile-art">
                                        {i.art ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={i.art} alt="" draggable="false" />
                                        ) : <span className="cmp-tile-none" aria-hidden="true" />}
                                    </span>
                                    <span className="cmp-tile-name">{i.collected ? i.name : "???"}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )) : <p className="muted" style={{ margin: 0 }}>Nothing matches those filters.</p>}
            </section>

            {/* ── ONE ITEM, PROPERLY ── the sprite at size, every number on it, and how you get it. A missing
                item still shows all of it: knowing exactly what you are chasing is the point of the screen. */}
            {inspect && typeof document !== "undefined" ? createPortal((
                <div className="cmp-scrim" role="dialog" aria-modal="true" onClick={() => setInspect(null)}
                    style={{ "--r": tint(inspect.rarity) }}>
                    <div className="cmp-sheet" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="cmp-x" onClick={() => setInspect(null)} aria-label="Close">✕</button>
                        <div className={`cmp-sheet-art${inspect.collected ? "" : " is-missing"}`}>
                            {inspect.art ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={inspect.art} alt="" draggable="false" />
                            ) : <span className="cmp-tile-none" aria-hidden="true" />}
                        </div>
                        <b className="cmp-sheet-name">{inspect.name}</b>
                        <div className="cmp-sheet-meta">
                            <span className="cmp-rar">{inspect.rarity}</span>
                            {inspect.slot ? <span>{SLOT_LABEL[inspect.slot] || inspect.slot}</span> : null}
                            {inspect.reqLevel ? <span>Level {inspect.reqLevel}</span> : null}
                        </div>
                        {inspect.stats ? <p className="cmp-sheet-stats">{describe(inspect.stats)}</p> : null}
                        {inspect.signature ? <p className="cmp-sheet-sig">★ {inspect.signature.desc || inspect.signature}</p> : null}
                        {inspect.flavor ? <p className="cmp-sheet-flavor">“{inspect.flavor}”</p> : null}
                        <p className={`cmp-sheet-state${inspect.collected ? " is-have" : ""}`}>
                            {inspect.collected ? "✓ In your compendium" : "Not yet collected"}
                        </p>
                    </div>
                </div>
            ), document.body) : null}
        </div>
    );
}
