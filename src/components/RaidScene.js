"use client";

import { useEffect, useRef, useState } from "react";

// Full-screen ship-vs-ship RAID auto-battle. Plays the server's turn-by-turn `battle` script as cannon volleys
// with hit-shakes and floating damage, then reveals the outcome (gold ± / rare item copy). Purely a replay —
// the result is already decided server-side; this is the immersive show.
export default function RaidScene({ raid, myBoat, hero, captain, onClose }) {
    const events = raid?.battle || [];
    const [phase, setPhase] = useState("intro"); // intro → fight → result
    const [step, setStep] = useState(-1);
    const [myHp, setMyHp] = useState(100);
    const [foeHp, setFoeHp] = useState(100);
    const [fx, setFx] = useState(null); // { side, dmg, kind, k }
    const [ready, setReady] = useState(false); // gate the result's close button briefly (anti-misclick)

    // Intro "VS" splash → start the volleys.
    useEffect(() => {
        const t = setTimeout(() => { setPhase("fight"); setStep(0); }, 1500);
        return () => clearTimeout(t);
    }, []);

    // Step through the battle script, one volley at a time.
    useEffect(() => {
        if (phase !== "fight" || step < 0) return undefined;
        if (step >= events.length) {
            const t = setTimeout(() => { setPhase("result"); setTimeout(() => setReady(true), 900); }, 800);
            return () => clearTimeout(t);
        }
        const ev = events[step];
        setMyHp(ev.my);
        setFoeHp(ev.foe);
        setFx({ side: ev.side, dmg: ev.dmg, kind: ev.side === "stun" ? "stun" : "hit", k: step });
        const t = setTimeout(() => setStep((s) => s + 1), ev.side === "stun" ? 760 : 640);
        return () => clearTimeout(t);
    }, [phase, step, events]);

    const target = raid?.target || {};
    const heroImg = hero?.spriteUrl || hero?.avatarUrl || null;
    const win = raid?.outcome === "win";

    return (
        <div className="raid-scene" role="dialog" aria-modal="true">
            <div className="raid-sky" aria-hidden="true"><i /><i /><i /></div>
            <div className="raid-sea" aria-hidden="true" />

            {/* HP bars */}
            <div className="raid-hud">
                <div className="raid-hpwrap raid-hpwrap-me">
                    <div className="raid-hpname">{captain || "You"} <span className="raid-lvl">Lv {raid?.myLevel ?? ""}</span></div>
                    <div className="raid-hpbar"><span className="raid-hpfill is-me" style={{ width: `${myHp}%` }} /></div>
                </div>
                <div className="raid-vs-mini">⚔️</div>
                <div className="raid-hpwrap raid-hpwrap-foe">
                    <div className="raid-hpname">{target.name || "Rival"} <span className="raid-lvl">Lv {target.level ?? ""}</span></div>
                    <div className="raid-hpbar"><span className="raid-hpfill is-foe" style={{ width: `${foeHp}%` }} /></div>
                </div>
            </div>

            {/* The two ships */}
            <div className="raid-stage">
                <div className={`raid-ship raid-ship-me ${fx?.side === "foe" ? "is-hurt" : ""} ${fx?.side === "me" ? "is-firing" : ""}`}>
                    {myBoat ? /* eslint-disable-next-line @next/next/no-img-element */ (
                        <img src={myBoat} alt="" className="raid-boat" />
                    ) : null}
                    {heroImg ? /* eslint-disable-next-line @next/next/no-img-element */ (
                        <img src={heroImg} alt="" className={`raid-rider ${hero?.spriteFlip ? "is-flip" : ""}`} />
                    ) : null}
                    <span className="raid-muzzle raid-muzzle-me" aria-hidden="true" />
                </div>

                {/* Cannonball tracer for the current volley */}
                {phase === "fight" && fx?.kind === "hit" ? (
                    <span key={fx.k} className={`raid-ball ${fx.side === "me" ? "to-foe" : "to-me"}`} aria-hidden="true" />
                ) : null}

                <div className={`raid-ship raid-ship-foe ${fx?.side === "me" ? "is-hurt" : ""} ${fx?.side === "foe" ? "is-firing" : ""}`}>
                    {target.boat ? /* eslint-disable-next-line @next/next/no-img-element */ (
                        <img src={target.boat} alt="" className="raid-boat is-mirror" />
                    ) : null}
                    {target.rider ? /* eslint-disable-next-line @next/next/no-img-element */ (
                        <img src={target.rider} alt="" className={`raid-rider is-foe ${target.riderFlip ? "" : "is-flip"}`} />
                    ) : null}
                    <span className="raid-muzzle raid-muzzle-foe" aria-hidden="true" />
                </div>

                {/* Floating damage / stun call-out */}
                {phase === "fight" && fx ? (
                    fx.kind === "stun"
                        ? <span key={`s${fx.k}`} className="raid-float is-stun on-foe">STUN! 💫</span>
                        : <span key={`d${fx.k}`} className={`raid-float ${fx.side === "me" ? "on-foe" : "on-me"}`}>-{fx.dmg}</span>
                ) : null}
            </div>

            {/* Intro splash */}
            {phase === "intro" ? (
                <div className="raid-intro">
                    <div className="raid-intro-vs">RAID!</div>
                    <div className="raid-intro-sub">{captain || "You"} <span>⚔️</span> {target.name || "a passing ship"}</div>
                </div>
            ) : null}

            {/* Result */}
            {phase === "result" ? (
                <div className="raid-result">
                    <div className={`card raid-result-card ${win ? "is-win" : "is-lose"}`}>
                        <div className={`raid-result-banner ${win ? "is-win" : "is-lose"}`}>{win ? "🏆 Victory!" : "🏳️ Defeated"}</div>
                        <p className="muted raid-result-line">
                            {win
                                ? <>You raked <b>{target.name || "the rival ship"}</b> and boarded with the spoils.</>
                                : <>They out-gunned you and you fled with your hull intact.</>}
                        </p>
                        <div className="raid-result-rewards">
                            {win
                                ? <span className="raid-reward is-good">🪙 +{Math.abs(raid.gold)} gold</span>
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
