"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import GroveScene from "@/components/grove/GroveScene.js";
import { GROVE_PARTS, GROVE_EMBLEMS, GROVE_FOODS, GROVE_ZONES, emblemStars } from "@/lib/marketplace/grove-catalog.js";
import { GROVE_RECIPES, recipeById, canCraft, TOOL_SLOTS, toolBonusPct } from "@/lib/marketplace/grove-recipes.js";
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

// ── THE TRAIL ────────────────────────────────────────────────────────────────────────────────────────────────
// Twelve nodes down a winding path. x is a PERCENTAGE so the route holds its shape on a phone and on a
// desktop; y is pixels, because the gap between two stops should not stretch with the window.
//
// The sine is what stops it looking like a column of buttons: it is one continuous route that leans left and
// right, so the eye reads a journey rather than a list.
const TRAIL_GAP = 104;
const TRAIL_TOP = 54;
// ⚠️ THE AMPLITUDE IS BOUNDED BY THE LABEL, NOT THE DISC. At 27 the route looked right in the
// abstract and ran a 76px disc plus a 116px name tag straight off both edges of a 390px phone. 16 keeps
// the whole pin - marker AND label - inside the narrowest screen the shop actually sees.
const trailX = (i) => 50 + Math.sin(i * 0.82 + 0.4) * 16;

// Dots between each pair of nodes. Lit as far as you have unlocked, so the path ahead reads as unwalked.
function trailDots(zones) {
    const out = [];
    for (let i = 0; i < zones.length - 1; i += 1) {
        const x0 = trailX(i), x1 = trailX(i + 1);
        const y0 = TRAIL_TOP + i * TRAIL_GAP, y1 = y0 + TRAIL_GAP;
        for (let k = 1; k <= 4; k += 1) {
            const t = k / 5;
            out.push({
                key: `${i}-${k}`,
                x: x0 + (x1 - x0) * t,
                y: y0 + (y1 - y0) * t,
                lit: zones[i + 1]?.unlocked,
            });
        }
    }
    return out;
}

const partName = (id) => GROVE_PARTS[id]?.name || id;

