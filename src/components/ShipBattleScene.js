"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Gi from "react-icons/gi";

// ── THE SHIP BATTLE ──────────────────────────────────────────────────────────────────────────────────────────
// The first cut resolved the whole fight server-side and played it back. It looked fine and felt like nothing:
// you pressed Engage and watched a replay you had no part in. A battle is fought a ROUND at a time now — the
// server hands back one exchange per order, and between exchanges the screen waits for you.
//
// Four orders, each a trade rather than a strictly-better button (see ship-battle.js): broadside, rake, brace,
// board. The whole point is that "what do I do about this" has an answer other than watching.
//
// What is on screen and why:
//   • both ships, with their CAPTAIN and their PET on deck — you are fighting a person, not a stat block
//   • a broadside as one ball per gun, from the muzzle, arcing, splashing when it misses
//   • a running LOG of what actually happened, because a number that flashes for 900ms is not information
//   • the state that decides your next order: rigging shredded, fires burning, who has the weather gauge
//
// Styling lives in globals.css — this file has several components, and a scoped <style jsx> block only reaches
// the one that owns it.

const Icon = ({ name, className }) => {
    const C = Gi[name] || Gi.GiCannon;
    return <C className={className} aria-hidden="true" />;
};
const clampPct = (v, max) => Math.max(0, Math.min(100, Math.round((v / Math.max(1, max)) * 100)));

// One cannonball per gun, leaving the muzzle in a ragged stagger with a puff of smoke behind it. A broadside
// is not a chord — the guns fire as their crews get to them.
function Volley({ ev }) {
    const shots = ev?.shots || [];
    const dir = ev.side === "me" ? "to-foe" : "to-me";
    return (
        <span className={`sbt-volley ${dir}`} aria-hidden="true">
            <i className="sbt-muzzle" />
            {shots.map((s, i) => (
                <i
                    key={i}
                    className={`sbt-ball${s.hit ? "" : " is-miss"}${s.rake ? " is-rake" : ""}`}
                    style={{ animationDelay: `${i * 52}ms`, "--lane": `${((i % 4) - 1.5) * 11}px` }}
                />
            ))}
        </span>
    );
}

function Ship({ f, side, firing, hurt, low, sinking, burning }) {
    return (
        <div className={`sbt-ship sbt-ship-${side}${firing ? " is-firing" : ""}${hurt ? " is-hurt" : ""}${low ? " is-low" : ""}${sinking ? " is-sinking" : ""}`}>
            <div className="sbt-hull">
                {f?.art ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.art} alt="" className={`sbt-boat${f.mirror ? " is-mirror" : ""}`} draggable="false" />
                ) : <span className="sbt-boat-fallback" aria-hidden="true" />}
                {/* THE CREW. A ship with nobody on it is a prop; this is the person you are fighting. */}
                <span className="sbt-crew">
                    {f?.pet?.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.pet.url} alt="" className="sbt-pet"
                            style={{ transform: (side === "foe") !== Boolean(f.pet.flip) ? "scaleX(-1)" : undefined }} />
                    ) : null}
                    {f?.rider ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.rider} alt="" className="sbt-rider"
                            style={{ transform: (side === "foe") !== Boolean(f.riderFlip) ? "scaleX(-1)" : undefined }} />
                    ) : null}
                </span>
                {burning ? <span className="sbt-burning" aria-hidden="true"><i /><i /><i /></span> : null}
            </div>
            <span className="sbt-wake" aria-hidden="true" />
            {sinking ? <span className="sbt-foam" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span> : null}
        </div>
    );
}

function Bar({ f, hp, max, side, rigged, burning }) {
    const pct = clampPct(hp, max);
    return (
        <div className={`sbt-panel sbt-panel-${side}`}>
            <div className="sbt-pname">
                <b>{f?.name || "Ship"}</b>
                <em>{f?.cls || (f?.level != null ? `boat level ${f.level}` : "")}</em>
            </div>
            <div className="sbt-hpbar">
                <span className={`sbt-hpfill is-${side}${pct <= 25 ? " is-low" : ""}`} style={{ width: `${pct}%` }} />
                <b className="sbt-hpnum">{Math.max(0, Math.round(hp))} / {max}</b>
            </div>
            <div className="sbt-meta">
                <span>{f?.guns} guns</span>
                {f?.ammo ? <span className={`sbt-ammo is-${f.ammo}`}>{f.ammo}</span> : null}
                {rigged ? <span className="sbt-flag is-rig">−{rigged} guns</span> : null}
                {burning ? <span className="sbt-flag is-fire">burning</span> : null}
            </div>
        </div>
    );
}

