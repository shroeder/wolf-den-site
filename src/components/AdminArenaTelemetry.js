"use client";

import { useCallback, useEffect, useState } from "react";

// ── FIGHT TELEMETRY ──────────────────────────────────────────────────────────────────────────────────────────
// Four tables, deliberately in this order, because it is the order the questions get asked in:
//
//   1. IS EACH ROOM A FIGHT?      win rate and round count per kind — a walkover and a wall look the same on
//                                 a leaderboard and opposite here.
//   2. WHERE IS THE WALL?         per-rung win rate on the Road, measured rather than modelled.
//   3. IS A CLASS FOOD?           the matchup grid. One Warden losing to one Reaver is an anecdote; the grid
//                                 is the difference between that and a balance bug.
//   4. WHAT HAPPENED IN THAT ONE? the individual bouts, with what each side brought and where the HP went.
//
// Everything is read-only and gated behind the same admin key the boss panel uses.

const pct = (n) => `${Math.round(n)}%`;
const KINDS = [["", "Everything"], ["member", "Member duels"], ["ladder", "The Road"], ["gauntlet", "Gauntlet"], ["town", "Plaza raids"]];

export default function AdminArenaTelemetry() {
    const [key, setKey] = useState("");
    const [data, setData] = useState(null);
    const [kind, setKind] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    useEffect(() => { try { setKey(window.localStorage.getItem("wd-admin-key") || ""); } catch { /* private mode */ } }, []);

    const load = useCallback(async (k, kd) => {
        if (!k) return;
        setBusy(true); setErr(null);
        const r = await fetch(`/api/admin/arena-telemetry${kd ? `?kind=${kd}` : ""}`, {
            headers: { Authorization: `Bearer ${k}` }, cache: "no-store",
        }).then((x) => x.json()).catch(() => null);
        setBusy(false);
        if (!r?.ok) { setErr(r?.error || "That key was refused, or the request failed."); return; }
        try { window.localStorage.setItem("wd-admin-key", k); } catch { /* private mode */ }
        setData(r);
    }, []);

    useEffect(() => { if (key) load(key, kind); }, [key, kind, load]);

    return (
        <div className="stack">
            <section className="card">
                <div className="at-key">
                    <input type="password" value={key} placeholder="Admin key" onChange={(e) => setKey(e.target.value)} />
                    <button type="button" className="btn" disabled={busy || !key} onClick={() => load(key, kind)}>
                        {busy ? "Reading…" : "Refresh"}
                    </button>
                </div>
                {err ? <p className="at-err">{err}</p> : null}
            </section>

            {data ? (
                <>
                    <section className="card">
                        <h2>Is each room a fight?</h2>
                        <p className="muted">Last {data.hours}h. A room at 100% is a walkover; a room at 0% is a wall. Ten rounds is the design target.</p>
                        <div className="at-scroll">
                            <table className="at-tbl">
                                <thead><tr><th>Room</th><th>Bouts</th><th>Win rate</th><th>Rounds</th><th>Dealt/rd</th><th>Taken/rd</th><th>Turned aside</th></tr></thead>
                                <tbody>
                                    {data.health.map((h) => (
                                        <tr key={h.kind}>
                                            <td><b>{h.kind}</b></td><td>{h.bouts}</td>
                                            <td className={h.winPct >= 95 || h.winPct <= 10 ? "at-flag" : ""}>{pct(h.winPct)}</td>
                                            <td className={h.avgRounds > 16 || h.avgRounds < 5 ? "at-flag" : ""}>{h.avgRounds}</td>
                                            <td>{h.dealtPerRound}</td><td>{h.takenPerRound}</td><td>{pct(h.pctTurnedAside)}</td>
                                        </tr>
                                    ))}
                                    {data.health.length ? null : <tr><td colSpan={7} className="muted">No bouts with telemetry yet — it starts recording from the next fight.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className="card">
                        <h2>Where is the wall?</h2>
                        <p className="muted">Per rung, last {data.days} days. A rung nobody has reached reports nothing, which is its own answer.</p>
                        <div className="at-scroll">
                            <table className="at-tbl">
                                <thead><tr><th>Rung</th><th>Attempts</th><th>Won</th><th>Win rate</th><th>Rounds</th></tr></thead>
                                <tbody>
                                    {data.ladder.map((r) => (
                                        <tr key={r.rung}>
                                            <td><b>{r.rung}</b></td><td>{r.attempts}</td><td>{r.wins}</td>
                                            <td className={r.winPct <= 25 ? "at-flag" : ""}>{pct(r.winPct)}</td>
                                            <td>{r.avgRounds}</td>
                                        </tr>
                                    ))}
                                    {data.ladder.length ? null : <tr><td colSpan={5} className="muted">No Road fights recorded yet.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className="card">
                        <h2>Is a class food?</h2>
                        <p className="muted">Member duels only, last {data.days} days. Read it as: challenger&apos;s class beat defender&apos;s class this often.</p>
                        <div className="at-scroll">
                            <table className="at-tbl">
                                <thead><tr><th>Challenger</th><th>Defender</th><th>Bouts</th><th>Challenger wins</th><th>Rounds</th></tr></thead>
                                <tbody>
                                    {data.matchups.map((m) => (
                                        <tr key={`${m.challenger}-${m.defender}`}>
                                            <td><b>{m.challenger}</b></td><td>{m.defender}</td><td>{m.bouts}</td>
                                            <td className={m.bouts >= 5 && (m.winPct >= 80 || m.winPct <= 20) ? "at-flag" : ""}>{pct(m.winPct)}</td>
                                            <td>{m.avgRounds}</td>
                                        </tr>
                                    ))}
                                    {data.matchups.length ? null : <tr><td colSpan={5} className="muted">No member duels recorded yet.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className="card">
                        <h2>What happened in that one?</h2>
                        <div className="at-filters">
                            {KINDS.map(([k, label]) => (
                                <button type="button" key={k || "all"} className={`at-pill${kind === k ? " is-on" : ""}`} onClick={() => setKind(k)}>{label}</button>
                            ))}
                        </div>
                        <div className="at-bouts">
                            {data.recent.map((b) => {
                                const t = b.t || {};
                                return (
                                    <details key={b.id} className={`at-bout${b.won ? " is-win" : " is-loss"}`}>
                                        <summary>
                                            <b>{b.challenger}</b> {b.won ? "beat" : "lost to"} <b>{b.defender || t.rung ? (b.defender || `rung ${t.rung}`) : `tier ${b.npcTier}`}</b>
                                            <em>{b.rounds} rounds · {t.kind || "?"}</em>
                                        </summary>
                                        <div className="at-detail">
                                            <div className="at-cols">
                                                <div>
                                                    <h4>Them</h4>
                                                    <p>{t.me?.damage} dmg · {t.me?.critChance}% crit ×{t.me?.critMult} · {t.me?.health} hp</p>
                                                    <p>turns aside {(t.me?.armour || 0) + (t.me?.block || 0)}% · {t.me?.element}</p>
                                                    <p><b>{t.dealt?.dealt}</b> dealt over {t.dealt?.swings} swings ({t.dealt?.perSwing}/swing, {t.dealt?.crits} crits)</p>
                                                    <p className="muted">{t.dealt?.turnedAside} turned aside · {t.dealt?.shieldEaten} eaten by shield · {t.dealt?.returned} came back</p>
                                                    <p className="muted">{t.dealt?.guards} guards · {t.dealt?.wards} wards · {t.dealt?.abilities} skills · {t.dealt?.items} items</p>
                                                </div>
                                                <div>
                                                    <h4>Opponent</h4>
                                                    <p>{t.foe?.damage} dmg · {t.foe?.critChance}% crit ×{t.foe?.critMult} · {t.foe?.health} hp</p>
                                                    <p>turns aside {(t.foe?.armour || 0) + (t.foe?.block || 0)}% · {t.foe?.element}</p>
                                                    <p><b>{t.taken?.dealt}</b> dealt over {t.taken?.swings} swings ({t.taken?.perSwing}/swing, {t.taken?.crits} crits)</p>
                                                    <p className="muted">{t.taken?.turnedAside} turned aside · {t.taken?.shieldEaten} eaten by shield · {t.taken?.returned} came back</p>
                                                </div>
                                            </div>
                                            <p className="at-foot">
                                                {t.clashNote ? `${t.clashNote} (×${t.clash}) · ` : ""}
                                                underdog ×{t.underdog} · {t.perRoundDealt}/rd dealt vs {t.perRoundTaken}/rd taken
                                                {" · "}ended {t.hpLeft} hp to {t.foeHpLeft}
                                            </p>
                                        </div>
                                    </details>
                                );
                            })}
                            {data.recent.length ? null : <p className="muted">Nothing recorded yet — telemetry starts with the next fight after deploy.</p>}
                        </div>
                    </section>
                </>
            ) : null}

            <style jsx>{`
                .at-key { display: flex; gap: 8px; }
                .at-key input { flex: 1 1 auto; padding: 8px 10px; border-radius: 9px;
                    border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.05); color: #e8eef5; }
                .at-err { color: #ff9aa4; font-size: .85rem; margin: 8px 0 0; }
                h2 { margin: 0 0 4px; font-size: 1.05rem; }
                .at-scroll { overflow-x: auto; }
                .at-tbl { width: 100%; border-collapse: collapse; font-size: .82rem; white-space: nowrap; }
                .at-tbl th { text-align: left; font-size: .68rem; text-transform: uppercase; letter-spacing: .06em;
                    color: #8b93a0; padding: 6px 10px 6px 0; }
                .at-tbl td { padding: 5px 10px 5px 0; border-top: 1px solid rgba(255,255,255,0.07); }
                /* The whole point of a health table is that the bad rows find YOU. */
                .at-flag { color: #ff9aa4; font-weight: 900; }
                .at-filters { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
                .at-pill { padding: 5px 11px; border-radius: 999px; cursor: pointer; font-size: .74rem; font-weight: 800;
                    color: #b9c2cc; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); }
                .at-pill.is-on { color: #2a1f08; background: linear-gradient(180deg, #ffe9a8, #f0c14b); }
                .at-bouts { display: grid; gap: 6px; }
                .at-bout { border-radius: 10px; border: 1px solid rgba(255,255,255,0.10); padding: 8px 10px;
                    background: rgba(255,255,255,0.03); }
                .at-bout.is-loss { border-color: rgba(224,91,106,0.35); }
                .at-bout.is-win { border-color: rgba(143,214,162,0.28); }
                .at-bout summary { cursor: pointer; font-size: .85rem; display: flex; gap: 8px; flex-wrap: wrap; align-items: baseline; }
                .at-bout summary em { font-style: normal; color: #8b93a0; font-size: .75rem; }
                .at-detail { padding-top: 8px; }
                .at-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; }
                .at-cols h4 { margin: 0 0 4px; font-size: .72rem; text-transform: uppercase; letter-spacing: .06em; color: #8b93a0; }
                .at-cols p { margin: 0 0 3px; font-size: .78rem; }
                .at-foot { margin: 8px 0 0; font-size: .74rem; color: #8b93a0; }
            `}</style>
        </div>
    );
}
