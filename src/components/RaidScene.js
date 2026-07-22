"use client";

import { useEffect, useRef, useState } from "react";

// ───────────────────────── Web-Audio battle score + SFX (no asset files) ─────────────────────────
function createBattleAudio() {
    if (typeof window === "undefined") return null;
    let ctx;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
    const musicBus = ctx.createGain(); musicBus.gain.value = 0.0; musicBus.connect(master);

    const osc = (freq, t0, dur, { type = "sine", gain = 0.2, to = null, dest = master } = {}) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type; o.frequency.setValueAtTime(freq, t0);
        if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(gain, t0 + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dur + 0.02);
    };
    const noise = (t0, dur, { gain = 0.3, type = "lowpass", freq = 1000, q = 0.7, dest = master, sweepTo = null } = {}) => {
        const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = ctx.createBufferSource(); src.buffer = buf;
        const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
        if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
        const g = ctx.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        src.connect(f); f.connect(g); g.connect(dest); src.start(t0); src.stop(t0 + dur);
    };

    // Driving minor battle loop, scheduled a bar at a time.
    const BPM = 140, beat = 60 / BPM, bar = beat * 4;
    const ROOT = 73.42; // D2
    const bassSeq = [1, 1, 1.5, 1, 1.335, 1, 1.5, 1]; // root/fifth ostinato (ratios)
    const stab = [2.67, 3, 3.56]; // higher tension notes
    let nextBar = 0, barIdx = 0, timer = null;
    const scheduleBar = () => {
        const t = nextBar;
        for (let i = 0; i < 8; i++) {
            const nt = t + i * (beat / 2);
            osc(ROOT * bassSeq[i], nt, beat / 2 * 0.9, { type: "sawtooth", gain: 0.16, dest: musicBus }); // bass
            if (i % 2 === 0) { // kick
                osc(120, nt, 0.14, { type: "sine", gain: 0.5, to: 46, dest: musicBus });
                noise(nt, 0.05, { gain: 0.18, type: "lowpass", freq: 200, dest: musicBus });
            } else { // hat
                noise(nt, 0.03, { gain: 0.07, type: "highpass", freq: 6000, dest: musicBus });
            }
        }
        // A tense stab on bars 2 & 4
        if (barIdx % 2 === 1) osc(ROOT * stab[barIdx % stab.length] * 2, t + beat * 2, beat, { type: "square", gain: 0.06, dest: musicBus });
        nextBar += bar; barIdx += 1;
    };

    let started = false;
    return {
        startMusic() {
            if (started) return; started = true;
            if (ctx.state === "suspended") ctx.resume().catch(() => {});
            nextBar = ctx.currentTime + 0.06; barIdx = 0;
            musicBus.gain.cancelScheduledValues(ctx.currentTime);
            musicBus.gain.setValueAtTime(0.0001, ctx.currentTime);
            musicBus.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 0.5);
            scheduleBar(); scheduleBar();
            timer = setInterval(() => { while (nextBar < ctx.currentTime + bar * 1.5) scheduleBar(); }, bar * 1000 * 0.5);
        },
        cannon() {
            const t = ctx.currentTime;
            osc(90, t, 0.22, { type: "sine", gain: 0.5, to: 44 });
            noise(t, 0.16, { gain: 0.42, type: "lowpass", freq: 900, sweepTo: 180 });
            noise(t, 0.03, { gain: 0.25, type: "highpass", freq: 2500 });
        },
        hit(big) {
            const t = ctx.currentTime;
            noise(t, big ? 0.34 : 0.2, { gain: big ? 0.5 : 0.34, type: "lowpass", freq: big ? 1400 : 900, sweepTo: 120 });
            osc(140, t, big ? 0.3 : 0.18, { type: "square", gain: big ? 0.34 : 0.2, to: 50 });
            if (big) osc(1200, t, 0.28, { type: "sawtooth", gain: 0.14, to: 200 }); // crit zing
        },
        splash() { noise(ctx.currentTime, 0.3, { gain: 0.2, type: "highpass", freq: 1200, sweepTo: 400 }); },
        stun() {
            const t = ctx.currentTime;
            [880, 660, 495, 370].forEach((f, i) => osc(f, t + i * 0.05, 0.18, { type: "square", gain: 0.13 }));
            osc(2400, t, 0.4, { type: "sine", gain: 0.06, to: 400 });
        },
        victory() {
            const t = ctx.currentTime;
            [523, 659, 784, 1047, 1319].forEach((f, i) => osc(f, t + i * 0.11, 0.6, { type: "triangle", gain: 0.22 }));
            [784, 1047].forEach((f) => osc(f, t + 0.56, 0.9, { type: "sine", gain: 0.16 }));
        },
        defeat() {
            const t = ctx.currentTime;
            osc(196, t, 1.1, { type: "sawtooth", gain: 0.2, to: 90 });
            osc(147, t + 0.12, 1.1, { type: "sawtooth", gain: 0.16, to: 70 });
        },
        stopMusic() {
            try { musicBus.gain.cancelScheduledValues(ctx.currentTime); musicBus.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.4); } catch { /* noop */ }
            if (timer) { clearInterval(timer); timer = null; }
        },
        close() { try { if (timer) clearInterval(timer); ctx.close(); } catch { /* noop */ } },
    };
}