// A line of the log for one event. This is the "more data" the fight was missing: what was fired, how many of
// them hit, what it cost, and what it did besides damage.
function logLine(ev, me, foe) {
    const who = ev.side === "me" ? (me?.name || "You") : (foe?.name || "They");
    if (ev.type === "fire") return { side: ev.side, text: `Fire burns aboard ${ev.side === "me" ? (foe?.name || "them") : (me?.name || "you")} — ${ev.dmg}` };
    if (ev.type === "order" && ev.order === "brace") return { side: ev.side, text: `${who} braces — holding fire, taking it on the armour` };
    if (ev.type !== "volley") return null;
    const hits = (ev.shots || []).filter((s) => s.hit).length;
    const raked = (ev.shots || []).some((s) => s.rake);
    const verb = ev.order === "board" ? "boards" : ev.order === "rake" ? "rakes the rigging" : "fires a broadside";
    return {
        side: ev.side,
        text: `${who} ${verb} — ${hits}/${ev.guns} on target for ${ev.dmg}${raked ? ", RAKED" : ""}${ev.rigged ? ` · ${ev.rigged} of their guns silenced` : ""}`,
        big: raked || ev.order === "board",
    };
}

export default function ShipBattleScene({ battle, busy, onOrder, onClose }) {
    const me = battle?.me || {};
    const foe = battle?.foe || {};
    const events = battle?.events || [];

    const [phase, setPhase] = useState(battle?.round ? "orders" : "intro"); // intro → play → orders → sinking → result
    const [step, setStep] = useState(-1);
    const [myHp, setMyHp] = useState(battle?.myHp ?? battle?.myMax ?? 100);
    const [foeHp, setFoeHp] = useState(battle?.foeHp ?? battle?.foeMax ?? 100);
    const [fx, setFx] = useState(null);
    const [shake, setShake] = useState(null);
    const [log, setLog] = useState([]);
    const [ready, setReady] = useState(false);
    const logRef = useRef(null);

    // A fresh batch of events (the answer to an order) → play it.
    useEffect(() => {
        if (!events.length) { setPhase((ph) => (ph === "intro" ? ph : "orders")); return; }
        setStep(0);
        setPhase("play");
    }, [events]);

    // Opening splash.
    useEffect(() => {
        if (phase !== "intro") return undefined;
        const t = setTimeout(() => setPhase("orders"), 1600);
        return () => clearTimeout(t);
    }, [phase]);

    // Step through this exchange. Each phase transition owns its own timer — scheduling a cross-phase timer
    // inside this effect is how the first version dead-ended on the sinking with no recap.
    useEffect(() => {
        if (phase !== "play" || step < 0) return undefined;
        if (step >= events.length) {
            if (battle?.over) { setPhase(battle?.sunk ? "sinking" : "result"); return undefined; }
            const t = setTimeout(() => setPhase("orders"), 260);
            return () => clearTimeout(t);
        }
        const ev = events[step];
        const line = logLine(ev, me, foe);
        if (line) setLog((l) => [...l.slice(-40), { ...line, k: `${battle?.round}-${step}` }]);

        if (ev.type === "volley") {
            setFx({ k: `${battle?.round}-${step}`, ...ev });
            const land = setTimeout(() => {
                setMyHp(ev.my); setFoeHp(ev.foe);
                if ((ev.shots || []).some((s) => s.hit)) setShake({ k: step, big: (ev.shots || []).some((s) => s.rake) || ev.order === "board" });
            }, 440);
            const clearShake = setTimeout(() => setShake(null), 900);
            const next = setTimeout(() => setStep((v) => v + 1), 1150);
            return () => { clearTimeout(land); clearTimeout(clearShake); clearTimeout(next); };
        }
        setMyHp(ev.my); setFoeHp(ev.foe);
        const next = setTimeout(() => setStep((v) => v + 1), 720);
        return () => clearTimeout(next);
    }, [phase, step, events, battle, me, foe]);

    useEffect(() => {
        if (phase !== "sinking") return undefined;
        const t = setTimeout(() => setPhase("result"), 2500);
        return () => clearTimeout(t);
    }, [phase]);

    useEffect(() => {
        if (phase !== "result") return undefined;
        const t = setTimeout(() => setReady(true), 600);
        return () => clearTimeout(t);
    }, [phase]);

    useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log]);

    const give = useCallback((order) => { setFx(null); onOrder?.(order); }, [onOrder]);

    const sinkingSide = phase === "sinking" || phase === "result" ? battle?.sunk : null;
    const win = Boolean(battle?.win);
    const lowAny = clampPct(myHp, battle?.myMax) <= 25 || clampPct(foeHp, battle?.foeMax) <= 25;

    return (
        <div className="sbt-scene" role="dialog" aria-modal="true">
            <div className="sbt-sky" aria-hidden="true" />
            <div className="sbt-sea" aria-hidden="true" />

            <div className="sbt-hud">
                <Bar f={me} hp={myHp} max={battle?.myMax} side="me" rigged={battle?.rigged?.me} burning={battle?.burning?.me} />
                <div className="sbt-round">
                    <b>Round {Math.max(1, battle?.round || 1)}</b>
                    <em>{battle?.gauge === "me" ? "you hold the gauge" : "they hold the gauge"}</em>
                </div>
                <Bar f={foe} hp={foeHp} max={battle?.foeMax} side="foe" rigged={battle?.rigged?.foe} burning={battle?.burning?.foe} />
            </div>

            <div className={`sbt-shakewrap${shake ? (shake.big ? " is-quake" : " is-shake") : ""}`}>
                <div className={`sbt-stage${lowAny ? " is-desperate" : ""}`}>
                    <Ship f={me} side="me" firing={fx?.side === "me" && phase === "play"}
                        hurt={fx?.side === "foe" && phase === "play"} low={clampPct(myHp, battle?.myMax) <= 25}
                        sinking={sinkingSide === "me"} burning={(battle?.burning?.me || 0) > 0} />
                    <Ship f={foe} side="foe" firing={fx?.side === "foe" && phase === "play"}
                        hurt={fx?.side === "me" && phase === "play"} low={clampPct(foeHp, battle?.foeMax) <= 25}
                        sinking={sinkingSide === "foe"} burning={(battle?.burning?.foe || 0) > 0} />

                    {phase === "play" && fx ? <Volley key={`v${fx.k}`} ev={fx} /> : null}
                    {phase === "play" && fx?.dmg ? (
                        <span key={`d${fx.k}`} className={`sbt-float ${fx.side === "me" ? "on-foe" : "on-me"}`}>
                            −{fx.dmg}
                            {(fx.shots || []).some((s) => s.rake) ? <b>RAKED</b> : fx.order === "board" ? <b>BOARDED</b> : null}
                        </span>
                    ) : null}
                </div>
            </div>

            {/* THE LOG — what actually happened, in order, still there a second later. */}
            <div className={`sbt-log${log.length ? "" : " is-empty"}`} ref={logRef}>
                {log.map((l) => (
                    <p key={l.k} className={`sbt-logline is-${l.side}${l.big ? " is-big" : ""}`}>{l.text}</p>
                ))}
            </div>

            {/* ORDERS — the reason this is a fight rather than a cutscene. */}
            {phase === "orders" && !battle?.over ? (
                <div className="sbt-orders">
                    {(battle?.orders || []).map((o) => (
                        <button key={o.id} type="button" className={`sbt-order is-${o.id}`} disabled={busy}
                            onClick={() => give(o.id)}>
                            <Icon name={o.icon} className="sbt-order-ico" />
                            <b>{o.name}</b>
                            <em>{o.desc}</em>
                        </button>
                    ))}
                </div>
            ) : null}

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
                                ? <>{foe.name} {battle?.sunk === "foe" ? "went down by the bow" : "broke off and ran"} after {battle?.round} round{battle?.round === 1 ? "" : "s"}.</>
                                : <>{foe.name} had the better of it after {battle?.round} round{battle?.round === 1 ? "" : "s"}.</>}
                        </p>
                        {battle?.reward?.length ? (
                            <div className="sbt-rewards">
                                {battle.reward.map((r, i) => (
                                    <span key={i} className={`sbt-reward is-${r.kind}`}>
                                        {r.kind === "doubloons" ? `+${r.n} doubloons`
                                            : r.kind === "gold" ? `+${r.n.toLocaleString()} gold`
                                            : r.kind === "goldLost" ? `−${r.n.toLocaleString()} gold`
                                            : r.kind === "xp" ? `+${r.n} XP`
                                            : r.kind === "fragments" ? `+${r.n} fragments`
                                            : r.kind === "parts" ? `+${r.n} tier-${r.tier} parts`
                                            : r.kind === "chest" ? `${r.tier} chest`
                                            : r.kind === "item" ? `plundered ${r.name}`
                                            : r.kind === "free" ? "raid not used up!"
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
