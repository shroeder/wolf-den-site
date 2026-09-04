"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { GiFlame } from "react-icons/gi";

import { PERKS, POTIONS, SHOP, cardById, removalCost } from "@/lib/marketplace/cards-kit.js";

// ── THE MERCHANT ─────────────────────────────────────────────────────────────────────────────────────────
// The one room that used to hand you straight back to the map. Embers have been paid out since the run
// shipped and had nowhere to go, which quietly made "take nothing, +25" a choice between a real card and a
// number that did nothing.
//
// Theirs sells cards, potions and a relic you cannot get anywhere else, discounts one thing, and — the part
// that actually matters — REMOVES A CARD. Every other reward here makes the deck bigger, and a deck that only
// grows draws its good cards less often the longer a run goes. This is the only place it can get better
// instead of longer, which is why the removal is the loudest thing on the screen rather than a footnote.

const LABEL = { card: "Card", potion: "Potion", perk: "Trinket" };

function itemFace(item) {
    if (item.kind === "card") {
        const c = cardById(item.ref);
        return { name: c?.name || item.ref, text: c?.text?.replace(/\{(\w+)\}/g, (_, k) => c[k] ?? "") || "" };
    }
    if (item.kind === "potion") {
        const p = POTIONS[item.ref];
        return { name: p?.name || item.ref, text: p?.text || "" };
    }
    const k = PERKS[item.ref];
    return { name: k?.name || item.ref, text: k?.text || "" };
}

