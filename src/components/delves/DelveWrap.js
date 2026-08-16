"use client";

import { useEffect, useState } from "react";

// ── HOW THE RUN ENDED ────────────────────────────────────────────────────────────────────────────────────────
// Two endings — you cleared it or you fell — and BOTH pay. That is the design, and the card says so plainly,
// because "you died" on a screen full of loot is otherwise a confusing thing to read.
//
// The HAUL is the point of this screen. It used to be three rows of numbers and a gear name in a coloured box,
// which is the least interesting way to tell somebody a dungeon just handed them a legendary. Every piece has
// painted art, a rarity and a real stat line; they were simply never asked for. The server resolves all of it
// now and this deals the pieces in one at a time, worst first, with a sting per item — so a run builds to its
// best moment instead of opening on it.
//
// Raw <img> throughout: styled-jsx does not scope a rule aimed at a custom component (see check:styled-jsx).

const REWARD_ART = {
    gold: "/images/spin/prizes/coins-big.png",
    xp: "/images/spin/prizes/xp-orb.png",
    doubloons: "/images/sailing/doubloon.png",
};
const CHEST_FALLBACK = {
    wooden: "/images/spin/prizes/chest-wood.png",
    iron: "/images/spin/prizes/chest-wood.png",
    gold: "/images/spin/prizes/chest-gold.png",
};
const RARITY = {
    common: "#9aa0a6", rare: "#4aa3ff", epic: "#b061ff", legendary: "#ffb020",
    mythic: "#33e0a1", ascendant: "#ff7a3c", eternal: "#ff5cc8",
};
const RANK = ["common", "rare", "epic", "legendary", "mythic", "ascendant", "eternal"];

// A short rising sting per item, pitched higher the rarer it is. Built inline — no assets to load or go stale.
function ding(rarity) {
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const a = new AC();
        const base = 520 + Math.max(0, RANK.indexOf(rarity)) * 70;
        [base, base * 1.26, base * 1.5].forEach((f, i) => {
            const t = a.currentTime + i * 0.06;
            const o = a.createOscillator(), g = a.createGain();
            o.type = "triangle"; o.frequency.setValueAtTime(f, t);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.16, t + 0.012);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
            o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.25);
        });
    } catch { /* audio is a bonus, never a requirement */ }
}

