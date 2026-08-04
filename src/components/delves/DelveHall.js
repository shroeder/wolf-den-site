"use client";

// ── THE HALL ─────────────────────────────────────────────────────────────────────────────────────────────────
// Pick a dungeon, or spend gold on the three things that change how a run feels. A locked dungeon still shows
// its art and its boss — you should be able to see what you are working toward, not a grey box with a padlock.

import { UpgCard } from "@/components/mining/kit.js";

const money = (n) => Number(n || 0).toLocaleString();

// Raw <img> everywhere, deliberately. A local `Img` component looks tidier and silently breaks every style
// rule aimed at it: styled-jsx appends its `jsx-<hash>` scope class to DOM elements only, never to a custom
// component, so `.dlv-track-ico { width: 34px }` compiled to `.dlv-track-ico.jsx-abc` and matched nothing. The
// upgrade icons rendered at their natural 256px inside a 38px grid track and buried the card under a potion.

export default function DelveHall({ state, busy, onAct }) {
    const { dungeons = [], tracks = [], potions, stats, gold, power } = state;
    return (
        <>
            <div className="dlv-hall">
                {dungeons.map((d) => {
                    const locked = !d.unlocked;
                    const spent = d.runToday;
                    return (
                        <div key={d.id} className={`dlv-card${locked ? " is-locked" : ""}`} style={{ "--tint": d.tint }}>
                            <div className="dlv-card-art">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={d.bg} className="dlv-card-bg" alt="" draggable="false" loading="lazy" />
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={d.boss.sprite} className="dlv-card-boss" alt={d.boss.name} draggable="false" loading="lazy" />
                                <span className="dlv-card-scrim" aria-hidden="true" />
                                <span className="dlv-card-floors">{d.floors} floors</span>
                            </div>
                            <div className="dlv-card-body">
                                <b className="dlv-card-name">{d.name}</b>
                                <p className="dlv-card-blurb">{d.blurb}</p>
                                <div className="dlv-card-foot">
                                    <span className="dlv-card-boss-name">Guarded by {d.boss.name}</span>
                                    {locked ? (
                                        <span className="dlv-card-gate">Unlocks at level {d.minLevel}</span>
                                    ) : spent ? (
                                        <span className="dlv-card-gate is-done">Run today — back tomorrow</span>
                                    ) : (
                                        <button type="button" className="dlv-btn" disabled={busy}
                                            onClick={() => onAct("start", { dungeon: d.id })}>
                                            Descend
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* WHAT YOU'D WALK IN WITH. Health and swing both come off your level and your equipped gear, so this
                has to be visible here — otherwise "better gear helps in a delve" is a claim nobody can see. */}
            <div className="dlv-power">
                <div className="dlv-power-stat">
                    <span className="dlv-power-lab">Vigour</span>
                    <b>{power?.vigour}</b>
                    <em>health</em>
                </div>
                <div className="dlv-power-stat">
                    <span className="dlv-power-lab">Might</span>
                    <b>{power?.might}</b>
                    <em>per swing</em>
                </div>
                <p className="dlv-power-note">
                    From level <b>{power?.level}</b> and <b>{power?.gearPower}</b> points of equipped gear.
                    Wear something better and you go in tougher.
                </p>
            </div>

            <div className="dlv-kit">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/delves/ev-potion.webp" className="dlv-kit-ico" alt="" draggable="false" />
                <span>You go in with <b>{potions?.count} potions</b>, each restoring <b>{potions?.healPct}%</b> of your health.</span>
            </div>

            {/* THE SHARED UPGRADE CARD. Sailing, the farm, the kitchen, the forge and the mine all buy their
                levers through .sail-upgrades / UpgCard; the delve had grown its own list with its own spacing,
                its own level pill and its own price button, which is why it looked like a different game. */}
            <div className="dlv-sec-head">Provisions <span className="muted">· {money(gold)} gold</span></div>
            <div className="sail-upgrades is-delve">
                {tracks.map((t) => <UpgCard key={t.key} t={t} gold={gold} busy={busy} onBuy={() => onAct("upgrade", { track: t.key })} />)}
            </div>

            {stats?.started ? (
                <div className="dlv-stats">
                    <span><b>{stats.started}</b> runs</span>
                    <span><b>{stats.cleared}</b> cleared</span>
                    <span><b>{stats.bosses}</b> bosses</span>
                    <span><b>{stats.floors}</b> floors</span>
                    <span><b>{stats.died}</b> deaths</span>
                </div>
            ) : null}

            <style jsx>{`
                .dlv-hall { display: grid; gap: 12px; }
                @media (min-width: 700px) { .dlv-hall { grid-template-columns: 1fr 1fr; } }
                .dlv-card { border-radius: 16px; overflow: hidden; background: rgba(255,255,255,0.03);
                    border: 1px solid color-mix(in srgb, var(--tint) 40%, transparent); }
                .dlv-card.is-locked { opacity: 0.62; }
                .dlv-card-art { position: relative; aspect-ratio: 16 / 9; display: grid; place-items: center; overflow: hidden; }
                .dlv-card-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
                .dlv-card-scrim { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0.1), rgba(10,6,16,0.82)); }
                .dlv-card-boss { position: relative; z-index: 1; width: 44%; max-height: 82%; object-fit: contain;
                    filter: drop-shadow(0 6px 16px rgba(0,0,0,0.6)); }
                .dlv-card-floors { position: absolute; top: 8px; right: 9px; z-index: 2; padding: 3px 8px; border-radius: 999px;
                    font-size: 10.5px; font-weight: 900; color: #120e1a; background: color-mix(in srgb, var(--tint) 85%, white); }
                .dlv-card-body { padding: 11px 13px 13px; }
                .dlv-card-name { display: block; font-size: 1rem; color: color-mix(in srgb, var(--tint) 70%, white); }
                .dlv-card-blurb { margin: 4px 0 9px; font-size: 12px; line-height: 1.45; color: #9aa2ab; }
                .dlv-card-foot { display: grid; gap: 7px; }
                .dlv-card-boss-name { font-size: 11px; font-weight: 800; color: #bda9d8; }
                .dlv-card-gate { padding: 9px; border-radius: 11px; text-align: center; font-size: 12px; font-weight: 800;
                    color: #9aa2ab; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); }
                .dlv-card-gate.is-done { color: #7cffb2; border-color: rgba(124,255,178,0.3); background: rgba(124,255,178,0.08); }

                .dlv-power { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 14px; padding: 12px 14px;
                    border-radius: 13px; background: linear-gradient(150deg, rgba(185,140,255,0.14), rgba(90,208,208,0.06));
                    border: 1px solid rgba(185,140,255,0.32); }
                .dlv-power-stat { text-align: center; }
                .dlv-power-lab { display: block; font-size: 9.5px; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; color: #a08cff; }
                .dlv-power-stat b { display: block; font-size: 1.55rem; font-weight: 900; color: #e9e0ff; line-height: 1.1; }
                .dlv-power-stat em { font-size: 10px; font-style: normal; color: #8f88ab; }
                .dlv-power-note { grid-column: 1 / -1; margin: 4px 0 0; font-size: 11px; line-height: 1.45; color: #9c93b8; text-align: center; }
                .dlv-power-note b { color: #d9c2ff; }
                .dlv-kit { display: flex; align-items: center; gap: 10px; margin: 14px 0 6px; padding: 10px 12px; border-radius: 12px;
                    font-size: 12.5px; color: #cdd3d8; background: rgba(185,140,255,0.08); border: 1px solid rgba(185,140,255,0.28); }
                .dlv-kit-ico { width: 30px; height: 30px; object-fit: contain; flex: 0 0 auto; }
                .dlv-kit b { color: #e0ceff; }

                .dlv-sec-head { margin: 16px 0 8px; font-size: 12.5px; font-weight: 900; color: #d9c2ff; }
                .dlv-stats { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 14px; padding-top: 11px;
                    border-top: 1px solid rgba(255,255,255,0.08); font-size: 11.5px; color: #9aa2ab; }
                .dlv-stats b { color: #d9c2ff; }
            `}</style>
        </>
    );
}
