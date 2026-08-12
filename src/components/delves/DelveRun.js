"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── THE RUN ──────────────────────────────────────────────────────────────────────────────────────────────────
// One floor at a time, in the room that floor happens in. The stage is the game: the backdrop is this
// encounter's own plate, the thing you are dealing with stands on it, and when the floor resolves the stage
// turns into the payoff card. You never see what is ahead — the ten floors are dealt server-side at the door
// and only the current one is ever sent, so nothing but the boss is predictable.
//
// EVERY IMAGE HERE IS A RAW <img>. There used to be a tidy little `Img` wrapper, and it silently unstyled the
// entire screen: styled-jsx scopes by appending its `jsx-<hash>` class to DOM elements, and it does NOT add it
// to a custom component, so every rule that targeted one of those images (`.dlr-bg`, `.dlr-art`, the upgrade
// icons in the hall) compiled to `.dlr-bg.jsx-abc` and matched nothing. The backdrop lost `object-fit: cover`
// and rendered at its natural size inside a 16:10 box — which is exactly what "you just zoomed in on a bg and
// keep moving the pane" looks like — and every sprite rendered at full width. The art was always there.

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
    loot: () => tone([700, 950, 1250], { vol: 0.13, gap: 0.055 }),
    rare: () => tone([659, 880, 1047, 1319, 1568], { vol: 0.16, len: 0.22, gap: 0.085 }),
    gain: () => tone([620, 880], { type: "sine", vol: 0.12, gap: 0.06 }),
    step: () => tone([180, 140], { type: "sine", vol: 0.07, len: 0.09, gap: 0.05 }),
    die: () => tone([220, 165, 110], { type: "sawtooth", vol: 0.15, len: 0.3, gap: 0.13 }),
};
// Which sting a resolved floor plays. The beat and the sound are picked from the SAME tone the server sent, so
// they can never disagree about whether that was a good floor.
const RESULT_SFX = { rare: SFX.rare, boss: SFX.boss, win: SFX.kill, loot: SFX.loot, heal: SFX.heal, gain: SFX.gain, hurt: SFX.hurt, none: SFX.step };

const REWARD_ART = {
    gold: "/images/spin/prizes/coins-big.png",
    xp: "/images/spin/prizes/xp-orb.png",
    potion: "/images/delves/ev-potion.webp",
    frags: "/images/sailing/fragment-wooden.png",
};
const RARITY_COLOR = { common: "#9aa0a6", rare: "#4aa3ff", epic: "#b061ff", legendary: "#ffb020", mythic: "#33e0a1", ascendant: "#ff7a3c", eternal: "#ff5cc8" };
const CHEST_ART = {
    wooden: "/images/spin/prizes/chest-wood.png",
    iron: "/images/spin/prizes/chest-wood.png",
    gold: "/images/spin/prizes/chest-gold.png",
};

