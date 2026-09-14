"use client";

// ── THE WHOLE RUN, END TO END ────────────────────────────────────────────────────────────────────────────────
// Open the chart → solve it → thirty seconds of sailing with two named things in the way → beach the boat →
// walk the island → put to sea.
//
// This file is the traffic, not the rules. ChartTable draws the plot, IslandWalk draws the walk, and the
// fights are the SAME ShipBattleScene the fleet and the sea encounters use — an island warden is an
// ENCOUNTERS-shaped foe (island-wardens.js) precisely so there is no second combat screen to build or balance.
//
// TWO ENDPOINTS, DELIBERATELY. Everything about the expedition goes to /sailing/expedition; the volleys go to
// /sailing, because that is where a battle already lives and a fight resumed after a reload has to come back
// through the same door whatever opened it.

import { useCallback, useEffect, useRef, useState } from "react";
import { GiScrollUnfurled, GiSailboat, GiTreasureMap, GiAnchor } from "react-icons/gi";
import ShipBattleScene from "@/components/ShipBattleScene";
import ChartTable from "@/components/ChartTable";
import IslandWalk from "@/components/IslandWalk";

const EXP = "/api/marketplace/sailing/expedition";
const SAIL = "/api/marketplace/sailing";

export default function ExpeditionClient() {
    const [state, setState] = useState(null);
    const [busy, setBusy] = useState(false);
    const [battle, setBattle] = useState(null);
    const [summary, setSummary] = useState(null);
    const [elapsed, setElapsed] = useState(0);
    const rafRef = useRef(0);
    const markingRef = useRef(false);
    const view = state?.expedition || null;

    const post = useCallback(async (action, body = {}) => {
        setBusy(true);
        try {
            const r = await fetch(EXP, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, ...body }),
            });
            const d = await r.json().catch(() => null);
            if (d?.ok) setState(d);
            return d;
        } finally { setBusy(false); }
    }, []);

    const load = useCallback(async () => {
        const r = await fetch(EXP, { cache: "no-store" });
        const d = await r.json().catch(() => null);
        if (d) setState(d);
        return d;
    }, []);

    // A fight left open by a reload has to be handed back, or it is a saved battle nobody can reach.
    const resumeBattle = useCallback(async () => {
        const r = await fetch(SAIL, { cache: "no-store" });
        const d = await r.json().catch(() => null);
        const open = d?.combat?.openBattle;
        if (open) setBattle(open);
        return open;
    }, []);

    // Fetch on mount, guarded — a fight resumed after the component is gone would set state on nothing, and
    // the async IIFE keeps the setState out of the effect body where it causes cascading renders.
    useEffect(() => {
        let alive = true;
        (async () => {
            await load();
            if (alive) await resumeBattle();
        })();
        return () => { alive = false; };
    }, [load, resumeBattle]);

    // ── THE THIRTY SECONDS ───────────────────────────────────────────────────────────────────────────────
    // The server stamped when the boat pushed off and says how far in we already are; this only animates the
    // gap. So locking the phone mid-run and coming back lands you where the clock really is, not where the
    // animation left off.
    useEffect(() => {
        if (view?.phase !== "run" || battle) return undefined;
        const total = view.run?.ms || 30000;
        const base = view.run?.elapsed || 0;
        const t0 = performance.now();
        const tick = () => {
            rafRef.current = requestAnimationFrame(tick);
            setElapsed(Math.min(total, base + (performance.now() - t0)));
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, [view?.phase, view?.run?.ms, view?.run?.elapsed, battle]);

    // Reaching a mark, and reaching the beach. One effect, because they are the same question asked of the
    // same clock and splitting them raced: both fired on the frame the run ended.
    // ⚠️ THE SERVER'S CLOCK IS THE ONE THAT COUNTS, AND IT CAN DISAGREE WITH OURS. reachMark refuses a mark
    // the wall clock has not reached ("not_yet"), and our animation runs off performance.now() — so a phone a
    // second fast would ask, be refused, and ask again on the very next frame, forever. Sixty requests a
    // second is the single most expensive shape this codebase can produce (CLAUDE.md). A refusal backs off.
    const retryRef = useRef(0);
    useEffect(() => {
        if (view?.phase !== "run" || battle || markingRef.current) return;
        if (Date.now() < retryRef.current) return;
        const total = view.run?.ms || 30000;
        const marks = view.run?.marks || [];
        const due = marks.findIndex((m) => !m.done && elapsed >= total * m.at);
        (async () => {
            markingRef.current = true;
            try {
                if (due >= 0) {
                    const d = await post("mark", { k: due });
                    if (d?.fight) await resumeBattle();
                    else if (d?.ok === false) retryRef.current = Date.now() + 600;
                } else if (elapsed >= total && marks.every((m) => m.done)) {
                    const d = await post("ashore");
                    if (d?.ok === false) retryRef.current = Date.now() + 600;
                }
            } finally { markingRef.current = false; }
        })();
    }, [elapsed, view?.phase, view?.run?.marks, view?.run?.ms, battle, post, resumeBattle]);

    const volley = async (aim) => {
        const r = await fetch(SAIL, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "battle_volley", aim }),
        });
        const d = await r.json().catch(() => null);
        if (d?.battle) setBattle(d.battle);
    };
    const reckoning = async () => {
        const r = await fetch(SAIL, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "battle_reckoning" }),
        });
        const d = await r.json().catch(() => null);
        if (d?.battle) setBattle(d.battle);
    };

    // ── THE SCREENS ──────────────────────────────────────────────────────────────────────────────────────
    if (!state) return <div className="ex-wrap"><p className="ex-quiet">Unrolling the chart…</p></div>;

    if (summary) {
        return (
            <div className="ex-wrap">
                <div className="ex-card">
                    <GiAnchor className="ex-bigico" aria-hidden="true" />
                    <h2 className="ex-h">{summary.island?.name}</h2>
                    <p className="ex-band">{summary.band?.name} — {summary.band?.say}</p>
                    <div className="ex-tally">
                        <span><b>{summary.purse}</b> doubloons</span>
                        <span><b>{summary.took}</b> taken</span>
                        {summary.prize ? <span className="ex-prize"><b>{summary.prize.name}</b></span> : <span className="ex-missed">the mark was left standing</span>}
                    </div>
                    <button className="ex-go" onClick={() => { setSummary(null); load(); }}>Back to the harbour</button>
                </div>
                <Style />
            </div>
        );
    }

    // Nothing open. Either there is a chart to spend or there is not.
    if (!state.open) {
        return (
            <div className="ex-wrap">
                <div className="ex-card">
                    <GiTreasureMap className="ex-bigico" aria-hidden="true" />
                    <h2 className="ex-h">{state.charts > 0 ? "A chart, in hand" : "No chart"}</h2>
                    <p className="ex-quiet">
                        {state.charts > 0
                            ? `${state.charts === 1 ? "One chart" : `${state.charts} charts`} — the best one is opened. Somebody was made to say where this is.`
                            : "Beat a fleet ship and take her captain. He will tell you where something is."}
                    </p>
                    {state.charts > 0 ? (
                        <button className="ex-go" disabled={busy} onClick={() => post("open")}>
                            <GiScrollUnfurled aria-hidden="true" /> Open the chart
                        </button>
                    ) : null}
                </div>
                <Style />
            </div>
        );
    }

    return (
        <div className="ex-wrap">
            {view?.phase === "plot" ? (
                <ChartTable chart={view.chart} busy={busy} onCommit={(at) => post("plot", at)} />
            ) : null}

            {view?.phase === "run" && !battle ? (
                <Run view={view} elapsed={elapsed} />
            ) : null}

            {view?.phase === "ashore" ? (
                <IslandWalk view={view} hero={state.hero} busy={busy}
                    onTake={(p) => post("take", p)}
                    onLeave={async () => { const d = await post("leave"); if (d?.summary) setSummary(d.summary); }} />
            ) : null}

            {battle ? (
                <ShipBattleScene battle={battle} busy={busy}
                    onVolley={volley} onReckoning={reckoning}
                    onClose={async () => { setBattle(null); await load(); }} />
            ) : null}
            <Style />
        </div>
    );
}