export default function CardShop({ run }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState(null);
    const [picking, setPicking] = useState(false);

    const embers = run.embers || 0;
    const stock = run.shop?.stock || [];
    const bought = run.shop?.bought || [];
    const removed = Boolean(run.shop?.removed);
    const cost = removalCost(run.removals || 0);
    const deck = run.deck || [];

    const post = useCallback(async (body) => {
        if (busy) return;
        setBusy(true);
        setNote(null);
        const r = await fetch("/api/marketplace/cards/run", {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
        }).then((x) => x.json()).catch(() => null);
        setBusy(false);
        // Say why, always. A button that refuses in silence is the thing that reads as broken — the same
        // lesson the casino's stake row and the plaza's taps both cost.
        if (r?.error) {
            setNote({
                too_few_embers: "Not enough embers.",
                no_potion_slot: "No room on your belt.",
                already_carried: "You already carry that.",
                already_bought: "Already yours.",
                already_removed: "One burning a visit.",
                deck_too_small: "Your deck is as small as it goes.",
            }[r.error] || "The merchant shakes their head.");
            return;
        }
        setPicking(false);
        router.refresh();
    }, [busy, router]);

    return (
        <div className="cs-wrap">
            <div className="cs-bar">
                <b className="cs-title">The Merchant</b>
                <span className="cs-embers"><GiFlame aria-hidden="true" />{embers.toLocaleString()}</span>
                <button type="button" className="cs-leave" disabled={busy} onClick={() => post({ action: "leave" })}>
                    Move on
                </button>
            </div>

            {note ? <p className="cs-note" role="status">{note}</p> : null}

            <div className="cs-shelf">
                {stock.map((item) => {
                    const face = itemFace(item);
                    const gone = bought.includes(item.slot);
                    const poor = embers < item.price;
                    return (
                        <button
                            key={item.slot}
                            type="button"
                            className={`cs-item${gone ? " is-gone" : ""}${item.sale ? " is-sale" : ""}`}
                            disabled={busy || gone || poor}
                            onClick={() => post({ action: "buy", slot: item.slot })}
                        >
                            <span className="cs-kind">{LABEL[item.kind] || item.kind}</span>
                            <b className="cs-name">{face.name}</b>
                            <span className="cs-text">{face.text}</span>
                            <span className="cs-price">
                                {gone ? "Sold" : <><GiFlame aria-hidden="true" />{item.price}</>}
                            </span>
                            {item.sale && !gone ? <span className="cs-tag">On sale</span> : null}
                        </button>
                    );
                })}
            </div>

            {/* ── THE REMOVAL ─────────────────────────────────────────────────────────────────────────
                Loud, because it is the reason to stop here. Once a visit, and the price rises for the rest
                of the run every time it is used. */}
            <div className="cs-burn">
                <div className="cs-burn-head">
                    <b>Burn a card</b>
                    <span className="cs-price"><GiFlame aria-hidden="true" />{cost}</span>
                </div>
                <p className="cs-burn-copy">
                    {removed
                        ? "The brazier is cold. One a visit."
                        : "Take a card out of your deck for good. A smaller deck draws its best cards more often."}
                </p>
                {!removed ? (
                    <button type="button" className="cs-burn-btn" disabled={busy || embers < cost || deck.length <= 5}
                        onClick={() => setPicking((v) => !v)}>
                        {picking ? "Never mind" : "Choose a card"}
                    </button>
                ) : null}
                {picking ? (
                    <div className="cs-deck">
                        {deck.map((id, i) => {
                            const c = cardById(id);
                            return (
                                <button key={`${id}-${i}`} type="button" className="cs-card" disabled={busy}
                                    onClick={() => post({ action: "remove", index: i })}>
                                    {c?.name || id}
                                </button>
                            );
                        })}
                    </div>
                ) : null}
            </div>

            <style jsx>{`
                /* ── FULL BLEED, LIKE THE MAP AND THE RING ───────────────────────────────────────────
                   Every other room in this game covers the site: CardMap is fixed to inset 0 at z-index
                   4000. The shop was rendered into the ordinary page flow, so it opened UNDER the
                   site header, the gold bar, the quest banner and the game nav — half a phone screen of the
                   marketplace above a merchant. A room you walk into is a room, not a section of a page. */
                .cs-wrap { position: fixed; inset: 0; z-index: 4000; overflow-y: auto;
                    padding: 14px 12px 28px; display: flex; flex-direction: column;
                    gap: 14px; background: linear-gradient(180deg, #241c17, #17110e); color: #efe3cd; }
                .cs-bar { display: flex; align-items: center; gap: 10px; }
                .cs-title { font-size: 19px; letter-spacing: 0.04em; }
                .cs-embers { display: inline-flex; align-items: center; gap: 4px; margin-left: auto;
                    color: #ffb45e; font-weight: 700; font-variant-numeric: tabular-nums; }
                .cs-leave { border: 0; border-radius: 8px; padding: 8px 14px; cursor: pointer;
                    background: #3a2e25; color: #efe3cd; font: inherit; font-weight: 700; }
                .cs-leave:disabled { opacity: 0.5; cursor: default; }
                .cs-note { margin: 0; color: #ffb0a0; font-size: 13px; }

                .cs-shelf { display: grid; gap: 10px; grid-template-columns: 1fr; }
                @media (min-width: 620px) { .cs-shelf { grid-template-columns: repeat(3, 1fr); } }
                .cs-item { position: relative; display: flex; flex-direction: column; gap: 4px; text-align: left;
                    padding: 12px 12px 34px; border: 1px solid #4b3b2e; border-radius: 10px; cursor: pointer;
                    background: linear-gradient(180deg, #33281f, #241c16); color: inherit; font: inherit; }
                .cs-item:disabled { cursor: default; opacity: 0.55; }
                .cs-item.is-gone { opacity: 0.35; }
                .cs-item.is-sale { border-color: #b98a3a; box-shadow: 0 0 0 1px rgba(255,180,94,0.25) inset; }
                .cs-kind { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #9d8a72; }
                .cs-name { font-size: 15px; }
                .cs-text { font-size: 12.5px; color: #c3b49c; line-height: 1.35; }
                .cs-price { position: absolute; left: 12px; bottom: 10px; display: inline-flex; align-items: center;
                    gap: 3px; color: #ffb45e; font-weight: 700; font-variant-numeric: tabular-nums; }
                .cs-tag { position: absolute; right: 10px; bottom: 10px; font-size: 10px; letter-spacing: 0.1em;
                    text-transform: uppercase; color: #ffd75e; }

                .cs-burn { border: 1px solid #5a3a2a; border-radius: 10px; padding: 12px;
                    background: linear-gradient(180deg, #35211a, #241511); }
                .cs-burn-head { display: flex; align-items: center; justify-content: space-between; }
                .cs-burn-head b { font-size: 16px; }
                .cs-burn-head .cs-price { position: static; }
                .cs-burn-copy { margin: 6px 0 10px; font-size: 12.5px; color: #c8b09a; line-height: 1.4; }
                .cs-burn-btn { border: 0; border-radius: 8px; padding: 9px 14px; cursor: pointer;
                    background: #7d3f2a; color: #ffe6d2; font: inherit; font-weight: 700; }
                .cs-burn-btn:disabled { opacity: 0.45; cursor: default; }
                .cs-deck { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
                .cs-card { border: 1px solid #5a4738; border-radius: 7px; padding: 6px 9px; cursor: pointer;
                    background: #2c221b; color: #e6d8c2; font: inherit; font-size: 12.5px; }
                .cs-card:hover:not(:disabled) { background: #7d3f2a; color: #ffe6d2; }
            `}</style>
        </div>
    );
}
