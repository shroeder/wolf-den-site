"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── THE RUN ──────────────────────────────────────────────────────────────────────────────────────────────────
// One floor at a time, against the dungeon's own backdrop. The floor you are on is the whole screen; the log
// underneath is what you have already done. You never see what is ahead — the ten floors are dealt server-side
// at the door and only the current one is ever sent, so nothing but the boss is predictable.

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

// ── SOUND ────────────────────────────────────────────────────────────────────────────────────────────────────
// Built on the fly, no assets to load or go stale: a dry crack when you connect, a lower one when you are hit,
// a rising sting on a kill, a longer fanfare for a boss, a falling one on death. Every call is wrapped so a
// browser that blocks audio can never break a tap.
let _ac = null;
const ac = () => {
    if (typeof window === "undefined") return null;
    try {
        _ac = _ac || new (window.AudioContext || window.webkitAudioContext)();
        if (_ac.state === "suspended") _ac.resume();
        return _ac;
    } catch { return null; }
};
function tone(freqs, { type = "triangle", vol = 0.14, len = 0.16, gap = 0.07 } = {}) {
    const a = ac();
    if (!a) return;
    try {
        freqs.forEach((f, i) => {
            const t = a.currentTime + i * gap;
            const o = a.createOscillator();
            const g = a.createGain();
            o.type = type;
            o.frequency.setValueAtTime(f, t);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
            g.gain.exponentialRampToValueAtTime(0.0001, t + len);
            o.connect(g); g.connect(a.destination);
            o.start(t); o.stop(t + len + 0.02);
        });
    } catch { /* audio is a bonus, never a requirement */ }
}
const SFX = {
    hit: () => tone([320, 180], { type: "square", vol: 0.1, len: 0.1, gap: 0.03 }),
    hurt: () => tone([150, 96], { type: "sawtooth", vol: 0.13, len: 0.18, gap: 0.04 }),
    kill: () => tone([523, 659, 880], { vol: 0.15 }),
    boss: () => tone([392, 523, 659, 880, 1047], { vol: 0.17, gap: 0.09 }),
    heal: () => tone([523, 784], { type: "sine", vol: 0.13, gap: 0.09 }),
    loot: () => tone([700, 950], { vol: 0.12, gap: 0.05 }),
    die: () => tone([220, 165, 110], { type: "sawtooth", vol: 0.15, len: 0.3, gap: 0.13 }),
};

