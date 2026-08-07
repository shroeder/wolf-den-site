"use client";

import { useMemo, useState } from "react";
import { matchupOdds } from "@/lib/marketplace/ship-battle.js";
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

// ONE OPPONENT, ONE ROW — whether it is a designed fleet ship or a real member.
//
// These were two different row components in two different tabs, and they could not be compared: the fleet had
// a rank and no odds, rivals had odds and a "pays like rank N" footnote that overflowed into the Battle button
// on a phone. Same fight, same allowance, same reward table — so it is one list, sorted by one difficulty.
//
// The PORTRAIT is the change you feel. It used to be a 34px face chip beside a small hull; now the captain
// stands on their own deck in a single tile, the way they will when the fight opens. You are picking a
// character, not reading a row of numbers.
function Portrait({ art, rider, boss, locked, flipCrew }) {
    return (
        <span className={`sby-port${boss ? " is-boss" : ""}${locked ? " is-locked" : ""}${flipCrew ? " is-flipcrew" : ""}`} aria-hidden="true">
            {art ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="sby-port-ship" src={art} alt="" draggable="false" />
            ) : null}
            {rider ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="sby-port-crew" src={rider} alt="" draggable="false" />
            ) : null}
            {locked ? <span className="sby-port-lock">🔒</span> : null}
        </span>
    );
}

// How hard this is, in one word and one colour, off the shared matchup read. A percentage alone is a number;
// a word is a decision.
//
// But a word ALONE is a legend you have to be taught. "Favoured" and "Brutal" in coloured pills told you there
// was a scale without telling you what it measured or which end you were on — the first thing asked about them
// was what they meant. So the word now carries its own number: "Favoured 71%" needs no key, and the five words
// stay because a number is a fact while a word is a decision.
const BANDS = [
    { max: 0.20, key: "brutal", label: "Brutal" },
    { max: 0.40, key: "hard", label: "Hard" },
    { max: 0.62, key: "even", label: "Even" },
    { max: 0.82, key: "fair", label: "Favoured" },
    { max: 1.01, key: "easy", label: "Easy" },
];
const bandFor = (odds) => BANDS.find((b) => odds <= b.max) || BANDS[BANDS.length - 1];
// Never 0% or 100%: matchupOdds already clamps to 5–95, and a rounded "100%" would promise a win the sim can
// still take away from you.
const oddsPct = (odds) => Math.round(Math.max(0.05, Math.min(0.95, odds ?? 0.5)) * 100);

function BattleRow({ e, busy, canFight, onFight }) {
    const band = bandFor(e.odds ?? 0.5);
    const disabled = busy || !canFight || e.locked;
    return (
        <div className={`sby-row is-${e.kind}${e.boss ? " is-boss" : ""}${e.locked ? " is-locked" : ""}${e.beaten ? " is-beaten" : ""}`}>
            {/* FACING. Fleet hulls are drawn facing LEFT on purpose (fleet.js — the enemy sits on the right of
                the battle stage) while every captain is drawn facing RIGHT so the scene's mirror turns them
                toward you. Correct in the fight, wrong in a still portrait: the two ended up back to back. A
                rival's boat and hero are both drawn facing right, so only the fleet rows need the flip. */}
            <Portrait art={e.art} rider={e.rider} boss={e.boss} locked={e.locked} flipCrew={e.kind === "fleet"} />
            <div className="sby-row-body">
                {/* The name gets the whole line. Sharing it with the difficulty chip left about 150px for a
                    title on a phone, which turned "The Cormorant" into "The Corm…" — the badge is a label,
                    the name is the thing you are choosing between. */}
                <b className="sby-row-name">{e.name}</b>
                <div className="sby-row-sub">
                    <span className={`sby-kind is-${e.kind}`}>{e.kind === "fleet" ? (e.boss ? "Flagship" : "Fleet") : "Rival"}</span>
                    <span className={`sby-band is-${band.key}`}
                        title={`${band.label} — you are given a ${oddsPct(e.odds)}% chance of winning this fight, from your guns and hull against theirs`}>
                        {band.label} <b>{oddsPct(e.odds)}%</b>
                    </span>
                    <span className="sby-row-cls">{e.sub}</span>
                </div>
                <div className="sby-row-stats">
                    {/* The gun count gets the same treatment the hull grade already had: a drawn cannon rather
                        than a coloured dot. The dot carried no meaning — it was a legend entry you had to learn —
                        and it sat next to a chip that was already showing real art, so the row read as half
                        finished. This is the same deck cannon that gets drawn on the ship itself. */}
                    <span className="sby-chip is-guns">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="sby-gunicon" src="/images/sailing/deck-cannon.png" alt="" draggable="false" />
                        <b>{e.guns}</b> guns
                    </span>
                    {/* HULL, as a thing you can see. Boat level is base hull now, so this badge is mostly a
                        readout of how much boat somebody has actually built — which is the point: the weeks
                        you put into the boat should be legible on the row, not buried in a number. */}
                    <span className={`sby-chip is-hull is-g${e.hullGrade?.grade || 1}`}
                        title={e.hullGrade ? `${e.hullGrade.name} — ${e.hullGrade.blurb}` : undefined}>
                        {e.hullGrade ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img className="sby-hullgrade" src={`/images/sailing/hull/grade${e.hullGrade.grade}.png`} alt="" draggable="false" />
                        ) : <i />}
                        <b>{e.hull}</b> hull
                    </span>
                    <span className={`sby-chip is-ammo is-${e.ammo}`}><i /><b>{e.ammo}</b></span>
                </div>
            </div>
            <div className="sby-row-go">
                <button type="button" className={`sby-engage${e.locked ? " is-locked" : e.beaten ? " is-refight" : ""}`} disabled={disabled}
                    onClick={() => onFight(e)}>
                    {e.locked ? "Locked" : !canFight ? "None left" : e.beaten ? "Re-fight" : "Battle"}
                </button>
                <span className="sby-row-pays">Tier {e.rank}</span>
            </div>
        </div>
    );
}

