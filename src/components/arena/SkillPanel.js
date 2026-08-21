"use client";

import { useState } from "react";
import { GiSwapBag } from "react-icons/gi";

import { NODE_COST, SKILL_UNLOCK_COST, TREE_POINTS_PER_SKILL_POINT, skillState } from "@/lib/marketplace/arena-skills.js";

// ── THE SKILL PANEL ──────────────────────────────────────────────────────────────────────────────────────────
// Separate from the passive tree on purpose, and the separation is the point. The tree is thirty-six numbers
// going up; this is the three buttons you will actually press in a fight. Spending in one earns points in the
// other — every three points in the tree buys one here — so the two screens are one decision seen twice.
//
// THE STATES, and they are the whole UI:
//
//   LOCKED     you have never bought it. One point takes it, at full strength, with no prerequisite.
//   OWNED      it is on your deck. Its five nodes are now buyable, in any order.
//   DEEP       nodes taken. The card prints what they changed rather than what they promised.
//
// A node card shows NOW and NEXT off resolveSkill — the same function the ring swings with — so the number on
// the screen is the number in the bout. The passive tree learned this the hard way: fifteen of its nodes were
// computed for the defender and dropped on the floor, and every one of them had a card promising otherwise.
//
// Tapping SELECTS. Nothing here spends on a single tap, because a point costs gold to take back and the last
// thing this screen should do is buy a node on a mis-tap.

const num = (n) => Number(n || 0).toLocaleString();

// ── WHAT A SKILL IS, IN NUMBERS ──────────────────────────────────────────────────────────────────────────────
// Built from the resolved skill rather than typed beside it. A card that lists "Cooldown 3" next to a skill
// whose nodes took it to 1 is the copied-constant bug wearing a stat line.
function statsOf(s) {
    const out = [];
    out.push(["Power", s.power > 0 ? `${s.power.toFixed(2)}x` : "no blow"]);
    if (s.hits > 0) out.push(["Blows", String(s.hits)]);
    out.push(["Cooldown", s.cooldown === 0 ? "every beat" : `${s.cooldown} beats`]);
    const p = (v) => `${Math.round(v * 100)}%`;
    if (s.bleed > 0) out.push(["Wound", "always"]);
    if (s.burn > 0) out.push(["Burn", "always"]);
    if (s.freeze > 0) out.push(["Freeze", `${s.freeze} beat${s.freeze > 1 ? "s" : ""}`]);
    if (s.chill > 0) out.push(["Chill", p(s.chill)]);
    if (s.shield > 0) out.push(["Shield", p(s.shield)]);
    if (s.heal > 0) out.push(["Heal", p(s.heal)]);
    if (s.drain > 0) out.push(["Drain", p(s.drain)]);
    if (s.pierce > 0) out.push(["Pierce", p(s.pierce)]);
    if (s.soulfire > 0) out.push(["Soulfire", p(s.soulfire)]);
    if (s.grudge > 0) out.push(["Grudge", p(s.grudge)]);
    if (s.executeAt > 0) out.push(["Execute", `<${p(s.executeAt)}`]);
    if (s.thorns > 0) out.push(["Thorns", p(s.thorns)]);
    // The over-time numbers matter MORE than the ones above once a branch is invested in — Hemorrhage's whole
    // payoff is here, and leaving them off meant the strip said "Power 1.60x" for a build whose damage does not
    // come from the blow at all.
    if (s.bleedDamage > 0) out.push(["Wound tick", `+${p(s.bleedDamage)}`]);
    if (s.bleedLeech > 0) out.push(["Wound leech", p(s.bleedLeech)]);
    if (s.burnDamage > 0) out.push(["Burn tick", `+${p(s.burnDamage)}`]);
    if (s.burnLeech > 0) out.push(["Burn leech", p(s.burnLeech)]);
    if (s.keepGrudge > 0) out.push(["Ledger kept", p(s.keepGrudge)]);
    if (s.cleanse) out.push(["Cleanse", "wound, burn"]);
    if (s.haste > 0) out.push(["Haste", "5 swings"]);
    if (s.free) out.push(["Costs", "no beat"]);
    return out;
}

