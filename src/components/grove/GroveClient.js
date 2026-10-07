"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import GroveScene from "@/components/grove/GroveScene.js";
import { GROVE_PARTS, GROVE_EMBLEMS, GROVE_ZONES, emblemStars } from "@/lib/marketplace/grove-catalog.js";
import { GROVE_RECIPES, recipeById, canCraft } from "@/lib/marketplace/grove-recipes.js";
import { GROVE_CSS } from "@/components/grove/grove-css.js";

// ── THE GROVE ────────────────────────────────────────────────────────────────────────────────────────────────
// Map, zone, bag, bank, workbench and emblems. The scene itself is GroveScene; this is everything around it.
//
// ⚠️ ONE FETCH ON MOUNT AND ONE PER ACTION. No polling. This screen has no other players on it and nothing
// changes behind your back, so a timer here would be pure Active CPU for nothing — the exact shape
// check:polls exists to catch.

const post = (body) => fetch("/api/marketplace/grove", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}).then((r) => r.json()).catch(() => ({ ok: false }));

const partName = (id) => GROVE_PARTS[id]?.name || id;

export default function GroveClient({ initial }) {
    const [st, setSt] = useState(initial);
    const [view, setView] = useState("map");     // map | zone | bag | bench | emblems
    const [session, setSession] = useState(null);
    const [note, setNote] = useState(null);
    const [unlockedNow, setUnlockedNow] = useState(null);

    const refresh = useCallback(async () => {
        const d = await fetch("/api/marketplace/grove").then((r) => r.json()).catch(() => null);
        if (d?.ok) setSt(d);
    }, []);

    // ── ENTER A ZONE ────────────────────────────────────────────────────────────────────────────────
    const enter = useCallback(async (zone) => {
        const d = await post({ action: "enter", zone: zone.id });
        if (!d?.ok) { setNote(d?.error === "locked" ? "That one is still closed." : "Couldn't go in."); return; }
        setSession({ zone: d.zone, seed: d.seed, bonuses: d.bonuses });
        setView("zone");
    }, []);

    // ── SETTLE ──────────────────────────────────────────────────────────────────────────────────────
    // ⚠️ THE ONLY THING SENT IS WHAT WAS KILLED. The scene already rolled the loot locally to show it; the
    // server re-rolls from the same seed and grants what IT computes. See grove-roll.js.
    const settle = useCallback(async (kills) => {
        if (!kills?.length || !session) return;
        const d = await post({ action: "settle", zone: session.zone.id, kills });
        if (!d?.ok) return;
        if (d.unlocked) setUnlockedNow(d.unlocked);
        if (d.newlySeen?.length) {
            // The recipe moment. Luke: "The recipe unlock should be dopamine inducing and inspectsble with a
            // call to action to craft it."
            setNote(`Found ${d.newlySeen.map(partName).join(", ")}`);
        }
        await refresh();
    }, [session, refresh]);

    const leave = useCallback(() => { setSession(null); setView("map"); refresh(); }, [refresh]);

    // Your stats for the scene. Account stats + equipped emblems, which is what Luke described driving
    // damage, attack speed and health.
    const stats = useMemo(() => {
        const e = { power: 12, maxHp: 120, armour: 8, critRate: 5, critDamage: 50, lifeSteal: 0, attackSpeed: 0, moveSpeed: 0 };
        for (const em of st?.emblems || []) {
            if (em.slot === null || em.slot === undefined || !em.stars) continue;
            const meta = GROVE_EMBLEMS[em.id];
            if (!meta) continue;
            const v = meta.per * em.stars;
            if (meta.stat === "might") e.power += v;
            else if (meta.stat === "vitality") e.maxHp += v * 4;
            else if (meta.stat === "armour") e.armour += v;
            else if (meta.stat === "crit_rate") e.critRate += v;
            else if (meta.stat === "crit_damage") e.critDamage += v;
            else if (meta.stat === "life_steal") e.lifeSteal += v;
            else if (meta.stat === "attack_speed") e.attackSpeed += v;
            else if (meta.stat === "move_speed") e.moveSpeed += v;
        }
        return e;
    }, [st?.emblems]);

    useEffect(() => {
        if (!note) return undefined;
        const t = setTimeout(() => setNote(null), 3200);
        return () => clearTimeout(t);
    }, [note]);

    if (!st?.ok) {
        return <div className="gv"><p className="muted">The Grove is closed.</p><style>{GROVE_CSS}</style></div>;
    }

    // ── THE ZONE ────────────────────────────────────────────────────────────────────────────────────
    if (view === "zone" && session) {
        return (
            <div className="gv">
                <GroveScene
                    zone={session.zone} seed={session.seed} bonuses={session.bonuses}
                    stats={stats} pet={null} onSettle={settle} onLeave={leave}
                />
                {unlockedNow ? (
                    <div className="gv-unlock" onClick={() => setUnlockedNow(null)}>
                        <div>
                            <span>Area unlocked</span>
                            <b>{unlockedNow.name}</b>
                            <button type="button" onClick={() => setUnlockedNow(null)}>Good</button>
                        </div>
                    </div>
                ) : null}
                <style>{GROVE_CSS}</style>
            </div>
        );
    }

    const bagRows = Object.entries(st.pack || {});
    const bankRows = Object.entries(st.bank || {});
    const known = new Set(st.recipes || []);

    return (
        <div className="gv">
            <header className="gv-head">
                <b>The Grove</b>
                <nav>
                    {[["map", "Map"], ["bag", "Bag"], ["bench", "Workbench"], ["emblems", "Emblems"]].map(([k, label]) => (
                        <button key={k} type="button" className={view === k ? "is-on" : ""} onClick={() => setView(k)}>{label}</button>
                    ))}
                </nav>
            </header>

            {note ? <p className="gv-note">{note}</p> : null}

            {/* ── THE MAP ──────────────────────────────────────────────────────────────────────── */}
            {view === "map" ? (
                <div className="gv-map">
                    {st.zones.map((z) => (
                        <button key={z.id} type="button"
                            className={`gv-node${z.unlocked ? "" : " is-locked"}${z.kills >= z.toUnlock ? " is-clear" : ""}`}
                            disabled={!z.unlocked} onClick={() => enter(z)}
                            style={{ backgroundImage: z.unlocked ? `url(${z.bg})` : undefined }}>
                            <span className="gv-node-n">{z.n}</span>
                            <span className="gv-node-name">{z.name}</span>
                            {z.unlocked ? (
                                <span className="gv-node-bar">
                                    <i style={{ width: `${Math.min(100, (z.kills / z.toUnlock) * 100)}%` }} />
                                    <em>{Math.min(z.kills, z.toUnlock)}/{z.toUnlock}</em>
                                </span>
                            ) : <span className="gv-node-lock">Locked</span>}
                        </button>
                    ))}
                </div>
            ) : null}

            {/* ── BAG AND BANK ─────────────────────────────────────────────────────────────────── */}
            {view === "bag" ? (
                <div className="gv-bag">
                    <section>
                        <h4>Backpack <i>{bagRows.length}/{st.packSlots}</i></h4>
                        <div className="gv-slots">
                            {bagRows.map(([p, n]) => (
                                <button key={p} type="button" className="gv-slot"
                                    onClick={async () => { await post({ action: "move", partId: p, from: "pack", to: "bank", qty: n }); refresh(); }}>
                                    <b>{partName(p)}</b><span>{n}</span><em>to bank →</em>
                                </button>
                            ))}
                            {!bagRows.length ? <p className="muted">Empty. Go and kill something.</p> : null}
                        </div>
                    </section>
                    <section>
                        <h4>Bank <i>{bankRows.length}/{st.bankSlots}</i></h4>
                        <div className="gv-slots">
                            {bankRows.map(([p, n]) => (
                                <button key={p} type="button" className="gv-slot"
                                    onClick={async () => { await post({ action: "move", partId: p, from: "bank", to: "pack", qty: n }); refresh(); }}>
                                    <b>{partName(p)}</b><span>{n}</span><em>← to bag</em>
                                </button>
                            ))}
                            {!bankRows.length ? <p className="muted">Nothing stored.</p> : null}
                        </div>
                    </section>
                    {/* The stone tablet, which is a record of what the Grove has shown you. */}
                    <section className="gv-tablet">
                        <h4>The Tablet</h4>
                        <p><b>{st.tablet.seen}</b> of <b>{st.tablet.total}</b> parts discovered</p>
                        <ul>{st.tablet.bonuses.map((b) => <li key={b.at}>{b.label} — +{b.value}{b.kind === "pct" ? "%" : ""} {b.stat.replace(/_/g, " ")}</li>)}</ul>
                    </section>
                </div>
            ) : null}

            {/* ── THE WORKBENCH ────────────────────────────────────────────────────────────────── */}
            {view === "bench" ? (
                <div className="gv-bench">
                    <p className="muted">A recipe appears once you have found every part it needs — even if you dropped them.</p>
                    {GROVE_RECIPES.filter((r) => known.has(r.id)).map((r) => {
                        const ready = canCraft(r, st.pack);
                        const built = (st.packsBuilt || []).includes(r.id) || (st.banksBuilt || []).includes(r.id);
                        return (
                            <div key={r.id} className={`gv-recipe${ready && !built ? " is-ready" : ""}`}>
                                <div>
                                    <b>{r.name}</b>
                                    {r.blurb ? <p>{r.blurb}</p> : null}
                                    <ul>
                                        {Object.entries(r.parts).map(([p, n]) => (
                                            <li key={p} className={(st.pack?.[p] || 0) >= n ? "is-have" : ""}>
                                                {partName(p)} <span>{st.pack?.[p] || 0}/{n}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <button type="button" disabled={!ready || built}
                                    onClick={async () => {
                                        const d = await post({ action: "craft", recipe: r.id });
                                        setNote(d?.ok ? `Made ${d.name}` : "Couldn't make that.");
                                        refresh();
                                    }}>
                                    {built ? "Built" : ready ? "Craft" : "Not yet"}
                                </button>
                            </div>
                        );
                    })}
                    {!known.size ? <p className="muted">Nothing discovered yet.</p> : null}
                </div>
            ) : null}

            {/* ── EMBLEMS ──────────────────────────────────────────────────────────────────────── */}
            {view === "emblems" ? (
                <div className="gv-emblems">
                    <p className="muted">Three may be worn. Three more are sealed.</p>
                    <div className="gv-eslots">
                        {[0, 1, 2].map((s) => {
                            const on = (st.emblems || []).find((e) => e.slot === s);
                            return (
                                <div key={s} className="gv-eslot">
                                    {on ? (
                                        <button type="button" onClick={async () => { await post({ action: "emblem", emblemId: on.id, slot: null }); refresh(); }}>
                                            <b style={{ color: on.rung?.color }}>{"★".repeat(on.stars)}</b>
                                            <span>{GROVE_EMBLEMS[on.id]?.name}</span>
                                            <em>take off</em>
                                        </button>
                                    ) : <span className="gv-eempty">empty</span>}
                                </div>
                            );
                        })}
                        {[3, 4, 5].map((s) => <div key={s} className="gv-eslot is-sealed"><span>sealed</span></div>)}
                    </div>
                    <div className="gv-elist">
                        {(st.emblems || []).filter((e) => e.count > 0).map((e) => {
                            const meta = GROVE_EMBLEMS[e.id];
                            const next = e.next;
                            return (
                                <div key={e.id} className="gv-em">
                                    <b style={{ color: e.rung?.color || "#8d8577" }}>{e.stars ? "★".repeat(e.stars) : "—"}</b>
                                    <div>
                                        <b>{meta?.name || e.id}</b>
                                        <p>+{(meta?.per || 0) * (e.stars || 0)}{meta?.kind === "pct" ? "%" : ""} {String(meta?.stat || "").replace(/_/g, " ")}
                                            {meta?.global ? <em> · everywhere</em> : null}</p>
                                        <small>{e.count} collected{next ? ` · ${next.at - e.count} to ${next.label}` : " · maxed"}</small>
                                    </div>
                                    <button type="button" disabled={e.slot !== null && e.slot !== undefined}
                                        onClick={async () => {
                                            const free = [0, 1, 2].find((s) => !(st.emblems || []).some((x) => x.slot === s));
                                            await post({ action: "emblem", emblemId: e.id, slot: free ?? 0 });
                                            refresh();
                                        }}>
                                        {e.slot !== null && e.slot !== undefined ? "Worn" : "Wear"}
                                    </button>
                                </div>
                            );
                        })}
                        {!(st.emblems || []).some((e) => e.count > 0) ? <p className="muted">No emblems yet. They fall rarely.</p> : null}
                    </div>
                </div>
            ) : null}

            <style>{GROVE_CSS}</style>
        </div>
    );
}
