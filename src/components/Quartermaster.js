"use client";

import ChestOpener from "@/components/ChestOpener";
import PetStoneShelf from "@/components/PetStoneShelf";
import RecipeShelf from "@/components/RecipeShelf";

import { useState } from "react";
import * as Gi from "react-icons/gi";

import useScrollLock from "@/lib/useScrollLock";

// ── THE QUARTERMASTER ────────────────────────────────────────────────────────────────────────────────────────
// Everything doubloons buy, in one place.
//
// It used to live on the ammunition tab, because ammunition was the thing doubloons mostly bought. Ammunition
// is unlocked on the gun deck now, so that tab is gone and the shop needed a home — and it turns out a shop
// with three genuinely different shelves is worth its own room anyway:
//
//   THE LOCKER      consumables (unchanged)
//   THE MANIFEST    collection SETS, flat-priced. Most of these only ever fell out of chests, so a set you
//                   were two pieces short of was a set you could only wait for.
//   THE GAMBLE      a cheap roll on a chest. The point is not the expected value, it is finding out what you
//                   got — so the reveal is the feature, not the transaction.
//
// EVERY SHELF SHOWS THE THING IT SELLS. All three used to be nameplates: the locker drew no art at all for
// five consumables that each have a painted sprite, and the tabs were three words in a row. A shop where you
// cannot see the goods is a menu.
const Icon = ({ name, className }) => {
    const C = Gi[name] || Gi.GiCannon;
    return <C className={className} aria-hidden="true" />;
};

const RARITY = {
    common: "#c9d1d9", rare: "#6bb8ff", epic: "#c98bff", legendary: "#ffb648", mythic: "#ff6b8a",
};

// Which part of the game a collection pays into. The sets are non-combat and each one feeds exactly one
// feature, so the chip answers "why would I want this" before the capstone line spells it out.
const FEATURE = { sea: "At sea", farm: "Farm", depths: "The Depths", forge: "The Forge", wheel: "The Wheel" };

const TABS = [
    ["locker", "Locker", "GiKnapsack"],
    ["pieces", "Manifest", "GiScrollQuill"],
    ["gamble", "Gamble", "GiPerspectiveDiceSixFacesRandom"],
];

// eslint-disable-next-line @next/next/no-img-element
const Dbl = () => <img className="qm-dbl" src="/images/sailing/doubloon.png" alt="doubloons" draggable="false" />;

// A piece as it appears in a slot: its painted sprite where one exists, its glyph where one does not. Unowned
// is the same object with the light off — a silhouette of the thing you are missing, which says more about a
// collection than any count of it.
const PieceArt = ({ piece, className }) => (
    piece.art ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={className} src={piece.art} alt="" draggable="false" />
    ) : <Icon name={piece.icon} className={className} />
);

