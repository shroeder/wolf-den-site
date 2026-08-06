"use client";

import { useEffect, useRef, useState } from "react";

// ── THE SHIP BATTLE ──────────────────────────────────────────────────────────────────────────────────────────
// The old raid scene drew two ships and then resolved a fight between their CAPTAINS: one damage number a
// round, floating over a hull that never did anything. This plays the battle the sim actually ran.
//
// A broadside is a VOLLEY — one ball per gun that bore, fired in a ragged stagger rather than a single tracer,
// with the ones that missed splashing short. That is the whole reason gun count is a stat you can see: eleven
// balls in the air reads as eleven guns without a number anywhere.
//
// Rakes flash and shake. Fires keep burning between broadsides. And the loser SINKS — bow down, slow, while
// the result card waits for it, because a ship going under is the moment worth watching.
//
// Styling lives in globals.css. Row markup like this belongs in the global sheet, not a <style jsx> block:
// scoped styles only reach JSX written inside the component that owns them, and this file has several
// components. (That is exactly how the sailing boards shipped with dead CSS and a full-screen ship.)

const clampPct = (v, max) => Math.max(0, Math.min(100, Math.round((v / Math.max(1, max)) * 100)));

// One cannonball per gun. They leave the muzzle in a ragged stagger — a broadside is not a chord — and the
// misses fall short and splash.
function Volley({ ev, side }) {
    const shots = ev?.shots || [];
    return (
        <span className={`sbt-volley to-${side === "me" ? "foe" : "me"}`} aria-hidden="true">
            {shots.map((s, i) => (
                <i
                    key={i}
                    className={`sbt-ball${s.hit ? "" : " is-miss"}${s.rake ? " is-rake" : ""}`}
                    style={{ animationDelay: `${i * 46}ms`, "--lane": `${(i % 5) * 9 - 18}px` }}
                />
            ))}
        </span>
    );
}

function Ship({ f, side, firing, hurt, low, sinking }) {
    return (
        <div className={`sbt-ship sbt-ship-${side}${firing ? " is-firing" : ""}${hurt ? " is-hurt" : ""}${low ? " is-low" : ""}${sinking ? " is-sinking" : ""}`}>
            <div className="sbt-hull">
                {f?.art ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.art} alt="" className={`sbt-boat${side === "foe" ? " is-mirror" : ""}`} draggable="false" />
                ) : <span className="sbt-boat-fallback" aria-hidden="true" />}
            </div>
            <span className="sbt-wake" aria-hidden="true" />
            {sinking ? <span className="sbt-foam" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span> : null}
        </div>
    );
}

function Bar({ label, hp, max, side, guns, ammo, sub }) {
    const pct = clampPct(hp, max);
    return (
        <div className={`sbt-panel sbt-panel-${side}`}>
            <div className="sbt-pname">
                <b>{label}</b>
                {sub ? <em>{sub}</em> : null}
            </div>
            <div className="sbt-hpbar">
                <span className={`sbt-hpfill is-${side}${pct <= 25 ? " is-low" : ""}`} style={{ width: `${pct}%` }} />
                <b className="sbt-hpnum">{Math.max(0, Math.round(hp))}</b>
            </div>
            <div className="sbt-meta">
                <span>{guns} guns</span>
                {ammo ? <span className={`sbt-ammo is-${ammo}`}>{ammo}</span> : null}
            </div>
        </div>
    );
}

