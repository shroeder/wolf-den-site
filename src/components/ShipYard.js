"use client";

import { useState } from "react";
import * as Gi from "react-icons/gi";

// ── THE GUN DECK, THE RACKS AND THE LADDER ───────────────────────────────────────────────────────────────────
// Everything you decide BEFORE a battle, on one screen, because the battle itself resolves on its own: what
// your ship is, what you can buy for it, what is in the racks, and which ship you are going to fight.
//
// The four numbers at the top are the SAME ones the sim uses — guns, accuracy, hull, armour. A screen whose
// only job is helping you choose what to buy next cannot hide the maths that decides whether it was worth it.
//
// Styling is in globals.css (this file has several components; a styled-jsx block would only reach the one
// that owns it — see the sailing boards).

const Icon = ({ name, className }) => {
    const C = Gi[name] || Gi.GiCannon;
    return <C className={className} aria-hidden="true" />;
};

function Track({ t, purse, busy, onBuy }) {
    const afford = t.cost != null && purse >= t.cost;
    return (
        <div className="sby-track">
            <Icon name={t.icon} className="sby-track-ico" />
            <div className="sby-track-body">
                <b>{t.name}</b>
                <em>{t.desc}</em>
                <div className="sby-pips" aria-hidden="true">
                    {Array.from({ length: t.max }).map((_, i) => <i key={i} className={i < t.level ? "on" : undefined} />)}
                </div>
            </div>
            {t.maxed ? (
                <button type="button" className="sby-buy is-maxed" disabled>Maxed</button>
            ) : (
                <button type="button" className="sby-buy" disabled={busy || !afford} onClick={() => onBuy(t.key)}
                    title={afford ? `Costs ${t.cost} doubloons` : `Needs ${t.cost} doubloons`}>
                    {t.cost} ⛃
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

function Rung({ s, busy, sortiesLeft, onEngage }) {
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
                <button type="button" className="sby-mini" disabled={busy || sortiesLeft <= 0} onClick={() => onEngage(s.rank)}>
                    Re-fight
                </button>
            ) : (
                <button type="button" className="sby-engage" disabled={busy || sortiesLeft <= 0} onClick={() => onEngage(s.rank)}>
                    {sortiesLeft > 0 ? "Engage" : "No sorties"}
                </button>
            )}
        </div>
    );
}

export default function ShipYard({ combat, busy, onAct }) {
    const [tab, setTab] = useState("fleet");
    if (!combat) return null;
    const purse = combat.doubloons || 0;
    const fleet = combat.fleet || {};

    return (
        <section className="card sby">
            <div className="sby-head">
                <h3>The gun deck</h3>
                <span className="sby-purse">{purse.toLocaleString()} ⛃ doubloons</span>
            </div>

            <div className="sbd-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={tab === "fleet"} className={tab === "fleet" ? "is-on" : ""} onClick={() => setTab("fleet")}>The fleet</button>
                <button type="button" role="tab" aria-selected={tab === "ship"} className={tab === "ship" ? "is-on" : ""} onClick={() => setTab("ship")}>Your ship</button>
                <button type="button" role="tab" aria-selected={tab === "ammo"} className={tab === "ammo" ? "is-on" : ""} onClick={() => setTab("ammo")}>Ammunition</button>
            </div>

            {tab === "ship" ? (
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
                            <Track key={t.key} t={t} purse={purse} busy={busy}
                                onBuy={(track) => onAct({ action: "upgrade_combat", track })} />
                        ))}
                    </div>
                </>
            ) : null}

            {tab === "ammo" ? (
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

            {tab === "fleet" ? (
                <>
                    <div className="sby-head">
                        <p className="sby-sub" style={{ flex: 1 }}>
                            Fought in order. Sinking one for the first time opens the next and pays the most; losing costs
                            the sortie and nothing else.
                        </p>
                        <span className="sby-sorties">{fleet.sortiesLeft}/{fleet.sortiesMax} sorties today</span>
                    </div>
                    {fleet.cleared ? (
                        <div className="sby-cleared">The whole fleet is on the bottom. Admiral Vane included.</div>
                    ) : null}
                    <div className="sby-fleet">
                        {(fleet.ships || []).slice().reverse().map((s) => (
                            <Rung key={s.rank} s={s} busy={busy} sortiesLeft={fleet.sortiesLeft}
                                onEngage={(rank) => onAct({ action: "fleet_battle", rank })} />
                        ))}
                    </div>
                </>
            ) : null}
        </section>
    );
}
