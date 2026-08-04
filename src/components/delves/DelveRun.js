"use client";

import { useEffect, useRef } from "react";

// ── THE RUN ──────────────────────────────────────────────────────────────────────────────────────────────────
// One floor at a time, against the dungeon's own backdrop. The floor you are on is the whole screen; the log
// underneath is what you have already done. You never see what is ahead — the ten floors are dealt server-side
// at the door and only the current one is ever sent.

const EVENT_ART = {
    chest: "/images/delves/ev-chest.png",
    mimic: "/images/delves/foe-mimic.png",
    merchant: "/images/delves/ev-merchant.png",
    well: "/images/delves/ev-well.png",
    shrine: "/images/delves/ev-shrine.png",
    trap: "/images/delves/ev-trap.png",
    rest: "/images/delves/ev-rest.png",
    cache: "/images/delves/ev-cache.png",
    puzzle: "/images/delves/ev-puzzle.png",
};

function Img({ src, className, alt = "" }) {
    if (!src) return null;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} className={className} alt={alt} draggable="false" />;
}

export default function DelveRun({ run, busy, onAct }) {
    const logEnd = useRef(null);
    // Keep the newest line in view — the log is the only record of a floor once you have left it.
    useEffect(() => { logEnd.current?.scrollIntoView({ block: "nearest" }); }, [run.log?.length]);

    const hpFrac = Math.max(0, run.hp / run.maxHp);
    const hpState = hpFrac <= 0.25 ? "is-critical" : hpFrac <= 0.5 ? "is-hurt" : "";
    const cur = run.current;
    const fighting = Boolean(run.foe);
    const awaiting = run.awaiting;
    const art = fighting ? run.foe.sprite : (awaiting?.art || EVENT_ART[cur?.kind] || null);

    return (
        <div className="dlr" style={{ "--tint": run.tint }}>
            {/* ── the floor ── */}
            <div className="dlr-stage">
                <Img src={run.bg} className="dlr-bg" />
                <span className="dlr-scrim" aria-hidden="true" />
                <div className="dlr-depth">
                    <b>Floor {run.floor}</b><span>of {run.floors}</span>
                </div>
                <div className="dlr-pips" aria-hidden="true">
                    {Array.from({ length: run.floors }).map((_, i) => (
                        <span key={i} className={`dlr-pip${i + 1 < run.floor ? " is-done" : ""}${i + 1 === run.floor ? " is-now" : ""}${i + 1 === run.floors ? " is-boss" : ""}`} />
                    ))}
                </div>
                {art ? <Img src={art} className={`dlr-art${fighting ? " is-foe" : ""}`} alt="" /> : null}
                {fighting ? (
                    <div className="dlr-foe">
                        <b>{run.foe.name}</b>
                        <span className="dlr-foe-bar"><span style={{ width: `${Math.max(0, (run.foe.hp / run.foe.maxHp) * 100)}%` }} /></span>
                        <em>{run.foe.hp} / {run.foe.maxHp}</em>
                    </div>
                ) : null}
            </div>

            {/* ── you ── */}
            <div className="dlr-you">
                <div className={`dlr-hp ${hpState}`}>
                    <span className="dlr-hp-bar"><span style={{ width: `${hpFrac * 100}%` }} /></span>
                    <b>{run.hp} / {run.maxHp}</b>
                </div>
                <button type="button" className="dlr-potion" disabled={busy || run.potions <= 0 || run.hp >= run.maxHp}
                    onClick={() => onAct("potion")}
                    title={run.potions <= 0 ? "No potions left" : `Restores ${Math.round(run.potionHeal * 100)}% of your health`}>
                    <Img src="/images/delves/ev-potion.png" className="dlv-ico" />
                    <b>{run.potions}</b>
                </button>
            </div>

            {/* ── what's happening ── */}
            <div className="dlr-card">
                <b className="dlr-card-title">{awaiting?.title || cur?.title}</b>
                <p className="dlr-card-text">{awaiting?.text || cur?.text}</p>

                {awaiting ? (
                    <div className="dlr-options">
                        {awaiting.options.map((o) => (
                            <button key={o.key} type="button" className="dlv-btn is-ghost dlr-option" disabled={busy}
                                onClick={() => onAct("choose", { choice: o.key })}>
                                <span>{o.label}</span>
                                {o.cost ? <em>{o.cost.toLocaleString()} gold</em> : null}
                            </button>
                        ))}
                    </div>
                ) : fighting ? (
                    <div className="dlr-actions">
                        <button type="button" className="dlv-btn is-danger" disabled={busy} onClick={() => onAct("strike")}>Strike</button>
                        {/* Fleeing ends the run but KEEPS everything banked — the same deal as dying, minus the dying. */}
                        <button type="button" className="dlv-btn is-ghost" disabled={busy} onClick={() => onAct("flee")}>Turn back</button>
                    </div>
                ) : (
                    <div className="dlr-actions">
                        <button type="button" className="dlv-btn" disabled={busy} onClick={() => onAct("enter")}>
                            {cur?.done ? "Onward" : "Step in"}
                        </button>
                        <button type="button" className="dlv-btn is-ghost" disabled={busy} onClick={() => onAct("flee")}>Turn back</button>
                    </div>
                )}
            </div>

            {/* ── what you're carrying ── */}
            <div className="dlr-bank">
                <span>Carrying <b>{(run.banked?.gold || 0).toLocaleString()}</b> gold</span>
                <span><b>{(run.banked?.xp || 0).toLocaleString()}</b> XP</span>
                {run.banked?.chests?.length ? <span><b>{run.banked.chests.length}</b> chest{run.banked.chests.length === 1 ? "" : "s"}</span> : null}
            </div>
            <p className="dlr-note">Turn back or fall, and you still keep everything above.</p>

            {run.log?.length ? (
                <div className="dlr-log">
                    {run.log.slice(-14).map((l, i) => (
                        <div key={i} className={`dlr-line is-${l.kind}`}><b>F{l.floor}</b> {l.text}</div>
                    ))}
                    <div ref={logEnd} />
                </div>
            ) : null}

            <style jsx>{`
                .dlr-stage { position: relative; border-radius: 16px; overflow: hidden; aspect-ratio: 16 / 10;
                    display: grid; place-items: center; border: 1px solid color-mix(in srgb, var(--tint) 45%, transparent); }
                .dlr-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
                .dlr-scrim { position: absolute; inset: 0; background: radial-gradient(70% 60% at 50% 45%, transparent, rgba(8,5,14,0.8)); }
                .dlr-depth { position: absolute; top: 9px; left: 11px; z-index: 2; display: flex; align-items: baseline; gap: 5px; }
                .dlr-depth b { font-size: 15px; font-weight: 900; color: #fff; text-shadow: 0 2px 8px #000; }
                .dlr-depth span { font-size: 10.5px; color: #cbbfe0; text-shadow: 0 2px 6px #000; }
                .dlr-pips { position: absolute; top: 12px; right: 11px; z-index: 2; display: flex; gap: 3px; }
                .dlr-pip { width: 7px; height: 7px; border-radius: 2px; background: rgba(255,255,255,0.22); }
                .dlr-pip.is-done { background: color-mix(in srgb, var(--tint) 80%, white); }
                .dlr-pip.is-now { background: #fff; box-shadow: 0 0 8px #fff; }
                .dlr-pip.is-boss { width: 10px; background: rgba(255,110,130,0.45); }
                .dlr-pip.is-boss.is-done { background: #ff6f7d; }
                .dlr-art { position: relative; z-index: 1; width: 46%; max-height: 72%; object-fit: contain;
                    filter: drop-shadow(0 8px 20px rgba(0,0,0,0.65)); animation: dlrIn .4s cubic-bezier(.2,1.3,.4,1) both; }
                .dlr-art.is-foe { animation: dlrIn .4s cubic-bezier(.2,1.3,.4,1) both, dlrBreathe 2.6s ease-in-out 0.4s infinite alternate; }
                @keyframes dlrIn { from { opacity: 0; transform: scale(.8) translateY(10px); } to { opacity: 1; transform: none; } }
                @keyframes dlrBreathe { from { transform: translateY(0) } to { transform: translateY(-5px) } }
                .dlr-foe { position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); z-index: 2; width: min(78%, 320px); text-align: center; }
                .dlr-foe b { display: block; font-size: 13px; color: #fff; text-shadow: 0 2px 8px #000; }
                .dlr-foe-bar { display: block; height: 7px; margin: 4px 0 2px; border-radius: 999px; overflow: hidden; background: rgba(0,0,0,0.55); }
                .dlr-foe-bar > span { display: block; height: 100%; background: linear-gradient(90deg, #ff6f7d, #ffb0b8); transition: width .3s ease; }
                .dlr-foe em { font-size: 10px; font-style: normal; color: #e6d9ff; text-shadow: 0 1px 4px #000; }

                .dlr-you { display: flex; align-items: center; gap: 10px; margin: 11px 0; }
                .dlr-hp { flex: 1; position: relative; display: flex; align-items: center; gap: 8px; }
                .dlr-hp-bar { flex: 1; height: 16px; border-radius: 999px; overflow: hidden; background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.12); }
                .dlr-hp-bar > span { display: block; height: 100%; background: linear-gradient(90deg, #4ad07f, #7ce8a4); transition: width .35s ease; }
                .dlr-hp.is-hurt .dlr-hp-bar > span { background: linear-gradient(90deg, #ffb020, #ffd75e); }
                .dlr-hp.is-critical .dlr-hp-bar > span { background: linear-gradient(90deg, #ff4d5e, #ff8f9a); animation: dlrPulse 1s ease-in-out infinite; }
                @keyframes dlrPulse { 0%,100% { opacity: 1 } 50% { opacity: .55 } }
                .dlr-hp b { font-size: 12px; font-variant-numeric: tabular-nums; color: #cdd3d8; min-width: 66px; text-align: right; }
                .dlr-potion { display: flex; align-items: center; gap: 5px; padding: 7px 11px; border-radius: 11px; cursor: pointer;
                    background: rgba(185,140,255,0.14); border: 1px solid rgba(185,140,255,0.4); color: #e0ceff; font-weight: 900; }
                .dlr-potion:disabled { opacity: 0.4; cursor: default; }

                .dlr-card { padding: 13px 15px; border-radius: 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); }
                .dlr-card-title { font-size: 1rem; color: color-mix(in srgb, var(--tint) 65%, white); }
                .dlr-card-text { margin: 5px 0 12px; font-size: 12.5px; line-height: 1.5; color: #b9c2cc; }
                .dlr-actions { display: grid; grid-template-columns: 2fr 1fr; gap: 8px; }
                .dlr-options { display: grid; gap: 7px; }
                .dlr-option { justify-content: space-between; padding: 12px 14px; font-size: 0.86rem; }
                .dlr-option em { font-style: normal; font-size: 0.76rem; font-weight: 800; color: #ffd75e; }

                .dlr-bank { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 12px; font-size: 12px; color: #9aa2ab; }
                .dlr-bank b { color: #ffd75e; }
                .dlr-note { margin: 4px 0 0; font-size: 11px; color: #7f8790; }
                .dlr-log { margin-top: 12px; max-height: 190px; overflow-y: auto; display: grid; gap: 4px;
                    padding: 9px 11px; border-radius: 11px; background: rgba(0,0,0,0.28); }
                .dlr-line { font-size: 11.5px; line-height: 1.45; color: #9aa2ab; }
                .dlr-line b { color: #6f6486; margin-right: 5px; font-variant-numeric: tabular-nums; }
                .dlr-line.is-fight { color: #ffb9bf; }
                .dlr-line.is-chest, .dlr-line.is-cache { color: #ffe28a; }
                .dlr-line.is-rest { color: #9fe6b8; }
                .dlr-line.is-trap { color: #ff8f9a; }
                .dlr-line.is-potion { color: #d9c2ff; }
            `}</style>
        </div>
    );
}