export default function ShipBattleScene({ battle, onClose }) {
    const events = battle?.events || [];
    const win = Boolean(battle?.win);
    const me = battle?.me || {};
    const foe = battle?.foe || {};

    const [phase, setPhase] = useState("intro"); // intro → fight → sinking → result
    const [step, setStep] = useState(-1);
    const [myHp, setMyHp] = useState(battle?.myMax || 100);
    const [foeHp, setFoeHp] = useState(battle?.foeMax || 100);
    const [fx, setFx] = useState(null);      // the volley being drawn
    const [note, setNote] = useState(null);  // gauge / fire / rigging call-outs
    const [shake, setShake] = useState(null);
    const [ready, setReady] = useState(false);
    const timers = useRef([]);

    const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
    useEffect(() => clearTimers, []);

    // Intro splash, then the fight.
    useEffect(() => {
        const t = setTimeout(() => { setPhase("fight"); setStep(0); }, 1500);
        return () => clearTimeout(t);
    }, []);

    // Step the script. Each volley: balls fly, then land, then the bars move.
    useEffect(() => {
        if (phase !== "fight" || step < 0) return undefined;
        if (step >= events.length) {
            // The loser goes down slowly — the beat the whole scene is for.
            const sunk = battle?.sunk;
            if (sunk) {
                setPhase("sinking");
                const t1 = setTimeout(() => { setPhase("result"); setTimeout(() => setReady(true), 700); }, 2600);
                timers.current.push(t1);
            } else {
                const t1 = setTimeout(() => { setPhase("result"); setTimeout(() => setReady(true), 500); }, 700);
                timers.current.push(t1);
            }
            return () => clearTimers();
        }
        const ev = events[step];
        const advance = (ms) => { const t = setTimeout(() => setStep((s) => s + 1), ms); timers.current.push(t); };

        if (ev.type === "gauge") {
            setNote({ k: step, kind: "gauge", side: ev.side,
                text: ev.side === "me" ? "You take the weather gauge — first broadside" : "They have the weather gauge" });
            advance(1150);
            return () => clearTimers();
        }
        if (ev.type === "fire") {
            setNote({ k: step, kind: "fire", side: ev.side, text: `Fire spreads — ${ev.dmg}` });
            setMyHp(ev.my); setFoeHp(ev.foe);
            advance(760);
            return () => clearTimers();
        }
        // A volley.
        setNote(null);
        setFx({ k: step, ...ev });
        const hits = (ev.shots || []).filter((s) => s.hit).length;
        const raked = (ev.shots || []).some((s) => s.rake);
        const land = setTimeout(() => {
            setMyHp(ev.my); setFoeHp(ev.foe);
            if (hits) setShake({ k: step, big: raked });
            const clear = setTimeout(() => setShake(null), raked ? 420 : 260);
            timers.current.push(clear);
        }, 430);
        timers.current.push(land);
        advance(950);
        return () => clearTimers();
    }, [phase, step, events, battle]);

    const sinkingSide = phase === "sinking" || phase === "result" ? battle?.sunk : null;
    const lowAny = clampPct(myHp, battle?.myMax) <= 25 || clampPct(foeHp, battle?.foeMax) <= 25;

    return (
        <div className="sbt-scene" role="dialog" aria-modal="true">
            <div className="sbt-sky" aria-hidden="true" />
            <div className="sbt-sea" aria-hidden="true" />

            <div className="sbt-hud">
                <Bar label={me.name || "Your ship"} hp={myHp} max={battle?.myMax} side="me" guns={me.guns} ammo={me.ammo} sub={`Lv ${me.level ?? "?"}`} />
                <div className="sbt-vs" aria-hidden="true">⚓</div>
                <Bar label={foe.name || "Enemy ship"} hp={foeHp} max={battle?.foeMax} side="foe" guns={foe.guns} ammo={foe.ammo} sub={foe.cls || null} />
            </div>

            <div className={`sbt-shakewrap${shake ? (shake.big ? " is-quake" : " is-shake") : ""}`}>
                <div className={`sbt-stage${lowAny ? " is-desperate" : ""}`}>
                    <Ship f={me} side="me" firing={fx?.side === "me" && phase === "fight"}
                        hurt={fx?.side === "foe" && phase === "fight"} low={clampPct(myHp, battle?.myMax) <= 25}
                        sinking={sinkingSide === "me"} />
                    <Ship f={foe} side="foe" firing={fx?.side === "foe" && phase === "fight"}
                        hurt={fx?.side === "me" && phase === "fight"} low={clampPct(foeHp, battle?.foeMax) <= 25}
                        sinking={sinkingSide === "foe"} />

                    {phase === "fight" && fx ? <Volley key={`v${fx.k}`} ev={fx} side={fx.side} /> : null}

                    {phase === "fight" && fx?.dmg ? (
                        <span key={`d${fx.k}`} className={`sbt-float ${fx.side === "me" ? "on-foe" : "on-me"}`}>
                            −{fx.dmg}
                            {(fx.shots || []).some((s) => s.rake) ? <b> RAKED!</b> : null}
                        </span>
                    ) : null}

                    {note ? <span key={`n${note.k}`} className={`sbt-note is-${note.kind}`}>{note.text}</span> : null}
                    {fx?.rigged ? <span key={`r${fx.k}`} className={`sbt-note is-rig ${fx.side === "me" ? "on-foe" : "on-me"}`}>Rigging shredded — {fx.rigged} guns silenced</span> : null}
                </div>
            </div>

            {phase === "intro" ? (
                <div className="sbt-intro">
                    <div className="sbt-intro-tag">{foe.boss ? "FLAGSHIP" : "SHIP BATTLE"}</div>
                    <div className="sbt-intro-name">{foe.name}</div>
                    {foe.cls ? <div className="sbt-intro-cls">{foe.cls}</div> : null}
                    {foe.flavor ? <p className="sbt-intro-flavor">{foe.flavor}</p> : null}
                </div>
            ) : null}

            {phase === "sinking" ? (
                <div className="sbt-sinkcall">
                    {battle?.sunk === "foe" ? <>You sank <b>{foe.name}</b></> : <>Your ship is going down</>}
                </div>
            ) : null}

            {phase === "result" ? (
                <div className="sbt-result">
                    <div className={`card sbt-result-card ${win ? "is-win" : "is-lose"}`}>
                        <div className={`sbt-result-banner ${win ? "is-win" : "is-lose"}`}>
                            {win ? (battle?.sunk === "foe" ? "Sunk!" : "Victory") : (battle?.sunk === "me" ? "Sent to the bottom" : "Driven off")}
                        </div>
                        <p className="sbt-result-line">
                            {win
                                ? <>{foe.name} {battle?.sunk === "foe" ? "went down by the bow." : "broke off and ran."} {battle?.first ? "A new rung on the ladder." : "You have beaten her before."}</>
                                : <>{foe.name} had the better of it. Your sortie is spent — the fleet keeps your progress.</>}
                        </p>
                        {win && battle?.reward?.length ? (
                            <div className="sbt-rewards">
                                {battle.reward.map((r, i) => (
                                    <span key={i} className={`sbt-reward is-${r.kind}`}>
                                        {r.kind === "doubloons" ? `+${r.n} doubloons`
                                            : r.kind === "gold" ? `+${r.n.toLocaleString()} gold`
                                            : r.kind === "xp" ? `+${r.n} XP`
                                            : r.kind === "fragments" ? `+${r.n} fragments`
                                            : r.kind === "parts" ? `+${r.n} tier-${r.tier} parts`
                                            : r.kind === "chest" ? `${r.tier} chest`
                                            : r.kind === "seed" ? "a seed for the farm"
                                            : `${r.kind}`}
                                    </span>
                                ))}
                            </div>
                        ) : null}
                        <button className="sail-cta" disabled={!ready} onClick={onClose}>{ready ? "Back to the helm ⚓" : "…"}</button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