export default function DelveRun({ run, busy, onAct }) {
    const logBox = useRef(null);
    const [floats, setFloats] = useState([]);  // damage / heal numbers flying off the stage
    const [shake, setShake] = useState(0);     // 1 = you connected, 2 = you got hit
    const [flash, setFlash] = useState(null);
    const prev = useRef({ hp: run.hp, foeHp: run.foe?.hp ?? null, floor: run.floor, logLen: run.log?.length ?? 0, resultAt: null });

    // Keep the newest line in view by scrolling the LOG BOX, never the page. This was
    // `logEnd.scrollIntoView()`, and scrollIntoView walks up every scrollable ancestor — including the document
    // — so every single tap yanked the window down to the log and left the stage half off the top of the
    // screen. The one place you want to be looking is the place it scrolled away from.
    useEffect(() => {
        const el = logBox.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [run.log?.length]);

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
    const result = run.result || null;
    const resultKey = result ? `${run.floor}:${result.title}` : null;
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
        // A floor just landed on its result — this is the beat, so it gets the sting and the flash.
        if (resultKey && resultKey !== p.resultAt) {
            (RESULT_SFX[result.tone] || SFX.gain)();
            setFlash(result.tone === "hurt" ? "hurt" : result.tone === "heal" ? "heal" : "win");
        }
        if (run.hp <= 0) SFX.die();

        prev.current = { hp: run.hp, foeHp, floor: run.floor, logLen, resultAt: resultKey };
        const t1 = setTimeout(() => setShake(0), 320);
        const t2 = setTimeout(() => setFlash(null), 420);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, [run.hp, foeHp, run.floor, logLen, resultKey, result, pop]);

    const hpFrac = Math.max(0, run.hp / run.maxHp);
    const hpState = hpFrac <= 0.25 ? "is-critical" : hpFrac <= 0.5 ? "is-hurt" : "";
    const cur = run.current;
    const fighting = Boolean(run.foe);
    const awaiting = run.awaiting;

    // What stands on the stage, in priority order: the result of the floor you just finished, the thing hitting
    // you, the thing asking you a question, or the shape of what is ahead.
    const art = result?.art || (fighting ? run.foe.sprite : (awaiting?.art || cur?.art || null));
    const silhouette = !result && !fighting && !awaiting && Boolean(cur?.silhouette);
    const rare = Boolean(result?.rare || (cur?.rare && !fighting && !result));

    const chips = result ? [
        result.gold ? { k: "gold", art: REWARD_ART.gold, text: `+${result.gold.toLocaleString()} gold` } : null,
        result.xp ? { k: "xp", art: REWARD_ART.xp, text: `+${result.xp.toLocaleString()} XP` } : null,
        result.chest ? { k: "chest", art: CHEST_ART[result.chest] || CHEST_ART.wooden, text: `${result.chest} chest` } : null,
        result.parts ? { k: "parts", art: null, text: `${result.parts.n}× ${result.parts.name}` } : null,
        result.frags ? { k: "frags", art: REWARD_ART.frags, text: `${result.frags} shards` } : null,
        result.potion ? { k: "potion", art: REWARD_ART.potion, text: `+${result.potion} potion${result.potion === 1 ? "" : "s"}` } : null,
        result.healed ? { k: "heal", art: REWARD_ART.potion, text: `+${result.healed} health` } : null,
        result.damage ? { k: "dmg", art: null, text: `-${result.damage} health` } : null,
    ].filter(Boolean) : [];

    return (
        <div className="dlr" style={{ "--tint": run.tint }}>
            {/* ── the floor ── */}
            <div className={`dlr-stage${shake ? ` is-shake-${shake}` : ""}${result ? " is-result" : ""}`}>
                {run.bg ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={run.bg} className="dlr-bg" alt="" draggable="false" />
                ) : null}
                <span className="dlr-scrim" aria-hidden="true" />
                {flash ? <span className={`dlr-flash is-${flash}`} aria-hidden="true" /> : null}
                {result && result.tone !== "hurt" && result.tone !== "none" ? (
                    <span className={`dlr-burst is-${result.tone}`} aria-hidden="true">
                        {Array.from({ length: 18 }).map((_, i) => <span key={i} style={{ "--a": `${i * 20}deg`, animationDelay: `${(i % 5) * 0.03}s` }} />)}
                    </span>
                ) : null}
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
                {art ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={art}
                        className={`dlr-art${fighting ? " is-foe" : ""}${rare ? " is-rare" : ""}${silhouette ? " is-shadow" : ""}${result ? " is-result" : ""}`}
                        alt=""
                        draggable="false"
                    />
                ) : null}
                {rare ? <span className="dlr-rare-tag">RARE FIND</span> : null}
                {fighting ? (
                    <div className="dlr-foe">
                        <b>{run.foe.name}</b>
                        <span className="dlr-foe-bar"><span style={{ width: `${Math.max(0, (run.foe.hp / run.foe.maxHp) * 100)}%` }} /></span>
                        <em>{run.foe.hp} / {run.foe.maxHp}</em>
                    </div>
                ) : null}
                {/* The payoff, drawn ON the stage rather than as a log line. This is the beat the whole floor
                    was building to, so it gets the room, the sprite and the numbers all in one frame. */}
                {result ? (
                    <div className={`dlr-payoff is-${result.tone}`}>
                        <b>{result.title}</b>
                        {result.gear ? (
                            <span className="dlr-gear" style={{ "--rar": RARITY_COLOR[result.gear.rarity] || "#4aa3ff" }}>
                                <em>{result.gear.rarity}</em>{result.gear.name}
                            </span>
                        ) : null}
                        {chips.length ? (
                            <div className="dlr-chips">
                                {chips.map((c) => (
                                    <span key={c.k} className={`dlr-chip is-${c.k}`}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        {c.art ? <img src={c.art} alt="" draggable="false" /> : null}
                                        {c.text}
                                    </span>
                                ))}
                            </div>
                        ) : null}
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
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/images/delves/ev-potion.webp" className="dlr-potion-ico" alt="" draggable="false" />
                    <b>{run.potions}</b>
                </button>
            </div>

            {/* ── what's happening ── */}
            <div className="dlr-card">
                {/* Same priority as the stage: result, then the thing hitting you, then the question, then the
                    floor. The card and the picture must never be describing different floors. */}
                <b className="dlr-card-title">{result ? result.title : fighting ? run.foe.name : (awaiting?.title || cur?.title)}</b>
                <p className="dlr-card-text">{result ? result.line : fighting ? cur?.text : (awaiting?.text || cur?.text)}</p>

                {result ? (
                    <div className="dlr-actions is-single">
                        <button type="button" className="dlv-btn" disabled={busy} onClick={() => onAct("onward")}>
                            {run.floor >= run.floors ? "Take what it owes you" : "Onward"}
                        </button>
                    </div>
                ) : fighting ? (
                    <div className="dlr-actions is-single">
                        <button type="button" className="dlv-btn is-danger" disabled={busy} onClick={() => onAct("strike")}>Strike</button>
                    </div>
                ) : awaiting ? (
                    <div className="dlr-options">
                        {awaiting.options.map((o) => (
                            <button key={o.key} type="button" className="dlv-btn is-ghost dlr-option" disabled={busy}
                                onClick={() => onAct("choose", { choice: o.key })}>
                                <span>{o.label}</span>
                                {/* Only PRICES are shown. What it does is the thing you are deciding. */}
                                {o.cost ? <em>{o.cost.toLocaleString()} gold</em> : null}
                                {o.potionCost ? <em>{o.potionCost} potion</em> : null}
                                {o.hpCost ? <em className="is-blood">{o.hpCost} health</em> : null}
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="dlr-actions is-single">
                        <button type="button" className="dlv-btn" disabled={busy} onClick={() => onAct("enter")}>Step in</button>
                    </div>
                )}
            </div>

            {/* ── what you're carrying ── */}
            <div className="dlr-bank">
                <span>Carrying <b>{(run.banked?.gold || 0).toLocaleString()}</b> gold</span>
                <span><b>{(run.banked?.xp || 0).toLocaleString()}</b> XP</span>
                {run.banked?.chests?.length ? <span><b>{run.banked.chests.length}</b> chest{run.banked.chests.length === 1 ? "" : "s"}</span> : null}
            </div>
            <p className="dlr-note">Fall down here and you still keep everything above. There is no way back up.</p>

            {run.log?.length ? (
                <div className="dlr-log" ref={logBox}>
                    {run.log.slice(-14).map((l, i) => (
                        <div key={i} className={`dlr-line is-${l.kind}`}><b>F{l.floor}</b> {l.text}</div>
                    ))}
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
                .dlr-flash { position: absolute; inset: 0; z-index: 4; pointer-events: none; animation: dlrFlash .42s ease-out forwards; }
                .dlr-flash.is-hurt { background: radial-gradient(circle at 50% 50%, rgba(255,60,80,0.55), transparent 68%); }
                .dlr-flash.is-heal { background: radial-gradient(circle at 50% 60%, rgba(90,230,140,0.5), transparent 66%); }
                .dlr-flash.is-win { background: radial-gradient(circle at 50% 45%, rgba(255,215,94,0.6), transparent 66%); }
                @keyframes dlrFlash { 0% { opacity: .95 } 100% { opacity: 0 } }

                /* A ring of shards thrown off the middle of the stage when a floor pays. Cheap, and it is the
                   difference between "a number changed" and "something happened". */
                .dlr-burst { position: absolute; inset: 0; z-index: 3; display: grid; place-items: center; pointer-events: none; }
                .dlr-burst span { position: absolute; width: 4px; height: 15px; border-radius: 2px; transform-origin: 50% 0;
                    background: linear-gradient(#ffe28a, transparent); animation: dlrBurst .95s cubic-bezier(.15,.75,.3,1) both; }
                .dlr-burst.is-heal span { background: linear-gradient(#8bf0b4, transparent); }
                .dlr-burst.is-rare span { background: linear-gradient(#fff1b8, transparent); width: 5px; height: 22px; }
                @keyframes dlrBurst { from { opacity: 1; transform: rotate(var(--a)) translateY(0) scaleY(.35); }
                    to { opacity: 0; transform: rotate(var(--a)) translateY(-115px) scaleY(1); } }

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
                .dlr-stage.is-result { border-color: color-mix(in srgb, var(--tint) 80%, white); }
                .dlr-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
                    animation: dlrPan 16s ease-in-out infinite alternate; }
                /* A slow, tiny drift. Enough that the room is alive; small enough that it never reads as a pan. */
                @keyframes dlrPan { from { transform: scale(1.04) translate(-0.6%, 0.4%); } to { transform: scale(1.09) translate(0.8%, -0.6%); } }
                .dlr-scrim { position: absolute; inset: 0; background: radial-gradient(72% 62% at 50% 45%, rgba(6,4,12,0.06), rgba(8,5,14,0.82)); }
                .dlr-depth { position: absolute; top: 9px; left: 11px; z-index: 2; display: flex; align-items: baseline; gap: 5px; }
                .dlr-depth b { font-size: 15px; font-weight: 900; color: #fff; text-shadow: 0 2px 8px #000; }
                .dlr-depth span { font-size: 10.5px; color: #cbbfe0; text-shadow: 0 2px 6px #000; }
                .dlr-pips { position: absolute; top: 12px; right: 11px; z-index: 2; display: flex; gap: 3px; }
                .dlr-pip { width: 7px; height: 7px; border-radius: 2px; background: rgba(255,255,255,0.22); }
                .dlr-pip.is-done { background: color-mix(in srgb, var(--tint) 80%, white); }
                .dlr-pip.is-now { background: #fff; box-shadow: 0 0 8px #fff; }
                .dlr-pip.is-boss { width: 10px; background: rgba(255,110,130,0.45); }
                .dlr-pip.is-boss.is-done { background: #ff6f7d; }

                .dlr-art { position: relative; z-index: 1; width: 46%; max-height: 70%; object-fit: contain;
                    filter: drop-shadow(0 8px 20px rgba(0,0,0,0.65)); animation: dlrIn .4s cubic-bezier(.2,1.3,.4,1) both; }
                /* What is ahead, not what it looks like. Black fill, faint rim, breathing. */
                .dlr-art.is-shadow { filter: brightness(0) drop-shadow(0 0 12px color-mix(in srgb, var(--tint) 70%, transparent)); opacity: 0.72;
                    animation: dlrIn .4s cubic-bezier(.2,1.3,.4,1) both, dlrBreathe 2.6s ease-in-out .4s infinite alternate; }
                .dlr-art.is-result { width: 40%; max-height: 52%; margin-bottom: 44px; animation: dlrPayoffIn .5s cubic-bezier(.2,1.5,.35,1) both; }
                @keyframes dlrPayoffIn { from { opacity: 0; transform: scale(.55) rotate(-6deg); } to { opacity: 1; transform: none; } }
                /* A RARE FIND IS A FRAMED PLATE, NOT A DIE-CUT OBJECT.
                   Every ordinary encounter sprite is a 256px cut-out on transparency, so contain plus a
                   drop-shadow floats it on the backdrop exactly as intended. The rare arts are not: they are
                   opaque 420px SCENES, and given the same treatment they landed as a hard-edged square
                   photograph pasted onto another photograph, with a shadow tracing the rectangle. That is the
                   whole of why it looked wrong — the sprite was fine, the treatment was for a different kind
                   of picture.
                   So it gets a frame on purpose: rounded, gilt-edged, lit from behind. A rare find is the
                   thing you want to be looking at, so it also sits a little larger than an ordinary floor. */
                .dlr-art.is-rare { width: 52%; max-height: 62%; border-radius: 14px;
                    border: 2px solid rgba(255,215,94,.8); background: #0b0d10;
                    animation: dlrIn .4s cubic-bezier(.2,1.3,.4,1) both, dlrRare 1.8s ease-in-out .4s infinite alternate; }
                @keyframes dlrRare {
                    from { box-shadow: 0 10px 26px rgba(0,0,0,.7), 0 0 14px rgba(255,215,94,.5); filter: none; }
                    to { box-shadow: 0 10px 26px rgba(0,0,0,.7), 0 0 34px rgba(255,215,94,.95); filter: none; } }
                /* CLEAR OF THE PLATE. At 40px it sat ON the picture, cutting its top edge in half. It is a
                   banner over the scene now, above the frame, where a label belongs. */
                .dlr-rare-tag { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); z-index: 3;
                    padding: 4px 13px; border-radius: 999px; font-size: 10px; font-weight: 900; letter-spacing: .12em;
                    color: #2a1c00; background: linear-gradient(180deg, #ffe9a8, #f0c14b); box-shadow: 0 0 22px rgba(255,200,70,.75); }
                .dlr-art.is-foe { animation: dlrIn .4s cubic-bezier(.2,1.3,.4,1) both, dlrBreathe 2.6s ease-in-out 0.4s infinite alternate; }
                @keyframes dlrIn { from { opacity: 0; transform: scale(.8) translateY(10px); } to { opacity: 1; transform: none; } }
                @keyframes dlrBreathe { from { transform: translateY(0) } to { transform: translateY(-5px) } }
                .dlr-foe { position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); z-index: 2; width: min(78%, 320px); text-align: center; }
                .dlr-foe b { display: block; font-size: 13px; color: #fff; text-shadow: 0 2px 8px #000; }
                .dlr-foe-bar { display: block; height: 7px; margin: 4px 0 2px; border-radius: 999px; overflow: hidden; background: rgba(0,0,0,0.55); }
                .dlr-foe-bar > span { display: block; height: 100%; background: linear-gradient(90deg, #ff6f7d, #ffb0b8); transition: width .3s ease; }
                .dlr-foe em { font-size: 10px; font-style: normal; color: #e6d9ff; text-shadow: 0 1px 4px #000; }

                .dlr-payoff { position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); z-index: 6;
                    width: min(92%, 380px); text-align: center; animation: dlrPayoffUp .45s cubic-bezier(.2,1.3,.4,1) .12s both; }
                @keyframes dlrPayoffUp { from { opacity: 0; transform: translate(-50%, 14px); } to { opacity: 1; transform: translate(-50%, 0); } }
                .dlr-payoff > b { display: block; font-size: 1.05rem; font-weight: 900; color: #fff; text-shadow: 0 2px 10px #000, 0 0 22px rgba(0,0,0,.9); }
                .dlr-payoff.is-hurt > b { color: #ffb0b8; }
                .dlr-payoff.is-rare > b { color: #ffe28a; }
                .dlr-chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; margin-top: 7px; }
                .dlr-chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px 4px 5px; border-radius: 999px;
                    font-size: 12px; font-weight: 900; color: #ffe28a; background: rgba(10,6,16,0.78);
                    border: 1px solid rgba(255,215,94,0.5); animation: dlrChip .4s cubic-bezier(.2,1.5,.35,1) both; }
                .dlr-chip img { width: 20px; height: 20px; object-fit: contain; }
                .dlr-chip.is-heal { color: #8bf0b4; border-color: rgba(139,240,180,0.5); }
                .dlr-chip.is-dmg { color: #ff8f9a; border-color: rgba(255,143,154,0.5); padding-left: 10px; }
                .dlr-chip.is-parts { padding-left: 10px; color: #cfd6dd; border-color: rgba(207,214,221,0.45); }
                /* Gear is the rarest thing a fight can drop, so it gets its own rarity-coloured banner rather
                   than a chip in a row of chips. */
                .dlr-gear { display: inline-flex; align-items: center; gap: 7px; margin-top: 8px; padding: 5px 13px;
                    border-radius: 999px; font-size: 13px; font-weight: 900; color: #fff; background: rgba(10,6,16,0.82);
                    border: 1px solid var(--rar); box-shadow: 0 0 22px -4px var(--rar);
                    animation: dlrChip .45s cubic-bezier(.2,1.5,.35,1) .1s both; }
                .dlr-gear em { font-style: normal; font-size: 9.5px; font-weight: 900; letter-spacing: .1em;
                    text-transform: uppercase; color: var(--rar); }
                @keyframes dlrChip { from { opacity: 0; transform: translateY(8px) scale(.8); } to { opacity: 1; transform: none; } }

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
                .dlr-potion-ico { width: 22px; height: 22px; object-fit: contain; }

                .dlr-card { padding: 13px 15px; border-radius: 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); }
                .dlr-card-title { font-size: 1rem; color: color-mix(in srgb, var(--tint) 65%, white); }
                .dlr-card-text { margin: 5px 0 12px; font-size: 12.5px; line-height: 1.5; color: #b9c2cc; }
                .dlr-actions { display: grid; gap: 8px; }
                .dlr-actions.is-single { grid-template-columns: 1fr; }
                .dlr-options { display: grid; gap: 7px; }
                .dlr-option { justify-content: space-between; padding: 12px 14px; font-size: 0.86rem; text-align: left; }
                .dlr-option em { font-style: normal; font-size: 0.76rem; font-weight: 800; color: #ffd75e; white-space: nowrap; }
                .dlr-option em.is-blood { color: #ff8f9a; }

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
