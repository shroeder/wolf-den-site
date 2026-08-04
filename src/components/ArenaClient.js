"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── THE ARENA ────────────────────────────────────────────────────────────────────────────────────────────────
// Two screens. The LADDER — who is next, who is above them, and what beating them is worth — and the BOUT,
// which is two fighters facing each other and three buttons.
//
// The bout is stance-versus-stance, so every round is a read rather than a tap. The opponent's tell is printed
// on their card and is derived from their real build, so it is information, not flavour.
//
// Raw <img> everywhere: styled-jsx will not scope a rule aimed at a custom component (see check:styled-jsx).

const money = (n) => Number(n || 0).toLocaleString();

const STANCES = [
    { key: "strike", label: "Strike", hint: "Beats a feint. Loses to a guard." },
    { key: "guard", label: "Guard", hint: "Beats a strike. Loses to a feint." },
    { key: "feint", label: "Feint", hint: "Beats a guard. Loses to a strike." },
];

// A short tone per outcome — built inline, no assets.
function blip(kind) {
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const a = new AC();
        const notes = kind === "win" ? [523, 659, 880] : kind === "hit" ? [420, 300] : kind === "hurt" ? [180, 120] : [330, 300];
        notes.forEach((f, i) => {
            const t = a.currentTime + i * 0.06;
            const o = a.createOscillator(), g = a.createGain();
            o.type = kind === "hurt" ? "sawtooth" : "triangle";
            o.frequency.setValueAtTime(f, t);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.15, t + 0.012);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
            o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.22);
        });
    } catch { /* audio is a bonus */ }
}

function Fighter({ f, hp, maxHp, mirrored, hurt }) {
    const frac = maxHp ? Math.max(0, hp / maxHp) : 0;
    return (
        <div className={`ar-fighter${mirrored ? " is-foe" : ""}${hurt ? " is-hurt" : ""}`}>
            <div className="ar-portrait">
                {f?.sprite ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.sprite} alt="" draggable="false" style={mirrored ? { transform: "scaleX(-1)" } : undefined} />
                ) : <span className="ar-noface" aria-hidden="true" />}
            </div>
            <b className="ar-fname">{f?.name}</b>
            <span className="ar-hp"><i style={{ width: `${frac * 100}%` }} /></span>
            <em className="ar-hpnum">{Math.max(0, hp)} / {maxHp}</em>
        </div>
    );
}

