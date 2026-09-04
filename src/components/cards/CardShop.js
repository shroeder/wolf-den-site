"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Cinzel } from "next/font/google";
import { GiFlame } from "react-icons/gi";

import CardFace, { CARD_FONT } from "@/components/cards/CardFace";
import { PERKS, POTIONS, cardById, removalCost } from "@/lib/marketplace/cards-kit.js";

// ── THE MERCHANT ─────────────────────────────────────────────────────────────────────────────────────────
// Luke, looking at the first cut: "the merchant looks nothing like it, it doesn't Slay the Spire."
//
// He was right and the fault was not styling. THIS SCREEN WAS TEXT. Its stock — three cards, two potions and
// a trinket — was rendered as six bordered `<button>`s with the item's NAME typed inside them, on a CSS
// gradient, with the card removal in a rounded rectangle underneath. Nothing you could buy was ever DRAWN.
// That is the same fault the map had when it was react-icons glyphs and the reward screen had when it was a
// panel: theirs is a place with things in it, ours was a list about things.
//
// So the room is a room now: a stall under a slung awning with the keeper standing behind it, the cards laid
// out as CARDS (the real face, off CardFace — see the note there about why there is exactly one of those),
// the potions and the trinket as drawn objects on a shelf, and the removal as a brazier you feed a card to.
//
// ⚠️ THE RULES DID NOT MOVE. Every price, the sale slot, the escalating removal cost and what a refusal means
// are all still SHOP/removalCost in cards-kit and the run route — this file draws what the server already
// decided. It has no opinion about what anything costs.
const panelFont = Cinzel({ subsets: ["latin"], weight: ["600", "700"], display: "swap" });

const LABEL = { card: "Card", potion: "Potion", perk: "Trinket" };

// ── WHAT A REFUSAL SOUNDS LIKE ───────────────────────────────────────────────────────────────────────────
// Say why, always. A button that refuses in silence is the thing that reads as broken — the same lesson the
// casino's stake row and the plaza's taps both cost. Spoken by the keeper rather than printed as an error
// line, because there is somebody standing there now and a shopkeeper who tells you no is a shop.
const REFUSAL = {
    too_few_embers: "Not enough embers for that one.",
    no_potion_slot: "Your belt's full, friend.",
    already_carried: "You're already carrying one.",
    already_bought: "Sold — to you, a moment ago.",
    already_removed: "One burning to a visit. Come back.",
    deck_too_small: "Any smaller and you'd have nothing to play.",
};

/** The picture for one thing on the shelf. A potion and a trinket each have their own now (gen-card-items). */
const goodsArt = (item) => (item.kind === "potion"
    ? `/images/cards/potions/${item.ref}.png`
    : `/images/cards/items/${item.ref}.png`);

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

/** The price, on a hanging leather tag. Struck onto a drawn object rather than floating over the painting. */
const PriceTag = ({ price, sold, sale }) => (
    <span className={`cs-tag${sold ? " is-sold" : ""}${sale ? " is-sale" : ""}`}>
        {sold ? "Sold" : <><GiFlame aria-hidden="true" />{price}</>}
    </span>
);