export default function Quartermaster({ shop, locker, purse, busy, onBuyLocker, onBuyPiece, onGamble, stoneShop, onBuyStone, recipe = null, onBuyRecipe }) {
    const [tab, setTab] = useState("locker");
    const [opening, setOpening] = useState(null); // the gamble's chest, handed to the real chest opener
    const [got, setGot] = useState(null);         // the piece a crate turned out to hold
    const [buying, setBuying] = useState(null);
    const [rolling, setRolling] = useState(false);
    // The opener locks scroll itself, so only the crate reveal needs it here.
    useScrollLock(Boolean(got));

    const sets = shop?.pieces || [];
    const gamblePrice = shop?.gamble?.price ?? 250;

    // ── THE GAMBLE ENDS WHERE EVERY OTHER CHEST ENDS ─────────────────────────────────────────────────────
    // Luke: "the doubloon shop has like a random chest but it completely skips the reveal animation and
    // doesn't reveal the thing it gives you."
    //
    // Both true. This used to wait out the whole round trip, then wait 900ms MORE, and then show a card that
    // named the tier and said "added to your chests" — so the payoff for a gamble was a receipt. There was no
    // opening, and the loot, the only thing anybody gambles for, was never shown at all: it went into the pile
    // and you had to walk to another screen to find out what you had won.
    //
    // It hands straight to ChestOpener now — the real one, with the shake, the burst, the sound and the loot.
    // The crate rattles here while the server rolls, so the wait is the anticipation rather than a disabled
    // button, and the moment the chest is known the opener takes the screen. Two beats, no receipt.
    async function roll() {
        if (busy || rolling || purse < gamblePrice) return;
        setRolling(true);
        const res = await onGamble?.();
        setRolling(false);
        // A fresh key every time, or gambling the same tier twice in a row would open only once.
        if (res?.won) setOpening({ ...res.won, k: Date.now() });
    }

    // Buy a crate off a SET. The quartermaster picks what is in it, so the only thing to reveal is which one
    // you got — and whether that was the last one.
    async function buySet(set) {
        if (busy || buying || set.done || purse < set.price) return;
        setBuying(set.id);
        const res = await onBuyPiece?.(set.id);
        setBuying(null);
        if (res?.bought) setGot(res.bought);
    }

    return (
        <div className="qm">
            <div className="qm-tabs">
                {TABS.map(([k, label, icon]) => (
                    <button key={k} type="button" className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
                        <Icon name={icon} className="qm-tab-ico" />{label}
                    </button>
                ))}
                <span className="qm-purse"><Dbl />{purse}</span>
            </div>

            {tab === "locker" && stoneShop ? (
                <PetStoneShelf shop={stoneShop} currency="doubloons" purse={purse} busy={busy} onBuy={onBuyStone} />
            ) : null}

            {tab === "locker" ? (
                <div className="qm-grid">
                    {(locker || []).map((l) => (
                        <div key={l.id} className="qm-card">
                            <div className="qm-art">
                                {l.art ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={l.art} alt="" draggable="false" />
                                ) : <Icon name={l.icon} className="qm-art-ico" />}
                            </div>
                            <b>{l.name}</b>
                            <p>{l.blurb}</p>
                            <button type="button" className="qm-buy" disabled={busy || purse < l.price}
                                onClick={() => onBuyLocker?.(l.id)}>
                                <Dbl />{l.price}
                            </button>
                        </div>
                    ))}
                    {/* A PAGE FROM THE BOOK. Which page is the quartermaster's business, not yours — the roll
                        leans hard on the everyday recipes and only occasionally turns up something from the
                        back. Sold beside the scrolls because it is the same kind of purchase: a permanent
                        thing you cannot otherwise go and get on purpose. The card it opens is the ordinary
                        recipe-found card; buying one is not a different celebration from finding one. */}
                    {recipe ? (
                        <RecipeShelf shop={recipe} busy={busy} canAfford={purse >= recipe.price}
                            priceLabel={<><Dbl />{recipe.price}</>}
                            onBuy={() => onBuyRecipe?.()} />
                    ) : null}
                </div>
            ) : null}

            {/* ── THE MANIFEST ── one card per SET, not per piece. Which piece you get is not a decision anybody
                has information to make — they are interchangeable until the set is finished, and finishing it
                is the only thing that pays — so the shelf sells the set and the quartermaster picks the piece.
                The row of slots IS the explanation: lit ones you own, silhouettes you do not. */}
            {tab === "pieces" ? (
                sets.length ? (
                    <>
                        <p className="qm-shelf-note">
                            Buy a crate from a collection — the quartermaster picks which piece is in it.
                        </p>
                        <div className="qm-sets">
                            {sets.map((s) => {
                                const short = s.total - s.have;
                                return (
                                    <div key={s.id} className={`qm-set-card${s.done ? " is-done" : ""}`}>
                                        <div className="qm-set-head">
                                            <b>{s.name}</b>
                                            {s.feature ? <em className="qm-feat">{FEATURE[s.feature] || s.feature}</em> : null}
                                            <span className="qm-have">{s.have}<i>/{s.total}</i></span>
                                        </div>
                                        <div className="qm-slots">
                                            {s.pieces.map((p) => (
                                                <span key={p.id}
                                                    className={`qm-slot${p.owned ? " is-on" : ""}`}
                                                    style={{ "--rar": RARITY[p.rarity] || "#c9d1d9" }}
                                                    title={p.owned ? p.name : "Still missing"}>
                                                    <PieceArt piece={p} className="qm-slot-art" />
                                                </span>
                                            ))}
                                        </div>
                                        {s.capstone ? <p className="qm-cap">{s.capstone}</p> : null}
                                        {s.done ? (
                                            <span className="qm-done"><Icon name="GiLaurelCrown" />Complete</span>
                                        ) : (
                                            <button type="button" className="qm-buy" disabled={busy || Boolean(buying) || purse < s.price}
                                                onClick={() => buySet(s)}>
                                                {buying === s.id ? "Prising it open…" : (
                                                    <><Dbl />{s.price}<i className="qm-short">{short === 1 ? "the last one" : `${short} to go`}</i></>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </>
                ) : <p className="qm-empty">Every collection piece is already yours.</p>
            ) : null}

            {tab === "gamble" ? (
                <div className="qm-gamble">
                    <div className={`qm-crate${rolling ? " is-rolling" : ""}`} aria-hidden="true">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/images/sailing/gun/reckoning.png" alt="" draggable="false" />
                    </div>
                    <b>An unmarked chest</b>
                    <p>
                        The quartermaster will not say what is in it, and mostly it is pine.
                        Wooden through mythic, weighted where you would expect — and he prises it open
                        on the counter rather than handing it over shut.
                    </p>
                    <div className="qm-odds">
                        {(shop?.gamble?.table || []).map((g) => (
                            <span key={g.tier}><i>{g.tier}</i>{g.w}%</span>
                        ))}
                    </div>
                    <button type="button" className="qm-roll" disabled={busy || rolling || purse < gamblePrice} onClick={roll}>
                        {rolling ? "Prising it open…" : <><Dbl />{gamblePrice} · Roll</>}
                    </button>
                </div>
            ) : null}

            {/* The reveal, borrowed whole from the chests screen — see the note on ChestOpener's `openTier`. */}
            <ChestOpener bare openTier={opening} />

            {/* WHICH PIECE WAS IN THE CRATE. You bought the set, so the piece is news — and the last piece of a
                set is the biggest news the shelf has, which is why it does not read like any other purchase. */}
            {got ? (
                <div className="qm-reveal" role="dialog" aria-modal="true" onClick={() => setGot(null)}>
                    <span className="qm-burst" aria-hidden="true" style={{ "--c": RARITY[got.rarity] || "#ffd75e" }} />
                    <div className={`qm-reveal-card${got.completed ? " is-complete" : ""}`}
                        style={{ "--c": RARITY[got.rarity] || "#ffd75e" }} onClick={(e) => e.stopPropagation()}>
                        {got.art ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img className="qm-reveal-art" src={got.art} alt="" draggable="false" />
                        ) : <Icon name={got.icon} className="qm-reveal-glyph" />}
                        <b>{got.name}</b>
                        <em>{got.setName} · {got.have} of {got.total}</em>
                        {got.completed ? (
                            <div className="qm-complete">
                                <span><Icon name="GiLaurelCrown" />Set complete</span>
                                {got.capstone ? <p>{got.capstone}</p> : null}
                            </div>
                        ) : null}
                        <button type="button" className="qm-buy" onClick={() => setGot(null)}>Take it</button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
