"use client";

import { useState } from "react";
import * as Gi from "react-icons/gi";

// ── SHIP BATTLES: ONE HOME FOR THE WHOLE THING ───────────────────────────────────────────────────────────────
// This started as two features wearing one engine. The FLEET lived here and called a fight a "sortie" you
// "engage"; RAIDS lived in a big call-to-action near the top of the sailing page, opened a separate
// full-screen picker, called the same fight a "raid", counted a different daily allowance, paid a different
// currency, and kept its upgrade track in the BOAT list while the gun tracks sat in here. Same maths, two
// vocabularies, two homes, two budgets, two upgrade lists — Luke's word for it was bipolar and he was right.
//
// It is one screen now, and one word. Everything is a BATTLE. The only thing that changes is who you fight:
//   FLEET   the designed ladder — fifteen ranks, the progression, where the doubloons come from
//   RAIDS   another member's ship — opportunistic, pays gold and a shot at their gear
//   YOUR SHIP  every combat upgrade in one list, each showing what it costs in
//   AMMUNITION what is in the racks
//
// The two daily allowances are still separate (they are different activities with different economies) but
// they are stated together, in the same place, in the same words — which is all the player needed.
//
// Styling is in globals.css (this file has several components; a styled-jsx block would only reach the one
// that owns it — see the sailing boards).

const Icon = ({ name, className }) => {
    const C = Gi[name] || Gi.GiCannon;
    return <C className={className} aria-hidden="true" />;
};

function Track({ t, purse, gold, busy, onBuy }) {
    const afford = t.cost != null && (t.currency === "gold" ? (gold ?? 0) : purse) >= t.cost;
    return (
        <div className="sby-track">
            <Icon name={t.icon} className="sby-track-ico" />
            <div className="sby-track-body">
                <b>{t.name}</b>
                <em>{t.desc}</em>
                {t.effect ? <span className="sby-track-eff">{t.effect}</span> : null}
                <div className="sby-pips" aria-hidden="true">
                    {Array.from({ length: t.max }).map((_, i) => <i key={i} className={i < t.level ? "on" : undefined} />)}
                </div>
            </div>
            {t.maxed ? (
                <button type="button" className="sby-buy is-maxed" disabled>Maxed</button>
            ) : (
                <button type="button" className={`sby-buy${t.currency === "gold" ? " is-gold" : ""}`}
                    disabled={busy || !afford} onClick={() => onBuy(t)}
                    title={`Costs ${t.cost} ${t.currency === "gold" ? "gold" : "doubloons"}`}>
                    {t.currency === "gold" ? `🪙 ${t.cost.toLocaleString()}` : `${t.cost} ⛃`}
                </button>
            )}
        </div>
    );
}

function Round({ a, purse, busy, onLoad, onBuy }) {
    const out = !a.basic && (a.count || 0) <= 0;
    return (
        <div className={`sby-round${a.loaded ? " is-loaded" : ""}`}>
            <Icon name={a.icon} className="sby-round-ico" />
            <div className="sby-round-body">
                <b>{a.name}</b>
                <em>{a.blurb}</em>
            </div>
            <div className="sby-round-acts">
                <span className={`sby-count${out ? " is-out" : ""}`}>
                    {a.basic ? "unlimited" : `${a.count} in the racks`}
                </span>
                {a.loaded ? (
                    <span className="sby-count">loaded</span>
                ) : (
                    <button type="button" className="sby-mini is-load" disabled={busy || out} onClick={() => onLoad(a.id)}>Load</button>
                )}
                {a.basic ? null : (
                    <button type="button" className="sby-mini" disabled={busy || purse < a.price * 5}
                        onClick={() => onBuy(a.id, 5)} title={`5 rounds for ${a.price * 5} doubloons`}>
                        Buy 5 · {a.price * 5} ⛃
                    </button>
                )}
            </div>
        </div>
    );
}

