"use client";

import { useState } from "react";
import { treeState } from "@/lib/marketplace/arena-classes.js";
import { GiLaurelCrown, GiUpgrade } from "react-icons/gi";

import { TIER_GATE } from "@/lib/marketplace/arena-classes.js";

// ── THE SKILL TREE ───────────────────────────────────────────────────────────────────────────────────────────
// Four tiers of three, read top to bottom, with the gate for each tier stated on it. Every node carries its
// own art, its rank pips and what one more point would actually do.
//
// The states are deliberately loud and distinct, because a tree that does not answer "what can I press right
// now" at a glance is a puzzle rather than a build:
//
//   TAKEN      lit, coloured by class, rank pips filled
//   AVAILABLE  breathing outline — you have a point and the tier is open
//   OPEN       tier reached, but you have no point to spend
//   LOCKED     the tier gate is not met, and it says how far off you are
//
// Everything here renders from `treeState()`, the same pure function the server validates a spend against, so
// the screen can never offer a node the server would refuse.

const money = (n) => Number(n || 0).toLocaleString();

// ── A NODE ───────────────────────────────────────────────────────────────────────────────────────────────────
// Nothing but art, name and rank pips, and every tile is exactly the same height. All the words live in the
// detail panel below the row: a grid where a taken node is twice as tall as its neighbours reads as broken,
// and a grid where the untaken nodes say nothing at all cannot be used to plan a build.
//
// Tapping SELECTS rather than spends. A point costs gold to take back, so the last thing this screen should
// do is spend one on a mis-tap.
function Node({ n, selected, onPick, busy }) {
    const state = n.rank > 0 ? "taken" : !n.tierOpen ? "locked" : n.canTake ? "ready" : "open";
    return (
        <button type="button" disabled={busy} onClick={() => onPick(n.id)}
            className={`skt-node is-${state}${selected ? " is-sel" : ""}`}
            aria-pressed={selected}
            aria-label={`${n.name}${n.rank ? `, rank ${n.rank} of ${n.ranks}` : ""}`}>
            {n.kind === "active" ? <i className="skt-node-tag">Active</i> : null}
            <span className="skt-node-art">
                {n.sprite ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={n.sprite} alt="" draggable="false" />
                ) : null}
            </span>
            <b className="skt-node-name">{n.name}</b>
            <span className="skt-pips" aria-hidden="true">
                {Array.from({ length: Math.max(1, n.ranks || 1) }).map((_, i) => (
                    <i key={i} className={i < n.rank ? "is-on" : ""} />
                ))}
            </span>
        </button>
    );
}

// ── THE DETAIL PANEL ─────────────────────────────────────────────────────────────────────────────────────────
// One of these at a time, docked under the row of the node you tapped, so the answer appears next to the
// question instead of scrolling the tree out from under you.
function Detail({ n, busy, points, refundCost, canAfford, freeLeft = 0, readOnly = false, onTake, onRefund, onClose }) {
    const ranked = (n.ranks || 1) > 1;
    return (
        <div className="skt-detail">
            <div className="skt-detail-head">
                <b>{n.name}</b>
                <span className="skt-detail-meta">
                    {n.kind === "active" ? "Active skill" : "Passive"}
                    {ranked ? ` · rank ${n.rank}/${n.ranks}` : n.rank ? " · learned" : ""}
                </span>
                <button type="button" className="skt-detail-x" onClick={onClose} aria-label="Close">×</button>
            </div>
            <p className="skt-detail-desc">{n.desc}</p>

            {/* ── WHAT IT ACTUALLY DOES ────────────────────────────────────────────────────────────────
                A passive shows "now 3% → next 4.5%" below; an active showed nothing but its flavour line,
                so Tithe read "You keep half of what it takes off them" — half of what, at what cost, how
                often? These are the node's own numbers, run through the same builder that writes the gear
                ability cards, so the tree and the ring cannot describe one move two ways.
                The accuracy cost is stated because it is the price of the big ones and is invisible
                otherwise: the strongest actives are also the easiest to miss with. */}
            {n.kind === "active" && n.effect ? (
                <>
                    <p className="skt-detail-eff">{n.effect.line}</p>
                    <div className="skt-detail-facts">
                        {n.cd ? <span className="skt-fact">Cools {n.cd} turns</span> : null}
                        {n.acc ? <span className="skt-fact is-cost">{`−${Math.abs(Math.round(n.acc * 100))}% accuracy`}</span> : null}
                    </div>
                </>
            ) : null}

            {n.kind === "passive" && n.rank > 0 ? (
                <p className="skt-detail-now">
                    now <b>{fmt(n)}</b>
                    {n.maxed ? <em> · maxed</em> : <> → next <b>{fmt(n, 1)}</b></>}
                </p>
            ) : null}

            <div className="skt-detail-acts">
                {readOnly ? (
                    // Reading someone else's discipline: everything above is true, nothing here is spendable.
                    <span className="skt-detail-lock">Preview — switch to Yours to spend points.</span>
                ) : !n.tierOpen ? (
                    <span className="skt-detail-lock">Spend {n.gate} points in this tree to open this tier.</span>
                ) : n.maxed ? (
                    <span className="skt-detail-lock is-ok">Fully learned.</span>
                ) : points > 0 ? (
                    <button type="button" className="skt-learn" disabled={busy} onClick={() => onTake(n.id)}>
                        {n.rank > 0 ? "Add a rank" : "Learn"}
                    </button>
                ) : (
                    <span className="skt-detail-lock">Win bouts to earn another point.</span>
                )}
                {/* THE FIRST THREE OF THE DAY ARE FREE, and the button says so — a price you have to discover
                    by tapping is a price that stops people tapping. */}
                {n.rank > 0 && !readOnly ? (
                    <button type="button" className="skt-refund" disabled={busy || (freeLeft <= 0 && !canAfford)}
                        onClick={() => onRefund(n.id)}>
                        {freeLeft > 0
                            ? <>Refund one · <u>free · {freeLeft} left today</u></>
                            : <>Refund one · 🪙 {money(refundCost)}</>}
                    </button>
                ) : null}
            </div>
        </div>
    );
}

