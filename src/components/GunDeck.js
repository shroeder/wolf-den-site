"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

import useScrollLock from "@/lib/useScrollLock";

// PAINTED, NOT LINE ART. These were Game-Icons glyphs — flat single-colour outlines in a sheet made entirely
// of painted objects. One sprite per track (scripts/gen-gun-sprites.mjs).
const TRACK_ART = { hp: "iron", dmg: "bore", acc: "lay" };
// eslint-disable-next-line @next/next/no-img-element
const TrackArt = ({ k, className }) => <img className={className} src={`/images/sailing/gun/${TRACK_ART[k] || "iron"}.png`} alt="" draggable="false" />;

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
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="gdk-gun-ico" src={g.art || "/images/sailing/gun/cannon-1.png"} alt="" draggable="false" />
                            <b>{g.index + 1}</b>
                            {spent ? <i className="gdk-pips">{"·".repeat(Math.min(9, spent))}</i> : null}
                        </button>
                    );
                })}
            </div>

            {/* PORTALLED TO THE BODY. `position: fixed` is measured against the nearest transformed ancestor,
                not the viewport — and this sheet lives inside the sailing page, which has them. That is why it
                opened halfway down the screen and ran off the bottom with its last buy button unreachable
                instead of sitting centred and scrolling. Out here it is measured against the viewport. */}
            {gun && typeof document !== "undefined" ? createPortal((
                <div className="gdk-sheet" role="dialog" aria-modal="true" onClick={() => setOpenGun(null)}>
                    <div className="gdk-card" onClick={(e) => e.stopPropagation()}>
                        <div className="gdk-card-head">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="gdk-card-ico" src={gun.art || "/images/sailing/gun/cannon-1.png"} alt="" draggable="false" />
                            <div>
                                <b>Cannon {gun.index + 1}</b>
                                <em>{gun.hits} hits to dismount{gun.stage > 1 ? ` · mark ${gun.stage}` : ""}</em>
                            </div>
                            <button type="button" className="gdk-x" onClick={() => setOpenGun(null)} aria-label="Close">×</button>
                        </div>

                        {(gun.tracks || []).map((t) => {
                            const afford = t.cost != null && purse >= t.cost;
                            return (
                                <div key={t.key} className={`gdk-track${t.maxed ? " is-maxed" : ""}`}>
                                    <div className="gdk-track-top">
                                        <TrackArt k={t.key} className="gdk-track-ico" />
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

                        {/* WHAT THIS BARREL LOADS. Ammunition is not bought or picked any more — the mark
                            decides what the gun can carry and the target decides which of those it uses, so
                            this is where a player finds out that four more levels is a new kind of shot. */}
                        <div className="gdk-ammo">
                            <b>Loads</b>
                            <span>
                                {(gun.ammo || []).map((a) => <i key={a.id} title={a.blurb}>{a.name}</i>)}
                            </span>
                            {gun.nextAmmo ? (
                                <em>{gun.nextAmmo.inLevels} more level{gun.nextAmmo.inLevels === 1 ? "" : "s"} unlocks {gun.nextAmmo.name}</em>
                            ) : <em>Every round in the game</em>}
                        </div>

                        <div className="gdk-purse">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/images/sailing/doubloon.png" alt="" draggable="false" />
                            {purse} in the purse
                        </div>
                    </div>
                </div>
            ), document.body) : null}
        </div>
    );
}
