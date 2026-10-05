"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// ── THE COUNTER IS A LADDER ──────────────────────────────────────────────────────────────────────────────
// Luke: "Unlocking things in the casino and vip is going to be based on total amount of gold won lifetime at
// the casino... they are just claimable noe if youve reached milestones."
//
// So this is not a shop and it must not look like one. A shop asks "what can you afford"; a ladder answers
// "what is next", and the whole screen is built around one number going up — lifetime gold won, which only
// ever rises and which nothing can spend down.
//
// ⚠️ THE NEXT RUNG IS THE HEADLINE, NOT THE BALANCE. A shelf of fifteen prices tells you fifteen things and
// therefore nothing. The bar at the top says how far you are from the single nearest thing you have not got,
// and everything below it is in reach order — so the screen always has an answer to the only question
// somebody standing at a counter is actually asking.

const GROUPS = [
    { kind: "pet", title: "The Floor's Own", note: "Each one makes the machines a little kinder." },
    { kind: "unlock", title: "Doors", note: "One-time, and they open things outside this room." },
    { kind: "stat", title: "The Permanent Tracks", note: "Every so many won, for ever." },
    { kind: "chest", title: "The Boxes", note: "Every so many won, for ever." },
    { kind: "vip_pet", title: "Behind the Rope", note: "Trophies. They do nothing, which is the point." },
    { kind: "gem", title: "Sable's Stones", note: null },
    { kind: "recipe", title: "Sable's Pages", note: null },
];

const n = (v) => Number(v || 0).toLocaleString();

export default function Ladder({ onClose }) {
    const [st, setSt] = useState(null);
    const [busy, setBusy] = useState(null);
    const [flash, setFlash] = useState(null);

    const post = useCallback(async (body) => {
        const r = await fetch("/api/marketplace/casino", {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
        }).catch(() => null);
        return r ? r.json().catch(() => null) : null;
    }, []);

    const load = useCallback(async () => {
        const d = await post({ action: "ladder" });
        if (d?.ok) setSt(d);
    }, [post]);

    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount (setState is post-await)
    useEffect(() => { load(); }, [load]);

    const take = useCallback(async (kind, ref) => {
        if (busy) return;
        setBusy(`${kind}:${ref}`);
        const d = await post({ action: "ladder_claim", kind, ref });
        setBusy(null);
        if (d?.ok) {
            setSt(d);
            setFlash(d.gave);
            if (typeof window !== "undefined") window.dispatchEvent(new Event("wolfden-hud-refresh"));
        } else {
            setFlash(d?.error === "vip_only" ? "That one is behind the rope."
                : d?.error === "nothing_left" ? "You have already learned everything in that band."
                    : "Not yet.");
        }
        setTimeout(() => setFlash(null), 3200);
    }, [busy, post]);

    const won = st?.won ?? 0;
    // ⚠️ THE READY ONES FIRST, ALWAYS. A member owed eight things should not have to hunt for them among
    // thirty rows — and a member owed nothing should see what is closest, not what is cheapest.
    const ready = useMemo(() => (st?.rungs || []).filter((r) => r.ready > 0 && !r.locked), [st]);
    const next = st?.next ?? null;
    const toGo = next ? Math.max(0, next - won) : 0;
    // How far across the gap between the last rung and the next one. Shown as a bar because the number on
    // its own ("418,000 to go") is a wall, and a bar most of the way across is a reason to pull once more.
    const span = next && ready.length === 0 ? next : null;
    const pct = span ? Math.max(2, Math.min(100, Math.round((won / span) * 100))) : 100;

    return (
        <div className="lad" role="dialog" aria-label="The Counter">
            <div className="lad-head">
                <b>The Counter</b>
                <button type="button" className="lad-x" onClick={onClose} aria-label="Step away">✕</button>
            </div>

            <div className="lad-top">
                <span className="lad-lab">Won here, all time</span>
                <strong className="lad-won">{n(won)}</strong>
                {next ? (
                    <>
                        <div className="lad-bar"><span style={{ width: `${pct}%` }} /></div>
                        <span className="lad-next">{n(toGo)} more to the next thing</span>
                    </>
                ) : <span className="lad-next">You have everything this room has.</span>}
            </div>

            {flash ? <div className="lad-flash">{flash}</div> : null}

            {ready.length ? (
                <section className="lad-ready">
                    <h4>Waiting for you</h4>
                    {ready.map((r) => (
                        <button key={`${r.kind}:${r.ref}`} type="button" className="lad-take"
                            disabled={busy === `${r.kind}:${r.ref}`}
                            onClick={() => take(r.kind, r.ref)}>
                            <span>{r.name}{r.ready > 1 ? ` ×${r.ready}` : ""}</span>
                            <i>{busy === `${r.kind}:${r.ref}` ? "…" : "Take it"}</i>
                        </button>
                    ))}
                </section>
            ) : null}

            {GROUPS.map((g) => {
                const rows = (st?.rungs || []).filter((r) => r.kind === g.kind);
                if (!rows.length) return null;
                return (
                    <section key={g.kind} className="lad-group">
                        <h4>{g.title}{g.note ? <i>{g.note}</i> : null}</h4>
                        {rows.map((r) => {
                            const done = r.ready === 0 && r.held > 0 && !r.every;
                            return (
                                <div key={`${r.kind}:${r.ref}`} className={`lad-row${r.ready > 0 ? " is-ready" : ""}${r.locked ? " is-locked" : ""}${done ? " is-done" : ""}`}>
                                    <span className="lad-row-name">
                                        {r.name}
                                        {r.held > 0 ? <em>{r.every ? `${r.held} taken` : "yours"}</em> : null}
                                    </span>
                                    <span className="lad-row-at">
                                        {/* An `every X` rung says its interval; a one-time rung says its height.
                                            Those are different promises and the screen has to say which. */}
                                        {r.every ? `every ${n(r.every)}` : n(r.at)}
                                        {r.ready > 0 ? <b>ready{r.ready > 1 ? ` ×${r.ready}` : ""}</b>
                                            : <i>{n(r.toGo)} to go</i>}
                                    </span>
                                </div>
                            );
                        })}
                    </section>
                );
            })}
            <style>{CSS}</style>
        </div>
    );
}

