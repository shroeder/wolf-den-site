"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import useScrollLock from "@/lib/useScrollLock";

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

const RARITY_ORDER = ["eternal", "primordial", "celestial", "ascendant", "mythic", "legendary", "epic", "rare", "common"];
const RARITY_TINT = {
    common: "#9aa0a6", rare: "#4aa3ff", epic: "#b061ff", legendary: "#ffb020", mythic: "#33e0a1",
    ascendant: "#ff7a3c", eternal: "#ff5cc8", celestial: "#5ad0ff", primordial: "#c9a24a",
};
const SLOT_LABEL = {
    main_hand: "Weapon", off_hand: "Off-hand", helmet: "Helmet", chest: "Chest", belt: "Belt",
    boots: "Boots", back: "Back", amulet: "Amulet", ring: "Ring",
};
const STAT = { might: "Might", ferocity: "Ferocity", fortune: "Fortune", crit_chance: "Crit chance", crit_power: "Crit power", extra_strike: "Extra strike" };
const rank = (v) => { const i = RARITY_ORDER.indexOf(v); return i < 0 ? RARITY_ORDER.length : i; };
const describe = (stats) => Object.entries(stats || {}).map(([k, v]) => `+${v} ${STAT[k] || k}`).join(" · ");

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

    const shown = useMemo(() => {
        if (!data?.items) return [];
        return data.items
            .filter((i) => (filter === "all" ? true : filter === "have" ? i.collected : !i.collected))
            .filter((i) => (slot === "all" ? true : i.slot === slot))
            .slice()
            .sort((a, b) => rank(a.rarity) - rank(b.rarity)
                || String(a.slot).localeCompare(String(b.slot))
                || a.name.localeCompare(b.name));
    }, [data, filter, slot]);

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
                    <p className="cmp-bonus">Currently earning <b>{describe(data.bonus)}</b> on everything you do.</p>
                ) : null}
            </section>

            {/* ── THE WALL ── */}
            <section className="card">
                <div className="cmp-filters">
                    {[["all", `All ${data.total}`], ["have", `Collected ${data.count}`], ["missing", `Missing ${data.total - data.count}`]].map(([k, label]) => (
                        <button type="button" key={k} className={`cmp-pill${filter === k ? " is-on" : ""}`} onClick={() => setFilter(k)}>{label}</button>
                    ))}
                </div>
                <div className="cmp-filters">
                    {slots.map((sk) => (
                        <button type="button" key={sk} className={`cmp-pill is-slot${slot === sk ? " is-on" : ""}`} onClick={() => setSlot(sk)}>
                            {sk === "all" ? "Every slot" : SLOT_LABEL[sk]}
                        </button>
                    ))}
                </div>

                {shown.length ? (
                    <div className="cmp-grid">
                        {shown.map((i) => (
                            <button type="button" key={i.id}
                                className={`cmp-tile${i.collected ? " is-have" : " is-missing"}`}
                                style={{ "--r": RARITY_TINT[i.rarity] || "#9aa0a6" }}
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
                ) : <p className="muted" style={{ margin: 0 }}>Nothing matches those filters.</p>}
            </section>

            {/* ── ONE ITEM, PROPERLY ── the sprite at size, every number on it, and how you get it. A missing
                item still shows all of it: knowing exactly what you are chasing is the point of the screen. */}
            {inspect && typeof document !== "undefined" ? createPortal((
                <div className="cmp-scrim" role="dialog" aria-modal="true" onClick={() => setInspect(null)}
                    style={{ "--r": RARITY_TINT[inspect.rarity] || "#9aa0a6" }}>
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