export default function DelveWrap({ finished, onClose }) {
    const { cleared, floor, gold, xp, bonusGold, bonusXp, chests = [], parts = [], doubloons = 0, gear = [], chestArt = {} } = finished;
    const tone = cleared ? "is-clear" : "is-dead";
    const title = cleared ? "The way is clear" : "You fell";
    const line = cleared
        ? "The boss is down and the dungeon is quiet."
        : `Floor ${floor} was as far as you got. You keep everything you had already banked.`;

    const dealt = [...gear].sort((a, b) => RANK.indexOf(a.rarity) - RANK.indexOf(b.rarity));
    const [shown, setShown] = useState(0);
    useEffect(() => {
        if (shown >= dealt.length) return undefined;
        const t = setTimeout(() => { ding(dealt[shown].rarity); setShown((n) => n + 1); }, shown === 0 ? 420 : 620);
        return () => clearTimeout(t);
    }, [shown, dealt]);

    const chestCounts = chests.reduce((m, t) => ({ ...m, [t]: (m[t] || 0) + 1 }), {});

    return (
        <div className="dlw" role="dialog" aria-modal="true" onClick={onClose}>
            <div className={`dlw-card ${tone}`} onClick={(e) => e.stopPropagation()}>
                {cleared ? (
                    <div className="dlw-rays" aria-hidden="true">
                        {Array.from({ length: 26 }).map((_, i) => (
                            <span key={i} style={{ "--a": `${i * (360 / 26)}deg`, animationDelay: `${(i % 6) * 0.05}s` }} />
                        ))}
                    </div>
                ) : null}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cleared ? "/images/delves/ev-victory.webp" : "/images/delves/ev-death.webp"} className="dlw-art" alt="" draggable="false" />
                <h3>{title}</h3>
                <p className="dlw-line">{line}</p>

                <div className="dlw-haul">
                    <div className="dlw-tiles">
                        <span className="dlw-tile">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={REWARD_ART.gold} alt="" draggable="false" />
                            <b>{gold.toLocaleString()}</b><em>gold</em>
                        </span>
                        <span className="dlw-tile">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={REWARD_ART.xp} alt="" draggable="false" />
                            <b>{xp.toLocaleString()}</b><em>XP</em>
                        </span>
                        {Object.entries(chestCounts).map(([tier, n]) => (
                            <span key={tier} className="dlw-tile">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={chestArt[tier] || CHEST_FALLBACK[tier] || CHEST_FALLBACK.wooden} alt="" draggable="false" />
                                <b>{n}</b><em>{tier} chest{n === 1 ? "" : "s"}</em>
                            </span>
                        ))}
                        {parts.map((p) => (
                            <span key={p.tier} className="dlw-tile">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                {p.sprite ? <img src={p.sprite} alt="" draggable="false" /> : null}
                                <b>{p.n}</b><em>{p.name}</em>
                            </span>
                        ))}
                        {doubloons ? (
                            <span className="dlw-tile">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={REWARD_ART.doubloons} alt="" draggable="false" />
                                <b>{doubloons}</b><em>doubloons</em>
                            </span>
                        ) : null}
                    </div>

                    {dealt.length ? (
                        <div className="dlw-gear">
                            <span className="dlw-gear-head">{dealt.length === 1 ? "It was carrying something" : "It was carrying things"}</span>
                            {dealt.slice(0, shown).map((g, i) => (
                                <div key={`${g.id}-${i}`} className="dlw-item" style={{ "--rar": RARITY[g.rarity] || "#4aa3ff" }}>
                                    <span className="dlw-item-art">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        {g.sprite ? <img src={g.sprite} alt="" draggable="false" /> : null}
                                    </span>
                                    <span className="dlw-item-body">
                                        <b>{g.name}</b>
                                        <span className="dlw-item-tags">
                                            <i className="dlw-rar">{g.rarity}</i>
                                            {g.slot ? <i className="dlw-slot">{String(g.slot).replace(/_/g, " ")}</i> : null}
                                        </span>
                                        {g.stats ? <em className="dlw-item-stats">{g.stats}</em> : null}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>

                {cleared && (bonusGold || bonusXp) ? (
                    <div className="dlw-bonus">Clearing it paid a purse of <b>{bonusGold.toLocaleString()}</b> gold and <b>{bonusXp.toLocaleString()}</b> XP on top.</div>
                ) : null}

                <button type="button" className="dlv-btn dlw-out" onClick={onClose}>Back to the hall</button>
            </div>

            <style jsx>{`
                .dlw { position: fixed; inset: 0; z-index: 300; display: grid; place-items: center; padding: 16px;
                    background: rgba(6,4,12,0.86); backdrop-filter: blur(3px); overflow-y: auto; }
                .dlw-card { position: relative; overflow: hidden; width: min(430px, 100%); padding: 22px 20px 18px;
                    border-radius: 20px; text-align: center; background: linear-gradient(180deg, #241c33, #14101f);
                    border: 2px solid #6f5a9c; box-shadow: 0 24px 70px rgba(0,0,0,0.75);
                    animation: dlwPop .38s cubic-bezier(.2,1.4,.35,1) both; }
                @keyframes dlwPop { from { opacity: 0; transform: scale(.9) translateY(12px); } to { opacity: 1; transform: none; } }
                .dlw-card.is-clear { border-color: #ffd75e; box-shadow: 0 24px 70px rgba(0,0,0,0.75), 0 0 60px rgba(255,190,60,0.35); }
                .dlw-card.is-dead { border-color: #ff6f7d; }
                .dlw-rays { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; }
                .dlw-rays span { position: absolute; width: 3px; height: 46px; border-radius: 2px; background: linear-gradient(#ffd75e, transparent);
                    transform-origin: 50% 0; animation: dlwRay 1.4s cubic-bezier(.15,.7,.3,1) both; }
                @keyframes dlwRay { from { opacity: 1; transform: rotate(var(--a)) translateY(0) scaleY(.4); }
                    to { opacity: 0; transform: rotate(var(--a)) translateY(-180px) scaleY(1); } }
                .dlw-art { position: relative; width: 84px; height: 84px; object-fit: contain; filter: drop-shadow(0 5px 16px rgba(0,0,0,0.6)); }
                .dlw-card h3 { margin: 5px 0 4px; font-size: 1.3rem; font-weight: 900; color: #e9e0ff; }
                .dlw-card.is-clear h3 { color: #ffe28a; }
                .dlw-card.is-dead h3 { color: #ffb0b8; }
                .dlw-line { margin: 0 0 14px; font-size: 0.82rem; line-height: 1.5; color: #a99fc4; }

                .dlw-haul { text-align: left; }
                /* Counted loot as picture tiles rather than a name/number table — you read a haul faster than
                   you read a receipt. */
                .dlw-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(86px, 1fr)); gap: 7px; }
                .dlw-tile { display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 9px 6px 7px;
                    border-radius: 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); }
                .dlw-tile img { width: 30px; height: 30px; object-fit: contain; }
                .dlw-tile b { font-size: 1rem; font-weight: 900; color: #ffd75e; font-variant-numeric: tabular-nums; }
                .dlw-tile em { font-size: 9.5px; font-style: normal; color: #a99fc4; text-align: center; text-transform: capitalize; }

                .dlw-gear { margin-top: 12px; display: grid; gap: 8px; }
                .dlw-gear-head { font-size: 10px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; color: #8a7fae; }
                /* One card per piece, dealt in on a delay, with its rarity colour doing the talking. */
                .dlw-item { display: grid; grid-template-columns: 54px minmax(0, 1fr); gap: 11px; align-items: center;
                    padding: 10px 12px; border-radius: 13px;
                    background: linear-gradient(140deg, color-mix(in srgb, var(--rar) 20%, transparent), rgba(255,255,255,0.03) 65%);
                    border: 1px solid var(--rar); box-shadow: 0 0 22px -8px var(--rar);
                    animation: dlwItem .5s cubic-bezier(.2,1.45,.35,1) both; }
                @keyframes dlwItem { from { opacity: 0; transform: translateY(14px) scale(.94); } to { opacity: 1; transform: none; } }
                .dlw-item-art { width: 54px; height: 54px; border-radius: 11px; display: grid; place-items: center;
                    background: radial-gradient(circle at 40% 30%, color-mix(in srgb, var(--rar) 26%, transparent), rgba(0,0,0,0.4));
                    border: 1px solid color-mix(in srgb, var(--rar) 55%, transparent); }
                .dlw-item-art img { width: 44px; height: 44px; object-fit: contain; }
                .dlw-item-body { min-width: 0; }
                .dlw-item-body b { display: block; font-size: 0.92rem; font-weight: 900; color: #fff; line-height: 1.2; }
                .dlw-item-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 4px; }
                .dlw-item-tags i { font-style: normal; font-size: 9px; font-weight: 900; letter-spacing: .08em;
                    text-transform: uppercase; padding: 2px 7px; border-radius: 999px; }
                .dlw-rar { color: #120e1a; background: var(--rar); }
                .dlw-slot { color: #c9bce8; background: rgba(255,255,255,0.08); }
                .dlw-item-stats { display: block; margin-top: 5px; font-style: normal; font-size: 11px; line-height: 1.45; color: #d6cbf0; }

                .dlw-bonus { margin: 12px 0 0; font-size: 0.76rem; line-height: 1.45; color: #cdb894; text-align: center; }
                .dlw-bonus b { color: #ffe28a; }
                .dlw-out { margin-top: 14px; }
            `}</style>
        </div>
    );
}