export default function ArenaClient({ initial }) {
    const [st, setSt] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [shake, setShake] = useState(0);
    const prev = useRef({ hp: null, foeHp: null });
    const logEnd = useRef(null);

    const act = useCallback(async (action, extra = {}) => {
        if (busy) return;
        setBusy(true);
        try {
            const r = await fetch("/api/marketplace/arena", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ action, ...extra }),
            }).then((x) => x.json()).catch(() => null);
            if (r?.unlocked) setSt(r);
        } finally { setBusy(false); }
    }, [busy]);

    const bout = st?.bout || null;
    // Juice is derived by DIFFING the server's reply, never fired from the click — so a number can never float
    // for a hit the server did not deal.
    useEffect(() => {
        if (!bout) { prev.current = { hp: null, foeHp: null }; return; }
        const p = prev.current;
        if (p.hp != null && bout.hp < p.hp) { setShake(2); blip("hurt"); }
        else if (p.foeHp != null && bout.foeHp < p.foeHp) { setShake(1); blip("hit"); }
        if (bout.over && bout.won) blip("win");
        prev.current = { hp: bout.hp, foeHp: bout.foeHp };
        const t = setTimeout(() => setShake(0), 320);
        return () => clearTimeout(t);
    }, [bout]);
    useEffect(() => { logEnd.current?.scrollIntoView?.({ block: "nearest" }); }, [bout?.log?.length]);

    if (!st?.unlocked) return null;

    // ── THE BOUT ──
    if (bout) {
        return (
            <section className="card ar">
                <div className={`ar-stage${shake ? ` is-shake-${shake}` : ""}`}>
                    <Fighter f={st.me} hp={bout.hp} maxHp={bout.maxHp} hurt={shake === 2} />
                    <span className="ar-vs">vs</span>
                    <Fighter f={bout.foe} hp={bout.foeHp} maxHp={bout.foeMaxHp} mirrored hurt={shake === 1} />
                </div>
                <p className="ar-tell"><b>Their tell:</b> {bout.tell}</p>

                {bout.over ? (
                    <div className={`ar-result ${bout.won ? "is-win" : "is-loss"}`}>
                        <b>{bout.won ? `You beat ${bout.foe.name}` : `${bout.foe.name} put you down`}</b>
                        {bout.won && bout.reward ? (
                            <p>+{money(bout.reward.gold)} gold · +{money(bout.reward.xp)} XP{bout.reward.chest ? ` · a ${bout.reward.chest} chest` : ""}</p>
                        ) : <p>The rung holds. Your attempts reset tomorrow.</p>}
                        <button type="button" className="dlv-btn" disabled={busy} onClick={() => act("dismiss")}>Back to the ladder</button>
                    </div>
                ) : (
                    <div className="ar-stances">
                        {STANCES.map((s) => (
                            <button key={s.key} type="button" className={`ar-stance is-${s.key}`} disabled={busy}
                                onClick={() => act("stance", { stance: s.key })}>
                                <b>{s.label}</b><em>{s.hint}</em>
                            </button>
                        ))}
                    </div>
                )}

                {bout.log?.length ? (
                    <div className="ar-log">
                        {bout.log.slice(-8).map((l, i) => (
                            <div key={i} className="ar-line"><b>R{l.round}</b> {l.text}</div>
                        ))}
                        <div ref={logEnd} />
                    </div>
                ) : null}
                <Styles />
            </section>
        );
    }

    // ── THE LADDER ──
    const next = st.next;
    return (
        <section className="card ar">
            <div className="ar-head">
                <div>
                    <h2 className="ar-title">The Arena</h2>
                    <p className="ar-sub">The pack, weakest to strongest. Start at the bottom and climb.</p>
                </div>
                <div className="ar-rung"><b>{st.rung}</b><span>of {st.ladderSize}</span></div>
            </div>

            <div className="ar-stats">
                <span><b>{st.stats.wins}</b> wins</span>
                <span><b>{st.stats.losses}</b> losses</span>
                <span><b>{st.stats.streak}</b> streak</span>
                <span><b>{st.fightsLeft}</b> fights left today</span>
            </div>

            {st.cleared ? (
                <div className="ar-cleared">
                    <b>You have beaten the whole pack.</b>
                    <p>There is nobody above you. Come back when somebody gears up.</p>
                </div>
            ) : next ? (
                <div className="ar-next">
                    <span className="ar-next-kicker">Rung {st.rung + 1} · next up</span>
                    <div className="ar-next-row">
                        <div className="ar-portrait is-big">
                            {next.sprite ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={next.sprite} alt="" draggable="false" style={{ transform: "scaleX(-1)" }} />
                            ) : <span className="ar-noface" aria-hidden="true" />}
                        </div>
                        <div className="ar-next-body">
                            <b>{next.name}</b>
                            <span className="ar-next-meta">Level {next.level} · {next.vigour} vigour · {next.might} per swing</span>
                            <span className="ar-next-tell">{next.tell}</span>
                        </div>
                    </div>
                    <div className="ar-next-foot">
                        <span className="ar-prize">+{money(next.reward.gold)} gold · +{money(next.reward.xp)} XP{next.reward.chest ? ` · ${next.reward.chest} chest` : ""}</span>
                        <button type="button" className="dlv-btn" disabled={busy || st.fightsLeft <= 0} onClick={() => act("start")}>
                            {st.fightsLeft <= 0 ? "No fights left today" : "Step up"}
                        </button>
                    </div>
                </div>
            ) : null}

            {st.upcoming?.length > 1 ? (
                <div className="ar-up">
                    <span className="ar-up-head">Above them</span>
                    {st.upcoming.slice(1).map((o) => (
                        <div key={`${o.rung}-${o.name}`} className="ar-up-row">
                            <span className="ar-up-rung">{o.rung + 1}</span>
                            <div className="ar-portrait is-tiny">
                                {o.sprite ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={o.sprite} alt="" draggable="false" style={{ transform: "scaleX(-1)" }} />
                                ) : <span className="ar-noface" aria-hidden="true" />}
                            </div>
                            <span className="ar-up-name">{o.name}</span>
                            <span className="ar-up-lvl">Lv {o.level}</span>
                        </div>
                    ))}
                </div>
            ) : null}

            {st.board?.length ? (
                <div className="ar-board">
                    <span className="ar-up-head">Highest climbers</span>
                    {st.board.map((r) => (
                        <div key={r.place} className="ar-up-row">
                            <span className="ar-up-rung">{r.place}</span>
                            <span className="ar-up-name">{r.name}</span>
                            <span className="ar-up-lvl">rung {r.rung}</span>
                        </div>
                    ))}
                </div>
            ) : null}
            <Styles />
        </section>
    );
}

