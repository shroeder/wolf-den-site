"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── THE BOARD ───────────────────────────────────────────────────────────────────────────────────────────
// Luke: "Make it awesome and dopamine inducing."
//
// Four things carry that, and none of them is the ranking:
//
//   THE PODIUM lands one at a time, third then second then first, each with a thump. A list that appears all
//   at once has no winner in it; a podium that arrives in reverse order has three.
//   THE NUMBERS COUNT UP rather than appearing. A number that climbs is a number you watch.
//   THE GAP is the only line on the screen you can act on — "4,210 behind Jrobert" is one good night, and it
//   is deliberately the largest thing under the podium.
//   THE WEEK COLUMN shows who is MOVING. A board where the same name has led since August is a monument; one
//   that shows the climb is a race, and the person in ninth who won more than the leader did this week gets
//   to see that.
//
// ⚠️ AND YOUR OWN ROW IS ALWAYS ON IT, pinned to the bottom when you have not placed. There is no version of
// this screen that does not contain the person looking at it.

const n = (v) => Number(v || 0).toLocaleString();
const MEDAL = ["#ffd04a", "#d8dde6", "#d08a4a"];

/** A number that climbs to its value. Cheap: one rAF chain per figure, and it stops dead when it arrives. */
function Count({ to, ms = 900 }) {
    const [v, setV] = useState(0);
    const ref = useRef(0);
    useEffect(() => {
        const from = ref.current;
        const t0 = performance.now();
        let raf = 0;
        const tick = (t) => {
            const k = Math.min(1, (t - t0) / ms);
            // Ease out — fast at the start, lingering at the end, which is where the eye is.
            const e = 1 - (1 - k) ** 3;
            setV(Math.round(from + (to - from) * e));
            if (k < 1) raf = requestAnimationFrame(tick); else ref.current = to;
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [to, ms]);
    return <>{n(v)}</>;
}

export default function Leaderboard({ onClose }) {
    const [st, setSt] = useState(null);
    // How many podium places have landed. Drives the reverse-order arrival.
    const [shown, setShown] = useState(0);

    const load = useCallback(async () => {
        const r = await fetch("/api/marketplace/casino", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "leaderboard" }),
        }).then((x) => x.json()).catch(() => null);
        if (r?.ok) setSt(r);
    }, []);

    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount (setState is post-await)
    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!st) return undefined;
        // Third, second, first — 420ms apart, which is slow enough to be three events rather than one.
        const t = [0, 1, 2].map((i) => setTimeout(() => setShown((s) => Math.max(s, i + 1)), 160 + i * 420));
        return () => t.forEach(clearTimeout);
    }, [st]);

    const top = st?.top || [];
    const podium = top.slice(0, 3);
    const rest = top.slice(3);
    // Third, first, second — so first stands in the middle and tallest, the way a podium is.
    const order = [1, 0, 2];

    return (
        <div className="lb" role="dialog" aria-label="Lifetime winnings">
            <div className="lb-head">
                <b>The Board</b>
                <span className="lb-sub">Most won at this casino, all time</span>
                <button type="button" className="lb-x" onClick={onClose} aria-label="Step away">✕</button>
            </div>

            {!st ? <p className="lb-wait">Reading the slate…</p> : null}

            {podium.length ? (
                <div className="lb-podium">
                    {order.map((slot) => {
                        const p = podium[slot];
                        if (!p) return <span key={slot} />;
                        const landed = shown > (2 - slot);
                        return (
                            <div key={p.id} className={`lb-step p${slot + 1}${landed ? " is-in" : ""}${p.you ? " is-you" : ""}`}
                                style={{ "--m": MEDAL[slot] }}>
                                <span className="lb-face">
                                    {p.sprite ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={p.sprite} alt="" draggable={false} />
                                    ) : <i>{p.name.slice(0, 1)}</i>}
                                    <em className="lb-medal">{slot + 1}</em>
                                </span>
                                <b className="lb-name">{p.name}</b>
                                <span className="lb-won">{landed ? <Count to={p.won} /> : "0"}</span>
                                {p.week > 0 ? <i className="lb-week">+{n(p.week)} this week</i> : null}
                            </div>
                        );
                    })}
                </div>
            ) : null}

            {/* ── THE LINE YOU CAN ACT ON ──────────────────────────────────────────────────────────────
                Deliberately the biggest thing that is not the podium. "You are 9th" is a fact; "4,210 behind
                Jrobert" is a plan. */}
            {st?.rank ? (
                <div className={`lb-you${st.gap == null ? " is-top" : ""}`}>
                    {st.gap == null ? (
                        <><b>You are top of the board.</b><i>Nobody has won more here than you.</i></>
                    ) : (
                        <>
                            <span className="lb-you-rank">#{st.rank}<em>of {st.of}</em></span>
                            <span className="lb-you-gap">
                                <b><Count to={st.gap} /></b>
                                <i>behind {st.chasing}</i>
                            </span>
                        </>
                    )}
                </div>
            ) : null}

            {rest.length ? (
                <div className="lb-list">
                    {rest.map((r) => (
                        <div key={r.id} className={`lb-row${r.you ? " is-you" : ""}`}>
                            <span className="lb-rank">{r.rank}</span>
                            <span className="lb-pic">
                                {r.sprite ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={r.sprite} alt="" draggable={false} />
                                ) : null}
                            </span>
                            <span className="lb-row-name">{r.name}</span>
                            {r.week > 0 ? <span className="lb-row-week">+{n(r.week)}</span> : <span />}
                            <span className="lb-row-won">{n(r.won)}</span>
                        </div>
                    ))}
                    {/* Pinned, when they did not place. The separator says "there is a gap here" without
                        pretending the rows in between do not exist. */}
                    {st?.me ? (
                        <>
                            <span className="lb-gapline" aria-hidden="true">· · ·</span>
                            <div className="lb-row is-you">
                                <span className="lb-rank">{st.me.rank}</span>
                                <span className="lb-pic">
                                    {st.me.sprite ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={st.me.sprite} alt="" draggable={false} />
                                    ) : null}
                                </span>
                                <span className="lb-row-name">{st.me.name}</span>
                                {st.me.week > 0 ? <span className="lb-row-week">+{n(st.me.week)}</span> : <span />}
                                <span className="lb-row-won">{n(st.me.won)}</span>
                            </div>
                        </>
                    ) : null}
                </div>
            ) : null}

            {/* And the board and the Counter are the same conversation, so it says what the climb buys. */}
            {st?.toRung ? (
                <p className="lb-foot">{n(st.toRung)} more and the Counter owes you something.</p>
            ) : null}
            <style>{CSS}</style>
        </div>
    );
}

