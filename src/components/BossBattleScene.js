"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GiSpikedDragonHead } from "react-icons/gi";

// The 2D side-scrolling battle stage: the boss's own AI background, the boss sprite anchored right, and
// the pack of member sprites on the left attacking on a staggered loop. Purely presentational — the parent
// (BossFightClient) owns HP/attack state and passes it down.
const MAX_FIGHTERS = 10;

export default function BossBattleScene({ boss, fighters = [], defaultSprite = null, hit = false, floaters = [], pct = 100 }) {
    const party = useMemo(() => {
        const real = fighters.filter((f) => f.spriteUrl).slice(0, MAX_FIGHTERS);
        const out = [...real];
        // Keep the stage populated even before many people have joined.
        let pad = 0;
        while (out.length < 5 && defaultSprite) {
            out.push({ id: `pad-${pad}`, spriteUrl: defaultSprite, pad: true });
            pad += 1;
        }
        return applyPositions(out);
    }, [fighters, defaultSprite]);

    // Ambient impact glints on the boss — so the pack's passive attacks read as visibly landing. Purely
    // decorative light hits (NO numbers): the real damage shows on the live HP counter, which ticks down
    // continuously, and on the big floaters from actual manual strikes.
    const [sparks, setSparks] = useState([]);
    const sid = useRef(0);
    useEffect(() => {
        if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
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

    return (
        <div className="battle">
            <div className="battle-bg" style={boss.backgroundUrl ? { backgroundImage: `url(${boss.backgroundUrl})` } : undefined} />
            <div className="battle-vignette" />
            <div className="battle-ground" />

            <div className="battle-hud">
                <div className="battle-name">{boss.name}</div>
                <div className="battle-hpbar"><span style={{ width: `${pct}%` }} /></div>
                <div className="battle-hp">{boss.hp.toLocaleString()} / {boss.maxHp.toLocaleString()} HP</div>
                {boss.buff ? (
                    <div className="battle-buff" title={`All damage ×${boss.buff.damageMult} while active`}>
                        <span className="battle-buff-emoji">{boss.buff.emoji}</span>
                        <span className="battle-buff-label">{boss.buff.label}</span>
                        <span className="battle-buff-mult">×{boss.buff.damageMult}</span>
                    </div>
                ) : null}
            </div>

            <div className={`battle-boss${hit ? " is-hit" : ""}`}>
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

            <div className="battle-party">
                {party.map((f) => (
                    <div key={f.key} className={`fighter${f.pad ? " is-pad" : ""}${f.you ? " is-you" : ""}`} style={{ left: `${f.left}%`, bottom: `${f.bottom}%`, zIndex: f.z, "--s": f.scale }}>
                        <div className="fighter-lunge" style={{ animationDelay: `${f.delay}s` }}>
                            {f.petSpriteUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img className="fighter-pet" src={f.petSpriteUrl} alt="" />
                            ) : null}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="fighter-sprite" src={f.spriteUrl} alt="" />
                            {!f.pad && f.name ? <span className="fighter-name">{f.name}</span> : null}
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

// Lay fighters out in two depth rows across the left of the stage.
function applyPositions(out) {
    return out.map((f, i) => {
        const back = i % 2 === 1;
        return {
            key: f.id || `f-${i}`,
            spriteUrl: f.spriteUrl,
            petSpriteUrl: f.petSpriteUrl || null,
            name: f.name || null,
            you: Boolean(f.you),
            pad: Boolean(f.pad),
            left: 3 + Math.floor(i / 2) * 8.5, // spread across the left third
            bottom: back ? 20 : 6, // back row sits higher (further away)
            scale: back ? 0.82 : 1,
            z: back ? 1 : 3,
            delay: (i * 0.35).toFixed(2),
        };
    });
}