export default function ShipYard({ combat, raid, gold, targets = null, targetsMine = null, busy, tab, onTab, onAct }) {
    const [ownTab, setOwnTab] = useState("battles");
    const active = tab || ownTab;
    const setTab = onTab || setOwnTab;
    const purse = combat?.doubloons || 0;
    const fleet = combat?.fleet || {};
    // ONE allowance covering both kinds of battle — the fleet and member raids draw from the same pool, so
    // choosing between them is a real decision rather than two separate chores.
    const battlesLeft = Math.max(0, (raid?.cap || 0) - (raid?.used || 0));

    // ── THE ONE LIST ─────────────────────────────────────────────────────────────────────────────────────
    // Fleet ships and member rivals, normalised onto a single difficulty scale and sorted together. A rival's
    // ship is already matched to the fleet rank it most resembles (fleetRankForShip on the server), so that
    // rank is the shared axis; matchupOdds gives every row the same read of how it will actually go against
    // YOUR gun deck, which the fleet half never had.
    //
    // Sorted by that rank, then by odds, so the list climbs from what you can take to what will take you.
    const myGuns = targetsMine?.guns ?? combat?.ship?.guns ?? 4;
    const myHull = targetsMine?.hull ?? combat?.ship?.hp ?? 140;
    const opponents = useMemo(() => {
        const rows = [];
        for (const f of fleet.ships || []) {
            rows.push({
                key: `f${f.rank}`, kind: "fleet", rank: f.rank, name: f.name,
                sub: f.cls || "", art: f.art, rider: f.crew || null, boss: Boolean(f.boss),
                guns: f.guns, hull: f.hp, ammo: f.ammo, hullGrade: f.hullGrade || null,
                odds: matchupOdds({ myGuns, myHull, guns: f.guns, hull: f.hp }),
                beaten: Boolean(f.beaten), locked: Boolean(f.locked),
            });
        }
        for (const t of targets || []) {
            rows.push({
                key: `r${t.id}`, kind: "rival", id: t.id, rank: t.rank || 1, name: t.name,
                // Was "boat level 15 · best legendary" — the rarity was left over from when a raid could copy
                // one of their items, and read as an advertisement for loot that no longer drops.
                sub: `boat level ${t.level}`,
                art: t.boat, rider: t.rider || null, boss: false,
                guns: t.guns, hull: t.hull, ammo: t.ammo, hullGrade: t.hullGrade || null,
                odds: t.odds != null ? t.odds / 100 : matchupOdds({ myGuns, myHull, guns: t.guns, hull: t.hull }),
                beaten: false, locked: false,
            });
        }
        return rows.sort((a, b) => a.rank - b.rank || b.odds - a.odds);
    }, [fleet.ships, targets, myGuns, myHull]);

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

            {/* "Your ship" used to live here, which put the UPGRADE list inside the place you go to FIGHT.
                The page already has a structure for upgrades — one station per thing you improve — and raiding
                simply had no seat at it. The tracks moved to the Gun Deck station; this modal is for choosing
                an opponent and loading the racks, both of which you do right now. */}

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

            {active === "battles" ? (
                <>
                    {fleet.cleared ? (
                        <div className="sby-cleared">The whole fleet is on the bottom. Admiral Vane included.</div>
                    ) : null}
                    {/* Says what the coloured word on every row IS. The pills read as a scale without ever
                        saying what they measured or which end was good — the number on each one carries most
                        of that now, and this one line closes it. */}
                    <p className="sby-oddskey">
                        The colour on each opponent is <b>your chance of winning</b> — worked out from your guns
                        and hull against theirs.
                    </p>
                    <div className="sby-fleet">
                        {opponents.map((e) => (
                            <BattleRow key={e.key} e={e} busy={busy} canFight={battlesLeft > 0}
                                onFight={(x) => onAct(x.kind === "fleet"
                                    ? { action: "fleet_battle", rank: x.rank }
                                    : { action: "raid", target: x.id })} />
                        ))}
                    </div>
                    {targets === null ? <p className="sby-sub">Scanning the horizon for rivals…</p> : null}
                    {/* One short line instead of two paragraphs. The old copy explained the reward table, the
                        allowance and the matchmaking in eight sentences above the thing you came to tap. */}
                    <p className="sby-sub">
                        Fleet ships open in order; rivals are always out there. Same fight, same allowance, same
                        spoils — losing costs the battle and nothing else.
                    </p>
                </>
            ) : null}

        </section>
    );
}