const CSS = `
.lb { display: flex; flex-direction: column; gap: 10px; color: #f0e6d6; }
.lb-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.lb-head b { font-size: 1.02rem; color: #ffd98a; }
.lb-sub { flex: 1; font-size: 0.74rem; color: #9b9080; }
.lb-x { width: 28px; height: 28px; border-radius: 999px; background: rgba(255,255,255,0.08); border: none;
    color: #e8e2d6; font-size: 14px; cursor: pointer; }
.lb-wait { margin: 18px 0; text-align: center; font-size: 0.86rem; color: #9b9080; font-style: italic; }

/* ── THE PODIUM ───────────────────────────────────────────────────────────────────────────────────────
   Three columns, bottom-aligned, with first taller than the other two — the shape IS the ranking, so it
   reads before any number does. */
.lb-podium { display: grid; grid-template-columns: 1fr 1.18fr 1fr; align-items: end; gap: 7px;
    padding: 12px 6px 10px; border-radius: 14px;
    background: radial-gradient(ellipse at 50% 120%, rgba(255,190,80,0.15), transparent 70%); }
.lb-step { display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center;
    opacity: 0; transform: translateY(16px); }
/* Each place drops in and settles, with a little overshoot. The stagger is in JS because the three have to
   land in REVERSE order and CSS cannot know which is which. */
.lb-step.is-in { animation: lbDrop .5s cubic-bezier(.2,1.4,.4,1) both; }
@keyframes lbDrop { from { opacity: 0; transform: translateY(18px) scale(.92); } to { opacity: 1; transform: none; } }
.lb-face { position: relative; display: grid; place-items: center; width: 62px; height: 62px; border-radius: 50%;
    background: radial-gradient(circle at 50% 35%, rgba(255,255,255,0.12), rgba(0,0,0,0.35));
    border: 2px solid var(--m); box-shadow: 0 0 16px color-mix(in srgb, var(--m) 55%, transparent); }
/* ⚠️ FIRST PLACE IS LIFTED, NOT JUST BIGGER. With the three columns bottom-aligned, a taller avatar pushes
   the winner's NAME AND NUMBER DOWN — filmed, second place's figure sat a clear 20px above first place's,
   which is the one thing a podium must never do. The lift is what makes it a step. */
.lb-step.p1 { transform: translateY(-14px); }
.lb-step.p1.is-in { animation-name: lbDropTop; }
@keyframes lbDropTop { from { opacity: 0; transform: translateY(4px) scale(.92); } to { opacity: 1; transform: translateY(-14px); } }
.lb-step.p1 .lb-face { width: 78px; height: 78px; }
.lb-face img { width: 86%; height: 86%; object-fit: contain; border-radius: 50%; }
.lb-face i { font-style: normal; font-size: 1.5rem; font-weight: 900; color: var(--m); }
.lb-medal { position: absolute; bottom: -5px; display: grid; place-items: center; width: 21px; height: 21px;
    border-radius: 50%; background: var(--m); color: #221706; font-size: 11px; font-weight: 900;
    font-style: normal; border: 2px solid #1b1430; }
.lb-name { font-size: 0.8rem; color: #fff; max-width: 10ch; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap; }
.lb-step.p1 .lb-name { font-size: 0.9rem; max-width: 13ch; }
.lb-won { font-size: 0.88rem; font-weight: 900; color: var(--m); font-variant-numeric: tabular-nums; }
.lb-step.p1 .lb-won { font-size: 1.08rem; }
.lb-week { font-size: 0.64rem; font-style: normal; color: #7ee0a8; font-weight: 800; }
.lb-step.is-you .lb-name { color: #ffe488; }

/* ── THE ONE ACTIONABLE LINE ─────────────────────────────────────────────────────────────────────── */
.lb-you { display: flex; align-items: center; gap: 12px; padding: 11px 14px; border-radius: 13px;
    background: linear-gradient(180deg, rgba(255,190,80,0.14), rgba(255,140,30,0.05));
    border: 1px solid rgba(255,190,80,0.32); }
.lb-you.is-top { justify-content: center; flex-direction: column; gap: 2px; text-align: center; }
.lb-you.is-top b { font-size: 0.98rem; color: #ffd98a; }
.lb-you.is-top i { font-size: 0.78rem; font-style: normal; color: #c9bda9; }
.lb-you-rank { display: flex; flex-direction: column; font-size: 1.3rem; font-weight: 900; color: #ffd98a;
    line-height: 1; font-variant-numeric: tabular-nums; }
.lb-you-rank em { font-style: normal; font-size: 0.6rem; font-weight: 700; color: #9b9080; letter-spacing: .06em; }
.lb-you-gap { display: flex; flex-direction: column; }
.lb-you-gap b { font-size: 1.22rem; font-weight: 900; color: #fff; line-height: 1.1;
    font-variant-numeric: tabular-nums; }
.lb-you-gap i { font-size: 0.76rem; font-style: normal; color: #c9bda9; }

.lb-list { display: flex; flex-direction: column; gap: 3px; }
.lb-row { display: grid; grid-template-columns: 24px 26px 1fr auto auto; align-items: center; gap: 8px;
    padding: 6px 10px; border-radius: 8px; background: rgba(255,255,255,0.03); }
.lb-row.is-you { background: rgba(255,207,106,0.12); border: 1px solid rgba(255,207,106,0.4); }
.lb-rank { font-size: 0.76rem; font-weight: 900; color: #8b8273; font-variant-numeric: tabular-nums; }
.lb-pic { width: 26px; height: 26px; border-radius: 50%; overflow: hidden; background: rgba(0,0,0,0.3); }
.lb-pic img { width: 100%; height: 100%; object-fit: contain; }
.lb-row-name { font-size: 0.84rem; color: #e8dcc8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lb-row-week { font-size: 0.68rem; font-weight: 800; color: #7ee0a8; font-variant-numeric: tabular-nums; }
.lb-row-won { font-size: 0.84rem; font-weight: 800; color: #ffd98a; font-variant-numeric: tabular-nums; }
.lb-gapline { text-align: center; color: #5d5648; letter-spacing: .4em; font-size: 0.7rem; padding: 2px 0; }
.lb-foot { margin: 2px 0 0; text-align: center; font-size: 0.78rem; color: #c9a86a; }
`;