const CSS = `
.lad { display: flex; flex-direction: column; gap: 10px; color: #f0e6d6; }
.lad-head { display: flex; align-items: center; gap: 8px; }
.lad-head b { flex: 1; font-size: 1rem; color: #ffd98a; }
.lad-x { width: 28px; height: 28px; border-radius: 999px; background: rgba(255,255,255,0.08); border: none;
    color: #e8e2d6; font-size: 14px; cursor: pointer; }
/* The one number the whole room is about. Big, because it is the only currency left in here. */
.lad-top { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 14px 12px;
    border-radius: 14px; background: linear-gradient(180deg, rgba(255,190,80,0.13), rgba(255,140,30,0.05));
    border: 1px solid rgba(255,190,80,0.28); }
.lad-lab { font-size: 0.68rem; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; color: #c9a86a; }
.lad-won { font-size: 1.9rem; font-weight: 900; color: #ffd98a; font-variant-numeric: tabular-nums; line-height: 1; }
.lad-bar { width: 100%; max-width: 280px; height: 7px; border-radius: 999px; overflow: hidden;
    background: rgba(0,0,0,0.4); margin-top: 3px; }
.lad-bar span { display: block; height: 100%; border-radius: 999px;
    background: linear-gradient(90deg, #e8961c, #ffe4a0); }
.lad-next { font-size: 0.78rem; color: #c9bda9; font-variant-numeric: tabular-nums; }
.lad-flash { padding: 9px 11px; border-radius: 10px; font-size: 0.85rem; text-align: center;
    background: rgba(90,220,160,0.12); border: 1px solid rgba(90,220,160,0.32); color: #c9f5e2; }
.lad-ready { display: flex; flex-direction: column; gap: 6px; }
.lad-ready h4, .lad-group h4 { display: flex; align-items: baseline; gap: 8px; margin: 4px 2px 2px;
    font-size: 0.72rem; font-weight: 900; text-transform: uppercase; letter-spacing: .09em; color: #ffcf6a; }
.lad-group h4 i { font-style: normal; font-weight: 600; text-transform: none; letter-spacing: 0;
    font-size: 0.72rem; color: #9b9080; }
.lad-take { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%;
    padding: 11px 13px; border-radius: 12px; cursor: pointer; font-size: 0.92rem; font-weight: 800;
    color: #2a1403; background: linear-gradient(180deg, #ffcf6a, #e89a1c); border: none; }
.lad-take i { font-style: normal; font-size: 0.76rem; font-weight: 900; text-transform: uppercase;
    letter-spacing: .07em; opacity: 0.72; }
.lad-group { display: flex; flex-direction: column; gap: 4px; }
.lad-row { display: flex; align-items: center; justify-content: space-between; gap: 10px;
    padding: 8px 11px; border-radius: 9px; background: rgba(255,255,255,0.035);
    border: 1px solid rgba(255,255,255,0.07); }
.lad-row.is-ready { border-color: rgba(255,207,106,0.55); background: rgba(255,207,106,0.08); }
.lad-row.is-done { opacity: 0.5; }
.lad-row.is-locked { opacity: 0.55; border-style: dashed; }
.lad-row-name { font-size: 0.88rem; color: #f0e6d6; display: flex; align-items: baseline; gap: 6px; }
.lad-row-name em { font-style: normal; font-size: 0.68rem; color: #9af5c6; }
.lad-row-at { display: flex; flex-direction: column; align-items: flex-end; gap: 1px;
    font-size: 0.72rem; color: #9b9080; font-variant-numeric: tabular-nums; white-space: nowrap; }
.lad-row-at b { font-size: 0.72rem; color: #ffcf6a; text-transform: uppercase; letter-spacing: .06em; }
.lad-row-at i { font-style: normal; font-size: 0.7rem; color: #7f7667; }
`;