// A passive's value, said the way the node's own description says it.
function fmt(n, plus = 0) {
    const v = (n.per || 0) * (n.rank + plus);
    if (Math.abs(n.per) < 1) return `${(v * 100).toFixed(1)}%`;
    return `+${Math.round(v * 10) / 10}`;
}

export default function SkillTree({ progress, gold = 0, busy, onAct }) {
    const p = progress || {};
    const cls = p.cls;
    const colour = cls?.color || "#ffd75e";
    const pts = p.points || { total: 0, spent: 0, available: 0 };
    const [confirm, setConfirm] = useState(null);   // "tree" | classId
    const [sel, setSel] = useState(null);           // the node whose detail panel is open
    // ── READING A CLASS YOU ARE NOT ──────────────────────────────────────────────────────────────────────
    // "I need a way to see the other class skill trees and passives without respeccing." The catalog is pure
    // (arena-classes.js: no DB, no server-only), so any class's tree can be built right here from nothing —
    // no round trip, no state on the server, and no way for a preview to touch your own points.
    const [preview, setPreview] = useState(null);   // classId being read, or null for your own

    // ── CHOOSE A CLASS ── the first level asks, and nothing else on this screen exists until it is answered.
    // …unless they asked to READ one first, in which case the tree below renders with nothing spendable.
    if (p.needsClass && !preview) {
        return (
            <div className="skt">
                <div className="skt-head is-intro">
                    <span className="skt-kick">Arena level {p.level}</span>
                    <b className="skt-title">Choose your discipline</b>
                    <p className="skt-sub">
                        This decides which tree your points go into. You can change it later for gold — every
                        point comes back.
                    </p>
                </div>
                <div className="skt-classes">
                    {(p.classes || []).map((c) => (
                        <button key={c.id} type="button" className="skt-class" style={{ "--c": c.color }}
                            disabled={busy} onClick={() => onAct("pick_class", { classId: c.id })}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={c.emblem} alt="" draggable="false" />
                            <b>{c.name}</b>
                            <em>{c.tag}</em>
                            {/* ── WHAT YOU ARE ACTUALLY PICKING ────────────────────────────────────────
                                A class used to be three lines of prose over an identical stat block: a fresh
                                Warden and a fresh Reaver fought exactly the same until they spent a point.
                                These three numbers ARE the choice, so they belong on the button that makes
                                it — not on a card you find later. */}
                            <span className="skt-class-stats">
                                <i><b>{c.health > 0 ? `+${c.health}` : "—"}</b>health</i>
                                <i><b>{Math.round((c.dr || 0) * 100)}%</b>reduction</i>
                                <i><b>{Math.round((c.accuracy || 0) * 100)}%</b>accuracy</i>
                                <i><b>{c.lifesteal ? `${Math.round(c.lifesteal * 100)}%` : "—"}</b>lifesteal</i>
                                {/* The Warden's is double everyone else's, and Fortune multiplies it — so
                                    this number is the floor, not the figure. */}
                                <i><b>{Math.round((c.guard || 0) * 100)}%</b>guard</i>
                            </span>
                            <p>{c.blurb}</p>
                            {/* ── READ IT BEFORE YOU PICK IT ──────────────────────────────────────────
                                A newcomer was choosing off a name, a tagline and five numbers, with the
                                twelve nodes that actually make the class invisible until after they had
                                committed. This opens the whole tree, read-only, before anything is spent. */}
                            <span role="button" tabIndex={0} className="skt-class-see"
                                onClick={(e) => { e.stopPropagation(); setPreview(c.id); }}
                                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); setPreview(c.id); } }}>
                                See its tree
                            </span>
                        </button>
                    ))}
                </div>
                <Styles />
            </div>
        );
    }

    if (!cls) {
        return (
            <div className="skt">
                <p className="skt-sub">Win a bout to earn your first arena level, then choose a discipline.</p>
                <Styles />
            </div>
        );
    }

    // Your own tree, or the one you are reading. A previewed tree is built with NO points spent and every
    // tier open, because the question being answered is "what is in this class", not "what could I take now".
    const viewing = preview && preview !== cls?.id ? preview : null;
    const choosing = Boolean(p.needsClass);   // reading a tree before any class exists
    const viewCls = viewing ? (p.classes || []).find((c) => c.id === viewing) || null : cls;
    const nodes = viewing
        ? treeState(viewing, {}, 0).map((n) => ({ ...n, tierOpen: true, canTake: false }))
        : (p.tree || []);
    const tiers = [0, 1, 2, 3].map((t) => nodes.filter((n) => n.tier === t));
    const picked = nodes.find((n) => n.id === sel) || null;

    // ── WHAT YOUR POINTS ARE ACTUALLY DOING ──────────────────────────────────────────────────────────────
    // "where do I see the passives, I cant even see my own." The tree draws a node's dots but never totals
    // them, so a Warden with four ranks of Conditioning had no way to read what that came to. Summed from the
    // same node data the tree renders, so the two cannot disagree.
    const held = nodes.filter((n) => n.kind !== "active" && n.rank > 0);

    return (
        <div className="skt" style={{ "--c": (viewCls?.color || colour) }}>
            {/* ── EVERY DISCIPLINE, READABLE ──────────────────────────────────────────────────────────────
                Tapping one reads its whole tree; nothing here can spend a point. Changing class still costs
                gold and still lives behind the confirm below — this only removes the need to PAY to find out
                what you would be buying. */}
            {(p.classes || []).length > 1 && !choosing ? (
                <div className="skt-switch">
                    <button type="button" className={`skt-sw${!viewing ? " is-on" : ""}`} onClick={() => { setPreview(null); setSel(null); }}>
                        Yours
                    </button>
                    {(p.classes || []).filter((c) => c.id !== cls?.id).map((c) => (
                        <button key={c.id} type="button" className={`skt-sw${viewing === c.id ? " is-on" : ""}`}
                            style={{ "--c": c.color }} onClick={() => { setPreview(c.id); setSel(null); }}>
                            {c.name}
                        </button>
                    ))}
                </div>
            ) : null}
            {viewing ? (
                <p className="skt-preview">
                    {choosing
                        ? <>Reading <b>{viewCls?.name}</b> before you commit. Nothing here spends a point.</>
                        : <>Reading <b>{viewCls?.name}</b> — you are a {cls?.name}. Nothing here spends a point.</>}
                    {choosing ? (
                        <button type="button" className="skt-sw skt-back" onClick={() => { setPreview(null); setSel(null); }}>
                            Back to choosing
                        </button>
                    ) : null}
                </p>
            ) : null}
            <div className="skt-head">
                {viewCls?.emblem ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="skt-emblem" src={viewCls.emblem} alt="" draggable="false" />
                ) : null}
                <div className="skt-head-body">
                    <span className="skt-kick">{viewCls?.tag}</span>
                    <b className="skt-title">{viewCls?.name}</b>
                    {viewing ? (
                        <span className="skt-lv">
                            {/* The numbers that ARE the choice — the same five the class-pick cards show, so
                                reading a class and picking one tell you the same things. */}
                            <span className="skt-class-stats is-read">
                                <i><b>{viewCls?.health > 0 ? `+${viewCls.health}` : "—"}</b>health</i>
                                <i><b>{Math.round((viewCls?.dr || 0) * 100)}%</b>reduction</i>
                                <i><b>{Math.round((viewCls?.accuracy || 0) * 100)}%</b>accuracy</i>
                                <i><b>{viewCls?.lifesteal ? `${Math.round(viewCls.lifesteal * 100)}%` : "—"}</b>lifesteal</i>
                                <i><b>{Math.round((viewCls?.guard || 0) * 100)}%</b>guard</i>
                            </span>
                        </span>
                    ) : (
                        <span className="skt-lv">
                            Arena level <b>{p.level}</b>
                            <i className="skt-xpbar"><u style={{ width: `${Math.min(100, (p.into / p.span) * 100)}%` }} /></i>
                            <em>{money(p.into)} / {money(p.span)} xp</em>
                        </span>
                    )}
                </div>
                <span className={`skt-points${pts.available ? " is-live" : ""}`}>
                    <b>{pts.available}</b><em>point{pts.available === 1 ? "" : "s"}</em>
                </span>
            </div>

            {/* ── WHAT YOU ARE CARRYING ───────────────────────────────────────────────────────────────────
                The tree draws a node's dots and never totals them, so four ranks of Conditioning was a row of
                pips and nothing else — there was no screen anywhere that said what your passives came to.
                Summed from the same node data the tree renders, so the two cannot disagree.
                In preview this lists what the discipline OFFERS instead, at one rank each, which is the
                question you are asking when you are reading a class you do not have. */}
            {viewing ? (
                <div className="skt-have is-read">
                    <b>What {viewCls?.name} offers</b>
                    <div className="skt-have-rows">
                        {nodes.filter((n) => n.kind !== "active").map((n) => (
                            <span key={n.id} className="skt-have-row">
                                <i>{n.name}</i>
                                <u>{fmt({ ...n, rank: 1 })} per rank</u>
                                <em>{n.ranks > 1 ? `${n.ranks} ranks` : "1 rank"}</em>
                            </span>
                        ))}
                    </div>
                    <b className="skt-have-sub">Its actives</b>
                    <div className="skt-have-rows">
                        {nodes.filter((n) => n.kind === "active").map((n) => (
                            <span key={n.id} className="skt-have-row">
                                <i>{n.name}</i>
                                <u>{n.effect ? n.effect.line : n.desc}</u>
                            </span>
                        ))}
                    </div>
                </div>
            ) : held.length ? (
                <div className="skt-have">
                    <b>What your points are doing</b>
                    <div className="skt-have-rows">
                        {held.map((n) => (
                            <span key={n.id} className="skt-have-row">
                                <i>{n.name}</i>
                                <u>{fmt(n)}</u>
                                <em>{n.rank}/{n.ranks || 1}</em>
                            </span>
                        ))}
                    </div>
                </div>
            ) : null}

            {/* ── THE TREE ── four tiers of three. The spines between them light up as each gate falls, so the
                shape of your progress is visible from across the room rather than read off the labels. */}
            <div className="skt-tree">
                {tiers.map((row, t) => (
                    <div key={t} className={`skt-tier${pts.spent >= (TIER_GATE[t] || 0) ? " is-open" : ""}`}>
                        {t > 0 ? (
                            <span className="skt-link" aria-hidden="true"><i /><i /><i /></span>
                        ) : null}
                        <span className="skt-tier-lab">
                            Tier {t + 1}
                            {TIER_GATE[t] > 0 ? <i>{pts.spent >= TIER_GATE[t] ? "open" : `${TIER_GATE[t]} spent`}</i> : null}
                        </span>
                        <div className="skt-row">
                            {row.map((n) => (
                                <Node key={n.id} n={n} busy={busy} selected={sel === n.id}
                                    onPick={(id) => setSel((cur) => (cur === id ? null : id))} />
                            ))}
                        </div>
                        {picked && picked.tier === t ? (
                            <Detail n={picked} busy={busy} points={viewing ? 0 : pts.available} readOnly={Boolean(viewing)}
                                refundCost={p.respec?.one || 0} canAfford={gold >= (p.respec?.one || 0)}
                                freeLeft={p.respec?.free || 0}
                                onClose={() => setSel(null)}
                                onTake={(id) => onAct("take_node", { nodeId: id })}
                                onRefund={(id) => onAct("refund_node", { nodeId: id })} />
                        ) : null}
                    </div>
                ))}
            </div>

            {/* ── RESPEC ── three prices, because they are three different decisions. */}
            <div className="skt-respec">
                <span className="skt-up-head"><GiUpgrade aria-hidden="true" /> Re-specialise</span>
                {confirm === "tree" ? (
                    <div className="skt-confirm">
                        <p>Empty the whole tree and take all {pts.spent} points back?</p>
                        <div>
                            <button type="button" className="skt-danger" disabled={busy}
                                onClick={() => { setConfirm(null); onAct("respec_tree"); }}>
                                Yes · 🪙 {money(p.respec?.tree)}
                            </button>
                            <button type="button" className="skt-cancel" onClick={() => setConfirm(null)}>Keep it</button>
                        </div>
                    </div>
                ) : (
                    <button type="button" className="skt-respec-btn"
                        disabled={busy || pts.spent <= 0 || gold < (p.respec?.tree || 0)}
                        onClick={() => setConfirm("tree")}>
                        Refund the whole tree <u>🪙 {money(p.respec?.tree)}</u>
                    </button>
                )}

                <span className="skt-up-head" style={{ marginTop: 12 }}>
                    <GiLaurelCrown aria-hidden="true" /> Change discipline
                </span>
                <p className="skt-note">Refunds every point. Your level and arena XP are untouched.</p>
                <div className="skt-swap">
                    {(p.classes || []).filter((c) => c.id !== cls.id).map((c) => (
                        confirm === c.id ? (
                            <div key={c.id} className="skt-confirm">
                                <p>Become a {c.name}? All {pts.spent} points come back.</p>
                                <div>
                                    <button type="button" className="skt-danger" disabled={busy}
                                        onClick={() => { setConfirm(null); onAct("respec_class", { classId: c.id }); }}>
                                        Yes · 🪙 {money(p.respec?.klass)}
                                    </button>
                                    <button type="button" className="skt-cancel" onClick={() => setConfirm(null)}>Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <button key={c.id} type="button" className="skt-swap-btn" style={{ "--c": c.color }}
                                disabled={busy || gold < (p.respec?.klass || 0)}
                                onClick={() => setConfirm(c.id)}>
                                {c.emblem ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={c.emblem} alt="" draggable="false" />
                                ) : null}
                                <b>{c.name}</b>
                                <u>🪙 {money(p.respec?.klass)}</u>
                            </button>
                        )
                    ))}
                </div>
            </div>
            <Styles />
        </div>
    );
}