const BGS = ["/images/sailing/raid-bg-day.png", "/images/sailing/raid-bg-night.png"];

function StatChips({ stats = [] }) {
    if (!stats.length) return <div className="raid-stats raid-stats-empty">no gear equipped</div>;
    return (
        <div className="raid-stats">
            {stats.slice(0, 4).map((s) => (
                <span key={s.key} className="raid-stat" title={s.label}>{s.icon} {s.value}{s.suffix}</span>
            ))}
        </div>
    );
}

function Fighter({ f, side, fx, hp }) {
    // side: "me" (left, faces right) | "foe" (right, faces left → mirror the art)
    const firing = fx?.side === (side === "me" ? "me" : "foe");
    const hurt = fx && fx.side !== "stun" && fx.side !== (side === "me" ? "me" : "foe");
    const low = hp <= 25;
    return (
        <div className={`raid-ship raid-ship-${side} ${firing ? "is-firing" : ""} ${hurt ? "is-hurt" : ""} ${low ? "is-low" : ""}`}>
            {f?.boat ? /* eslint-disable-next-line @next/next/no-img-element */ (
                <img src={f.boat} alt="" className={`raid-boat ${side === "foe" ? "is-mirror" : ""}`} />
            ) : null}
            {f?.pet?.url ? /* eslint-disable-next-line @next/next/no-img-element */ (
                <img src={f.pet.url} alt="" className={`raid-pet ${side === "foe" ? (f.pet.flip ? "" : "is-flip") : (f.pet.flip ? "is-flip" : "")}`} />
            ) : null}
            {f?.rider ? /* eslint-disable-next-line @next/next/no-img-element */ (
                <img src={f.rider} alt="" className={`raid-rider ${side === "foe" ? (f.riderFlip ? "" : "is-flip") : (f.riderFlip ? "is-flip" : "")}`} />
            ) : null}
            <span className="raid-muzzle" aria-hidden="true" />
            <span className="raid-wake" aria-hidden="true" />
        </div>
    );
}

