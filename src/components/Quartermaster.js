"use client";

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
//   THE MANIFEST    collection pieces, flat-priced. Most of these only ever fell out of chests, so a set you
//                   were two pieces short of was a set you could only wait for.
//   THE GAMBLE      a cheap roll on a chest. The point is not the expected value, it is finding out what you
//                   got — so the reveal is the feature, not the transaction.
const Icon = ({ name, className }) => {
    const C = Gi[name] || Gi.GiCannon;
    return <C className={className} aria-hidden="true" />;
};

const RARITY = {
    common: "#c9d1d9", rare: "#6bb8ff", epic: "#c98bff", legendary: "#ffb648", mythic: "#ff6b8a",
};

// eslint-disable-next-line @next/next/no-img-element
const Dbl = () => <img className="qm-dbl" src="/images/sailing/doubloon.png" alt="doubloons" draggable="false" />;

export default function Quartermaster({ shop, locker, purse, busy, onBuyLocker, onBuyPiece, onGamble }) {
    const [tab, setTab] = useState("locker");
    const [reveal, setReveal] = useState(null);
    const [rolling, setRolling] = useState(false);
    useScrollLock(Boolean(reveal));

    const pieces = shop?.pieces || [];
    const gamblePrice = shop?.gamble?.price ?? 250;

    async function roll() {
        if (busy || rolling || purse < gamblePrice) return;
        setRolling(true);
        // THE SPIN BEFORE THE ANSWER. The server already knows what you won the moment it charges you; this
        // beat exists purely so the lid is shut for a second first. Without it the chest simply appears, and
        // a gamble whose result is instant is not a gamble, it is a purchase.
        const res = await onGamble?.();
        setTimeout(() => {
            setRolling(false);
            if (res?.won) setReveal(res.won);
        }, 900);
    }

    return (
        <div className="qm">
            <div className="qm-tabs">
                {[["locker", "Locker"], ["pieces", "Manifest"], ["gamble", "Gamble"]].map(([k, label]) => (
                    <button key={k} type="button" className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{label}</button>
                ))}
                <span className="qm-purse"><Dbl />{purse}</span>
            </div>

            {tab === "locker" ? (
                <div className="qm-grid">
                    {(locker || []).map((l) => (
                        <div key={l.id} className="qm-card">
                            <b>{l.name}</b>
                            <p>{l.blurb}</p>
                            <button type="button" className="qm-buy" disabled={busy || purse < l.price}
                                onClick={() => onBuyLocker?.(l.id)}>
                                <Dbl />{l.price}
                            </button>
                        </div>
                    ))}
                </div>
            ) : null}

            {tab === "pieces" ? (
                pieces.length ? (
                    <div className="qm-grid">
                        {pieces.map((p) => (
                            <div key={p.id} className="qm-card is-piece" style={{ "--rar": RARITY[p.rarity] || "#c9d1d9" }}>
                                <Icon name={p.icon} className="qm-piece-ico" />
                                <b>{p.name}</b>
                                <em className="qm-set">{p.set}</em>
                                {p.flavor ? <p>{p.flavor}</p> : null}
                                <button type="button" className="qm-buy" disabled={busy || purse < p.price}
                                    onClick={() => onBuyPiece?.(p.id)}>
                                    <Dbl />{p.price}
                                </button>
                            </div>
                        ))}
                    </div>
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
                        Wooden through mythic, weighted where you would expect.
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

            {reveal ? (
                <div className="qm-reveal" role="dialog" aria-modal="true" onClick={() => setReveal(null)}>
                    <span className="qm-burst" aria-hidden="true" style={{ "--c": reveal.color }} />
                    <div className="qm-reveal-card" style={{ "--c": reveal.color }} onClick={(e) => e.stopPropagation()}>
                        {reveal.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img className="qm-reveal-art" src={reveal.image} alt="" draggable="false" />
                        ) : null}
                        <b>{reveal.label}</b>
                        <em>added to your chests</em>
                        <button type="button" className="qm-buy" onClick={() => setReveal(null)}>Take it</button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