function Styles() {
    return (
        <style jsx global>{`
            .skt { display: grid; gap: 14px; }
            .skt-kick { font-size: 9.5px; font-weight: 900; letter-spacing: .18em; text-transform: uppercase; color: #8a939d; }
            .skt-title { display: block; font-size: 1.45rem; font-weight: 900; line-height: 1.05;
                color: color-mix(in srgb, var(--c) 72%, white);
                text-shadow: 0 0 28px color-mix(in srgb, var(--c) 45%, transparent); }
            .skt-sub { margin: 6px 0 0; font-size: 12.5px; line-height: 1.5; color: #9aa2ab; }

            /* ── THE HEADER ── who you are, how far to the next point, and how many are burning a hole. */
            .skt-head { display: flex; align-items: center; gap: 13px; padding: 14px;
                border-radius: 17px;
                background: linear-gradient(145deg, color-mix(in srgb, var(--c) 22%, transparent), rgba(255,255,255,.02) 66%), rgba(10,8,14,.5);
                border: 1px solid color-mix(in srgb, var(--c) 48%, transparent); }
            /* The picker's header has no emblem and no point badge — it is three stacked lines, and the flex
               row above turns them into three squeezed columns. */
            .skt-head.is-intro { display: block; text-align: center; }
            .skt-head.is-intro .skt-sub { max-width: 42ch; margin-inline: auto; }
            .skt-emblem { width: 74px; height: 74px; object-fit: contain; flex: 0 0 auto;
                filter: drop-shadow(0 4px 14px color-mix(in srgb, var(--c) 55%, transparent)); }
            .skt-head-body { flex: 1; min-width: 0; }
            .skt-lv { display: block; margin-top: 5px; font-size: 11px; color: #a4adb7; }
            .skt-lv b { color: #fff; }
            .skt-xpbar { display: block; height: 5px; margin: 5px 0 3px; border-radius: 999px; overflow: hidden;
                background: rgba(0,0,0,.5); }
            .skt-xpbar u { display: block; height: 100%; background: var(--c); text-decoration: none;
                transition: width .6s cubic-bezier(.2,.8,.3,1); }
            .skt-lv em { font-style: normal; font-size: 10px; color: #7f8790; }
            .skt-points { flex: 0 0 auto; display: grid; place-items: center; min-width: 56px; padding: 8px 6px;
                border-radius: 13px; background: rgba(0,0,0,.36); border: 1px solid rgba(255,255,255,.12); }
            .skt-points b { font-size: 1.5rem; font-weight: 900; color: #6f7883; line-height: 1; }
            .skt-points em { font-style: normal; font-size: 8.5px; letter-spacing: .1em; text-transform: uppercase; color: #6f7883; }
            /* A point you can actually spend should be impossible to miss. */
            .skt-points.is-live { border-color: var(--c); box-shadow: 0 0 20px -4px var(--c); }
            .skt-points.is-live b { color: color-mix(in srgb, var(--c) 78%, white); }
            .skt-points.is-live em { color: color-mix(in srgb, var(--c) 60%, white); }

            /* ── CLASS PICKER ── */
            /* Three columns so the classes can be COMPARED, which is the only way a stat line helps: the
               numbers line up across the three buttons and the trade is visible without reading. */
            .skt-class-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; width: 100%;
                margin: 6px 0 2px; }
            .skt-class-stats i { display: grid; gap: 1px; font-style: normal; text-align: center;
                font-size: 0.58rem; text-transform: uppercase; letter-spacing: .05em; color: #8b93a0;
                padding: 4px 2px; border-radius: 7px; background: rgba(255,255,255,0.05); }
            .skt-class-stats i b { font-size: 0.86rem; color: var(--c); letter-spacing: 0; }
            .skt-classes { display: grid; gap: 10px; }
            @media (min-width: 640px) { .skt-classes { grid-template-columns: repeat(3, 1fr); } }
            .skt-class { display: grid; justify-items: center; gap: 4px; text-align: center; cursor: pointer;
                padding: 18px 14px 16px; border-radius: 18px;
                background: linear-gradient(160deg, color-mix(in srgb, var(--c) 20%, transparent), rgba(255,255,255,.02) 70%), rgba(10,8,14,.5);
                border: 1px solid color-mix(in srgb, var(--c) 45%, transparent);
                transition: transform .12s ease, box-shadow .2s ease; }
            @media (hover: hover) { .skt-class:hover { transform: translateY(-2px); box-shadow: 0 14px 34px -18px var(--c); } }
            .skt-class img { width: 92px; height: 92px; object-fit: contain;
                filter: drop-shadow(0 6px 18px color-mix(in srgb, var(--c) 60%, transparent)); }
            .skt-class b { font-size: 1.15rem; font-weight: 900; color: color-mix(in srgb, var(--c) 74%, white); }
            .skt-class em { font-style: normal; font-size: 10px; font-weight: 900; letter-spacing: .12em;
                text-transform: uppercase; color: var(--c); }
            .skt-class p { margin: 6px 0 0; font-size: 11.5px; line-height: 1.45; color: #9aa2ab; }

            /* ── TIERS ── */
            .skt-tree { display: grid; gap: 4px; padding: 13px 11px 15px; border-radius: 18px;
                background:
                    radial-gradient(120% 70% at 50% -10%, color-mix(in srgb, var(--c) 13%, transparent), transparent 62%),
                    rgba(0,0,0,.3);
                border: 1px solid rgba(255,255,255,.08); }
            /* Capped and centred rather than stretched: a tree that spans a desktop container stops reading as
               a tree and starts reading as a table of twelve wide rows. */
            .skt-tier { display: grid; gap: 7px; width: 100%; max-width: 620px; margin: 0 auto; }
            .skt-tier-lab { display: flex; align-items: center; gap: 8px; font-size: 9.5px; font-weight: 900;
                letter-spacing: .16em; text-transform: uppercase; color: #6f7883; }
            .skt-tier-lab i { font-style: normal; font-size: 9px; letter-spacing: .08em; padding: 2px 7px;
                border-radius: 999px; color: #8a939d; border: 1px solid rgba(255,255,255,.14); }
            .skt-tier.is-open .skt-tier-lab i { color: color-mix(in srgb, var(--c) 70%, white);
                border-color: color-mix(in srgb, var(--c) 45%, transparent); }
            .skt-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; align-items: stretch; }

            /* The spine between tiers. Dead until the gate falls, then it carries the class colour. */
            .skt-link { display: grid; grid-template-columns: repeat(3, 1fr); height: 14px; }
            .skt-link i { justify-self: center; width: 2px; height: 100%; border-radius: 2px;
                background: rgba(255,255,255,.09); }
            .skt-tier.is-open .skt-link i { background: linear-gradient(180deg,
                color-mix(in srgb, var(--c) 12%, transparent), color-mix(in srgb, var(--c) 65%, transparent));
                box-shadow: 0 0 8px -2px var(--c); }

            /* ── NODES ── four states, each unmistakable, and every tile the same height. */
            .skt-node { position: relative; display: grid; justify-items: center; align-content: start; gap: 5px;
                padding: 11px 5px 10px; border-radius: 14px; cursor: pointer; overflow: hidden;
                background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.1);
                transition: transform .12s ease, border-color .2s ease, background .2s ease; }
            @media (hover: hover) { .skt-node:hover { transform: translateY(-1px); border-color: rgba(255,255,255,.22); } }
            .skt-node-art { display: grid; place-items: center; width: 54px; height: 54px;
                border-radius: 14px; background: rgba(0,0,0,.34); border: 1px solid rgba(255,255,255,.12); }
            .skt-node-art img { width: 42px; height: 42px; object-fit: contain; }
            @media (min-width: 640px) {
                .skt-node-art { width: 66px; height: 66px; border-radius: 17px; }
                .skt-node-art img { width: 52px; height: 52px; }
                .skt-node-name { font-size: 12px; }
            }
            /* Pinned to the card corner, not the art — absolute, so it costs the tile no height and the row
               stays flush whether a node is active or passive. */
            .skt-node-tag { position: absolute; top: 0; right: 0; font-style: normal; font-size: 7px; font-weight: 900;
                letter-spacing: .09em; text-transform: uppercase; padding: 2px 5px 2px 6px;
                border-bottom-left-radius: 8px; color: #12101a; background: var(--c); }
            /* Two lines of room whether the name needs them or not, so "Killer Instinct" wrapping does not
               push its pips out of line with the pips either side of it. */
            .skt-node-name { display: grid; align-content: center; min-height: 2.4em; font-size: 11px;
                font-weight: 800; color: #d6dde4; text-align: center; line-height: 1.2; }
            .skt-pips { display: flex; gap: 3px; min-height: 5px; }
            .skt-pips i { width: 5px; height: 5px; border-radius: 50%; background: rgba(255,255,255,.16); }
            .skt-pips i.is-on { background: var(--c); box-shadow: 0 0 7px -1px var(--c); }

            .skt-node.is-taken { border-color: color-mix(in srgb, var(--c) 55%, transparent);
                background: linear-gradient(160deg, color-mix(in srgb, var(--c) 16%, transparent), rgba(255,255,255,.03) 70%); }
            .skt-node.is-taken .skt-node-art { border-color: color-mix(in srgb, var(--c) 60%, transparent);
                box-shadow: 0 0 16px -5px var(--c); }
            .skt-node.is-taken .skt-node-name { color: #fff; }
            /* Ready: you have a point AND the tier is open. It breathes — but gently, because with one point
               and three tiers open NINE of these are ready at once, and nine loud pulses in step read as the
               whole panel throbbing rather than as an invitation. The loud signal lives on the point badge. */
            .skt-node.is-ready { border-color: color-mix(in srgb, var(--c) 34%, transparent);
                animation: skReady 2.6s ease-in-out infinite; }
            @keyframes skReady {
                0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--c) 22%, transparent); }
                50% { box-shadow: 0 0 12px -3px color-mix(in srgb, var(--c) 40%, transparent); } }
            .skt-node.is-locked { opacity: .45; }
            .skt-node.is-locked .skt-node-art img { filter: grayscale(1); }
            .skt-node.is-sel { border-color: #fff; background: rgba(255,255,255,.09); animation: none; }
            .skt-node.is-sel .skt-node-art { box-shadow: 0 0 18px -6px #fff; }

            /* ── DETAIL ── one panel, under the row it belongs to. */
            .skt-detail { display: grid; gap: 7px; margin-top: 2px; padding: 11px 12px 12px; border-radius: 13px;
                background: rgba(8,7,12,.72); border: 1px solid rgba(255,255,255,.16);
                animation: skDetail .18s cubic-bezier(.2,.8,.3,1) both; }
            @keyframes skDetail { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: none; } }
            .skt-detail-head { display: flex; align-items: baseline; gap: 9px; }
            .skt-detail-head b { font-size: 13.5px; font-weight: 900; color: #fff; }
            .skt-detail-meta { flex: 1; font-size: 9.5px; font-weight: 800; letter-spacing: .1em;
                text-transform: uppercase; color: color-mix(in srgb, var(--c) 62%, white); }
            .skt-detail-x { flex: 0 0 auto; width: 22px; height: 22px; border-radius: 7px; cursor: pointer;
                font-size: 15px; line-height: 1; color: #9aa2ab; background: rgba(255,255,255,.06);
                border: 1px solid rgba(255,255,255,.12); }
            .skt-switch { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
            .skt-sw { padding: 5px 11px; border-radius: 999px; cursor: pointer; font-size: 11.5px; font-weight: 900;
                background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.14); color: #c6cfd8; }
            .skt-sw.is-on { color: #0b0d10; background: var(--c, #ffd75e); border-color: transparent; }
            .skt-preview { margin: 0 0 10px; padding: 8px 11px; border-radius: 10px; font-size: 11.5px; line-height: 1.45;
                color: #d8e2ec; background: rgba(96,165,250,0.10); border: 1px solid rgba(96,165,250,0.30); }
            .skt-preview b { color: #fff; }
            .skt-have { margin: 0 0 12px; padding: 10px 12px; border-radius: 12px;
                background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.10); }
            .skt-have > b { display: block; font-size: 12px; margin-bottom: 6px; }
            .skt-have-sub { margin-top: 9px; }
            .skt-have-rows { display: grid; gap: 4px; }
            .skt-have-row { display: flex; align-items: baseline; gap: 8px; font-size: 11.5px; }
            .skt-have-row i { font-style: normal; color: #e9eef3; font-weight: 800; flex: 0 0 auto; }
            .skt-have-row u { text-decoration: none; color: var(--c, #ffd75e); font-weight: 900; }
            .skt-have-row em { margin-left: auto; font-style: normal; font-size: 10.5px; color: #93a0ad; }
            .skt-class-stats.is-read { margin-top: 2px; }
            .skt-class-see { display: inline-block; margin-top: 8px; padding: 5px 12px; border-radius: 999px;
                font-size: 11px; font-weight: 900; color: #0b0d10; background: var(--c, #ffd75e); }
            .skt-back { margin-left: 8px; vertical-align: middle; }
            .skt-detail-desc { margin: 0; font-size: 12px; line-height: 1.5; color: #b6bec7; }
            .skt-detail-eff { margin: 7px 0 0; font-size: 12.5px; line-height: 1.45; font-weight: 800; color: #e8eef5; }
            .skt-detail-facts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 7px; }
            .skt-fact { font-size: 10.5px; font-weight: 800; letter-spacing: .2px; padding: 3px 8px; border-radius: 999px;
                color: #9fd0f5; background: rgba(96,165,250,0.12); border: 1px solid rgba(96,165,250,0.28); }
            .skt-fact.is-cost { color: #ffb4a2; background: rgba(255,122,107,0.12); border-color: rgba(255,122,107,0.30); }
            .skt-detail-now { margin: 0; font-size: 11.5px; color: #9aa2ab; }
            .skt-detail-now b { color: color-mix(in srgb, var(--c) 70%, white); }
            .skt-detail-now em { font-style: normal; color: #7f8790; }
            .skt-detail-acts { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; }
            .skt-detail-lock { font-size: 11px; color: #8a939d; }
            .skt-detail-lock.is-ok { color: color-mix(in srgb, var(--c) 60%, white); }
            .skt-learn { padding: 8px 18px; border-radius: 10px; cursor: pointer; font-size: 12px; font-weight: 900;
                color: #12101a; border: 0;
                background: linear-gradient(180deg, color-mix(in srgb, var(--c) 40%, white), var(--c));
                box-shadow: 0 8px 20px -10px var(--c); }
            .skt-learn:disabled { opacity: .5; cursor: default; }
            .skt-refund { padding: 7px 12px; border-radius: 10px; cursor: pointer; font-size: 10.5px; font-weight: 900;
                color: #ffd0a0; background: rgba(255,160,80,.1); border: 1px solid rgba(255,160,80,.35); }
            .skt-refund:disabled { opacity: .4; cursor: default; }

            /* ── RESPEC ── */
            .skt-respec { display: grid; gap: 7px; padding: 13px; border-radius: 15px;
                background: rgba(0,0,0,.28); border: 1px solid rgba(255,255,255,.09); }
            .skt-up-head { display: flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 900;
                letter-spacing: .14em; text-transform: uppercase; color: #8a939d; }
            .skt-up-head svg { width: 14px; height: 14px; }
            .skt-note { margin: 0; font-size: 10.5px; color: #7f8790; }
            .skt-respec-btn { display: flex; align-items: center; justify-content: space-between; gap: 10px;
                padding: 10px 13px; border-radius: 11px; cursor: pointer; font-size: 12px; font-weight: 800;
                color: #cbd3dc; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.14); }
            .skt-respec-btn u { text-decoration: none; color: #ffd75e; }
            .skt-refund u { text-decoration: none; color: #7fe0a4; font-weight: 800; }
            .skt-respec-btn:disabled { opacity: .4; cursor: default; }
            .skt-swap { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
            .skt-swap-btn { display: grid; justify-items: center; gap: 2px; padding: 9px 6px; border-radius: 12px;
                cursor: pointer; background: rgba(255,255,255,.04);
                border: 1px solid color-mix(in srgb, var(--c) 40%, transparent); }
            .skt-swap-btn img { width: 34px; height: 34px; object-fit: contain; }
            .skt-swap-btn b { font-size: 11.5px; color: color-mix(in srgb, var(--c) 72%, white); }
            .skt-swap-btn u { text-decoration: none; font-size: 10px; color: #ffd75e; }
            .skt-swap-btn:disabled { opacity: .4; cursor: default; }
            .skt-confirm { grid-column: 1 / -1; padding: 11px; border-radius: 12px;
                background: rgba(255,111,125,.1); border: 1px solid rgba(255,111,125,.4); }
            .skt-confirm p { margin: 0 0 8px; font-size: 12px; color: #ffd0d6; }
            .skt-confirm div { display: flex; gap: 7px; }
            .skt-danger { flex: 1; padding: 8px; border-radius: 9px; cursor: pointer; font-size: 11.5px;
                font-weight: 900; color: #2a0d10; background: linear-gradient(180deg,#ffc4ca,#ff6f7d); border: 0; }
            .skt-cancel { flex: 1; padding: 8px; border-radius: 9px; cursor: pointer; font-size: 11.5px;
                font-weight: 800; color: #cbd3dc; background: rgba(255,255,255,.06);
                border: 1px solid rgba(255,255,255,.14); }
        `}</style>
    );
}