function Skill({ s, selected, onPick, busy }) {
    const state = s.unlocked ? "owned" : s.canUnlock ? "ready" : "locked";
    return (
        <button type="button" disabled={busy} onClick={() => onPick(s.id)}
            className={`skp-card is-${state}${selected ? " is-sel" : ""}`}
            aria-pressed={selected}
            aria-label={`${s.name}${s.unlocked ? ", owned" : ", locked"}`}>
            <span className="skp-art">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.sprite} alt="" draggable="false" />
            </span>
            <b className="skp-name">{s.name}</b>
            {s.unlocked
                ? (
                    <span className="skp-pips" aria-hidden="true">
                        {s.nodes.map((n) => <i key={n.id} className={n.held ? "is-on" : ""} />)}
                    </span>
                )
                : <em className="skp-cost">{SKILL_UNLOCK_COST} pt</em>}
        </button>
    );
}

// ── THE DETAIL ───────────────────────────────────────────────────────────────────────────────────────────────
// Docked under the row rather than in a modal, for the reason the tree's is: the answer belongs next to the
// question, and a sheet that covers the row scrolls the thing you were comparing off the screen.
function Detail({ s, busy, points, onTake, onNode, onClose }) {
    const stats = statsOf(s.now);
    return (
        <div className="skp-detail">
            <div className="skp-detail-head">
                <div>
                    <b>{s.name}</b>
                    <p>{s.blurb}</p>
                </div>
                <button type="button" className="skp-x" onClick={onClose} aria-label="Close">&times;</button>
            </div>

            <dl className="skp-stats">
                {stats.map(([k, v]) => (
                    <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
                ))}
            </dl>

            {!s.unlocked ? (
                <button type="button" className="skp-buy" disabled={busy || !s.canUnlock} onClick={() => onTake(s.id)}>
                    {s.canUnlock ? `Unlock for ${SKILL_UNLOCK_COST} point` : `Needs ${SKILL_UNLOCK_COST} skill point`}
                </button>
            ) : (
                <>
                    <div className="skp-nodes-lab">
                        <span>Two branches</span>
                        <em>{NODE_COST} point a rung &middot; top down</em>
                    </div>
                    {/* ── TWO LADDERS, SIDE BY SIDE ────────────────────────────────────────────────────────
                        Drawn as columns rather than one list, because the shape IS the decision: a member has
                        to see that the points they spend on the left are points that never reach the capstone
                        on the right. A flat list of six hides exactly that, which is what the first build of
                        this screen did. */}
                    <div className="skp-branches">
                        {s.branches.map((b) => (
                            <div key={b.id} className={`skp-branch${b.depth >= b.nodes.length ? " is-full" : ""}`}>
                                <div className="skp-branch-head">
                                    <b>{b.name}</b>
                                    <span>{b.tag}</span>
                                    <i aria-hidden="true">{b.depth}/{b.nodes.length}</i>
                                </div>
                                <ol className="skp-rungs">
                                    {b.nodes.map((n, i) => (
                                        <li key={n.id}
                                            className={`skp-rung${n.held ? " is-held" : ""}${n.open ? "" : " is-shut"}${i === b.nodes.length - 1 ? " is-cap" : ""}`}>
                                            <div className="skp-rung-top">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={n.sprite} alt="" draggable="false" />
                                                <div className="skp-rung-id">
                                                    <b>{n.name}</b>
                                                    {i === b.nodes.length - 1 ? <i className="skp-cap-tag">Capstone</i> : null}
                                                </div>
                                            </div>
                                            <span className="skp-rung-desc">{n.desc}</span>
                                            {/* ── THE STATE GETS ITS OWN LINE ──────────────────────────────
                                                It sat beside the name, which works right up until the column
                                                is 165px wide — on a phone the name wrapped straight underneath
                                                the button and the two printed on top of each other
                                                ("DeeperTAKEN"). There is no breakpoint that fixes it either:
                                                three classes across a desktop gives columns barely wider than
                                                the phone does. So it is always its own row. */}
                                            <div className="skp-rung-state">
                                                {n.held
                                                    ? <i className="skp-held">Taken</i>
                                                    : (
                                                        <button type="button" className="skp-node-buy"
                                                            disabled={busy || !n.canTake}
                                                            onClick={() => onNode(s.id, n.id)}>
                                                            {n.canTake ? "Take" : n.open ? `${NODE_COST} pt` : "Locked"}
                                                        </button>
                                                    )}
                                            </div>
                                        </li>
                                    ))}
                                </ol>
                            </div>
                        ))}
                    </div>
                </>
            )}
            <p className="skp-foot">
                {points > 0 ? `${num(points)} point${points === 1 ? "" : "s"} to spend` : "No points to spend"}
            </p>
        </div>
    );
}