export default function GroveClient({ initial }) {
    const [st, setSt] = useState(initial);
    const [view, setView] = useState("map");     // map | zone | bag | bench | emblems
    const [session, setSession] = useState(null);
    const [note, setNote] = useState(null);
    const [unlockedNow, setUnlockedNow] = useState(null);
    const [bossWon, setBossWon] = useState(null);
    const router = useRouter();

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
    const settle = useCallback(async (kills, eaten) => {
        if (!kills?.length || !session) return;
        const d = await post({ action: "settle", zone: session.zone.id, kills, eaten: eaten || {} });
        if (!d?.ok) return;
        if (d.unlocked) setUnlockedNow(d.unlocked);
        if (d.newlySeen?.length) {
            // The recipe moment. Luke: "The recipe unlock should be dopamine inducing and inspectsble with a
            // call to action to craft it."
            setNote(`Found ${d.newlySeen.map(partName).join(", ")}`);
        }
        await refresh();
    }, [session, refresh]);

    // ── THE BOSS ────────────────────────────────────────────────────────────────────────────────────
    // ⚠️ ITS OWN REQUEST, NOT A LINE IN THE SETTLE BATCH. The server checks the zone was cleared and that
    // the cooldown elapsed, and neither of those can be held against a batch of two hundred claimed kills.
    // One request per boss death, at most one every thirty minutes per zone. See groveBoss.
    const bossKill = useCallback(async () => {
        if (!session) return;
        const d = await post({ action: "boss", zone: session.zone.id });
        if (!d?.ok) {
            setNote(d?.error === "on_cooldown" ? "That one is still lying where you left it."
                : d?.error === "not_cleared" ? "Clear the zone first."
                : "The kill did not land.");
            return;
        }
        setBossWon(d);
        await refresh();
    }, [session, refresh]);

    const leave = useCallback(() => { setSession(null); setView("map"); setBossWon(null); refresh(); }, [refresh]);

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

    // What the scene actually eats: the equipped food, its heal fraction, and how many are in the bag.
    // Resolved here rather than in the scene so the scene never has to know what a recipe is.
    const beltNow = useMemo(() => {
        const id = st?.belt;
        if (!id || !GROVE_FOODS[id]) return null;
        return { id, ...GROVE_FOODS[id], count: Number(st?.food?.[id]) || 0 };
    }, [st?.belt, st?.food]);

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
                    stats={stats} heroArt={session.heroArt || st?.heroArt || null}
                    petArt={session.petArt || st?.petArt || null}
                    belt={beltNow} onSettle={settle} onBoss={bossKill} onLeave={leave}
                    // Luke: "when you die it should send you back to town." ⚠️ router.push, NOT the
                    // leave handler — leaving drops you on the Grove map, which is the screen inviting you
                    // straight back into the zone that just killed you. Town is somewhere else.
                    onDeath={() => router.push("/marketplace/town")}
                />
                {bossWon ? (
                    <div className="gv-unlock gv-won" onClick={() => setBossWon(null)}>
                        <div>
                            <span>{bossWon.first ? "First kill" : `Kill ${bossWon.kills}`}</span>
                            <b>{bossWon.boss?.name}</b>
                            {bossWon.boss?.art ? <img src={bossWon.boss.art} alt="" /> : null}
                            <p className="gv-won-loot">
                                {Object.entries(bossWon.parts || {}).map(([k, n]) => `${n} ${partName(k)}`).join(" · ")}
                                {bossWon.emblem ? ` · ${GROVE_EMBLEMS[bossWon.emblem]?.name || "an emblem"}` : ""}
                            </p>
                            {/* The hyper-rare gets its own line and its own weight. It is roughly one boss in
                                forty-five at the deepest zone, so when it lands it must not be a word in a
                                list of roots. */}
                            {bossWon.hyper ? <strong className="gv-hyper">{bossWon.hyper.name}</strong> : null}
                            <button type="button" onClick={() => setBossWon(null)}>Good</button>
                        </div>
                    </div>
                ) : null}
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

            {/* ── THE MAP ──────────────────────────────────────────────────────────────────────────
                Luke: "I was thinking of a map with nodes."

                It was a grid of big 3:2 cards, which on a phone is one tall column of pictures —
                a LIST of places, not a map of them. A map has to show the ROUTE: that these twelve
                are one path, that you are somewhere along it, and that the far end is a long way off.

                ⚠️ THE TRAIL IS DOTS, NOT A LINE OR AN SVG. The nodes sit at percentage x so they stay
                on the path at any width, and a stroke drawn between two percentage points needs the
                container measured in JS (or an SVG scaled non-uniformly, which distorts the curve).
                Interpolated dots need neither: each one is placed at its own percentage and simply
                cannot distort. It also happens to look like a trail on a treasure map, which is what
                this is. */}
            {view === "map" ? (
                <div className="gv-trail" style={{ height: `${TRAIL_TOP * 2 + (st.zones.length - 1) * TRAIL_GAP}px` }}>
                    {trailDots(st.zones).map((d) => (
                        <i key={d.key} className={`gv-dot${d.lit ? " is-lit" : ""}`}
                            style={{ left: `${d.x}%`, top: `${d.y}px` }} />
                    ))}
                    {st.zones.map((z, i) => {
                        const x = trailX(i);
                        const y = TRAIL_TOP + i * TRAIL_GAP;
                        const done = z.kills >= z.toUnlock;
                        const right = x < 50;   // label goes on whichever side has room
                        return (
                            <button key={z.id} type="button"
                                className={`gv-pin${z.unlocked ? "" : " is-locked"}${done ? " is-clear" : ""}${right ? " to-right" : " to-left"}`}
                                disabled={!z.unlocked} onClick={() => enter(z)}
                                style={{ left: `${x}%`, top: `${y}px` }}
                                aria-label={`${z.name}${z.unlocked ? "" : " (locked)"}`}>
                                <span className="gv-pin-disc"
                                    style={{ backgroundImage: z.unlocked ? `url(${z.bg})` : undefined }}>
                                    <b>{z.n}</b>
                                </span>
                                <span className="gv-pin-tag">
                                    <em>{z.name}</em>
                                    {z.unlocked ? (
                                        <span className="gv-pin-meter">
                                            <i style={{ width: `${Math.min(100, (z.kills / z.toUnlock) * 100)}%` }} />
                                            <u>{Math.min(z.kills, z.toUnlock)}/{z.toUnlock}</u>
                                        </span>
                                    ) : <span className="gv-pin-lock">Locked</span>}
                                </span>
                            </button>
                        );
                    })}
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
                    {/* ── THE BELT ────────────────────────────────────────────────────────────────
                        Luke: "a way to equip food or potions that auto heal you if you get below 60
                        percent hp." One slot: choosing which is the decision. */}
                    <section>
                        <h4>The Belt <i>auto-eats below {Math.round((st.healAt || 0.6) * 100)}%</i></h4>
                        <div className="gv-slots">
                            {Object.entries(st.food || {}).filter(([, n]) => n > 0).map(([id, n]) => {
                                const f = GROVE_FOODS[id];
                                const on = st.belt === id;
                                return (
                                    <button key={id} type="button" className={`gv-slot${on ? " is-on" : ""}`}
                                        onClick={async () => { await post({ action: "belt", food: on ? null : id }); refresh(); }}>
                                        <b>{f?.name || id}</b>
                                        <span>{n}</span>
                                        <em>{on ? "on the belt" : `heals ${Math.round((f?.heals || 0) * 100)}%`}</em>
                                    </button>
                                );
                            })}
                            {!Object.values(st.food || {}).some((n) => n > 0)
                                ? <p className="muted">No food. Craft some at the workbench.</p> : null}
                        </div>
                    </section>

                    {/* ── THE TOOLS ───────────────────────────────────────────────────────────────
                        A ladder, not six items: each map raises every tool by a tier. */}
                    <section>
                        <h4>Tools</h4>
                        <div className="gv-slots">
                            {(st.toolMeta || []).map((t) => (
                                <span key={t.slot} className={`gv-slot${t.tier ? "" : " is-dim"}`}>
                                    <b>{t.name}</b>
                                    <span>{t.tier ? `Tier ${t.tier}` : "—"}</span>
                                    <em>{t.tier ? `+${t.pct}% ${t.bonus}` : t.bonus}</em>
                                </span>
                            ))}
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
