"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GiSpikedDragonHead } from "react-icons/gi";

// The 2D side-scrolling battle stage. Instead of cramming the whole (now large) pack on-screen, adventurers
// take turns: a GROUP of 3 marches in from the left, attacks the boss with a random flourish, then marches
// off as the next 3 rotate in — cycling through everyone who's fighting. Purely presentational; the parent
// (BossFightClient) owns HP/attack state.

const GROUP = 3;
// A varied set of attack flourishes — each wave's fighters get different ones so it feels alive. Add more
// keyframes with the same class prefix to grow the pool.
const ATTACKS = ["slash", "jump", "spin", "dash", "overhead", "uppercut", "thrust", "combo", "leap", "smash", "whirl", "pounce"];

export default function BossBattleScene({ boss, fighters = [], defaultSprite = null, hit = false, floaters = [], pct = 100, youElement = null }) {
    // Build the roster: real fighters (with art), padded a little so the stage isn't empty. "You" first so
    // the viewer sees themselves in the opening wave.
    const roster = useMemo(() => {
        const real = fighters.filter((f) => f.spriteUrl);
        real.sort((a, b) => (b.you ? 1 : 0) - (a.you ? 1 : 0));
        const out = [...real];
        let pad = 0;
        while (out.length < GROUP && defaultSprite) { out.push({ id: `pad-${pad}`, spriteUrl: defaultSprite, pad: true, name: null }); pad += 1; }
        return out;
    }, [fighters, defaultSprite]);

    const waveCount = Math.max(1, Math.ceil(roster.length / GROUP));
    const [wave, setWave] = useState(0);
    const [phase, setPhase] = useState("in"); // in → attack → out → (next wave) in
    const reduced = useRef(false);
    useEffect(() => {
        reduced.current = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    }, []);

    // The turn-based state machine. Timings tuned so a full wave is a satisfying ~4.5s beat.
    useEffect(() => {
        if (reduced.current) return undefined;
        const ms = phase === "in" ? 1500 : phase === "attack" ? 1500 : 1000;
        const t = setTimeout(() => {
            if (phase === "in") setPhase("attack");
            else if (phase === "attack") setPhase("out");
            else { setWave((w) => (w + 1) % waveCount); setPhase("in"); }
        }, ms);
        return () => clearTimeout(t);
    }, [phase, wave, waveCount]);

    // The 3 (or fewer) fighters on stage this wave, each with a stable-per-wave attack flourish + slot.
    const party = useMemo(() => {
        const start = wave * GROUP;
        const g = [];
        for (let i = 0; i < GROUP; i += 1) {
            const idx = start + i;
            if (idx >= roster.length) break;
            const f = roster[idx];
            g.push({
                ...f,
                key: `${wave}-${f.id || idx}`,
                slot: i,
                attack: ATTACKS[(wave * 5 + i * 3) % ATTACKS.length],
            });
        }
        return g;
    }, [wave, roster]);

    // Ambient impact glints on the boss so its continuous passive damage reads as landing.
    const [sparks, setSparks] = useState([]);
    const sid = useRef(0);
    useEffect(() => {
        if (reduced.current) return undefined;
        let alive = true;
        let timer;
        const tick = () => {
            if (!alive) return;
            const id = sid.current++;
            setSparks((s) => [...s, { id, top: 20 + Math.random() * 45, right: 6 + Math.random() * 22 }]);
            setTimeout(() => setSparks((s) => s.filter((x) => x.id !== id)), 750);
            timer = setTimeout(tick, 900 + Math.random() * 1500);
        };
        timer = setTimeout(tick, 700);
        return () => { alive = false; clearTimeout(timer); };
    }, []);

    const bossHit = hit || phase === "attack"; // boss flinches when the wave lands its blows

    return (
        <div className="battle">
            <div className="battle-bg" style={boss.backgroundUrl ? { backgroundImage: `url(${boss.backgroundUrl})` } : undefined} />
            <div className="battle-vignette" />
            <div className="battle-ground" />

            <div className="battle-hud">
                <div className="battle-name">{boss.name}</div>
                <div className="battle-hpbar"><span style={{ width: `${pct}%` }} /></div>
                <div className="battle-hp">{boss.hp.toLocaleString()} / {boss.maxHp.toLocaleString()} HP</div>
                {roster.length > GROUP ? <div className="battle-wave">⚔️ {roster.filter((f) => !f.pad).length} in the fight · wave {wave + 1}/{waveCount}</div> : null}
                {boss.buff ? (
                    <div className="battle-buff" title={`All damage ×${boss.buff.damageMult} while active`}>
                        <span className="battle-buff-emoji">{boss.buff.emoji}</span>
                        <span className="battle-buff-label">{boss.buff.label}</span>
                        <span className="battle-buff-mult">×{boss.buff.damageMult}</span>
                    </div>
                ) : null}
                {boss.weakness ? (
                    <div className={`battle-weakness${youElement?.matches > 0 ? " has-bonus" : ""}`} title={boss.weakness.desc}>
                        <span className="battle-buff-emoji">{boss.weakness.emoji}</span>
                        <span className="battle-buff-label">
                            Weak: {boss.weakness.label}
                            {youElement ? (youElement.matches > 0 ? ` · your +${youElement.bonusPct}%` : " · equip it for a bonus") : ""}
                        </span>
                    </div>
                ) : null}
            </div>

            <div className={`battle-boss${bossHit ? " is-hit" : ""}`}>
                {boss.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="battle-boss-art" src={boss.imageUrl} alt={boss.name} />
                ) : (
                    <span className="battle-boss-fallback"><GiSpikedDragonHead aria-hidden="true" /></span>
                )}
            </div>

            {sparks.map((s) => (
                <span key={s.id} className="battle-spark" style={{ top: `${s.top}%`, right: `${s.right}%` }} />
            ))}

            {/* The rotating trio. The phase class drives walk-in / attack / walk-off; each fighter's own
                attack class picks its flourish. */}
            <div className={`battle-party party-${phase}`}>
                {party.map((f) => (
                    <div
                        key={f.key}
                        className={`adv adv-slot-${f.slot} atk-${f.attack}${f.you ? " is-you" : ""}${f.pad ? " is-pad" : ""}`}
                    >
                        <div className="adv-body">
                            {f.petSpriteUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img className="adv-pet" src={f.petSpriteUrl} alt="" style={f.petSpriteFlip ? { transform: "scaleX(-1)" } : undefined} />
                            ) : null}
                            {/* Flip lives on a WRAPPER so the walk/attack keyframes (on the img) compose with it. */}
                            <span className="adv-flip" style={f.spriteFlip ? { transform: "scaleX(-1)" } : undefined}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img className="adv-sprite" src={f.spriteUrl} alt="" />
                            </span>
                            {!f.pad && f.name ? <span className="adv-name">{f.you ? "You" : f.name}</span> : null}
                        </div>
                    </div>
                ))}
            </div>

            {floaters.map((f) => (
                <span key={f.id} className={`battle-floater${f.crit ? " is-crit" : ""}`} style={{ top: `${f.top}%`, left: `${f.left}%` }}>
                    {f.crit ? `${f.amount}!` : f.amount}
                </span>
            ))}
        </div>
    );
}