export default function SkillPanel({ classId, taken = {}, points = 0, treeSpent = 0, colour = "#b061ff",
    busy = false, onTake = () => {}, onNode = () => {} }) {
    const [sel, setSel] = useState(null);
    const skills = skillState(classId, taken, points);
    const chosen = skills.find((s) => s.id === sel) || null;
    const toNext = TREE_POINTS_PER_SKILL_POINT - (treeSpent % TREE_POINTS_PER_SKILL_POINT);

    return (
        <div className="skp" style={{ "--c": colour }}>
            <div className="skp-head">
                <div className="skp-head-body">
                    <span className="skp-kick">Skills</span>
                    <b className="skp-title">What you can press in a fight</b>
                    <p className="skp-sub">
                        Every {TREE_POINTS_PER_SKILL_POINT} points in the tree earns 1 here.
                        {" "}{toNext === TREE_POINTS_PER_SKILL_POINT
                            ? "The next tree point starts the next one."
                            : `${toNext} more tree point${toNext === 1 ? "" : "s"} for the next.`}
                    </p>
                </div>
                <div className={`skp-points${points > 0 ? " is-live" : ""}`}>
                    <b>{num(points)}</b>
                    <em>points</em>
                </div>
            </div>

            <div className="skp-row">
                {skills.map((s) => (
                    <Skill key={s.id} s={s} busy={busy} selected={sel === s.id}
                        onPick={(id) => setSel((cur) => (cur === id ? null : id))} />
                ))}
            </div>

            {chosen ? (
                <Detail s={chosen} busy={busy} points={points}
                    onTake={onTake} onNode={onNode} onClose={() => setSel(null)} />
            ) : (
                <p className="skp-hint">
                    <GiSwapBag aria-hidden="true" /> Tap a skill to read what it does and what its nodes change.
                </p>
            )}

            <style jsx global>{`
                .skp { display: grid; gap: 12px; }
                .skp-kick { font-size: 9.5px; font-weight: 900; letter-spacing: .18em; text-transform: uppercase; color: #8a939d; }
                .skp-title { display: block; font-size: 1.2rem; font-weight: 900; line-height: 1.1;
                    color: color-mix(in srgb, var(--c) 72%, white);
                    text-shadow: 0 0 28px color-mix(in srgb, var(--c) 40%, transparent); }
                .skp-sub { margin: 5px 0 0; font-size: 11.5px; line-height: 1.5; color: #9aa2ab; }

                .skp-head { display: flex; align-items: center; gap: 13px; padding: 14px; border-radius: 17px;
                    background: linear-gradient(145deg, color-mix(in srgb, var(--c) 20%, transparent), rgba(255,255,255,.02) 66%), rgba(10,8,14,.5);
                    border: 1px solid color-mix(in srgb, var(--c) 44%, transparent); }
                .skp-head-body { flex: 1; min-width: 0; }
                .skp-points { flex: 0 0 auto; display: grid; place-items: center; min-width: 56px; padding: 8px 6px;
                    border-radius: 13px; background: rgba(0,0,0,.36); border: 1px solid rgba(255,255,255,.12); }
                .skp-points b { font-size: 1.5rem; font-weight: 900; color: #6f7883; line-height: 1; }
                .skp-points em { font-style: normal; font-size: 8.5px; letter-spacing: .1em; text-transform: uppercase; color: #6f7883; }
                .skp-points.is-live { border-color: var(--c); box-shadow: 0 0 20px -4px var(--c); }
                .skp-points.is-live b { color: color-mix(in srgb, var(--c) 78%, white); }
                .skp-points.is-live em { color: color-mix(in srgb, var(--c) 60%, white); }

                /* ── THE THREE ── one row, always three columns, even on the narrowest phone. Stacking them
                   would lose the only thing the row is for: seeing your whole deck at once. */
                .skp-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
                .skp-card { position: relative; display: grid; justify-items: center; gap: 5px; cursor: pointer;
                    padding: 11px 6px 9px; border-radius: 15px; text-align: center;
                    background: rgba(10,8,14,.5); border: 1px solid rgba(255,255,255,.09);
                    transition: transform .12s ease, box-shadow .2s ease, border-color .2s ease; }
                .skp-card.is-owned { border-color: color-mix(in srgb, var(--c) 52%, transparent);
                    background: linear-gradient(160deg, color-mix(in srgb, var(--c) 18%, transparent), rgba(255,255,255,.02) 70%), rgba(10,8,14,.5); }
                /* A point you can spend has to be impossible to miss — the same rule the tree's nodes follow. */
                .skp-card.is-ready { border-color: color-mix(in srgb, var(--c) 62%, transparent);
                    animation: skp-breathe 2.4s ease-in-out infinite; }
                .skp-card.is-locked { opacity: .62; }
                .skp-card.is-sel { border-color: var(--c); box-shadow: 0 0 24px -6px var(--c); }
                @media (hover: hover) { .skp-card:hover { transform: translateY(-2px); } }
                @keyframes skp-breathe {
                    0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--c) 40%, transparent); }
                    50% { box-shadow: 0 0 18px -2px color-mix(in srgb, var(--c) 62%, transparent); }
                }
                .skp-art { display: grid; place-items: center; width: 100%; }
                .skp-art img { width: 52px; height: 52px; object-fit: contain;
                    filter: drop-shadow(0 4px 12px color-mix(in srgb, var(--c) 50%, transparent)); }
                .skp-card.is-locked .skp-art img { filter: grayscale(1) brightness(.7); }
                .skp-name { font-size: 12px; font-weight: 900; line-height: 1.15;
                    color: color-mix(in srgb, var(--c) 66%, white); }
                .skp-card.is-locked .skp-name { color: #7d858f; }
                .skp-cost { font-style: normal; font-size: 9px; font-weight: 900; letter-spacing: .1em;
                    text-transform: uppercase; color: #7d858f; }
                .skp-pips { display: flex; gap: 3px; }
                .skp-pips i { width: 6px; height: 6px; border-radius: 999px; background: rgba(255,255,255,.16); }
                .skp-pips i.is-on { background: var(--c); box-shadow: 0 0 7px var(--c); }

                /* ── DETAIL ── */
                .skp-detail { display: grid; gap: 11px; padding: 13px; border-radius: 17px;
                    background: radial-gradient(120% 80% at 50% -10%, color-mix(in srgb, var(--c) 12%, transparent), transparent 62%), rgba(0,0,0,.34);
                    border: 1px solid color-mix(in srgb, var(--c) 34%, transparent); }
                .skp-detail-head { display: flex; align-items: flex-start; gap: 10px; }
                .skp-detail-head > div { flex: 1; min-width: 0; }
                .skp-detail-head b { font-size: 1.05rem; font-weight: 900;
                    color: color-mix(in srgb, var(--c) 72%, white); }
                .skp-detail-head p { margin: 4px 0 0; font-size: 11.5px; line-height: 1.5; color: #9aa2ab; }
                .skp-x { flex: 0 0 auto; width: 28px; height: 28px; border-radius: 9px; cursor: pointer;
                    background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12);
                    color: #b8c0c9; font-size: 17px; line-height: 1; }

                .skp-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(78px, 1fr)); gap: 4px; margin: 0; }
                .skp-stats > div { display: grid; gap: 1px; text-align: center; padding: 5px 3px; border-radius: 9px;
                    background: rgba(255,255,255,.05); }
                .skp-stats dt { font-size: .56rem; text-transform: uppercase; letter-spacing: .05em; color: #8b93a0; }
                .skp-stats dd { margin: 0; font-size: .84rem; font-weight: 900; color: var(--c);
                    font-variant-numeric: tabular-nums; }

                .skp-buy { padding: 11px; border-radius: 13px; cursor: pointer; font-size: 12.5px; font-weight: 900;
                    letter-spacing: .04em; text-transform: uppercase;
                    background: color-mix(in srgb, var(--c) 26%, transparent);
                    border: 1px solid color-mix(in srgb, var(--c) 62%, transparent);
                    color: color-mix(in srgb, var(--c) 40%, white); }
                .skp-buy:disabled { opacity: .45; cursor: default; background: rgba(255,255,255,.05);
                    border-color: rgba(255,255,255,.12); color: #7d858f; }

                .skp-nodes-lab { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
                .skp-nodes-lab span { font-size: 9.5px; font-weight: 900; letter-spacing: .15em;
                    text-transform: uppercase; color: #9aa2ab; }
                .skp-nodes-lab em { font-style: normal; font-size: 9.5px; color: #7d858f; }

                /* Two columns even on a phone: seeing both ladders at once is the entire point of the
                   screen, and stacking them turns the fork back into the flat list it replaced. */
                .skp-branches { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
                .skp-branch { display: grid; gap: 5px; padding: 8px 7px 9px; border-radius: 13px;
                    background: rgba(0,0,0,.3); border: 1px solid rgba(255,255,255,.07); align-content: start; }
                .skp-branch.is-full { border-color: color-mix(in srgb, var(--c) 55%, transparent);
                    box-shadow: inset 0 0 22px -10px var(--c); }
                .skp-branch-head { display: grid; gap: 1px; padding: 0 2px 3px; position: relative; }
                .skp-branch-head b { font-size: 11.5px; font-weight: 900; letter-spacing: .04em;
                    color: color-mix(in srgb, var(--c) 66%, white); padding-right: 26px; }
                .skp-branch-head span { font-size: 9.5px; line-height: 1.35; color: #838b96; }
                .skp-branch-head i { position: absolute; top: 0; right: 2px; font-style: normal;
                    font-size: 9px; font-weight: 900; color: #6f7883; font-variant-numeric: tabular-nums; }

                /* The spine. A ladder has to LOOK like one, or the ordering rule stays invisible until a
                   member taps a locked rung and wonders why nothing happened. */
                .skp-rungs { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; }
                .skp-rung { position: relative; padding: 7px 6px; border-radius: 10px;
                    background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.07); }
                .skp-rung + .skp-rung { margin-top: 11px; }
                .skp-rung + .skp-rung::before { content: ""; position: absolute; left: 21px; top: -12px;
                    width: 2px; height: 12px; background: rgba(255,255,255,.14); }
                .skp-rung.is-held + .skp-rung::before { background: var(--c); }
                .skp-rung.is-held { border-color: color-mix(in srgb, var(--c) 48%, transparent);
                    background: color-mix(in srgb, var(--c) 12%, transparent); }
                .skp-rung.is-shut { opacity: .45; }
                .skp-rung.is-cap { border-style: dashed; }
                .skp-rung.is-cap.is-held { border-style: solid; }
                .skp-rung-top { display: grid; grid-template-columns: 30px 1fr; gap: 7px; align-items: center; }
                .skp-rung-state { display: flex; justify-content: flex-end; margin-top: 6px; }
                .skp-rung-top img { width: 30px; height: 30px; object-fit: contain; }
                .skp-rung:not(.is-held) img { filter: grayscale(1) brightness(.72); }
                .skp-rung-id { min-width: 0; }
                .skp-rung-id b { display: block; font-size: 11px; font-weight: 900; color: #dfe4ea; line-height: 1.2;
                    overflow-wrap: anywhere; }
                .skp-cap-tag { display: block; margin-top: 1px; font-style: normal; font-size: 8px;
                    font-weight: 900; letter-spacing: .12em; text-transform: uppercase; color: var(--c); }
                .skp-rung-desc { display: block; margin-top: 5px; font-size: 10px; line-height: 1.4; color: #98a0aa; }
                .skp-node-buy { flex: 0 0 auto; padding: 6px 10px; border-radius: 9px; cursor: pointer;
                    font-size: 10px; font-weight: 900; letter-spacing: .06em; text-transform: uppercase;
                    background: color-mix(in srgb, var(--c) 24%, transparent);
                    border: 1px solid color-mix(in srgb, var(--c) 55%, transparent);
                    color: color-mix(in srgb, var(--c) 38%, white); }
                .skp-node-buy:disabled { opacity: .4; cursor: default; background: rgba(255,255,255,.05);
                    border-color: rgba(255,255,255,.1); color: #7d858f; }
                .skp-held { flex: 0 0 auto; font-style: normal; font-size: 9px; font-weight: 900;
                    letter-spacing: .1em; text-transform: uppercase; color: var(--c); }

                .skp-foot { margin: 0; font-size: 10px; text-align: center; color: #7d858f; }
                .skp-hint { display: flex; align-items: center; justify-content: center; gap: 7px; margin: 0;
                    padding: 13px; border-radius: 15px; font-size: 11.5px; color: #8b93a0;
                    background: rgba(0,0,0,.28); border: 1px dashed rgba(255,255,255,.1); }
                .skp-hint svg { color: var(--c); font-size: 15px; }

                @media (prefers-reduced-motion: reduce) {
                    .skp-card { transition: none; }
                }
            `}</style>
        </div>
    );
}
