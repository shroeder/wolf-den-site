"use client";

import { useState } from "react";
import * as Gi from "react-icons/gi";

import Quartermaster from "@/components/Quartermaster";

// ── Permanent credit: ship battles were Teegs's idea — that they should be immersive and ship-centric, fought
// as a SHIP rather than as a stat block, which is the whole reason the feature is shaped the way it is. Her
// actual AI hero sprite is enshrined on the panel as a medallion; tapping it tells the story. Hard-coded to her
// sprite blob on purpose so the tribute never breaks if her account or sprite changes — this is a fixed
// dedication, not live data. (Same treatment as Alstier1 in the Forge.)
const FOUNDER = {
    name: "Teegs",
    handle: "teegs",
    sprite: "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/sprite/1786159889111-616545.webp",
};

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

// The opponent LIST that used to live here — one row per fleet rung and per passing member, each with a
// portrait and an odds pill — is gone, and so is the ladder it implied. The server matches you now
// (matchOpponent in sailing.js), so there is nothing to compare and nothing to pick: this tab is one button
// and your record.

export default function ShipYard({ combat, raid, gold, busy, tab, onTab, onAct }) {
    const [ownTab, setOwnTab] = useState("battles");
    const [founderOpen, setFounderOpen] = useState(false);   // Teegs's tribute
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
                {/* Teegs's medallion — her hero, permanently enshrined for dreaming this feature up. */}
                <button type="button" className="sby-founder" onClick={() => setFounderOpen(true)}
                    title={`Ship battles — an idea by ${FOUNDER.name}`} aria-label={`About ship battles — an idea by ${FOUNDER.name}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={FOUNDER.sprite} alt={FOUNDER.name} draggable="false" />
                </button>
            </div>
            {/* BOTH allowances, together, in the same words. They used to be a "sortie" count in here and a
                separate "raid" count in a call-to-action three screens up. */}
            {/* The credit used to be a dotted-underline link parked on the end of this line. It is a medallion
                in the header now — see FOUNDER — the way the Forge enshrines Alstier1. */}
            <p className="sby-allowance">
                <b>{battlesLeft}</b> battle{battlesLeft === 1 ? "" : "s"} left today
            </p>

            <div className="sbd-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={active === "battles"} className={active === "battles" ? "is-on" : ""} onClick={() => setTab("battles")}>Battles</button>
                <button type="button" role="tab" aria-selected={active === "shop"} className={active === "shop" ? "is-on" : ""} onClick={() => setTab("shop")}>Quartermaster</button>
            </div>

            {/* "Your ship" used to live here, which put the UPGRADE list inside the place you go to FIGHT.
                The page already has a structure for upgrades — one station per thing you improve — and raiding
                simply had no seat at it. The tracks moved to the Gun Deck station; this modal is for choosing
                an opponent and loading the racks, both of which you do right now. */}

            {/* THE QUARTERMASTER. This tab was "Ammunition": rounds you bought by the ten, with the doubloon
                shop bolted underneath because that was where the purse already was. Ammunition is unlocked on
                the gun deck now, so the racks are gone and what is left is a shop — which turns out to deserve
                the room. Three shelves: the locker, the collection manifest, and a gamble. */}
            {active === "shop" ? (
                <Quartermaster
                    shop={combat.shop}
                    locker={combat.locker}
                    purse={purse}
                    busy={busy}
                    onBuyLocker={(id) => onAct({ action: "buy_locker", id })}
                    onBuyPiece={(piece) => onAct({ action: "buy_piece", piece })}
                    onGamble={() => onAct({ action: "gamble_chest" })}
                />
            ) : null}

            {founderOpen ? (
                <div className="sby-founder-scrim" role="dialog" aria-modal="true" onClick={() => setFounderOpen(false)}>
                    <div className="sby-founder-card" onClick={(e) => e.stopPropagation()}>
                        <div className="sby-founder-hero">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={FOUNDER.sprite} alt={FOUNDER.name} draggable="false" />
                        </div>
                        <div className="sby-founder-kicker">
                            <Icon name="GiPirateFlag" /> Founder&apos;s Tribute
                        </div>
                        <h3 className="sby-founder-name">{FOUNDER.name}</h3>
                        <p className="sby-founder-body">
                            Ship battles were <b>{FOUNDER.name}&apos;s</b> idea — that they should be immersive and
                            ship-centric, fought as a <b>ship</b> rather than as a stat block. Every gun on the deck,
                            every crew on the rail and every hull on the horizon traces back to her. Her captain is
                            enshrined here as thanks.
                        </p>
                        <a className="sby-founder-link" href={`/marketplace/u/${FOUNDER.handle}`}>Visit @{FOUNDER.handle}</a>
                        <button type="button" className="sby-founder-close" onClick={() => setFounderOpen(false)}>Back to the deck</button>
                    </div>
                </div>
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
                        {/* A PAINTED SPYGLASS, not a glyph. This is the button the whole panel exists to get
                            you to press, and it was the one thing on the screen still drawn as a flat outline
                            while the tracks, the rounds and the coin were all objects. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="sby-find-ico" src="/images/sailing/find-fight.png" alt="" draggable="false" />
                        {/* The words are ONE grid cell. Left loose beside the icon they were two, so the
                            subtitle wrapped into the 42px icon column and came out one word per line. */}
                        <span className="sby-find-words">
                            <b>{battlesLeft > 0 ? "Find a fight" : "No battles left today"}</b>
                            <em>{battlesLeft > 0
                                ? "Someone your own size — a pirate or a rival captain"
                                : "They come back at midnight"}</em>
                        </span>
                    </button>

                    <div className="sby-record">
                        <span><b>{fleet.wins || 0}</b><em>won</em></span>
                        <span><b>{fleet.losses || 0}</b><em>lost</em></span>
                        <span><b>{fleet.best || 0}</b><em>best tier</em></span>
                    </div>

                    <p className="sby-sub">
                        You are matched on your <b>guns and hull</b>, so a fight is always close to fair — with the
                        occasional heavyweight to keep it honest. Losing costs the battle and nothing else.
                    </p>

                    {/* The gun placement tool. Owner-only and useful, but it is a WORKSHOP door — it belongs at
                        the bottom of the screen, under the thing you actually came here to press, not in a
                        dashed banner above it. */}
                    <a href="/marketplace/sailing/gun-lab" className="sby-gunlab">
                        {/* The Cannons track sprite, reused — it is literally a stack of cannons and this is
                            where you go to place them. Nothing to draw. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="sby-gunlab-ico" src="/images/sailing/tracks/guns.png" alt="" draggable="false" />
                        <span>
                            <b>Gun placement</b>
                            <em>Set where the cannons sit on each hull</em>
                        </span>
                        <i aria-hidden="true">→</i>
                    </a>
                </>
            ) : null}

        </section>
    );
}
