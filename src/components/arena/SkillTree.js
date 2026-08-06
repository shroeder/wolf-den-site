"use client";

import { useState } from "react";
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

function Node({ n, colour, onTake, onRefund, busy, refundCost, canAfford }) {
    const [open, setOpen] = useState(false);
    const state = n.rank > 0 ? "taken" : !n.tierOpen ? "locked" : n.canTake ? "ready" : "open";
    return (
        <div className={`sk-node is-${state}`} style={{ "--c": colour }}>
            <button type="button" className="sk-node-btn" disabled={busy}
                onClick={() => (n.canTake ? onTake(n.id) : setOpen((v) => !v))}
                aria-label={`${n.name}${n.rank ? `, rank ${n.rank} of ${n.ranks}` : ""}`}>
                <span className="sk-node-art">
                    {n.sprite ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={n.sprite} alt="" draggable="false" />
                    ) : null}
                    {n.kind === "active" ? <i className="sk-node-tag">Active</i> : null}
                </span>
                <b className="sk-node-name">{n.name}</b>
                {n.ranks > 1 ? (
                    <span className="sk-pips" aria-hidden="true">
                        {Array.from({ length: n.ranks }).map((_, i) => (
                            <i key={i} className={i < n.rank ? "is-on" : ""} />
                        ))}
                    </span>
                ) : (
                    <span className="sk-pips" aria-hidden="true"><i className={n.rank ? "is-on" : ""} /></span>
                )}
            </button>

            {open || n.rank > 0 ? (
                <div className="sk-node-more">
                    <p>{n.desc}</p>
                    {n.kind === "passive" && n.rank > 0 && !n.maxed ? (
                        <p className="sk-node-next">
                            now <b>{fmt(n)}</b> → next <b>{fmt(n, 1)}</b>
                        </p>
                    ) : null}
                    {n.rank > 0 ? (
                        <button type="button" className="sk-refund" disabled={busy || !canAfford}
                            onClick={() => onRefund(n.id)}>
                            Refund one · 🪙 {money(refundCost)}
                        </button>
                    ) : null}
                    {!n.tierOpen ? <p className="sk-node-lock">Spend {n.gate} in this tree to reach this tier.</p> : null}
                </div>
            ) : null}
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

    // ── CHOOSE A CLASS ── the first level asks, and nothing else on this screen exists until it is answered.
    if (p.needsClass) {
        return (
            <div className="sk">
                <div className="sk-head">
                    <span className="sk-kick">Arena level {p.level}</span>
                    <b className="sk-title">Choose your discipline</b>
                    <p className="sk-sub">
                        This decides which tree your points go into. You can change it later for gold — every
                        point comes back.
                    </p>
                </div>
                <div className="sk-classes">
                    {(p.classes || []).map((c) => (
                        <button key={c.id} type="button" className="sk-class" style={{ "--c": c.color }}
                            disabled={busy} onClick={() => onAct("pick_class", { classId: c.id })}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={c.emblem} alt="" draggable="false" />
                            <b>{c.name}</b>
                            <em>{c.tag}</em>
                            <p>{c.blurb}</p>
                        </button>
                    ))}
                </div>
                <Styles />
            </div>
        );
    }

    if (!cls) {
        return (
            <div className="sk">
                <p className="sk-sub">Win a bout to earn your first arena level, then choose a discipline.</p>
                <Styles />
            </div>
        );
    }

    const tiers = [0, 1, 2, 3].map((t) => (p.tree || []).filter((n) => n.tier === t));

    return (
        <div className="sk" style={{ "--c": colour }}>
            <div className="sk-head">
                {cls.emblem ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="sk-emblem" src={cls.emblem} alt="" draggable="false" />
                ) : null}
                <div className="sk-head-body">
                    <span className="sk-kick">{cls.tag}</span>
                    <b className="sk-title">{cls.name}</b>
                    <span className="sk-lv">
                        Arena level <b>{p.level}</b>
                        <i className="sk-xpbar"><u style={{ width: `${Math.min(100, (p.into / p.span) * 100)}%` }} /></i>
                        <em>{money(p.into)} / {money(p.span)} xp</em>
                    </span>
                </div>
                <span className={`sk-points${pts.available ? " is-live" : ""}`}>
                    <b>{pts.available}</b><em>point{pts.available === 1 ? "" : "s"}</em>
                </span>
            </div>

            {tiers.map((row, t) => (
                <div key={t} className="sk-tier">
                    <span className="sk-tier-lab">
                        Tier {t + 1}
                        {TIER_GATE[t] > 0 ? <i>{pts.spent >= TIER_GATE[t] ? "open" : `${TIER_GATE[t]} spent`}</i> : null}
                    </span>
                    <div className="sk-row">
                        {row.map((n) => (
                            <Node key={n.id} n={n} colour={colour} busy={busy}
                                refundCost={p.respec?.one || 0} canAfford={gold >= (p.respec?.one || 0)}
                                onTake={(id) => onAct("take_node", { nodeId: id })}
                                onRefund={(id) => onAct("refund_node", { nodeId: id })} />
                        ))}
                    </div>
                </div>
            ))}

            {/* ── RESPEC ── three prices, because they are three different decisions. */}
            <div className="sk-respec">
                <span className="sk-up-head"><GiUpgrade aria-hidden="true" /> Re-specialise</span>
                {confirm === "tree" ? (
                    <div className="sk-confirm">
                        <p>Empty the whole tree and take all {pts.spent} points back?</p>
                        <div>
                            <button type="button" className="sk-danger" disabled={busy}
                                onClick={() => { setConfirm(null); onAct("respec_tree"); }}>
                                Yes · 🪙 {money(p.respec?.tree)}
                            </button>
                            <button type="button" className="sk-cancel" onClick={() => setConfirm(null)}>Keep it</button>
                        </div>
                    </div>
                ) : (
                    <button type="button" className="sk-respec-btn"
                        disabled={busy || pts.spent <= 0 || gold < (p.respec?.tree || 0)}
                        onClick={() => setConfirm("tree")}>
                        Refund the whole tree <u>🪙 {money(p.respec?.tree)}</u>
                    </button>
                )}

                <span className="sk-up-head" style={{ marginTop: 12 }}>
                    <GiLaurelCrown aria-hidden="true" /> Change discipline
                </span>
                <p className="sk-note">Refunds every point. Your level and arena XP are untouched.</p>
                <div className="sk-swap">
                    {(p.classes || []).filter((c) => c.id !== cls.id).map((c) => (
                        confirm === c.id ? (
                            <div key={c.id} className="sk-confirm">
                                <p>Become a {c.name}? All {pts.spent} points come back.</p>
                                <div>
                                    <button type="button" className="sk-danger" disabled={busy}
                                        onClick={() => { setConfirm(null); onAct("respec_class", { classId: c.id }); }}>
                                        Yes · 🪙 {money(p.respec?.klass)}
                                    </button>
                                    <button type="button" className="sk-cancel" onClick={() => setConfirm(null)}>Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <button key={c.id} type="button" className="sk-swap-btn" style={{ "--c": c.color }}
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
            .sk { display: grid; gap: 14px; }
            .sk-kick { font-size: 9.5px; font-weight: 900; letter-spacing: .18em; text-transform: uppercase; color: #8a939d; }
            .sk-title { display: block; font-size: 1.45rem; font-weight: 900; line-height: 1.05;
                color: color-mix(in srgb, var(--c) 72%, white);
                text-shadow: 0 0 28px color-mix(in srgb, var(--c) 45%, transparent); }
            .sk-sub { margin: 6px 0 0; font-size: 12.5px; line-height: 1.5; color: #9aa2ab; }

            /* ── THE HEADER ── who you are, how far to the next point, and how many are burning a hole. */
            .sk-head { display: flex; align-items: center; gap: 13px; padding: 14px;
                border-radius: 17px;
                background: linear-gradient(145deg, color-mix(in srgb, var(--c) 22%, transparent), rgba(255,255,255,.02) 66%), rgba(10,8,14,.5);
                border: 1px solid color-mix(in srgb, var(--c) 48%, transparent); }
            .sk-emblem { width: 74px; height: 74px; object-fit: contain; flex: 0 0 auto;
                filter: drop-shadow(0 4px 14px color-mix(in srgb, var(--c) 55%, transparent)); }
            .sk-head-body { flex: 1; min-width: 0; }
            .sk-lv { display: block; margin-top: 5px; font-size: 11px; color: #a4adb7; }
            .sk-lv b { color: #fff; }
            .sk-xpbar { display: block; height: 5px; margin: 5px 0 3px; border-radius: 999px; overflow: hidden;
                background: rgba(0,0,0,.5); }
            .sk-xpbar u { display: block; height: 100%; background: var(--c); text-decoration: none;
                transition: width .6s cubic-bezier(.2,.8,.3,1); }
            .sk-lv em { font-style: normal; font-size: 10px; color: #7f8790; }
            .sk-points { flex: 0 0 auto; display: grid; place-items: center; min-width: 56px; padding: 8px 6px;
                border-radius: 13px; background: rgba(0,0,0,.36); border: 1px solid rgba(255,255,255,.12); }
            .sk-points b { font-size: 1.5rem; font-weight: 900; color: #6f7883; line-height: 1; }
            .sk-points em { font-style: normal; font-size: 8.5px; letter-spacing: .1em; text-transform: uppercase; color: #6f7883; }
            /* A point you can actually spend should be impossible to miss. */
            .sk-points.is-live { border-color: var(--c); box-shadow: 0 0 20px -4px var(--c); }
            .sk-points.is-live b { color: color-mix(in srgb, var(--c) 78%, white); }
            .sk-points.is-live em { color: color-mix(in srgb, var(--c) 60%, white); }

            /* ── CLASS PICKER ── */
            .sk-classes { display: grid; gap: 10px; }
            @media (min-width: 640px) { .sk-classes { grid-template-columns: repeat(3, 1fr); } }
            .sk-class { display: grid; justify-items: center; gap: 4px; text-align: center; cursor: pointer;
                padding: 18px 14px 16px; border-radius: 18px;
                background: linear-gradient(160deg, color-mix(in srgb, var(--c) 20%, transparent), rgba(255,255,255,.02) 70%), rgba(10,8,14,.5);
                border: 1px solid color-mix(in srgb, var(--c) 45%, transparent);
                transition: transform .12s ease, box-shadow .2s ease; }
            @media (hover: hover) { .sk-class:hover { transform: translateY(-2px); box-shadow: 0 14px 34px -18px var(--c); } }
            .sk-class img { width: 92px; height: 92px; object-fit: contain;
                filter: drop-shadow(0 6px 18px color-mix(in srgb, var(--c) 60%, transparent)); }
            .sk-class b { font-size: 1.15rem; font-weight: 900; color: color-mix(in srgb, var(--c) 74%, white); }
            .sk-class em { font-style: normal; font-size: 10px; font-weight: 900; letter-spacing: .12em;
                text-transform: uppercase; color: var(--c); }
            .sk-class p { margin: 6px 0 0; font-size: 11.5px; line-height: 1.45; color: #9aa2ab; }

            /* ── TIERS ── */
            .sk-tier { display: grid; gap: 7px; }
            .sk-tier-lab { display: flex; align-items: center; gap: 8px; font-size: 9.5px; font-weight: 900;
                letter-spacing: .16em; text-transform: uppercase; color: #6f7883; }
            .sk-tier-lab i { font-style: normal; font-size: 9px; letter-spacing: .08em; padding: 2px 7px;
                border-radius: 999px; color: #8a939d; border: 1px solid rgba(255,255,255,.14); }
            .sk-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; align-items: start; }

            /* ── NODES ── four states, each unmistakable. */
            .sk-node { border-radius: 14px; overflow: hidden;
                background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.1); }
            .sk-node-btn { display: grid; justify-items: center; gap: 5px; width: 100%; padding: 10px 6px 9px;
                cursor: pointer; background: none; border: 0; }
            .sk-node-art { position: relative; display: grid; place-items: center; width: 54px; height: 54px;
                border-radius: 14px; background: rgba(0,0,0,.34); border: 1px solid rgba(255,255,255,.12); }
            .sk-node-art img { width: 40px; height: 40px; object-fit: contain; }
            .sk-node-tag { position: absolute; bottom: -6px; font-style: normal; font-size: 7.5px; font-weight: 900;
                letter-spacing: .1em; text-transform: uppercase; padding: 1px 5px; border-radius: 999px;
                color: #12101a; background: var(--c); }
            .sk-node-name { font-size: 11px; font-weight: 800; color: #d6dde4; text-align: center; line-height: 1.2; }
            .sk-pips { display: flex; gap: 3px; }
            .sk-pips i { width: 5px; height: 5px; border-radius: 50%; background: rgba(255,255,255,.16); }
            .sk-pips i.is-on { background: var(--c); box-shadow: 0 0 7px -1px var(--c); }

            .sk-node.is-taken { border-color: color-mix(in srgb, var(--c) 55%, transparent);
                background: linear-gradient(160deg, color-mix(in srgb, var(--c) 16%, transparent), rgba(255,255,255,.03) 70%); }
            .sk-node.is-taken .sk-node-art { border-color: color-mix(in srgb, var(--c) 60%, transparent);
                box-shadow: 0 0 16px -5px var(--c); }
            .sk-node.is-taken .sk-node-name { color: #fff; }
            /* Ready: you have a point AND the tier is open. It breathes so your eye goes there. */
            .sk-node.is-ready { border-color: color-mix(in srgb, var(--c) 45%, transparent);
                animation: skReady 1.8s ease-in-out infinite; }
            @keyframes skReady {
                0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--c) 40%, transparent); }
                50% { box-shadow: 0 0 18px -2px color-mix(in srgb, var(--c) 60%, transparent); } }
            .sk-node.is-locked { opacity: .45; }
            .sk-node.is-locked .sk-node-art img { filter: grayscale(1); }

            .sk-node-more { padding: 0 10px 10px; display: grid; gap: 6px; }
            .sk-node-more p { margin: 0; font-size: 10.5px; line-height: 1.4; color: #9aa2ab; }
            .sk-node-next b { color: color-mix(in srgb, var(--c) 70%, white); }
            .sk-node-lock { color: #ffb0b8 !important; }
            .sk-refund { padding: 5px; border-radius: 8px; cursor: pointer; font-size: 9.5px; font-weight: 900;
                color: #ffd0a0; background: rgba(255,160,80,.1); border: 1px solid rgba(255,160,80,.35); }
            .sk-refund:disabled { opacity: .4; cursor: default; }

            /* ── RESPEC ── */
            .sk-respec { display: grid; gap: 7px; padding: 13px; border-radius: 15px;
                background: rgba(0,0,0,.28); border: 1px solid rgba(255,255,255,.09); }
            .sk-up-head { display: flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 900;
                letter-spacing: .14em; text-transform: uppercase; color: #8a939d; }
            .sk-up-head svg { width: 14px; height: 14px; }
            .sk-note { margin: 0; font-size: 10.5px; color: #7f8790; }
            .sk-respec-btn { display: flex; align-items: center; justify-content: space-between; gap: 10px;
                padding: 10px 13px; border-radius: 11px; cursor: pointer; font-size: 12px; font-weight: 800;
                color: #cbd3dc; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.14); }
            .sk-respec-btn u { text-decoration: none; color: #ffd75e; }
            .sk-respec-btn:disabled { opacity: .4; cursor: default; }
            .sk-swap { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
            .sk-swap-btn { display: grid; justify-items: center; gap: 2px; padding: 9px 6px; border-radius: 12px;
                cursor: pointer; background: rgba(255,255,255,.04);
                border: 1px solid color-mix(in srgb, var(--c) 40%, transparent); }
            .sk-swap-btn img { width: 34px; height: 34px; object-fit: contain; }
            .sk-swap-btn b { font-size: 11.5px; color: color-mix(in srgb, var(--c) 72%, white); }
            .sk-swap-btn u { text-decoration: none; font-size: 10px; color: #ffd75e; }
            .sk-swap-btn:disabled { opacity: .4; cursor: default; }
            .sk-confirm { grid-column: 1 / -1; padding: 11px; border-radius: 12px;
                background: rgba(255,111,125,.1); border: 1px solid rgba(255,111,125,.4); }
            .sk-confirm p { margin: 0 0 8px; font-size: 12px; color: #ffd0d6; }
            .sk-confirm div { display: flex; gap: 7px; }
            .sk-danger { flex: 1; padding: 8px; border-radius: 9px; cursor: pointer; font-size: 11.5px;
                font-weight: 900; color: #2a0d10; background: linear-gradient(180deg,#ffc4ca,#ff6f7d); border: 0; }
            .sk-cancel { flex: 1; padding: 8px; border-radius: 9px; cursor: pointer; font-size: 11.5px;
                font-weight: 800; color: #cbd3dc; background: rgba(255,255,255,.06);
                border: 1px solid rgba(255,255,255,.14); }
        `}</style>
    );
}
