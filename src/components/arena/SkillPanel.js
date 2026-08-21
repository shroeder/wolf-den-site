"use client";

import { useState } from "react";
import { GiSwapBag } from "react-icons/gi";

import { NODE_COST, SKILL_UNLOCK_COST, TREE_POINTS_PER_SKILL_POINT } from "@/lib/marketplace/arena-skills.js";

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
// ── THE DETAIL ───────────────────────────────────────────────────────────────────────────────────────────────
// Docked under the row rather than in a modal: the answer belongs next to the question, and a sheet that
// covers the row scrolls the thing you were comparing off the screen.
//
// ── BRANCHES ARE TABS NOW, NOT COLUMNS ───────────────────────────────────────────────────────────────────────
// Three columns side by side was the honest way to show a three-way choice and it did not survive a phone.
// At 390px each column was 134px, the third sat mostly off-screen behind a scroll nobody discovers, and Luke
// looking at his own build said the plainest possible thing: "not clear this has a 3rd branch."
//
// A tab strip states the count in the one place a member cannot miss — three tabs, all visible, each carrying
// its own depth. And it buys back the width: a rung is now the full card instead of a 134px sliver, which is
// what makes room for the numbers below.
//
// ── AND THE NUMBERS ARE THE POINT ────────────────────────────────────────────────────────────────────────────
// "A markedly bigger shield" invites exactly one question. Every rung prints what it moves and by how much,
// diffed off the resolved skill (see skillDelta) rather than off its raw `mod`, so a capstone that pushes one
// number up while pulling another down shows BOTH — which is the trade the branch is asking you to make.
function Detail({ s, busy, points, onTake, onNode, onRefund, onClose }) {
    const [branch, setBranch] = useState(s.branches[0]?.id || null);
    const b = s.branches.find((x) => x.id === branch) || s.branches[0];
    const stats = statsOf(s.now);

    return (
        <div className="skp-detail">
            <div className="skp-detail-head">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="skp-detail-art" src={s.sprite} alt="" draggable="false" />
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
                    <div className="skp-brs" role="tablist" aria-label="Branches">
                        {s.branches.map((x) => (
                            <button key={x.id} type="button" role="tab" aria-selected={x.id === b.id}
                                className={`skp-br${x.id === b.id ? " is-on" : ""}${x.depth >= x.nodes.length ? " is-full" : ""}`}
                                onClick={() => setBranch(x.id)}>
                                <b>{x.name}</b>
                                <span className="skp-pips" aria-hidden="true">
                                    {x.nodes.map((n) => <i key={n.id} className={n.held ? "is-on" : ""} />)}
                                </span>
                            </button>
                        ))}
                    </div>

                    <p className="skp-br-tag">{b.tag}</p>

                    <ol className="skp-rungs">
                        {b.nodes.map((n, i) => {
                            const cap = i === b.nodes.length - 1;
                            return (
                                <li key={n.id}
                                    className={`skp-rung${n.held ? " is-held" : ""}${n.open ? "" : " is-shut"}${cap ? " is-cap" : ""}`}>
                                    <div className="skp-rung-top">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={n.sprite} alt="" draggable="false" />
                                        <div className="skp-rung-id">
                                            <b>{n.name}</b>
                                            {cap ? <i className="skp-cap-tag">Capstone</i> : null}
                                        </div>
                                        {n.held ? <i className="skp-held">Taken</i> : null}
                                    </div>
                                    <span className="skp-rung-desc">{String(n.desc).replace(/^CAPSTONE\.\s*/, "")}</span>

                                    {/* What it moves, in the units the stat strip above uses. A held rung
                                        prints what it is DOING; an unheld one prints what it would do. */}
                                    {n.delta?.length ? (
                                        <ul className="skp-delta">
                                            {n.delta.map((d) => (
                                                <li key={d.key} className={d.better ? "is-up" : "is-down"}>
                                                    <span>{d.label}</span>
                                                    <em>{d.from}</em>
                                                    <i aria-hidden="true">&rarr;</i>
                                                    <b>{d.to}</b>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : null}

                                    <div className="skp-rung-state">
                                        {n.held ? (
                                            <button type="button" className="skp-undo" disabled={busy}
                                                onClick={() => onRefund(s.id, n.id)}>
                                                {n.refunds > 1 ? `Give back · ${n.refunds} pts` : "Give back"}
                                            </button>
                                        ) : (
                                            <button type="button" className="skp-node-buy"
                                                disabled={busy || !n.canTake}
                                                onClick={() => onNode(s.id, n.id)}>
                                                {n.canTake ? `Take · ${NODE_COST} pt` : n.open ? `${NODE_COST} pt` : "Locked"}
                                            </button>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ol>

                    {/* ── GIVING THE WHOLE THING BACK ──────────────────────────────────────────────────────
                        Its own control, away from the rungs, because it is a different size of decision —
                        and because a member who wants OUT of a skill should not have to give back three
                        rungs one at a time to get there. */}
                    <button type="button" className="skp-drop" disabled={busy} onClick={() => onRefund(s.id, null)}>
                        Give back {s.name} entirely &middot; {s.spent} pt{s.spent === 1 ? "" : "s"}
                    </button>
                </>
            )}
            <p className="skp-foot">
                {points > 0 ? `${num(points)} point${points === 1 ? "" : "s"} to spend` : "No points to spend"}
                {" · "}three free changes a day
            </p>
        </div>
    );
}

export default function SkillPanel({ progress, busy = false, onAct = () => {} }) {
    const [sel, setSel] = useState(null);
    const p = progress || {};
    const skills = p.skills || [];
    const pts = p.skillPoints || { total: 0, spent: 0, available: 0 };
    const points = pts.available || 0;
    const colour = p.cls?.color || "#b061ff";
    const treeSpent = p.points?.spent || 0;
    const chosen = skills.find((s) => s.id === sel) || null;
    const toNext = TREE_POINTS_PER_SKILL_POINT - (treeSpent % TREE_POINTS_PER_SKILL_POINT);
    const onTake = (id) => onAct("take_skill", { skillId: id });
    const onNode = (skillId, nodeId) => onAct("take_skill_node", { skillId, nodeId });
    const onRefund = (skillId, nodeId) => onAct("refund_skill", { skillId, nodeId });

    // A member who has not picked a class has no panel to show — the tree tab asks them to choose first, and
    // two screens asking the same question is one too many.
    if (!p.classId) return null;

    return (
        <div className="skp" style={{ "--c": colour }}>
            <div className="skp-head">
                <div className="skp-head-body">
                    <span className="skp-kick">Skills</span>
                    <b className="skp-title">What you can press in a fight</b>
                    {/* At a rate of one the countdown sentence is nonsense — "1 more tree point for the next"
                        is true on every single beat of the game and tells nobody anything. The rate decides
                        which sentence gets written, rather than the sentence being written for a rate that has
                        since changed underneath it. */}
                    <p className="skp-sub">
                        {TREE_POINTS_PER_SKILL_POINT === 1
                            ? "Every point the tree earns, you earn one here too."
                            : `Every ${TREE_POINTS_PER_SKILL_POINT} points in the tree earns 1 here. ${
                                toNext === TREE_POINTS_PER_SKILL_POINT
                                    ? "The next tree point starts the next one."
                                    : `${toNext} more tree point${toNext === 1 ? "" : "s"} for the next.`}`}
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
                    onTake={onTake} onNode={onNode} onRefund={onRefund} onClose={() => setSel(null)} />
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
                .skp-detail-head { display: grid; grid-template-columns: 46px 1fr auto; gap: 10px; align-items: start; }
                .skp-detail-head > div { min-width: 0; }
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

                /* ── THREE LADDERS ────────────────────────────────────────────────────────────────────
                   Three columns wherever three columns fit, because seeing the ladders side by side is the
                   entire point of the screen — stacking them turns the argument back into the flat list it
                   replaced.
                   Three does not fit a phone, though: 375px leaves about 100px a column once the page and
                   panel padding are out, and a node card cannot be read at 100px. So the row SCROLLS rather
                   than squeezing — a fixed floor per column, two and a bit visible, swipe for the third. The
                   headers stay legible, which is what makes the third one findable rather than hidden. */
                /* ── BRANCH TABS ─────────────────────────────────────────────────────────────────────────
                   Three, always all three on screen, always the same width. The count of branches is the
                   thing this has to communicate before anything else — the previous build put the third one
                   behind a horizontal scroll and the answer to "how many branches are there" became "two,
                   apparently". */
                .skp-brs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
                .skp-br { display: grid; justify-items: center; gap: 5px; padding: 9px 4px 8px; cursor: pointer;
                    border-radius: 12px; background: rgba(0,0,0,.32);
                    border: 1px solid rgba(255,255,255,.09);
                    transition: border-color .16s ease, background .16s ease, transform .12s ease; }
                .skp-br b { font-size: 10.5px; font-weight: 900; line-height: 1.15; text-align: center;
                    color: #9aa2ab; letter-spacing: -.01em; }
                .skp-br.is-on { background: color-mix(in srgb, var(--c) 17%, transparent);
                    border-color: color-mix(in srgb, var(--c) 62%, transparent); }
                .skp-br.is-on b { color: color-mix(in srgb, var(--c) 68%, white); }
                /* A branch you have run to its capstone should read as DONE from the tab, not only from
                   inside it — that is the one state worth being smug about. */
                .skp-br.is-full { border-color: color-mix(in srgb, var(--c) 75%, transparent);
                    box-shadow: 0 0 16px -6px var(--c); }
                @media (hover: hover) { .skp-br:hover { transform: translateY(-1px); } }
                .skp-br-tag { margin: 0; text-align: center; font-size: 10.5px; color: #8b93a0; }

                /* ── THE RUNGS ── full width now that they are not fighting two siblings for it. */
                .skp-rungs { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; }
                .skp-rung { position: relative; padding: 10px; border-radius: 13px;
                    background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); }
                .skp-rung + .skp-rung { margin-top: 13px; }
                /* The spine, lit through what you own. A ladder has to LOOK like one or the ordering rule
                   stays invisible until somebody taps a locked rung and wonders why nothing happened. */
                .skp-rung + .skp-rung::before { content: ""; position: absolute; left: 27px; top: -14px;
                    width: 2px; height: 14px; background: rgba(255,255,255,.14); }
                .skp-rung.is-held + .skp-rung::before { background: var(--c); box-shadow: 0 0 8px var(--c); }
                .skp-rung.is-held { border-color: color-mix(in srgb, var(--c) 50%, transparent);
                    background: linear-gradient(150deg, color-mix(in srgb, var(--c) 15%, transparent), rgba(255,255,255,.03) 70%); }
                .skp-rung.is-shut { opacity: .5; }
                /* A capstone is the thing the branch is FOR, so it gets a frame of its own — dashed while it
                   is still out of reach, solid and lit the moment it is yours. */
                .skp-rung.is-cap { border-style: dashed; border-color: rgba(255,255,255,.2); }
                .skp-rung.is-cap.is-held { border-style: solid;
                    border-color: color-mix(in srgb, var(--c) 85%, transparent);
                    box-shadow: 0 0 26px -8px var(--c), inset 0 0 30px -18px var(--c); }
                .skp-rung-top { display: grid; grid-template-columns: 38px 1fr auto; gap: 9px; align-items: center; }
                .skp-rung-top img { width: 38px; height: 38px; object-fit: contain; }
                .skp-rung:not(.is-held) img { filter: grayscale(.85) brightness(.72); }
                .skp-rung.is-held img { filter: drop-shadow(0 2px 8px color-mix(in srgb, var(--c) 55%, transparent)); }
                .skp-rung-id { min-width: 0; }
                .skp-rung-id b { display: block; font-size: 12.5px; font-weight: 900; color: #e8ecf1; line-height: 1.2; }
                .skp-cap-tag { display: block; margin-top: 2px; font-style: normal; font-size: 8px;
                    font-weight: 900; letter-spacing: .14em; text-transform: uppercase; color: var(--c); }
                .skp-rung-desc { display: block; margin-top: 6px; font-size: 11px; line-height: 1.45; color: #98a0aa; }

                /* ── WHAT IT MOVES ───────────────────────────────────────────────────────────────────────
                   The reason the rung got the full width back. Every row is a real before-and-after off the
                   resolved skill, so a capstone that trades one number for another shows the trade rather
                   than the half of it that sounds good. */
                .skp-delta { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 3px; }
                .skp-delta li { display: grid; grid-template-columns: 1fr auto auto auto; gap: 6px;
                    align-items: baseline; padding: 4px 7px; border-radius: 8px;
                    background: rgba(0,0,0,.3); font-variant-numeric: tabular-nums; }
                .skp-delta span { font-size: 9.5px; text-transform: uppercase; letter-spacing: .06em; color: #8b93a0; }
                .skp-delta em { font-style: normal; font-size: 10.5px; color: #7d858f; }
                .skp-delta i { font-style: normal; font-size: 9px; color: #6f7883; }
                .skp-delta b { font-size: 11px; font-weight: 900; }
                .skp-delta li.is-up b { color: #7ee2a8; }
                .skp-delta li.is-down b { color: #ff9f8a; }

                /* ── GIVING IT BACK ──────────────────────────────────────────────────────────────────────
                   Present on every taken rung rather than hidden behind a mode. A tree you cannot walk back
                   out of is a tree nobody experiments with, which is the whole argument the passive tree's
                   own respec pricing already makes. */
                .skp-undo { padding: 6px 11px; border-radius: 9px; cursor: pointer;
                    font-size: 10px; font-weight: 900; letter-spacing: .06em; text-transform: uppercase;
                    background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.16); color: #a7aeb8; }
                .skp-undo:hover:not(:disabled) { color: #ff9f8a; border-color: rgba(255,159,138,.5); }
                .skp-drop { padding: 9px; border-radius: 11px; cursor: pointer; font-size: 10.5px;
                    font-weight: 900; letter-spacing: .04em;
                    background: rgba(255,255,255,.04); border: 1px dashed rgba(255,255,255,.16); color: #8b93a0; }
                .skp-drop:hover:not(:disabled) { color: #ff9f8a; border-color: rgba(255,159,138,.45); }
                .skp-drop:disabled, .skp-undo:disabled { opacity: .45; cursor: default; }

                .skp-detail-art { width: 46px; height: 46px; object-fit: contain; flex: 0 0 auto;
                    filter: drop-shadow(0 3px 12px color-mix(in srgb, var(--c) 55%, transparent)); }
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