export default function RaidScene({ raid, myBoat, hero, pet, captain, onClose }) {
    const events = raid?.battle || [];
    const meF = raid?.me || {
        name: captain || "You", level: raid?.myLevel, boat: myBoat,
        rider: hero?.spriteUrl || hero?.avatarUrl || null, riderFlip: hero?.spriteFlip === true,
        pet: pet || null, stats: [],
    };
    const foeF = raid?.foe || raid?.target || {};
    const win = raid?.outcome === "win";

    const [bg] = useState(() => BGS[Math.abs(events.length + Math.round(raid?.gold || 0)) % BGS.length] || BGS[0]);
    const [phase, setPhase] = useState("intro"); // intro → fight → result
    const [step, setStep] = useState(-1);
    const [myHp, setMyHp] = useState(100);
    const [foeHp, setFoeHp] = useState(100);
    const [fx, setFx] = useState(null);       // { side, dmg, crit, kind, k }
    const [shake, setShake] = useState(null); // { k, big }
    const [flash, setFlash] = useState(null); // { k, crit }
    const [ready, setReady] = useState(false);
    const audioRef = useRef(null);

    // Boot audio + intro splash → fight.
    useEffect(() => {
        audioRef.current = createBattleAudio();
        audioRef.current?.startMusic();
        const t = setTimeout(() => { setPhase("fight"); setStep(0); }, 1650);
        return () => { clearTimeout(t); audioRef.current?.close(); audioRef.current = null; };
    }, []);

    // Step through the battle script.
    useEffect(() => {
        if (phase !== "fight" || step < 0) return undefined;
        const a = audioRef.current;
        if (step >= events.length) {
            const t = setTimeout(() => {
                setPhase("result");
                a?.stopMusic();
                if (win) a?.victory(); else a?.defeat();
                setTimeout(() => setReady(true), 1000);
            }, 850);
            return () => clearTimeout(t);
        }
        const ev = events[step];
        const big = !!ev.crit;
        if (ev.side === "stun") {
            setFx({ side: "stun", kind: "stun", k: step });
            a?.stun();
        } else {
            setMyHp(ev.my); setFoeHp(ev.foe);
            setFx({ side: ev.side, dmg: ev.dmg, crit: big, kind: "hit", k: step });
            a?.cannon();
            // land the hit slightly after the cannon so it reads as travel time
            const hitT = setTimeout(() => { a?.hit(big); setShake({ k: step, big }); setFlash({ k: step, crit: big }); }, 260);
            const clear = setTimeout(() => { setShake(null); setFlash(null); }, 260 + (big ? 460 : 300));
            const nextT = setTimeout(() => setStep((s) => s + 1), big ? 900 : 660);
            return () => { clearTimeout(hitT); clearTimeout(clear); clearTimeout(nextT); };
        }
        const t = setTimeout(() => setStep((s) => s + 1), 800);
        return () => clearTimeout(t);
    }, [phase, step, events, win]);

    const target = foeF;
    const lowAny = myHp <= 25 || foeHp <= 25;

    return (
        <div className="raid-scene" role="dialog" aria-modal="true"
            style={{ backgroundImage: `linear-gradient(rgba(6,10,20,0.15), rgba(6,10,20,0.35)), url(${bg})` }}>
            {/* atmosphere */}
            <div className="raid-atmo" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
            <div className="raid-sealine" aria-hidden="true" />
            {lowAny ? <div className="raid-vignette" aria-hidden="true" /> : null}

            {/* HUD — fighter panels with portrait, HP, and STATS */}
            <div className="raid-hud">
                <div className="raid-panel raid-panel-me">
                    <div className="raid-portrait">
                        {meF.rider ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={meF.rider} alt="" className={meF.riderFlip ? "is-flip" : ""} /> : <span>🧑‍✈️</span>}
                    </div>
                    <div className="raid-panel-body">
                        <div className="raid-pname">{meF.name} <span className="raid-lvl">Lv {meF.level ?? "?"}</span></div>
                        <div className="raid-hpbar"><span className="raid-hpfill is-me" style={{ width: `${myHp}%` }} /><b className="raid-hpnum">{myHp}</b></div>
                        <StatChips stats={meF.stats} />
                    </div>
                </div>
                <div className="raid-vs-mini" aria-hidden="true">⚔️</div>
                <div className="raid-panel raid-panel-foe">
                    <div className="raid-portrait">
                        {target.rider ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={target.rider} alt="" className={target.riderFlip ? "is-flip" : ""} /> : <span>🏴‍☠️</span>}
                    </div>
                    <div className="raid-panel-body">
                        <div className="raid-pname">{target.name || "Rival"} <span className="raid-lvl">Lv {target.level ?? "?"}</span></div>
                        <div className="raid-hpbar"><span className="raid-hpfill is-foe" style={{ width: `${foeHp}%` }} /><b className="raid-hpnum">{foeHp}</b></div>
                        <StatChips stats={target.stats} />
                    </div>
                </div>
            </div>

            {/* Battle stage */}
            <div className={`raid-shakewrap ${shake ? (shake.big ? "is-quake" : "is-shake") : ""}`}>
                <div className="raid-stage">
                    <Fighter f={meF} side="me" fx={phase === "fight" ? fx : null} hp={myHp} />
                    <Fighter f={target} side="foe" fx={phase === "fight" ? fx : null} hp={foeHp} />

                    {/* cannonball tracer */}
                    {phase === "fight" && fx?.kind === "hit" ? (
                        <span key={`b${fx.k}`} className={`raid-ball ${fx.side === "me" ? "to-foe" : "to-me"} ${fx.crit ? "is-crit" : ""}`} aria-hidden="true"><i /></span>
                    ) : null}

                    {/* impact burst on the struck ship */}
                    {phase === "fight" && fx?.kind === "hit" ? (
                        <span key={`x${fx.k}`} className={`raid-burst ${fx.side === "me" ? "on-foe" : "on-me"} ${fx.crit ? "is-crit" : ""}`} aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>
                    ) : null}

                    {/* floating damage / stun */}
                    {phase === "fight" && fx ? (
                        fx.kind === "stun"
                            ? <span key={`s${fx.k}`} className="raid-float is-stun on-foe">STUN! 💫</span>
                            : <span key={`d${fx.k}`} className={`raid-float ${fx.side === "me" ? "on-foe" : "on-me"} ${fx.crit ? "is-crit" : ""}`}>{fx.crit ? "CRIT " : ""}-{fx.dmg}</span>
                    ) : null}
                </div>
            </div>

            {/* white crack on crit hits */}
            {flash ? <div key={`f${flash.k}`} className={`raid-hitflash ${flash.crit ? "is-crit" : ""}`} aria-hidden="true" /> : null}

            {/* Intro splash */}
            {phase === "intro" ? (
                <div className="raid-intro">
                    <div className="raid-intro-vs">RAID!</div>
                    <div className="raid-intro-names">
                        <span className="raid-intro-me">{meF.name}</span>
                        <span className="raid-intro-x">⚔️</span>
                        <span className="raid-intro-foe">{target.name || "a passing ship"}</span>
                    </div>
                </div>
            ) : null}

            {/* Result */}
            {phase === "result" ? (
                <div className="raid-result">
                    <div className={`card raid-result-card ${win ? "is-win" : "is-lose"}`}>
                        <div className={`raid-result-banner ${win ? "is-win" : "is-lose"}`}>{win ? "🏆 Victory!" : "🏴 Defeated"}</div>
                        <p className="muted raid-result-line">
                            {win ? <>You raked <b>{target.name || "the rival ship"}</b> and boarded with the spoils.</>
                                 : <>They out-gunned you — you broke off and fled with your hull intact.</>}
                        </p>
                        <div className="raid-result-rewards">
                            {win ? <span className="raid-reward is-good">🪙 +{Math.abs(raid.gold)} gold</span>
                                 : <span className="raid-reward is-bad">🪙 −{Math.abs(raid.gold)} gold</span>}
                            {raid.stunUsed ? <span className="raid-reward">💫 Stun landed</span> : null}
                            {raid.dodged ? <span className="raid-reward is-good">🏴‍☠️ Daily raid not used!</span> : null}
                        </div>
                        {raid.itemWon ? (
                            <div className={`raid-loot rar-${raid.itemWon.rarity || "common"}`}>
                                {raid.itemWon.image ? /* eslint-disable-next-line @next/next/no-img-element */ (
                                    <img src={raid.itemWon.image} alt="" className="raid-loot-img" />
                                ) : <span className="raid-loot-emoji">🎁</span>}
                                <div className="raid-loot-txt">
                                    <div className="raid-loot-tag">Plundered a copy!</div>
                                    <div className="raid-loot-name">{raid.itemWon.name}</div>
                                    <div className="muted raid-loot-note">{raid.itemWon.isNew ? "Added to your stash" : "You already own one"}</div>
                                </div>
                            </div>
                        ) : null}
                        <button className="sail-cta" disabled={!ready} onClick={onClose}>{ready ? "Return to port ⚓" : "…"}</button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
