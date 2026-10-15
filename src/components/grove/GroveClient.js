"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import GroveScene from "@/components/grove/GroveScene.js";
import { GROVE_PARTS, GROVE_EMBLEMS, GROVE_FOODS, GROVE_ZONES, emblemStars, groveArt } from "@/lib/marketplace/grove-catalog.js";
import GroveBench from "@/components/grove/GroveBench";
import { GROVE_RECIPES, recipeById, canCraft, TOOL_SLOTS, toolBonusPct } from "@/lib/marketplace/grove-recipes.js";
import { GROVE_CSS } from "@/components/grove/grove-css.js";
import { MAP_LAYOUT, mapSpot, nodeArt, trailPath } from "@/lib/marketplace/grove-map.js";
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

// ── ⚠️ THE MAIN SCREEN IS THE MAP, AND EVERYTHING ELSE FLOATS ────────────────────────────────────────────────
// Luke: "The main screen for the grove. It should only have a map. The backpack and other stuff should be
// sprite buttons floating on top of content at the bottom right of the screen, and the entire grove feature
// is full screen."
//
// The tab row this replaces was four words in a scrolling strip above the map, which cost a line of a phone
// to say what four objects say without one. Bottom-right because that is where a right thumb already is, and
// because the zone's own full-screen lock already clears that corner of the site's chat bubbles — see
// gv-full-lock in grove-css.js, which exists because a thumb reaching into that corner was opening a chat
// panel instead of hitting things.
const DOCK = [
    { k: "map", label: "Map", art: "/images/grove/ui-map.webp" },
    { k: "bag", label: "Backpack", art: "/images/grove/ui-bag.webp" },
    { k: "bench", label: "Workbench", art: "/images/grove/ui-bench.webp" },
    { k: "emblems", label: "Emblems", art: "/images/grove/ui-emblems.webp" },
];

// ── ⚠️ THE PARTS HAVE PICTURES AND THESE LISTS WERE NOT USING THEM ───────────────────────────────────────────
// Thirty-three painted items shipped for the floor of the zone, where a drop is on screen for a couple of
// seconds. The bag, the bank and the workbench — where a player spends far longer, deciding what to keep and
// what a recipe still needs — were rows of names. Reading "Gnawed Root, Damp Moss, Grub Fat" is work; seeing
// three objects is not, and it is the same art either way.
//
// Sized by role rather than one shared number: a slot is something you pick out of a grid at arm's length, a
// recipe cost is read inside a sentence. fail-silent on purpose — a part added later with no sprite yet gets
// its name and nothing else, which is a smaller fault than a broken-image glyph.
const PartIcon = ({ id, size = 34 }) => {
    const art = groveArt(id);
    if (!art) return null;
    return <img className="gv-ico" src={art} alt="" width={size} height={size} />;
};

