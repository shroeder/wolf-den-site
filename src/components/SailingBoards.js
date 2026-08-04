"use client";

import { useState } from "react";

// ── THE BOARDS ───────────────────────────────────────────────────────────────────────────────────────────────
// Whose boat is biggest, and who has dug the most out of the sand. Two tabs rather than two stacked lists: they
// are different competitions and nobody reads both at once.
//
// Your own row is highlighted and, if you placed outside the top 25, pinned to the bottom — a leaderboard that
// cannot tell you where YOU are is a wall of other people's names.

const ordinal = (n) => {
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
const medal = (p) => (p === 1 ? "🥇" : p === 2 ? "🥈" : p === 3 ? "🥉" : null);

function Row({ r, children }) {
    return (
        <div className={`sbd-row${r.you ? " is-you" : ""}${r.place <= 3 ? " is-podium" : ""}`}>
            <span className="sbd-place">{medal(r.place) || ordinal(r.place)}</span>
            {r.art ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="sbd-boat" src={r.art} alt="" draggable="false" />
            ) : null}
            <span className="sbd-who">
                {r.who}{r.you ? <b> · you</b> : null}
            </span>
            <span className="sbd-stat">{children}</span>
        </div>
    );
}

export default function SailingBoards({ boards, mePlace }) {
    const [tab, setTab] = useState("fleet");
    const rows = boards?.[tab] || [];
    const mine = mePlace?.[tab] || null;   // set only when the viewer placed outside the visible top

    return (
        <section className="card">
            <div className="sbd-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={tab === "fleet"} className={tab === "fleet" ? "is-on" : ""} onClick={() => setTab("fleet")}>
                    The Fleet
                </button>
                <button type="button" role="tab" aria-selected={tab === "dig"} className={tab === "dig" ? "is-on" : ""} onClick={() => setTab("dig")}>
                    Excavation
                </button>
            </div>

            <p className="sbd-blurb">
                {tab === "fleet"
                    ? "Ranked by boat level — every upgrade across all five tracks. Voyages break a tie."
                    : "Ranked by chest points. A chest is worth more the rarer it is, so a shelf of wooden chests doesn't out-rank a haul of mythics."}
            </p>

            {rows.length === 0 ? (
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                    {tab === "fleet" ? "Nobody has set sail yet." : "Nobody has forged a chest yet — go dig one up."}
                </p>
            ) : (
                <div className="sbd-rows">
                    {rows.map((r) => (
                        <Row key={`${tab}-${r.place}-${r.who}`} r={r}>
                            {tab === "fleet"
                                ? <><b>Lv {r.level}</b><em>{r.voyages} voyage{r.voyages === 1 ? "" : "s"}</em></>
                                : <><b>{r.points} pts</b><em>{r.forged} chest{r.forged === 1 ? "" : "s"}</em></>}
                        </Row>
                    ))}
                    {/* You, if you didn't make the cut. */}
                    {mine ? (
                        <>
                            <div className="sbd-gap" aria-hidden="true">···</div>
                            <Row r={{ ...mine, you: true }}>
                                {tab === "fleet"
                                    ? <><b>Lv {mine.level}</b><em>{mine.voyages} voyage{mine.voyages === 1 ? "" : "s"}</em></>
                                    : <><b>{mine.points} pts</b><em>{mine.forged} chest{mine.forged === 1 ? "" : "s"}</em></>}
                            </Row>
                        </>
                    ) : null}
                </div>
            )}

            <style jsx>{`
                .sbd-tabs { display: flex; gap: 6px; margin-bottom: 10px; }
                .sbd-tabs button { flex: 1 1 0; padding: 9px 8px; border-radius: 11px; cursor: pointer; color: #9aa2ab;
                    font-size: 0.83rem; font-weight: 800; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); }
                .sbd-tabs button.is-on { color: #0d1a22; background: linear-gradient(180deg, #9fe6ff, #55c8ee); border-color: transparent; }
                .sbd-blurb { margin: 0 0 11px; font-size: 0.76rem; line-height: 1.45; color: #8d96a0; }
                .sbd-rows { display: grid; gap: 5px; }
                .sbd-row { display: grid; grid-template-columns: 34px auto 1fr auto; align-items: center; gap: 9px;
                    padding: 7px 10px; border-radius: 11px; background: rgba(255,255,255,0.035);
                    border: 1px solid rgba(255,255,255,0.07); }
                .sbd-row.is-podium { background: rgba(255,215,94,0.08); border-color: rgba(255,215,94,0.28); }
                .sbd-row.is-you { border-color: #55c8ee; background: rgba(85,200,238,0.13); }
                .sbd-place { font-size: 0.82rem; font-weight: 900; color: #cdd3d8; text-align: center; }
                .sbd-boat { width: 30px; height: 30px; object-fit: contain; }
                .sbd-who { min-width: 0; font-size: 0.85rem; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .sbd-who b { color: #55c8ee; font-weight: 800; }
                .sbd-stat { display: flex; flex-direction: column; align-items: flex-end; line-height: 1.15; }
                .sbd-stat b { font-size: 0.85rem; color: #ffe28a; font-variant-numeric: tabular-nums; }
                .sbd-stat em { font-size: 0.66rem; font-style: normal; color: #8d96a0; }
                .sbd-gap { text-align: center; font-size: 0.8rem; color: #59606a; letter-spacing: 0.2em; padding: 1px 0; }
            `}</style>
        </section>
    );
}
