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
//   BATTLE  one button; the server matches you with a pirate or a member near your own guns and hull
//   YOUR SHIP  every combat upgrade in one list, each showing what it costs in
//   YOUR SHIP  every combat upgrade in one list, each showing what it costs in
//   AMMUNITION what is in the racks
//
// The two daily allowances are still separate (they are different activities with different economies) but
// they are stated together, in the same place, in the same words — which is all the player needed.
//
// Styling is in globals.css (this file has several components; a styled-jsx block would only reach the one
// that owns it — see the sailing boards).

// THE DOUBLOON. Was the Unicode character ⛃ — "black draughts king", not a coin, drawn by the operating
// system, and rendered as a flat dark disc that read as a missing glyph. It is the only currency ship battles
// mint and the only thing the Quartermaster takes, so it gets art.
// eslint-disable-next-line @next/next/no-img-element
const Dbl = ({ className = "sby-dbl" }) => <img className={className} src="/images/sailing/doubloon.png" alt="doubloons" draggable="false" />;

const Icon = ({ name, className }) => {
    const C = Gi[name] || Gi.GiCannon;
    return <C className={className} aria-hidden="true" />;
};

// A painted sprite per track, keyed by the track itself — the four things doubloons actually buy were a flat
// single-colour glyph while every other thing this game asks you to tap is an object. Falls back to the old
// Game-Icons glyph if a sprite is missing, so a new track is never a blank square.
const TRACK_ART = { guns: "guns", gunnery: "gunnery", hull: "hull", cunning: "cunning" };

export function Track({ t, purse, gold, busy, onBuy }) {
    const afford = t.cost != null && (t.currency === "gold" ? (gold ?? 0) : purse) >= t.cost;
    const art = TRACK_ART[t.key];
    return (
        <div className="sby-track">
            {art ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="sby-track-ico" src={`/images/sailing/tracks/${art}.png`} alt="" draggable="false" />
            ) : <Icon name={t.icon} className="sby-track-ico" />}
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
                    title={afford ? `Costs ${t.cost} ${t.currency === "gold" ? "gold" : "doubloons"}`
                        : `Need ${t.cost} ${t.currency === "gold" ? "gold" : "doubloons"} — you have ${(t.currency === "gold" ? (gold ?? 0) : purse).toLocaleString()}`}>
                    {/* The coin leads. Which currency this costs is the first thing to read, not the last. */}
                    {t.currency === "gold"
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img className="sby-buy-coin" src="/images/ui/coin.png" alt="gold" draggable="false" />
                        : <Dbl className="sby-buy-coin" />}
                    {t.cost.toLocaleString()}
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
                        Buy 5 · {a.price * 5}<Dbl />
                    </button>
                )}
            </div>
        </div>
    );
}

// The opponent LIST that used to live here — one row per fleet rung and per passing member, each with a
// portrait and an odds pill — is gone, and so is the ladder it implied. The server matches you now
// (matchOpponent in sailing.js), so there is nothing to compare and nothing to pick: this tab is one button
// and your record.