export default function GroveClient({ initial }) {
    const [st, setSt] = useState(initial);
    const [view, setView] = useState("map");     // map | zone | bag | bench | emblems
    // ⚠️ THE SAME BODY CLASS THE ZONE ALREADY USES, not a second mechanism. It stops the page behind
    // scrolling and hides the site's own fixed chat bubbles, which sit in exactly the corner the dock now
    // occupies. Added for the WHOLE feature rather than only the zone, because the whole feature is full
    // screen now — and removed on unmount, or leaving the Grove leaves the site with no chat.
    useEffect(() => {
        document.body.classList.add("gv-full-lock");
        return () => document.body.classList.remove("gv-full-lock");
    }, []);
    const [session, setSession] = useState(null);
    const [note, setNote] = useState(null);
    const [unlockedNow, setUnlockedNow] = useState(null);
    const [bossWon, setBossWon] = useState(null);
    // Which panel is open OVER the zone, or null for none. Separate from `view`, which stays "zone" the
    // whole time you are in one — see the hoist note above the panels.
    const [zonePanel, setZonePanel] = useState(null);
    // ⚠️ THE SHEET IS PORTALLED, AND A z-index WAS NOT ENOUGH. GroveScene portals its full-screen layer to
    // document.body; the sheet was rendered inside the page tree, where ANY ancestor with a transform,
    // a filter or an opacity makes a stacking context and turns its z-index into a local number. It then
    // paints under the zone however high you set it — the panel was there, the zone was paused, and the
    // close button could not be pressed, so the only way out was a reload. elementFromPoint over that
    // button is what said so; the z-index looked right in the stylesheet the whole time.
    //
    // Portalled to body it is a sibling of the scene, which is the only place the 70-vs-80 comparison the
    // stylesheet is written around actually holds.
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    // ── ⚠️ AND IN NATIVE FULL SCREEN, document.body IS THE WRONG PARENT ─────────────────────────
    // Luke: "when I click the buttons on the bottom when I'm running around in the grove, it doesn't
    // open up the interface as I'd expect it to. Even if you're full screen, it should pop up the
    // interface that you can craft and look at your backpack and look at the map."
    //
    // The note above is right that the sheet has to escape the page tree -- but it escaped one level
    // too far. GroveScene calls requestFullscreen on its own host, and a browser in native full screen
    // paints ONLY that element's subtree. The sheet, portalled to body, is its SIBLING: present in the
    // DOM, correct in the stylesheet, and never drawn. Nothing errors and nothing is logged; the button
    // simply does nothing, which is exactly what was reported.
    //
    // So the portal follows the full-screen element when there is one and falls back to body when there
    // is not. Tracked as state rather than read at render time because entering full screen does not
    // re-render this component on its own -- the value would be read once, while still null, and stay
    // wrong for the whole session.
    const [fsHost, setFsHost] = useState(null);
    useEffect(() => {
        const onChange = () => setFsHost(document.fullscreenElement || null);
        onChange();
        document.addEventListener("fullscreenchange", onChange);
        return () => document.removeEventListener("fullscreenchange", onChange);
    }, []);
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
        // ⚠️ AND THE SHEET COMES DOWN WITH IT. The map is one of the panels openable from inside a zone,
        // so tapping a place on it is now a way to travel WITHOUT leaving — and leaving the panel up over
        // the zone you just walked into means arriving somewhere new behind a backpack.
        setZonePanel(null);
        setView("zone");
    }, []);

    // ── THE DOORS ───────────────────────────────────────────────────────────────────────────────────
    // ⚠️ RESOLVED FROM THE CATALOGUE, NOT FROM st. A door is walked through immediately after a settle that
    // may have just unlocked the destination, and st is a snapshot taken before it. Reading the zone id from
    // the static list keeps this correct regardless of how stale the state is, and the server is the thing
    // that decides whether the door opens — enter() already reports "locked".
    const travel = useCallback(async (n) => {
        const z = GROVE_ZONES.find((x) => x.n === n);
        if (z) await enter(z);
    }, [enter]);

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

    // ── WHAT YOU BUILT, AND IT IS BUILT ON THE SERVER ───────────────────────────────────────────────
    // Luke: "Every stat should be important that you have on your gear, as well as all the passives that
    // you get, just like the arena... I do care about honoring all the players' commitments to their gear
    // and their passives and their pets and everything."
    //
    // ⚠️ THIS USED TO BE A HARDCODED `{ power: 12 }` PLUS EMBLEMS, and that one literal was the whole of
    // the hero. A level-30 member in best-in-slot, with a full badge set, an ascended pet and a maxed class
    // tree hit for exactly the same 12 as an account made this morning — forge, sets, jewels, compendium,
    // pets, badges and the casino tracks all worth precisely nothing in this zone.
    //
    // It is `st.hero` now: grove-kit.js builds it through the Arena's own combatStats + fighterFrom, with
    // the Grove's emblems folded into the SAME stat pool so an emblem's Might rides the same curve a
    // sword's does. Nothing is summed here any more — a second copy of the arithmetic is how the two would
    // drift. See grove-kit.js.
    const stats = useMemo(() => {
        const h = st?.hero;
        // The neutral fighter, for a state that has not loaded yet. Deliberately NOT the old 12/120/8:
        // a placeholder that looks like a real build is one somebody tunes against.
        if (!h) return null;
        return {
            damage: h.damage, dmgPct: h.dmgPct,
            critChance: h.critChance, critMult: h.critMult,
            // Tempo is a RATE, and the scene turns it into a swing interval. See the cadence note there.
            tempo: h.tempo, haste: h.haste,
            lifesteal: h.lifesteal, stun: h.stun,
            bleedChance: h.bleedChance, bleedDamage: h.bleedDamage, bleedLeech: h.bleedLeech,
            armour: h.armor, maxHp: h.health, moveSpeed: h.moveSpeed || 0,
        };
    }, [st?.hero]);

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
        // ⚠️ CENTRED, NOT PINNED 24px FROM THE LEFT EDGE. That was right for a strip of cards whose
        // left edge was its start; a place on a chart has a trail arriving at it from behind, and shoving
        // it against the left wall throws away the half of the journey you have already walked. Centring
        // shows where you came from as well as where you are.
        if (far) el.scrollLeft = Math.max(0, far.offsetLeft + far.offsetWidth / 2 - el.clientWidth / 2);
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
    // ── ⚠️ THE PANELS ARE BUILT BEFORE THE ZONE RETURNS, BECAUSE BOTH SCREENS NEED THEM ─────────
    // Luke: "The buttons to access crafting and backpack and map should be available when in a node
    // on the Grove."
    //
    // They used to live inside the hub return, below an early return for the zone, so there was no way
    // to put the backpack on screen without leaving the zone — and LEAVING IS NOT A FREE ACTION. The
    // scene would unmount and remount on the same seed, which rebuilds the world: full health, full
    // population, every creature you had already killed back on its feet. Opening your bag at 12 hit
    // points would have been a heal, which is the kind of exploit that arrives dressed as a convenience.
    //
    // So the panels are computed here, once, and rendered either as the hub body or as a sheet over a
    // PAUSED zone. `panel` is what decides which one shows: the dock view on the hub, and the zone's own
    // separate selection while in a node, because `view` is "zone" the whole time you are in one.
    const bagRows = Object.entries(st.pack || {});
    const bankRows = Object.entries(st.bank || {});
    const known = new Set(st.recipes || []);
    // ⚠️ THE TRAIL STOPS WHERE YOU DID. Drawing the whole route in confident ink would tell a new player
    // the shape of a map they have not earned; drawing none of it loses the one thing the chart is for.
    // Faint for the whole journey, inked as far as you have actually walked.
    const walkedSpots = MAP_LAYOUT.filter((m) => (st.zones || []).some((z) => z.id === m.id && z.unlocked));


    const panel = view === "zone" ? zonePanel : view;
    const sheetNode = (
                <div className="gv-sheet">

                {/* ── THE MAP ──────────────────────────────────────────────────────────────────────
                    Luke: "The map should be nodes on a paper map. The paper map should have color, as if a
                    skilled scribe actually drew the map, with families point of interest nodes on it ... If a
                    forest then leads to a cave or something, it should look like the trail leads from one
                    thing to another on the map. A forest should look like a grouping of trees on the map. A
                    cave should look like a cave."

                    ⚠️ THIS IS THE THIRD MAP AND THE FIRST TWO ARE WHY IT IS SHAPED LIKE THIS. The first was
                    one sepia parchment illustration standing in for twelve places, so none of them looked
                    like anywhere in particular. The second threw the paper away entirely and laid the twelve
                    zone BACKDROPS out as cards — which gave every place an identity and lost the thing a map
                    is for: where they are in relation to each other, and what leads to what. A chart with a
                    drawn symbol per place and a trail between them is both at once.

                    ⚠️ THE PLATE IS TERRAIN ONLY. The route and the twelve places are drawn here, over it, at
                    coordinates grove-map.js owns — a path painted into the art could never line up with nodes
                    positioned by code, and generated lettering is gibberish on inspection. */}
                {panel === "map" ? (
                    <div className="gv-paper" ref={stripRef}>
                        <div className="gv-paper-in">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="gv-paper-plate" src="/images/grove/map-plate.webp" alt="" />

                            {/* The trail, under the places so it runs behind them rather than across them.
                                Two passes: the whole route faint, then the part you have actually opened
                                drawn over it in confident ink. preserveAspectRatio none because the viewBox is
                                in percent and has to stretch with the paper. */}
                            <svg className="gv-paper-trail" viewBox="0 0 100 100"
                                preserveAspectRatio="none" aria-hidden="true">
                                <path className="is-ghost" d={trailPath()} />
                                <path className="is-walked" d={trailPath(walkedSpots)} />
                            </svg>

                            {st.zones.map((z) => {
                                const spot = mapSpot(z.id);
                                if (!spot) return null;
                                const done = z.kills >= z.toUnlock;
                                return (
                                    <button key={z.id} type="button" data-n={z.n}
                                        className={`gv-node${z.unlocked ? "" : " is-locked"}${done ? " is-clear" : ""}`}
                                        style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
                                        disabled={!z.unlocked} onClick={() => enter(z)}
                                        aria-label={`${z.name}${z.unlocked ? "" : " (locked)"}`}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={nodeArt(z.id)} alt="" />
                                        <span className="gv-node-label">
                                            <em>{z.name}</em>
                                            {z.unlocked
                                                ? <u>{done ? "Cleared" : `${z.kills}/${z.toUnlock}`}</u>
                                                : <u>Locked</u>}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ) : null}

                {/* ── BAG AND BANK ─────────────────────────────────────────────────────────────────── */}
                {panel === "bag" ? (
                    <div className="gv-bag">
                        <section>
                            <h4>Backpack <i>{bagRows.length}/{st.packSlots}</i></h4>
                            <div className="gv-slots">
                                {bagRows.map(([p, n]) => (
                                    <button key={p} type="button" className="gv-slot"
                                        onClick={async () => { await post({ action: "move", partId: p, from: "pack", to: "bank", qty: n }); refresh(); }}>
                                        <PartIcon id={p} />
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
                                        <PartIcon id={p} />
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
                {panel === "bench" ? (
                    <GroveBench
                        st={st} known={known} partName={partName} PartIcon={PartIcon}
                        post={post} refresh={refresh} setNote={setNote}
                    />
                ) : null}

                {/* ── EMBLEMS ──────────────────────────────────────────────────────────────────────── */}
                {panel === "emblems" ? (
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

                </div>
    );


    // ── THE ZONE ────────────────────────────────────────────────────────────────────────────────────
    if (view === "zone" && session) {
        return (
            <div className="gv">
                <GroveScene
                    zone={session.zone} seed={session.seed} bonuses={session.bonuses}
                    // ⚠️ THE DOOR'S GATE IS THE SERVER'S, NOT THE CLIENT'S KILL COUNT. groveEnter refuses
                    // any zone past unlocked_n, and the door used to decide for itself from local kills --
                    // so a count the server had not banked yet (the settle still in flight, or trimmed by
                    // the kill ceiling) painted an open portal that then answered "That one is still
                    // closed." Handing the scene the same number the server checks makes the picture and
                    // the rule the same thing. settle() calls refresh(), so this lands as soon as the
                    // kills are banked.
                    unlockedN={Number(st?.unlockedN) || 1}
                    stats={stats} heroArt={session.heroArt || st?.heroArt || null}
                    petArt={session.petArt || st?.petArt || null}
                    belt={beltNow} onSettle={settle} onBoss={bossKill} onLeave={leave}
                    onTravel={travel}
                    // ⚠️ THE ZONE IS FROZEN WHILE A PANEL IS OPEN, AND IT HAS TO BE. Crafting in front of
                    // a live fight means being eaten while reading a recipe, and the belt auto-eats below
                    // 60% — so an unpaused sheet would quietly spend your food while you were not looking
                    // at the screen. It also makes the scene's own clock honest: nothing ages, nothing
                    // respawns, and the fight you come back to is the fight you left.
                    paused={zonePanel !== null}
                    onPanel={setZonePanel}
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
                {/* ── ⚠️ THE PANEL IS A SHEET OVER THE ZONE, NOT A SCREEN INSTEAD OF IT ────────────
                    Luke: "The buttons to access crafting and backpack and map should be available when in
                    a node on the Grove." The scene stays mounted underneath — see the hoist note for why
                    unmounting it would hand out a free full heal — and the dock that opens this lives in
                    GroveScene, because the scene owns the unsettled kill log and has to bank it before a
                    backpack is worth looking at. */}
                {zonePanel && mounted ? createPortal((
                    <div className="gv-zsheet">
                        <button type="button" className="gv-zsheet-x" aria-label="Back to the zone"
                            onClick={() => setZonePanel(null)}>
                            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                                <path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor"
                                    strokeWidth="2.2" strokeLinecap="round" />
                            </svg>
                        </button>
                        {note ? <p className="gv-note">{note}</p> : null}
                        {sheetNode}
                        <style>{GROVE_CSS}</style>
                    </div>
                ), fsHost || document.body) : null}
                {popNode}
                <style>{GROVE_CSS}</style>
            </div>
        );
    }

    return (
        <div className="gv is-full">
            {/* ⚠️ THE WAY OUT, BECAUSE THE SITE'S OWN NAV IS UNDERNEATH THIS. Covering the whole viewport
                without putting a door in it is how a player ends up using the browser's back button to
                escape a game screen. Top-left, which is where a back control is looked for. */}
            <button type="button" className="gv-exit" aria-label="Leave the Grove"
                onClick={() => router.push("/marketplace")}>
                <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                    <path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" strokeWidth="2.2"
                        strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>

            {popNode}
            {note ? <p className="gv-note">{note}</p> : null}

            {sheetNode}

            {/* ── THE DOCK ──────────────────────────────────────────────────────────────────────
                Objects rather than words, over the content rather than above it. The current one is lit
                rather than merely outlined: at 46px an outline is a rounding error, and the question it
                has to answer at a glance is "where am I". */}
            <nav className="gv-dock" aria-label="The Grove">
                {DOCK.map((d) => (
                    <button key={d.k} type="button" title={d.label} aria-label={d.label}
                        aria-current={view === d.k ? "page" : undefined}
                        className={view === d.k ? "is-on" : undefined}
                        onClick={() => setView(d.k)}>
                        <img src={d.art} alt="" />
                    </button>
                ))}
            </nav>

            <style>{GROVE_CSS}</style>
        </div>
    );
}
