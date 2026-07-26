"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GiSpikedDragonHead } from "react-icons/gi";

import AvatarStack from "@/components/AvatarStack";
import CardTab from "@/components/CardTab";
import { backgroundClass } from "@/lib/marketplace/backgrounds.js";
import { frameClass } from "@/lib/marketplace/frames.js";
import { rankForLevel } from "@/lib/marketplace/ranks.js";

// The on-stage identity card for whoever is currently attacking. Painted STATICALLY in the top-left of the
// stage (it doesn't ride the moving sprite) so the words hold still and are readable, fading in as each new
// hero takes their turn. Renders the member's FULL configured look on a solid, opaque backplate: their
// equipped profile background (the crosshatch/hue plate), card frame, avatar with its border + cosmetics,
// featured "folder tab" badge, rank + level, and showcased badges.
function BattleHeroCard({ f }) {
    const rank = rankForLevel(f.level || 1);
    const initial = (f.displayLabel || f.name || "?").slice(0, 1).toUpperCase();
    // The member's signature color (aura → border) tints the card's edge + glow so each one reads as uniquely
    // theirs, on top of their equipped background/frame/avatar-ring.
    const glow = AURA_COL[f.aura] || BORDER_COL[f.border] || null;
    return (
        <div
            className={`bhc ${f.background ? `has-bg ${backgroundClass(f.background)}` : ""} ${frameClass(f.frame)} ${f.you ? "is-you" : ""}${glow ? " has-glow" : ""}`.replace(/\s+/g, " ").trim()}
            style={glow ? { "--glow": glow } : undefined}
        >
            <CardTab badge={f.featuredBadge} compact />
            {f.dmgRank ? (
                <span className={`bhc-rank bhc-rank-${f.dmgRank}`} title={`#${f.dmgRank} damage dealer`} aria-label={`Number ${f.dmgRank} damage dealer`}>
                    <span aria-hidden="true">{["🥇", "🥈", "🥉"][f.dmgRank - 1]}</span>#{f.dmgRank}
                </span>
            ) : null}
            <div className="bhc-inner">
                <AvatarStack avatarUrl={f.avatarUrl} initial={initial} size={36} border={f.border} cosmetics={f.avatarCosmetics} />
                <div className="bhc-body">
                    <div className="bhc-name">{f.you ? "You" : (f.displayLabel || f.name)}</div>
                    <div className="bhc-meta">
                        <span className="rank-chip rank-chip-sm">{rank.emoji} {rank.title}</span>
                        <span className="bhc-lv">Lv {f.level || 1}{f.petLevel ? ` · 🐾 ${f.petLevel}` : ""}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// The 2D side-scrolling battle stage. Instead of cramming the whole (now large) pack on-screen, adventurers
// take turns: a GROUP of 3 marches in from the left, attacks the boss with a random flourish, then marches
// off as the next 3 rotate in — cycling through everyone who's fighting. Purely presentational; the parent
// (BossFightClient) owns HP/attack state.

const GROUP = 1; // ONE hero at a time — each gets their moment to shine, then the next slides in.
const CHEER_EMOJI = ["📣", "🎉", "⭐", "👏", "🙌", "✨", "💥", "📣"]; // pom-poms that fan out when you cheer
// Border/aura cosmetics → a representative glow color, so a hero's configured look reads on the stage.
export const BORDER_COL = { ember: "#ff7a3c", bronze: "#cd7f32", aqua: "#5ad0d0", neon: "#39ff14", silver: "#c0c0c0", crimson: "#e23b4e", emerald: "#2ecc71", sunset: "#ff8c5a", sky: "#4aa3ff", rose: "#ff5fa2", gold: "#ffd75e", ocean: "#2aa9c8", aurora: "#7cffb2", amethyst: "#b76bff", frost: "#a8e6ff", inferno: "#ff5a2c", rainbow: "#ff6bd6", cosmic: "#8f7cff", legendary: "#ffd75e", solar: "#ffb24a", abyss: "#6a4fe0", godray: "#fff2b0", singularity: "#b76bff", role_volunteer: "#7cffb2", role_staff: "#ffd75e", role_dev: "#8fb8ff", role_admin: "#ff5a5a" };
export const AURA_COL = { aura_gold: "#ffd75e", aura_aqua: "#5ad0d0", aura_violet: "#b76bff", aura_rainbow: "#ff6bd6", aura_ember: "#ff7a3c", aura_frost: "#a8e6ff", aura_cosmic: "#8f7cff" };

export default function BossBattleScene({ boss, fighters = [], defaultSprite = null, hit = false, floaters = [], pct = 100, youElement = null, canCheer = false, cheersLeft = 0, onCheer = null }) {
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

    // The turn-based state machine. Timings tuned so a full wave is a satisfying ~4.5s beat. Always runs — the
    // scene rotating through fighters is core gameplay, not decorative motion, so it ignores reduce-motion.
    useEffect(() => {
        const ms = phase === "in" ? 850 : phase === "attack" ? 620 : 560;
        const t = setTimeout(() => {
            if (phase === "in") setPhase("attack");
            else if (phase === "attack") setPhase("out");
            else { setWave((w) => (w + 1) % waveCount); setPhase("in"); }
        }, ms);
        return () => clearTimeout(t);
    }, [phase, wave, waveCount]);

    // The one fighter on stage this wave.
    const party = useMemo(() => {
        if (!roster.length) return [];
        const f = roster[wave % roster.length];
        return f ? [{ ...f, key: `${wave}-${f.id || wave}` }] : [];
    }, [wave, roster]);
    const current = party[0] || null; // the hero whose identity card is shown top-left this beat

    // Cheering the hero on stage: fire the pom-pom/ring burst locally the instant you tap (feels instant), and
    // hand the actual network call + damage/reward juice up to the parent via onCheer.
    const [cheerPulse, setCheerPulse] = useState(0);
    const cheerNonce = useRef(0);
    const doCheer = (f) => {
        if (!f || f.pad || f.you || !canCheer || cheersLeft <= 0) return;
        const id = (cheerNonce.current += 1);
        setCheerPulse(id);
        setTimeout(() => setCheerPulse((p) => (p === id ? 0 : p)), 1500);
        if (onCheer) onCheer(f);
    };

    // Ambient impact glints on the boss so its continuous passive damage reads as landing.
    const [sparks, setSparks] = useState([]);
    const sid = useRef(0);
    useEffect(() => {
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
                {boss.buff ? (
                    <div className="battle-buff" title={`All damage ×${boss.buff.damageMult} while active`}>
                        <span className="battle-buff-emoji">{boss.buff.emoji}</span>
                        <span className="battle-buff-label">{boss.buff.label}</span>
                        <span className="battle-buff-mult">×{boss.buff.damageMult}</span>
                    </div>
                ) : null}
            </div>

            {/* Static, readable identity card for the current attacker — top-left, fades in per hero. */}
            {current && !current.pad ? (
                <div className="bhc-slot" key={current.id}>
                    <BattleHeroCard f={current} />
                    {canCheer && !current.you && cheersLeft > 0 ? (
                        <button type="button" className="cheer-btn" onClick={() => doCheer(current)} title={`Cheer ${current.displayLabel || current.name}`}>
                            📣 Cheer <span className="cheer-btn-n">{cheersLeft}</span>
                        </button>
                    ) : null}
                    {cheerPulse ? (
                        <div className="cheer-fx" key={cheerPulse} aria-hidden="true">
                            <span className="cheer-ring" />
                            {CHEER_EMOJI.map((e, i) => <span key={i} className="cheer-pom" style={{ "--i": i }}>{e}</span>)}
                            <span className="cheer-pop">CHEER!</span>
                        </div>
                    ) : null}
                </div>
            ) : null}

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
                {party.map((f) => {
                    const glow = AURA_COL[f.aura] || BORDER_COL[f.border] || null;
                    return (
                        <div
                            key={f.key}
                            className={`adv${f.you ? " is-you" : ""}${f.pad ? " is-pad" : ""}`}
                            style={glow ? { "--glow": glow } : undefined}
                        >
                            {/* adv-body = the shared march-in/out travel; hero + pet ride it in together but each
                                has its OWN gait + attack timing so they're not glued at the hip. */}
                            <div className="adv-body">
                                {glow ? <span className={`adv-aura${f.border ? " has-border" : ""}`} /> : null}
                                {/* The companion pet — rides in with its owner and strikes at the SAME time. Facing is a
                                    --pet-face var baked INTO the sprite's own transform (see globals.css) so the strike
                                    keyframe's translate lunges toward the boss even when the sprite is mirrored. */}
                                {f.petSpriteUrl ? (
                                    <span className="adv-pet-wrap">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img className="adv-pet" src={f.petSpriteUrl} alt="" style={{ "--pet-face": f.petSpriteFlip ? -1 : 1 }} />
                                    </span>
                                ) : null}
                                {/* Facing baked into the sprite's transform (--adv-face) so a flipped hero still lunges forward. */}
                                <span className="adv-flip">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img className="adv-sprite" src={f.spriteUrl} alt="" style={{ "--adv-face": f.spriteFlip ? -1 : 1 }} />
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {floaters.map((f) => (
                <span key={f.id} className={`battle-floater${f.crit ? " is-crit" : ""}${f.cheer ? " is-cheer" : ""}`} style={{ top: `${f.top}%`, left: `${f.left}%` }}>
                    {f.cheer ? `+${f.amount}` : f.crit ? `${f.amount}!` : f.amount}
                </span>
            ))}
        </div>
    );
}