function Styles() {
    return (
        <style jsx global>{`
            .ar-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
            .ar-title { margin: 0; font-size: 1.3rem; font-weight: 900; color: #ffb0b8; }
            .ar-sub { margin: 3px 0 0; font-size: 12.5px; color: #9aa2ab; }
            .ar-rung { flex: 0 0 auto; text-align: right; }
            .ar-rung b { display: block; font-size: 1.6rem; font-weight: 900; color: #fff; line-height: 1; }
            .ar-rung span { font-size: 10.5px; color: #7f8790; }
            .ar-stats { display: flex; flex-wrap: wrap; gap: 14px; margin: 12px 0 14px; font-size: 11.5px; color: #8a939d; }
            .ar-stats b { color: #ffd75e; font-variant-numeric: tabular-nums; }

            .ar-portrait { width: 74px; height: 74px; border-radius: 50%; display: grid; place-items: center; overflow: hidden;
                background: radial-gradient(circle at 38% 30%, rgba(255,255,255,0.12), rgba(8,6,12,0.92));
                border: 2px solid rgba(255,255,255,0.14); }
            .ar-portrait.is-big { width: 84px; height: 84px; flex: 0 0 auto; }
            .ar-portrait.is-tiny { width: 30px; height: 30px; border-width: 1px; flex: 0 0 auto; }
            .ar-portrait img { width: 100%; height: 100%; object-fit: contain; }
            .ar-noface { width: 60%; height: 60%; border-radius: 50%; background: rgba(255,255,255,0.1); }

            .ar-next { padding: 14px; border-radius: 15px; background: linear-gradient(150deg, rgba(255,111,125,0.16), rgba(255,255,255,0.02) 66%);
                border: 1px solid rgba(255,111,125,0.42); }
            .ar-next-kicker { font-size: 9.5px; font-weight: 900; letter-spacing: .13em; text-transform: uppercase; color: #ffb0b8; }
            .ar-next-row { display: flex; align-items: center; gap: 13px; margin-top: 8px; }
            .ar-next-body b { display: block; font-size: 1.05rem; font-weight: 900; color: #fff; }
            .ar-next-meta { display: block; margin-top: 2px; font-size: 11.5px; color: #9aa2ab; }
            .ar-next-tell { display: block; margin-top: 5px; font-size: 12px; font-style: italic; color: #ffd0a0; }
            .ar-next-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: 13px; }
            .ar-prize { font-size: 12px; font-weight: 900; color: #ffd75e; }
            .ar-cleared { padding: 16px; border-radius: 15px; text-align: center; background: rgba(255,215,94,0.09); border: 1px solid rgba(255,215,94,0.4); }
            .ar-cleared b { color: #ffe28a; }
            .ar-cleared p { margin: 6px 0 0; font-size: 12.5px; color: #c2cad3; }

            .ar-up, .ar-board { margin-top: 16px; display: grid; gap: 5px; }
            .ar-up-head { font-size: 10px; font-weight: 900; letter-spacing: .13em; text-transform: uppercase; color: #7f8790; }
            .ar-up-row { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 10px; background: rgba(255,255,255,0.035); }
            .ar-up-rung { min-width: 22px; font-size: 11px; font-weight: 900; color: #6f7883; font-variant-numeric: tabular-nums; }
            .ar-up-name { flex: 1; min-width: 0; font-size: 12.5px; font-weight: 800; color: #d6dde4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .ar-up-lvl { font-size: 11px; color: #8a939d; white-space: nowrap; }

            /* ── the bout ── */
            .ar-stage { display: grid; grid-template-columns: 1fr auto 1fr; align-items: start; gap: 10px; padding: 16px 8px 4px; }
            .ar-stage.is-shake-1 { animation: arShake .2s ease-out; }
            .ar-stage.is-shake-2 { animation: arShake .28s ease-out; }
            @keyframes arShake { 0%,100% { transform: translate(0,0) } 30% { transform: translate(-5px,2px) } 65% { transform: translate(5px,-2px) } }
            .ar-fighter { display: flex; flex-direction: column; align-items: center; gap: 6px; }
            .ar-fighter.is-hurt .ar-portrait { border-color: #ff6f7d; box-shadow: 0 0 22px -4px #ff6f7d; }
            .ar-vs { align-self: center; font-size: 11px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; color: #6f7883; }
            .ar-fname { font-size: 12.5px; font-weight: 900; color: #e9eef3; text-align: center; }
            .ar-hp { display: block; width: 100%; max-width: 130px; height: 8px; border-radius: 999px; overflow: hidden; background: rgba(0,0,0,0.5); }
            .ar-hp > i { display: block; height: 100%; background: linear-gradient(90deg, #4ad07f, #7ce8a4); transition: width .35s ease; }
            .ar-fighter.is-foe .ar-hp > i { background: linear-gradient(90deg, #ff6f7d, #ffb0b8); }
            .ar-hpnum { font-size: 10px; font-style: normal; color: #8a939d; font-variant-numeric: tabular-nums; }
            .ar-tell { margin: 10px 0 12px; font-size: 12px; color: #cbb; text-align: center; }
            .ar-tell b { color: #ffd0a0; }

            .ar-stances { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
            .ar-stance { padding: 12px 8px; border-radius: 13px; cursor: pointer; text-align: center;
                background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.13); }
            .ar-stance:disabled { opacity: .55; }
            .ar-stance b { display: block; font-size: 0.9rem; font-weight: 900; color: #fff; }
            .ar-stance em { display: block; margin-top: 3px; font-style: normal; font-size: 10px; line-height: 1.35; color: #8f98a3; }
            .ar-stance.is-strike { border-color: rgba(255,111,125,0.5); }
            .ar-stance.is-guard { border-color: rgba(111,208,255,0.5); }
            .ar-stance.is-feint { border-color: rgba(185,140,255,0.5); }

            .ar-result { margin-top: 4px; padding: 15px; border-radius: 14px; text-align: center; }
            .ar-result.is-win { background: rgba(255,215,94,0.1); border: 1px solid rgba(255,215,94,0.45); }
            .ar-result.is-loss { background: rgba(255,111,125,0.09); border: 1px solid rgba(255,111,125,0.4); }
            .ar-result b { font-size: 1.05rem; color: #fff; }
            .ar-result p { margin: 6px 0 12px; font-size: 12.5px; color: #cbd3dc; }

            .ar-log { margin-top: 13px; max-height: 150px; overflow-y: auto; display: grid; gap: 4px;
                padding: 9px 11px; border-radius: 11px; background: rgba(0,0,0,0.28); }
            .ar-line { font-size: 11.5px; line-height: 1.45; color: #9aa2ab; }
            .ar-line b { color: #6f6486; margin-right: 5px; }
        `}</style>
    );
}