export default function ShipYard({ combat, raid, gold, busy, tab, onTab, onAct }) {
    const [ownTab, setOwnTab] = useState("battles");
    const active = tab || ownTab;
    const setTab = onTab || setOwnTab;
    const purse = combat?.doubloons || 0;
    const fleet = combat?.fleet || {};
    // ONE allowance, whoever you are matched against.
    const battlesLeft = Math.max(0, (raid?.cap || 0) - (raid?.used || 0));


    // AFTER the hooks, never before: `combat` is null for anyone off the dev allow-list while ship battles are
    // under construction, and returning early above useMemo changes the hook order between renders.
    if (!combat) return null;

    return (
        <section className="card sby">
            <div className="sby-head">
                <h3>Ship battles</h3>
                {/* The purse. A flat outlined pill for the feature's whole economy read as a form field; it is
                    a struck-metal plaque now, with the coin itself doing the labelling. */}
                <span className="sby-purse" title={`${purse.toLocaleString()} doubloons`}>
                    <Dbl className="sby-purse-coin" />
                    <b>{purse.toLocaleString()}</b>
                    <em>doubloons</em>
                </span>
            </div>
            {/* BOTH allowances, together, in the same words. They used to be a "sortie" count in here and a
                separate "raid" count in a call-to-action three screens up. */}
            <p className="sby-allowance">
                <b>{battlesLeft}</b> battle{battlesLeft === 1 ? "" : "s"} left today
                {/* WHOSE IDEA THIS WAS. Ship battles being immersive and ship-centric — the fleet, the crews on
                    deck, fighting as a ship rather than as a stat block — was Teegs's call, and the feature is
                    built the way it is because of it. Credit belongs on the thing itself, not in a changelog. */}
                <a className="sby-credit" href="/marketplace/u/teegs" title="Ship battles were Teegs's idea — that they should be immersive and ship-centric">
                    an idea by <b>@teegs</b>
                </a>
            </p>

            <div className="sbd-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={active === "battles"} className={active === "battles" ? "is-on" : ""} onClick={() => setTab("battles")}>Battles</button>
                <button type="button" role="tab" aria-selected={active === "ammo"} className={active === "ammo" ? "is-on" : ""} onClick={() => setTab("ammo")}>Ammunition</button>
            </div>

            {/* THE WAY IN TO THE GUN PLACEMENT TOOL. It has existed and been owner-only for a while, and the only
                way to reach it was to know and type the URL — which is not a tool, it is a secret. This whole
                panel is already owner-gated (combat is null for everyone else), so the link is safe here and
                this is the screen you are on when you notice a ship's guns sitting wrong. */}
            <a href="/marketplace/sailing/gun-lab" className="sby-gunlab">
                Gun placement — set where cannons sit on each hull →
            </a>

            {/* "Your ship" used to live here, which put the UPGRADE list inside the place you go to FIGHT.
                The page already has a structure for upgrades — one station per thing you improve — and raiding
                simply had no seat at it. The tracks moved to the Gun Deck station; this modal is for choosing
                an opponent and loading the racks, both of which you do right now. */}

            {active === "ammo" ? (
                <>
                    <p className="sby-sub">
                        A round is spent PER GUN, per shot — pick one when you lay that gun in a battle and it comes out
                        of these racks. What is LOADED here is only the default. Round shot never runs out; the rest are
                        stock, and an empty rack just means that gun fires round shot instead of refusing.
                    </p>
                    <div className="sby-ammo">
                        {(combat.ammo || []).map((a) => (
                            <Round key={a.id} a={a} purse={purse} busy={busy}
                                onLoad={(ammo) => onAct({ action: "set_loadout", ammo })}
                                onBuy={(ammo, qty) => onAct({ action: "buy_ammo", ammo, qty })} />
                        ))}
                    </div>

                    {/* THE PRIZE LOCKER — the first thing doubloons buy that is not the ship itself. Sits under
                        the racks rather than in its own tab because it is the same act: spending plunder, on the
                        one screen where you already have the purse open. */}
                    {(combat.locker || []).length ? (
                        <>
                            <h3 className="sby-lockerhead">The Doubloon Shop</h3>
                            <p className="sby-sub">
                                Everything on this counter is chest-only everywhere else in the game — a random roll
                                inside a random drop. Here you can decide to have one.
                            </p>
                            <div className="sby-locker">
                                {combat.locker.map((l) => (
                                    <button key={l.id} type="button" className={`sby-lockeritem${l.canAfford ? "" : " is-poor"}`}
                                        disabled={busy || !l.canAfford}
                                        onClick={() => onAct({ action: "buy_locker", id: l.id })}>
                                        {/* The shared reward-kind sprites, which exist on disk. Per-tier chest art
                                            is served dynamically to the chest opener and has no static path to
                                            point at from here. */}
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img className="sby-lockerart" alt="" draggable="false"
                                            src="/images/ui/potion.png" />
                                        <span className="sby-lockerbody">
                                            <b>{l.name}</b>
                                            <em>{l.blurb}</em>
                                        </span>
                                        <span className="sby-lockerprice">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src="/images/sailing/doubloon.png" alt="" draggable="false" />
                                            {l.price}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </>
                    ) : null}
                </>
            ) : null}

            {active === "battles" ? (
                <>
                    {/* ONE BUTTON. This was a list of fifteen fleet rungs plus whichever members happened to
                        be passing, each with its own odds pill — a comparison exercise you had to do before
                        you had fought once, and the fleet half of it was locked in order besides. Press
                        Battle and the server finds you a ship your own size (matchOpponent in sailing.js):
                        a designed pirate or another member's gun deck, whichever it draws. */}
                    <button type="button" className="sby-find" disabled={busy || battlesLeft <= 0}
                        onClick={() => onAct({ action: "battle" })}>
                        <Icon name="GiSpyglass" className="sby-find-ico" />
                        <b>{battlesLeft > 0 ? "Find a fight" : "No battles left today"}</b>
                        <em>{battlesLeft > 0
                            ? "Someone your own size — a pirate or a rival captain"
                            : "They come back at midnight"}</em>
                    </button>

                    <div className="sby-record">
                        <span><b>{fleet.wins || 0}</b> won</span>
                        <span><b>{fleet.losses || 0}</b> lost</span>
                        <span><b>{fleet.best || 0}</b> deepest tier sunk</span>
                    </div>

                    <p className="sby-sub">
                        You are matched on your <b>guns and hull</b>, so a fight is always close to fair — with the
                        occasional heavyweight to keep it honest. Losing costs the battle and nothing else.
                    </p>
                </>
            ) : null}

        </section>
    );
}