export default function DelveRun({ run, busy, onAct }) {
    const logEnd = useRef(null);
    const [floats, setFloats] = useState([]);  // damage / heal numbers flying off the stage
    const [shake, setShake] = useState(0);     // 1 = you connected, 2 = you got hit
    const [flash, setFlash] = useState(null);
    const prev = useRef({ hp: run.hp, foeHp: run.foe?.hp ?? null, floor: run.floor, logLen: run.log?.length ?? 0 });

    // Keep the newest line in view — the log is the only record of a floor once you have left it.
    useEffect(() => { logEnd.current?.scrollIntoView({ block: "nearest" }); }, [run.log?.length]);

    const pop = useCallback((text, tone2) => {
        const id = Math.random().toString(36).slice(2);
        setFloats((f) => [...f, { id, text, tone: tone2, x: 30 + Math.random() * 40 }]);
        setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1100);
    }, []);

    // ── THE JUICE ────────────────────────────────────────────────────────────────────────────────────────────
    // Everything here is derived by DIFFING the server's new state against the last render, not fired from the
    // click handler. The click has no idea what happened — the reply does — so a damage number can never float
    // for a hit the server did not actually deal, and a kill sting can never play for a foe still standing.
    const logLen = run.log?.length ?? 0;
    const foeHp = run.foe?.hp ?? null;
    useEffect(() => {
        const p = prev.current;
        const hpDelta = run.hp - p.hp;

        if (hpDelta < 0) { pop(String(hpDelta), "hurt"); setShake(2); setFlash("hurt"); SFX.hurt(); }
        else if (hpDelta > 0) { pop(`+${hpDelta}`, "heal"); setFlash("heal"); SFX.heal(); }

        if (foeHp != null && p.foeHp != null && foeHp < p.foeHp) {
            pop(String(foeHp - p.foeHp), "dmg");
            setShake((s) => Math.max(s, 1));
            SFX.hit();
        }
        // It was there, now it isn't, and we haven't changed floor: it died.
        if (p.foeHp != null && run.foe == null && run.floor === p.floor) {
            (run.current?.kind === "boss" ? SFX.boss : SFX.kill)();
            setFlash("win");
        }
        // Reached a new floor with a new log line that mentions a gain — that's loot.
        if (run.floor > p.floor && logLen > p.logLen) {
            const last = run.log[logLen - 1];
            if (last && last.text.includes("+") && !last.text.includes("damage")) SFX.loot();
        }
        if (run.hp <= 0) SFX.die();

        prev.current = { hp: run.hp, foeHp, floor: run.floor, logLen };
        const t1 = setTimeout(() => setShake(0), 320);
        const t2 = setTimeout(() => setFlash(null), 380);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, [run.hp, foeHp, run.foe, run.floor, run.log, logLen, run.current?.kind, pop]);

    const hpFrac = Math.max(0, run.hp / run.maxHp);
    const hpState = hpFrac <= 0.25 ? "is-critical" : hpFrac <= 0.5 ? "is-hurt" : "";
    const cur = run.current;
    const fighting = Boolean(run.foe);
    const awaiting = run.awaiting;
    const art = fighting ? run.foe.sprite : (awaiting?.art || EVENT_ART[cur?.kind] || null);

    return (
        <div className="dlr" style={{ "--tint": run.tint }}>
            {/* ── the floor ── */}
            <div className={`dlr-stage${shake ? ` is-shake-${shake}` : ""}`}>
                <Img src={run.bg} className="dlr-bg" />
                <span className="dlr-scrim" aria-hidden="true" />
                {flash ? <span className={`dlr-flash is-${flash}`} aria-hidden="true" /> : null}
                {floats.map((f) => (
                    <span key={f.id} className={`dlr-float is-${f.tone}`} style={{ left: `${f.x}%` }}>{f.text}</span>
                ))}
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
                        {/* Turning back ends the run but KEEPS everything banked — the same deal as dying, minus the dying. */}
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
                /* ── juice ─────────────────────────────────────────────────────────────────────────────── */
                .dlr-stage.is-shake-1 { animation: dlrShake .18s ease-out; --amp: 3px; }
                .dlr-stage.is-shake-2 { animation: dlrShake .26s ease-out; --amp: 8px; }
                @keyframes dlrShake {
                    0% { transform: translate(0,0) }
                    22% { transform: translate(calc(var(--amp) * -1), 2px) rotate(-0.4deg) }
                    52% { transform: translate(var(--amp), -2px) rotate(0.35deg) }
                    78% { transform: translate(calc(var(--amp) * -0.4), 0) }
                    100% { transform: translate(0,0) } }
                .dlr-flash { position: absolute; inset: 0; z-index: 4; pointer-events: none; animation: dlrFlash .38s ease-out forwards; }
                .dlr-flash.is-hurt { background: radial-gradient(circle at 50% 50%, rgba(255,60,80,0.55), transparent 68%); }
                .dlr-flash.is-heal { background: radial-gradient(circle at 50% 60%, rgba(90,230,140,0.5), transparent 66%); }
                .dlr-flash.is-win { background: radial-gradient(circle at 50% 45%, rgba(255,215,94,0.6), transparent 66%); }
                @keyframes dlrFlash { 0% { opacity: .95 } 100% { opacity: 0 } }
                .dlr-float { position: absolute; top: 44%; z-index: 5; pointer-events: none; font-size: 1.5rem; font-weight: 900;
                    text-shadow: 0 2px 10px rgba(0,0,0,0.95); animation: dlrFloat 1.05s cubic-bezier(.2,.9,.3,1) both; }
                .dlr-float.is-dmg { color: #ffe28a; }
                .dlr-float.is-hurt { color: #ff6f7d; }
                .dlr-float.is-heal { color: #7ce8a4; }
                @keyframes dlrFloat {
                    0% { opacity: 0; transform: translateY(8px) scale(.7) }
                    18% { opacity: 1; transform: translateY(-6px) scale(1.22) }
                    100% { opacity: 0; transform: translateY(-70px) scale(1) } }

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
