"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GiSpikedDragonHead } from "react-icons/gi";

// The 2D side-scrolling battle stage: the boss's own AI background, the boss sprite anchored right, and
// the pack of member sprites on the left attacking on a staggered loop. Purely presentational — the parent
// (BossFightClient) owns HP/attack state and passes it down.
// NO cap on fighters: the whole pack shows up. applyPositions() crowd-packs them so the stage stays
// readable no matter how many turn out (more fighters → more depth rows + smaller sprites).

export default function BossBattleScene({ boss, fighters = [], defaultSprite = null, hit = false, floaters = [], pct = 100, youElement = null }) {
    const party = useMemo(() => {
        const real = fighters.filter((f) => f.spriteUrl);
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
                                <img className="fighter-pet" src={f.petSpriteUrl} alt="" style={f.petSpriteFlip ? { transform: "scaleX(-1)" } : undefined} />
                            ) : null}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="fighter-sprite" src={f.spriteUrl} alt="" style={f.spriteFlip ? { transform: "scaleX(-1)" } : undefined} />
                            {f.showName ? <span className="fighter-name">{f.name}</span> : null}
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

// Lay fighters out as a packed crowd on the left ~55% of the stage. Scales to ANY count: more fighters
// pack into more depth rows and shrink, so nobody marches off the edge or collides with the boss on the
// right. "You" is pulled to a front-and-center slot so a member always spots themselves in the mob, and
// name labels drop away once the crowd is too dense to read them.
const X0 = 3; // left edge of the crowd band (%)
const X1 = 52; // right edge — the boss owns the space past this (kept clear of the boss art)
const MAX_ROWS = 6; // deepest the crowd stacks before it just gets denser per row

function applyPositions(list) {
    // Put "you" first so it lands in the front row, front-left.
    const out = [...list].sort((a, b) => (b.you ? 1 : 0) - (a.you ? 1 : 0));
    const n = out.length;
    const rows = Math.min(MAX_ROWS, Math.max(1, Math.ceil(n / 6)));
    const cols = Math.max(1, Math.ceil(n / rows));
    const colStep = cols > 1 ? (X1 - X0) / (cols - 1) : 0;
    // Shrink the whole crowd as it grows (√ falloff so small packs stay full-size, mobs stay on-stage).
    const packScale = Math.max(0.42, Math.min(1, Math.sqrt(14 / Math.max(1, n))));
    const showNames = n <= 12; // labels get unreadable in a crowd — hide them once it's a mob
    return out.map((f, i) => {
        const row = i % rows; // 0 = front, higher = further back
        const col = Math.floor(i / rows);
        const depth = rows > 1 ? row / (rows - 1) : 0; // 0 (front) .. 1 (back)
        return {
            key: f.id || `f-${i}`,
            spriteUrl: f.spriteUrl,
            spriteFlip: Boolean(f.spriteFlip),
            petSpriteUrl: f.petSpriteUrl || null,
            petSpriteFlip: Boolean(f.petSpriteFlip),
            name: f.name || null,
            showName: showNames && !f.pad && Boolean(f.name),
            you: Boolean(f.you),
            pad: Boolean(f.pad),
            left: X0 + col * colStep + depth * colStep * 0.35, // stagger back rows for a crowd feel
            bottom: 5 + depth * 30, // back rows sit higher up-stage (further away)
            scale: packScale * (1 - depth * 0.22), // and a touch smaller
            z: (rows - row) + (f.you ? 10 : 0), // front rows on top; you always on top
            delay: ((i % 10) * 0.32).toFixed(2),
        };
    });
}