// ── THE RUN IN ───────────────────────────────────────────────────────────────────────────────────────────────
// Thirty seconds of water with the island growing on the horizon. The marks are drawn on the track ONCE THEY
// ARE BEHIND YOU and never before — a tick showing where the next fight is waiting would tell you on departure
// how much of this run is safe, which is the whole tension gone. Same call the voyage bar already makes.
function Run({ view, elapsed }) {
    const total = view.run?.ms || 30000;
    const p = Math.max(0, Math.min(1, elapsed / total));
    const isle = view.island || {};
    return (
        <div className="ex-run">
            <p className="ex-band">{view.band?.name} — {view.band?.say}</p>
            <div className="ex-sea" style={{ backgroundImage: `url(${isle.art || ""}?v=1)` }}>
                <div className="ex-fog" style={{ opacity: 1 - p * 0.92 }} />
                <div className="ex-boat" style={{ left: `${6 + p * 74}%` }}>
                    <GiSailboat className="ex-boatico" aria-hidden="true" />
                </div>
            </div>
            <div className="ex-track">
                <span className="ex-fill" style={{ width: `${p * 100}%` }} />
                {(view.run?.marks || []).filter((m) => m.done).map((m, i) => (
                    <span key={i} className="ex-mark" style={{ left: `${m.at * 100}%` }} title={m.name} />
                ))}
            </div>
            <p className="ex-quiet">{p < 1 ? "Making for the island." : "Coming alongside."}</p>
        </div>
    );
}