export default function CardShop({ run, art = {} }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [said, setSaid] = useState(null);
    const [picking, setPicking] = useState(false);

    const embers = run.embers || 0;
    const stock = run.shop?.stock || [];
    const bought = run.shop?.bought || [];
    const removed = Boolean(run.shop?.removed);
    const cost = removalCost(run.removals || 0);
    const deck = run.deck || [];
    const potions = (run.potions || []).map((id) => POTIONS[id]).filter(Boolean);

    const cards = stock.filter((s) => s.kind === "card");
    const goods = stock.filter((s) => s.kind !== "card");

    const post = useCallback(async (body) => {
        if (busy) return;
        setBusy(true);
        setSaid(null);
        const r = await fetch("/api/marketplace/cards/run", {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
        }).then((x) => x.json()).catch(() => null);
        setBusy(false);
        if (r?.error) {
            setSaid(REFUSAL[r.error] || "The merchant shakes his head.");
            return;
        }
        setPicking(false);
        router.refresh();
    }, [busy, router]);

    return (
        <div className={`cs ${panelFont.className}`} style={{ "--cf-card-font": CARD_FONT.style.fontFamily }}>
            {/* ── THE ROOM ── a painted alcove, not a gradient. Deliberately dim: everything on this screen is
                a decision about a card, so the card has to be the brightest thing on it. */}
            <div className="cs-room" aria-hidden="true" />

            {/* THE SAME BAR THE MAP WEARS. Health, money and what you are carrying do not change meaning
                because you walked into a shop, so they do not change shape either — a second dialect of top
                bar is how two screens stop being one game. */}
            <div className="cs-bar">
                <span className="cs-who">The Merchant</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="cs-ui" src="/images/cards/chrome/ui-heart.png" alt="" />
                <b className="cs-hp">{run.hp}/{run.hpMax}</b>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="cs-ui" src="/images/cards/chrome/ui-ember.png" alt="" />
                <b className="cs-em">{embers.toLocaleString()}</b>
                {/* EMPTY SLOTS ARE NOT DRAWN — Luke, on the map's bar. Same rule here. */}
                {potions.map((p, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={`${p.id}${i}`} className="cs-ui" src={`/images/cards/potions/${p.id}.png`} alt={p.name} title={`${p.name} — ${p.text}`} />
                ))}
            </div>

            {/* ── THE STALL ────────────────────────────────────────────────────────────────────────────────
                Awning, keeper, two shelves. On a phone he stands above his goods; past 760px he moves to the
                left of them, which is where a stall puts its owner and what stops a wide screen being one
                narrow column with a lot of room either side. */}
            <div className="cs-stall">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="cs-awning" src="/images/cards/chrome/shop-awning.png" alt="" />

                <div className="cs-keep">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="cs-keeper" src="/images/cards/chrome/shop-keeper.png" alt="The merchant" />
                    {/* HE SAYS IT, rather than a red line under a heading. There is a person on this screen
                        now, so the one place the screen talks back belongs to him. */}
                    <p className={`cs-say${said ? " is-live" : ""}`} role="status">
                        {said || "Everything's for sale. The fire's extra."}
                    </p>
                </div>

                <div className="cs-wares">
                    {/* ── THE CARDS, AS CARDS ──────────────────────────────────────────────────────────────
                        The whole complaint, in one row. `.cf-card` is the BOX — size, moulding, shadow — and
                        it is defined here rather than imported because the fight's box fans out and is
                        dragged and this one stands still on a shelf. The FACE inside it is the same
                        component the hand draws, so a card cannot look like one thing in the shop and
                        another in play. */}
                    <div className="cs-shelfrow">
                        <div className="cs-line">
                            {cards.map((item) => {
                                const card = cardById(item.ref);
                                const gone = bought.includes(item.slot);
                                const poor = embers < item.price;
                                if (!card) return null;
                                return (
                                    <button
                                        key={item.slot}
                                        type="button"
                                        className={`cs-buy${gone ? " is-gone" : ""}`}
                                        disabled={busy || gone || poor}
                                        aria-label={`${card.name}, ${item.price} embers`}
                                        onClick={() => post({ action: "buy", slot: item.slot })}
                                    >
                                        <span className="cf-card">
                                            <CardFace card={card} art={art[card.pet]} dim={poor && !gone} />
                                        </span>
                                        <PriceTag price={item.price} sold={gone} sale={item.sale} />
                                    </button>
                                );
                            })}
                        </div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="cs-shelf" src="/images/cards/chrome/shop-shelf.png" alt="" />
                    </div>

                    {/* ── THE POTIONS AND THE TRINKET ──────────────────────────────────────────────────────
                        Every one of these used to be the same borrowed glyph — one bottle for all five
                        potions, a heart for all six trinkets — which on a shelf is not a choice, it is a
                        list with a picture on it. They are drawn objects now (scripts/gen-card-items.mjs).
                        The trinket stands on a plinth because it is the one thing here you cannot otherwise
                        get without bleeding for it at an elite. */}
                    <div className="cs-shelfrow">
                        <div className="cs-line is-goods">
                            {goods.map((item) => {
                                const face = itemFace(item);
                                const gone = bought.includes(item.slot);
                                const poor = embers < item.price;
                                return (
                                    <button
                                        key={item.slot}
                                        type="button"
                                        className={`cs-good${gone ? " is-gone" : ""}${item.kind === "perk" ? " is-perk" : ""}`}
                                        disabled={busy || gone || poor}
                                        title={`${face.name} — ${face.text}`}
                                        aria-label={`${face.name}, ${item.price} embers. ${face.text}`}
                                        onClick={() => post({ action: "buy", slot: item.slot })}
                                    >
                                        <span className="cs-obj">
                                            {item.kind === "perk" ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img className="cs-plinth" src="/images/cards/chrome/shop-plinth.png" alt="" />
                                            ) : null}
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img className="cs-goodart" src={goodsArt(item)} alt="" />
                                        </span>
                                        <b className="cs-goodname">{face.name}</b>
                                        <span className="cs-kind">{LABEL[item.kind] || item.kind}</span>
                                        <PriceTag price={item.price} sold={gone} sale={item.sale} />
                                    </button>
                                );
                            })}
                        </div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="cs-shelf" src="/images/cards/chrome/shop-shelf.png" alt="" />
                    </div>
                </div>
            </div>

            {/* ── THE BRAZIER ──────────────────────────────────────────────────────────────────────────────
                ⚠️ THE LOUDEST THING ON THE SCREEN, ON PURPOSE. Removing a card is the only reason a shop
                exists (see SHOP in cards-kit): every other reward in this game makes the deck bigger, and a
                deck that only grows draws its best cards less often the longer a run goes. It was a bordered
                div with a heading in it — the quietest thing here. It is a fire now, and you feed cards to
                it. */}
            <button
                type="button"
                className={`cs-burn${removed ? " is-cold" : ""}`}
                disabled={busy || removed || embers < cost || deck.length <= 5}
                onClick={() => setPicking((v) => !v)}
            >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="cs-brazier" src="/images/cards/chrome/shop-brazier.png" alt="" />
                <span className="cs-burn-say">
                    <span className="cs-burn-top">
                        <b>{picking ? "Never mind" : "Burn a card"}</b>
                        {!removed ? <PriceTag price={cost} /> : null}
                    </span>
                    <i>
                        {removed
                            ? "The brazier is cold. One a visit."
                            : "Out of your deck for good — a smaller deck draws its best cards more often."}
                    </i>
                </span>
            </button>

            {/* ── AND WHICH ONE ────────────────────────────────────────────────────────────────────────────
                Also real cards. Picking the card to destroy off a list of NAMES is the single worst place in
                the game to be reading text instead of looking at cards — it is the one irreversible thing
                the shop does. */}
            {picking ? (
                <div className="cs-pick" role="dialog" aria-label="Choose a card to burn">
                    <p className="cs-pick-head">Feed one to the fire.</p>
                    <div className="cs-pick-deck">
                        {deck.map((id, i) => {
                            const c = cardById(id);
                            if (!c) return null;
                            return (
                                <button key={`${id}-${i}`} type="button" className="cs-buy" disabled={busy}
                                    aria-label={`Burn ${c.name}`}
                                    onClick={() => post({ action: "remove", index: i })}>
                                    <span className="cf-card"><CardFace card={c} art={art[c.pet]} /></span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            ) : null}

            {/* The same ribbon the map leaves by, hung off the stall rather than off the window: aligned to
                the screen edge it ended up a long way from everything else on a wide monitor. */}
            <div className="cs-foot">
                <button type="button" className="cs-leave" disabled={busy} onClick={() => post({ action: "leave" })}>
                    Move on
                </button>
            </div>

            {/* ── GLOBAL, AND IT HAS TO BE ────────────────────────────────────────────────────────────────
                styled-jsx scopes a rule to the elements THIS component renders, and the card face is drawn by
                <CardFace> one level down — so a scoped `.cf-card` here would style the box and nothing inside
                it. Same trap, and the same answer, as the fight screen. Every selector is under `.cs` or the
                card game's own `.cf-` prefix. */}
            <style jsx global>{`
                .cs { position: fixed; inset: 0; z-index: 4000; overflow-y: auto; overscroll-behavior: contain;
                    display: flex; flex-direction: column; align-items: center; gap: 10px;
                    padding: 0 10px 18px; background: #0a0b0f; color: #efe3cd; }
                /* THE ROOM IS BEHIND EVERYTHING AND FIXED, so scrolling the wares does not scroll the wall.
                   cover and not 100% 100%: it is a painting of a place, and stretching a place to a phone's
                   aspect bends the stonework. */
                .cs-room { position: fixed; inset: 0; z-index: -1;
                    background: #0a0b0f url(/images/cards/chrome/shop-room.png) center/cover no-repeat; }
                .cs-room::after { content: ""; position: absolute; inset: 0;
                    background: radial-gradient(ellipse at 50% 34%, rgba(10,11,15,0.10), rgba(6,7,10,0.86) 78%); }

                /* ── THE BAR ── flat, sprites and coloured numerals, no rounded rectangles. The map's. */
                .cs-bar { position: sticky; top: 0; z-index: 6; align-self: stretch;
                    display: flex; align-items: center; gap: 7px; padding: 7px 12px; margin: 0 -10px;
                    background: #3d4550; border-bottom: 1px solid rgba(0,0,0,0.35); }
                .cs-who { font-size: 13px; letter-spacing: 0.06em; opacity: 0.85; margin-right: auto; }
                .cs-ui { width: 20px; height: 20px; object-fit: contain; }
                .cs-hp { font-size: 13px; color: #ff8f7a; font-variant-numeric: tabular-nums; }
                .cs-em { font-size: 13px; color: #ffb45e; font-variant-numeric: tabular-nums; }

                /* ── THE STALL ── */
                .cs-stall { position: relative; width: min(1000px, 100%); padding-top: 6px;
                    display: flex; flex-direction: column; align-items: center; }
                /* Hung across the top of the stall and STRETCHED BY BORDER-IMAGE, not by background-size: the
                   scallops along its hem are the detail and scaling the whole picture to a 1000px screen
                   smears them flat. The two ends hold; the plain canvas between them gives. */
                .cs-awning { width: 100%; max-width: 620px; height: 40px; object-fit: fill;
                    filter: drop-shadow(0 6px 10px rgba(0,0,0,0.65)); }

                /* HE STANDS BEHIND HIS GOODS. Bottom-anchored and overlapped by the first shelf, which is what
                   puts him in the room rather than beside it. */
                .cs-keep { position: relative; display: flex; flex-direction: column; align-items: center;
                    width: 100%; margin-top: -8px; }
/* ⚠️ SIZED SO THE FIRST SHELF IS ABOVE THE FOLD. A phone is 375x441 once the browser's
                   own chrome is taken off, and at 168px he plus the awning filled it — the cards, which are
                   the entire reason for the room, started below the bottom edge. He is the welcome, not the
                   screen. */
                .cs-keeper { width: 118px; max-width: 32vw; height: auto; object-fit: contain;
                    filter: drop-shadow(0 8px 14px rgba(0,0,0,0.7)); }
                /* ── WHAT HE SAYS ── one line, always present so the layout does not jump when he answers,
                   and lit when it is an answer rather than a greeting. */
                .cs-say { margin: 1px 0 0; max-width: 300px; text-align: center; font-size: 12px;
                    line-height: 1.35; color: #c3b49c; font-style: italic;
                    text-shadow: 0 1px 3px rgba(0,0,0,0.9); }
                .cs-say.is-live { color: #ffcf9a; font-style: normal; }

                .cs-wares { width: 100%; display: flex; flex-direction: column; gap: 12px; margin-top: 4px; }
                /* A ROW IS ITS GOODS PLUS THE PLANK UNDER THEM. The plank is drawn last and pulled up under
                   the feet of what stands on it, so the objects sit ON the shelf instead of above a picture
                   of one. */
                .cs-shelfrow { position: relative; display: flex; flex-direction: column; align-items: center; }
                .cs-line { position: relative; z-index: 2; display: flex; justify-content: center;
                    align-items: flex-end; gap: 8px; flex-wrap: wrap; }
                .cs-line.is-goods { gap: 14px; align-items: flex-end; }
                .cs-shelf { width: min(100%, 620px); height: 22px; object-fit: fill; margin-top: -6px;
                    filter: drop-shadow(0 5px 8px rgba(0,0,0,0.7)); }

                /* ── ONE THING FOR SALE ── the card, and a tag hanging off it. */
                .cs-buy { position: relative; padding: 0 0 14px; border: 0; background: none; cursor: pointer;
                    display: flex; flex-direction: column; align-items: center; }
                .cs-buy:disabled { cursor: default; }
                .cs-buy.is-gone { opacity: 0.4; filter: grayscale(0.6); }
                .cs-buy:hover:not(:disabled) .cf-card { transform: translateY(-6px) scale(1.04); }
                .cs-buy:focus-visible .cf-card { transform: translateY(-6px) scale(1.04); }

                /* ── THE CARD BOX ── everything inside it is CardFace's. See the note there: the face is one
                   component and the box belongs to the screen, because the fight's fans out and is dragged
                   and this one stands on a plank. */
                .cs .cf-card { position: relative; width: 96px; height: 138px; padding: 0 0 8px;
                    display: flex; flex-direction: column; align-items: center;
                    background: none; border: 0; border-radius: 9px;
                    filter: drop-shadow(0 4px 7px rgba(0,0,0,0.6));
                    transition: transform 140ms ease-out; }
                /* The painted moulding. Same asset the hand uses — a card is a card wherever it is. */
                .cs .cf-card::after { content: ""; position: absolute; inset: -1px; z-index: 2;
                    pointer-events: none; background-image: url(/images/cards/chrome/frame.png);
                    background-repeat: no-repeat; background-size: 100% 100%; }

                /* ── THE PRICE, ON A DRAWN TAG ── struck onto leather rather than floating over the room.
                   Hung off the bottom of whatever it is pricing, overlapping the shelf. */
                .cs-tag { position: absolute; left: 50%; bottom: 0; transform: translateX(-50%);
                    z-index: 4; min-width: 54px; padding: 7px 8px 5px;
                    display: inline-flex; align-items: center; justify-content: center; gap: 3px;
                    background: url(/images/cards/chrome/shop-tag.png) center/100% 100% no-repeat;
                    font-family: var(--cf-card-font); font-size: 12px; font-weight: 800; color: #ffb45e;
                    font-variant-numeric: tabular-nums; text-shadow: 0 1px 2px rgba(0,0,0,0.9);
                    filter: drop-shadow(0 2px 3px rgba(0,0,0,0.6)); }
                .cs-tag.is-sale { color: #ffd75e; }
                .cs-tag.is-sold { color: #9d8a72; }

                /* ── A POTION OR A TRINKET ── the object, its name, and what kind of thing it is. */
/* padding-bottom CLEARS THE TAG. It hangs at bottom: 0 and it is ~28px tall, so at 16px it
                   sat straight across the word underneath the name: the shelf read "PO(TAG)ON". */
                .cs-good { position: relative; width: 96px; padding: 0 0 34px; border: 0; background: none;
                    cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 1px;
                    color: inherit; font: inherit; transition: transform 140ms ease-out; }
                .cs-good:disabled { cursor: default; }
                .cs-good.is-gone { opacity: 0.4; filter: grayscale(0.6); }
                .cs-good:hover:not(:disabled), .cs-good:focus-visible { transform: translateY(-5px); }
                .cs-obj { position: relative; height: 74px; width: 100%; display: grid; place-items: end center; }
                .cs-goodart { position: relative; z-index: 2; max-width: 64px; max-height: 66px;
                    object-fit: contain; filter: drop-shadow(0 5px 7px rgba(0,0,0,0.7)); }
                /* The trinket stands ON something, because it is the one thing here an elite is the only other
                   source of. The plinth is behind it and its own height is what lifts the object. */
                .cs-plinth { position: absolute; bottom: 0; left: 50%; transform: translateX(-50%);
                    z-index: 1; width: 62px; object-fit: contain; opacity: 0.95;
                    filter: drop-shadow(0 4px 6px rgba(0,0,0,0.7)); }
                .cs-good.is-perk .cs-goodart { max-height: 46px; margin-bottom: 26px; }
                .cs-goodname { font-family: var(--cf-card-font); font-size: 11.5px; line-height: 1.15;
                    text-align: center; color: #efe3cd; text-shadow: 0 1px 3px rgba(0,0,0,0.95); }
                .cs-kind { font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; color: #9d8a72; }

                /* ── THE BRAZIER ── */
                .cs-burn { position: relative; width: min(1000px, 100%); margin-top: 2px;
                    display: flex; align-items: center; gap: 10px; padding: 6px 12px 6px 6px;
                    border: 0; background: none; cursor: pointer; color: inherit; text-align: left; }
                .cs-burn:disabled { cursor: default; opacity: 0.55; }
                .cs-burn.is-cold .cs-brazier { filter: grayscale(0.85) brightness(0.6); }
                .cs-brazier { width: 78px; height: 78px; object-fit: contain;
                    filter: drop-shadow(0 4px 10px rgba(255,140,40,0.35)) drop-shadow(0 6px 9px rgba(0,0,0,0.7)); }
                .cs-burn-say { display: flex; flex-direction: column; gap: 2px; flex: 0 1 auto; }
                .cs-burn-top { display: flex; align-items: center; gap: 12px; }
                .cs-burn-say b { font-size: 16px; letter-spacing: 0.03em; color: #ffcf9a;
                    text-shadow: 0 1px 3px rgba(0,0,0,0.95); }
                .cs-burn-say i { font-family: var(--cf-card-font); font-style: normal; font-size: 12px;
                    line-height: 1.35; color: #c8b09a; text-shadow: 0 1px 3px rgba(0,0,0,0.9); }
                .cs-burn .cs-tag { position: static; transform: none; flex: 0 0 auto; }
                .cs-foot { width: min(1000px, 100%); display: flex; }

                /* ── CHOOSING WHAT TO BURN ── */
                .cs-pick { width: min(1000px, 100%); padding: 10px; border-radius: 10px;
                    background: rgba(8,9,12,0.82); box-shadow: inset 0 0 0 1px rgba(255,180,94,0.18); }
                .cs-pick-head { margin: 0 0 8px; text-align: center; font-size: 14px; color: #ffcf9a; }
                .cs-pick-deck { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px;
                    max-height: 46vh; overflow-y: auto; }
                .cs-pick .cs-buy { padding-bottom: 0; }

                /* The map's ribbon, so leaving looks the same wherever you are leaving from. */
                .cs-leave { width: 132px; height: 46px; padding: 0 0 3px 8px;
                    border: 0; background: transparent url(/images/cards/chrome/return-ribbon.png) center/100% 100% no-repeat;
                    color: #ffe6d2; font: inherit; font-size: 14px; letter-spacing: 0.04em; cursor: pointer;
                    text-shadow: 0 1px 3px rgba(0,0,0,0.8);
                    filter: drop-shadow(0 3px 5px rgba(0,0,0,0.6)); }
                .cs-leave:disabled { opacity: 0.5; cursor: default; }

                /* ── AND ON A WIDE SCREEN HE STANDS BESIDE HIS GOODS ─────────────────────────────────────
                   Not "the same column, centred". A stall is a person on one side and the wares on the
                   other, and a phone is the only reason he is ever stacked above them. */
                @media (min-width: 760px) {
                    .cs-stall { display: grid; grid-template-columns: 260px 1fr; gap: 18px;
                        align-items: end; padding-top: 10px; }
                    .cs-awning { grid-column: 1 / -1; max-width: 100%; height: 68px; }
                    .cs-keep { margin-top: -18px; align-self: end; }
                    .cs-keeper { width: 240px; max-width: 100%; }
                    .cs-say { font-size: 13px; }
                    .cs-wares { margin-top: 0; }
                    .cs-shelf { width: 100%; }
                    .cs-line { flex-wrap: nowrap; }
                }
            `}</style>
        </div>
    );
}
