"use client";

import { useState } from "react";

import * as Gi from "react-icons/gi";

import useScrollLock from "@/lib/useScrollLock";

// Same one-liner ShipYard uses — a Game-Icons glyph by name, falling back to a cannon so a new track key can
// never render as a blank square.
const Icon = ({ name, className }) => {
    const C = Gi[name] || Gi.GiCannon;
    return <C className={className} aria-hidden="true" />;
};

// ── THE GUN DECK ─────────────────────────────────────────────────────────────────────────────────────────────
// The Cannons track buys you MORE barrels. This is where one barrel becomes better than the one next to it.
//
// It is the SHIP, with your guns on it, and you tap the gun you want to work on. That matters more than it
// sounds: a list of "Cannon 1 / Cannon 2 / Cannon 3" would be the same data and would mean nothing, because a
// gun's identity in this game is WHERE IT SITS — the battle screen asks you to lay barrel 4 on her canvas, and
// barrel 4 has to be a thing you can point at. Same hull art, same port positions the battle uses, so the gun
// you upgrade here is visibly the gun you fire there.
//
// Each barrel carries its own three tracks (Iron / Bore / Lay) and its own prices, which is why this cannot
// just be another row in the yard's track list.
export default function GunDeck({ deck, purse, busy, onBuy }) {
    const [openGun, setOpenGun] = useState(null);
    const guns = deck?.guns || [];
    const gun = openGun == null ? null : guns.find((g) => g.index === openGun) || null;
    useScrollLock(Boolean(gun));

    if (!deck || !guns.length) return null;

    return (
        <div className="gdk">
            <div className="gdk-head">
                <b>Gun deck</b>
                <em>Tap a cannon to work on it</em>
            </div>

            <div className="gdk-ship">
                {deck.art ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="gdk-boat" src={deck.art} alt="" draggable="false" />
                ) : null}
                {guns.map((g) => {
                    // The sum of what you have put into this barrel, so a built gun is visibly different from a
                    // bare one on the ship itself — before you open anything.
                    const spent = (g.tracks || []).reduce((n, t) => n + (t.level || 0), 0);
                    return (
                        <button
                            key={g.index}
                            type="button"
                            className={`gdk-gun${spent ? " is-built" : ""}${openGun === g.index ? " is-open" : ""}`}
                            style={{ left: `${(g.port?.x ?? 0.5) * 100}%`, top: `${(g.port?.y ?? 0.5) * 100}%` }}
                            onClick={() => setOpenGun(g.index)}
                            title={`Cannon ${g.index + 1} — ${g.hits} hits`}
                        >
                            <Icon name="GiCannon" className="gdk-gun-ico" />
                            <b>{g.index + 1}</b>
                            {spent ? <i className="gdk-pips">{"·".repeat(Math.min(9, spent))}</i> : null}
                        </button>
                    );
                })}
            </div>

            {gun ? (
                <div className="gdk-sheet" role="dialog" aria-modal="true" onClick={() => setOpenGun(null)}>
                    <div className="gdk-card" onClick={(e) => e.stopPropagation()}>
                        <div className="gdk-card-head">
                            <Icon name="GiCannon" className="gdk-card-ico" />
                            <div>
                                <b>Cannon {gun.index + 1}</b>
                                <em>{gun.hits} hits to dismount</em>
                            </div>
                            <button type="button" className="gdk-x" onClick={() => setOpenGun(null)} aria-label="Close">×</button>
                        </div>

                        {(gun.tracks || []).map((t) => {
                            const afford = t.cost != null && purse >= t.cost;
                            return (
                                <div key={t.key} className={`gdk-track${t.maxed ? " is-maxed" : ""}`}>
                                    <div className="gdk-track-top">
                                        <Icon name={t.icon} className="gdk-track-ico" />
                                        <b>{t.name}</b>
                                        <span className="gdk-lv">
                                            {Array.from({ length: t.max }).map((_, i) => (
                                                <i key={i} className={i < t.level ? "is-on" : ""} />
                                            ))}
                                        </span>
                                    </div>
                                    <p className="gdk-desc">{t.desc}</p>
                                    {/* WHAT IT IS NOW AND WHAT IT BECOMES. The price of a level means nothing on
                                        its own; the pair of numbers either side of the arrow is the decision. */}
                                    <div className="gdk-track-buy">
                                        <span className="gdk-eff">
                                            {t.effect}
                                            {t.next ? <em> → {t.next}</em> : null}
                                        </span>
                                        {t.maxed ? (
                                            <span className="gdk-maxed">Maxed</span>
                                        ) : (
                                            <button
                                                type="button"
                                                className="gdk-buy"
                                                disabled={busy || !afford}
                                                onClick={() => onBuy?.(gun.index, t.key)}
                                            >
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src="/images/sailing/doubloon.png" alt="" draggable="false" />
                                                {t.cost}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}

                        <div className="gdk-purse">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/images/sailing/doubloon.png" alt="" draggable="false" />
                            {purse} in the purse
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
