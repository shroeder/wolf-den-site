"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import GroveScene from "@/components/grove/GroveScene.js";
import { GROVE_PARTS, GROVE_EMBLEMS, GROVE_FOODS, GROVE_ZONES, emblemStars } from "@/lib/marketplace/grove-catalog.js";
import { GROVE_RECIPES, recipeById, canCraft, TOOL_SLOTS, toolBonusPct } from "@/lib/marketplace/grove-recipes.js";
import { GROVE_CSS } from "@/components/grove/grove-css.js";
import { celebrateUnlock } from "@/components/grove/grove-sfx.js";

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
    const [bossWon, setBossWon] = useState(null);
    const router = useRouter();
    const stripRef = useRef(null);

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

    // ⚠️ OPENS WHERE YOU LEFT OFF, NOT AT ZONE ONE. Twelve panels is wider than any phone, so a
    // strip that always starts at the left shows a veteran the one place they finished weeks ago and
    // nothing they are actually doing. Instant rather than smooth: this is where the map IS, not a
    // journey the player should have to sit through every time they open it.
    useEffect(() => {
        const el = stripRef.current;
        if (view !== "map" || !el) return;
        const far = el.querySelector(`[data-n="${st?.unlockedN || 1}"]`);
        if (far) el.scrollLeft = Math.max(0, far.offsetLeft - 24);
    }, [view, st?.unlockedN]);

    // ── ⚠️ THE UNLOCK POP ─────────────────────────────────────────────────────────────────
    // Luke: "a dopamine pop middle of the screen for a duration letting you know you unlocked the next
    // area with vibration and a satisfying noise."
    //
    // Sound and buzz fire from HERE rather than from the settle handler, so they are tied to the panel
    // actually being on screen. Five seconds, then it clears itself — long enough to land, short
    // enough that nobody taps through it out of impatience. Tapping still dismisses it early.
    useEffect(() => {
        if (!unlockedNow) return undefined;
        celebrateUnlock();
        const t = setTimeout(() => setUnlockedNow(null), 5000);
        return () => clearTimeout(t);
    }, [unlockedNow]);

    useEffect(() => {
        if (!note) return undefined;
        const t = setTimeout(() => setNote(null), 3200);
        return () => clearTimeout(t);
    }, [note]);

    // ⚠️ RENDERED IN EVERY VIEW, NOT JUST INSIDE THE ZONE. The unlock usually arrives on the settle
    // that fires when you LEAVE a zone - which is the exact moment the zone view unmounts. Declared here and
    // dropped into both returns so the celebration cannot be destroyed by the thing that triggered it.
    const popNode = unlockedNow ? (
        <div className="gv-pop" onClick={() => setUnlockedNow(null)}>
            <div className="gv-pop-card">
                <span className="gv-pop-rays" aria-hidden="true" />
                <span className="gv-pop-kicker">New area unlocked</span>
                <b className="gv-pop-name">{unlockedNow.name}</b>
                <span className="gv-pop-art" style={{ backgroundImage: `url(${unlockedNow.bg})` }} />
                <span className="gv-pop-go">Tap to continue</span>
            </div>
        </div>
    ) : null;

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
                {popNode}
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

            {popNode}
            {note ? <p className="gv-note">{note}</p> : null}

            {/* ── THE MAP ──────────────────────────────────────────────────────────────────────
                Luke: "not enough identity, its supposed to have unique areas resembling the node, and
                the map should be colorful, the nodes are small. The maps are horizontal."

                ⚠️ THE TWELVE PAINTINGS ALREADY ARE THE IDENTITY. The parchment region map was one
                drawing standing in for twelve places, which is why none of them looked like anywhere in
                particular — and it was sepia, so the one colourful thing about each zone was thrown
                away. Every zone already has its own full-colour backdrop, the same art you walk into. The
                map is those twelve, laid left to right, which is also the direction you actually travel.

                Scrolls horizontally and starts you at the furthest place you have reached, so the journey
                reads as a journey rather than a wall of thumbnails. */}
            {view === "map" ? (
                <div className="gv-strip" ref={stripRef}>
                    {st.zones.map((z) => {
                        const done = z.kills >= z.toUnlock;
                        const pct = Math.min(100, (z.kills / Math.max(1, z.toUnlock)) * 100);
                        return (
                            <button key={z.id} type="button"
                                data-n={z.n}
                                className={`gv-area${z.unlocked ? "" : " is-locked"}${done ? " is-clear" : ""}`}
                                disabled={!z.unlocked} onClick={() => enter(z)}
                                style={{ backgroundImage: `url(${z.bg})` }}
                                aria-label={`${z.name}${z.unlocked ? "" : " (locked)"}`}>
                                <span className="gv-area-n">{z.n}</span>
                                <span className="gv-area-foot">
                                    <em>{z.name}</em>
                                    {z.unlocked ? (
                                        <span className="gv-area-meter">
                                            <i style={{ width: `${pct}%` }} />
                                            <u>{done ? "Cleared" : `${z.kills}/${z.toUnlock}`}</u>
                                        </span>
                                    ) : <span className="gv-area-lock">Locked</span>}
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