function Style() {
    return (
        <style jsx global>{`
            .ex-wrap { display: flex; flex-direction: column; gap: 14px; max-width: 620px; margin: 0 auto; padding: 14px; }
            .ex-card { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center;
                padding: 22px 18px; border-radius: 14px;
                background: linear-gradient(180deg, rgba(32, 26, 16, 0.92), rgba(18, 15, 10, 0.94));
                border: 1px solid rgba(232, 192, 105, 0.22); }
            .ex-bigico { width: 46px; height: 46px; color: #d9b878; }
            .ex-h { margin: 0; font-size: 1.3rem; color: #f2e4c6; }
            .ex-quiet { margin: 0; color: #b9a986; font-size: 0.88rem; line-height: 1.45; }
            .ex-band { margin: 0; text-align: center; color: #e8c069; font-size: 0.88rem; font-weight: 700; }
            .ex-tally { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; color: #cdbb98; font-size: 0.88rem; }
            .ex-tally b { color: #f2e4c6; }
            .ex-prize { color: #7fe0a8; }
            .ex-missed { color: #9a8f78; font-style: italic; }
            .ex-go { display: inline-flex; align-items: center; gap: 8px; justify-content: center;
                padding: 13px 20px; border-radius: 10px; border: 0; cursor: pointer;
                font-size: 1rem; font-weight: 700; color: #2a1c06;
                background: linear-gradient(180deg, #f0cb79, #d5a445);
                box-shadow: 0 3px 0 #8d6a23, 0 6px 16px rgba(0, 0, 0, 0.4); }
            .ex-go:disabled { opacity: 0.6; cursor: default; }

            .ex-run { display: flex; flex-direction: column; gap: 10px; }
            .ex-sea { position: relative; height: 220px; border-radius: 12px; overflow: hidden;
                background-size: cover; background-position: center; background-color: #16222b;
                box-shadow: inset 0 -30px 50px rgba(0, 0, 0, 0.55); }
            .ex-fog { position: absolute; inset: 0; background: linear-gradient(180deg, #16222b, #0d151b);
                transition: opacity 240ms linear; }
            .ex-boat { position: absolute; bottom: 22px; transform: translateX(-50%); }
            .ex-boatico { width: 50px; height: 50px; color: #f0dfb6; filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.7)); }
            .ex-track { position: relative; height: 8px; border-radius: 999px; overflow: hidden;
                background: rgba(0, 0, 0, 0.45); }
            .ex-fill { position: absolute; left: 0; top: 0; bottom: 0;
                background: linear-gradient(90deg, #8d6a23, #f0cb79); }
            .ex-mark { position: absolute; top: -3px; width: 3px; height: 14px; margin-left: -1.5px;
                border-radius: 2px; background: #d8323c; }
        `}</style>
    );
}