function Rung({ s, busy, canFight, onEngage }) {
    return (
        <div className={`sby-rung${s.beaten ? " is-beaten" : ""}${s.current ? " is-current" : ""}${s.boss ? " is-boss" : ""}`}>
            <span className="sby-rank">{s.rank}</span>
            {s.art ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="sby-rung-art" src={s.art} alt="" draggable="false" />
            ) : null}
            <div className="sby-rung-body">
                <b>{s.name}</b>
                <em>{s.cls}{s.boss ? " · flagship" : ""}</em>
                <div className="sby-rung-stats">
                    <span>{s.guns} guns</span>
                    <span>{s.hp} hull</span>
                    <span>{s.ammo} shot</span>
                    {s.reward?.doubloons ? <span>{s.reward.doubloons} ⛃</span> : null}
                </div>
            </div>
            {s.beaten && !s.current ? (
                <button type="button" className="sby-mini" disabled={busy || !canFight} onClick={() => onEngage(s.rank)}>
                    Re-fight
                </button>
            ) : (
                <button type="button" className="sby-engage" disabled={busy || !canFight} onClick={() => onEngage(s.rank)}>
                    {canFight ? "Battle" : "None left"}
                </button>
            )}
        </div>
    );
}

// A rival member's ship. Deliberately the SAME row as a fleet rung — rank chip, hull, the three numbers that
// decide the fight, one button — because it is the same fight and reading it should take the same glance.
function RivalRow({ t, mine, busy, canFight, onRaid }) {
    const worse = (a, b) => (mine && a > b ? "is-worse" : undefined);
    return (
        <div className="sby-rung is-rival">
            {t.rider ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="sby-rival-face" src={t.rider} alt="" draggable="false" />
            ) : <span className="sby-rank">@</span>}
            {t.boat ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="sby-rung-art" src={t.boat} alt="" draggable="false" />
            ) : null}
            <div className="sby-rung-body">
                <b>{t.name}</b>
                <em>boat level {t.level}{t.topRarity ? ` · best ${t.topRarity}` : ""}</em>
                <div className="sby-rung-stats">
                    <span className={worse(t.guns, mine?.guns)}>{t.guns} guns</span>
                    <span className={worse(t.hull, mine?.hull)}>{t.hull} hull</span>
                    <span>{t.ammo} shot</span>
                    {t.odds != null ? <span className={t.odds >= 60 ? "sby-odds is-good" : t.odds >= 35 ? "sby-odds" : "sby-odds is-bad"}>~{t.odds}%</span> : null}
                    {t.rank ? <span>pays like rank {t.rank}</span> : null}
                </div>
            </div>
            <button type="button" className="sby-engage" disabled={busy || !canFight} onClick={() => onRaid(t.id)}>
                {canFight ? "Battle" : "None left"}
            </button>
        </div>
    );
}

export default function ShipYard({ combat, raid, gold, targets = null, targetsMine = null, busy, tab, onTab, onAct }) {
    const [ownTab, setOwnTab] = useState("fleet");
    const active = tab || ownTab;
    const setTab = onTab || setOwnTab;
    if (!combat) return null;
    const purse = combat.doubloons || 0;
    const fleet = combat.fleet || {};
    // ONE allowance covering both kinds of battle — the fleet and member raids draw from the same pool, so
    // choosing between them is a real decision rather than two separate chores.
    const battlesLeft = Math.max(0, (raid?.cap || 0) - (raid?.used || 0));

    return (
        <section className="card sby">
            <div className="sby-head">
                <h3>Ship battles</h3>
                <span className="sby-purse">{purse.toLocaleString()} ⛃ doubloons</span>
            </div>
            {/* BOTH allowances, together, in the same words. They used to be a "sortie" count in here and a
                separate "raid" count in a call-to-action three screens up. */}
            <p className="sby-allowance">
                <b>{battlesLeft}</b> battle{battlesLeft === 1 ? "" : "s"} left today — spend them on the fleet or on a rival
            </p>

            <div className="sbd-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={active === "fleet"} className={active === "fleet" ? "is-on" : ""} onClick={() => setTab("fleet")}>Fleet</button>
                <button type="button" role="tab" aria-selected={active === "raid"} className={active === "raid" ? "is-on" : ""} onClick={() => setTab("raid")}>Raids</button>
                <button type="button" role="tab" aria-selected={active === "ship"} className={active === "ship" ? "is-on" : ""} onClick={() => setTab("ship")}>Your ship</button>
                <button type="button" role="tab" aria-selected={active === "ammo"} className={active === "ammo" ? "is-on" : ""} onClick={() => setTab("ammo")}>Ammunition</button>
            </div>

            {active === "ship" ? (
                <>
                    <div className="sby-stats">
                        <div className="sby-stat"><b>{combat.ship.guns}</b><em>guns</em></div>
                        <div className="sby-stat"><b>{combat.ship.accuracy}%</b><em>accuracy</em></div>
                        <div className="sby-stat"><b>{combat.ship.hp}</b><em>hull</em></div>
                        <div className="sby-stat"><b>{combat.ship.armor}%</b><em>armour</em></div>
                    </div>
                    <p className="sby-sub">
                        Your boat level (currently {combat.ship.boatLevel}) lifts all four — a bigger hull is a better gun
                        platform. Doubloons are the only thing that buys the rest, and the only place they come from is a
                        ship battle.
                    </p>
                    <div className="sby-tracks">
                        {(combat.tracks || []).map((t) => (
                            <Track key={t.key} t={t} purse={purse} gold={gold} busy={busy}
                                onBuy={(track) => onAct(track.action ? { action: track.action } : { action: "upgrade_combat", track: track.key })} />
                        ))}
                    </div>
                </>
            ) : null}

            {active === "ammo" ? (
                <>
                    <p className="sby-sub">
                        One round of whatever is loaded is spent per battle. Round shot never runs out — the rest are
                        stock, and when the racks are empty the guns fall back to round shot rather than refusing to fire.
                    </p>
                    <div className="sby-ammo">
                        {(combat.ammo || []).map((a) => (
                            <Round key={a.id} a={a} purse={purse} busy={busy}
                                onLoad={(ammo) => onAct({ action: "set_loadout", ammo })}
                                onBuy={(ammo, qty) => onAct({ action: "buy_ammo", ammo, qty })} />
                        ))}
                    </div>
                </>
            ) : null}

            {active === "raid" ? (
                <>
                    <p className="sby-sub">
                        The same fight, against a real member&apos;s ship, out of the same daily allowance — and it
                        pays out of the same table. Their ship is matched to the fleet rank it most resembles, so
                        running down a warship pays like a warship. They lose nothing either way, and losing costs you
                        the battle and nothing else. Every rival is a fresh opponent, which is what makes this the
                        repeatable half once you have out-run the ladder.
                    </p>
                    {!targets ? (
                        <p className="sby-sub">Scanning the horizon…</p>
                    ) : !targets.length ? (
                        <p className="sby-sub">No ships on the horizon right now — try again later.</p>
                    ) : (
                        <div className="sby-fleet">
                            {targets.map((t) => (
                                <RivalRow key={t.id} t={t} mine={targetsMine} busy={busy} canFight={battlesLeft > 0}
                                    onRaid={(id) => onAct({ action: "raid", target: id })} />
                            ))}
                        </div>
                    )}
                </>
            ) : null}

            {active === "fleet" ? (
                <>
                    <p className="sby-sub">
                        Fought in order. Sinking one for the first time opens the next and pays the most — doubloons,
                        forge parts, treasure fragments, a chest from a flagship. Losing costs the battle and nothing else.
                        Steady, and it is where the ladder is.
                    </p>
                    {fleet.cleared ? (
                        <div className="sby-cleared">The whole fleet is on the bottom. Admiral Vane included.</div>
                    ) : null}
                    <div className="sby-fleet">
                        {(fleet.ships || []).slice().reverse().map((s) => (
                            <Rung key={s.rank} s={s} busy={busy} canFight={battlesLeft > 0}
                                onEngage={(rank) => onAct({ action: "fleet_battle", rank })} />
                        ))}
                    </div>
                </>
            ) : null}
        </section>
    );
}
