"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Cinzel } from "next/font/google";

import CardFace, { CARD_FONT, Sprite } from "@/components/cards/CardFace";

// ── EVERY CARD IN THE GAME, AND WHOSE IT IS ──────────────────────────────────────────────────────────────
// Luke: "overall card collection", alongside "design the way cards reflect their pets level". The two are one
// screen, because in this game they are one fact: A CARD IS A PET YOU OWN. The offer pool is filtered by your
// collection (eligibleCards), the picture on the face is that pet at the level you have taken it to, and
// until now neither of those was visible anywhere. You met a card when a run offered it, if it ever did.
//
// So: the compendium. Every card the game knows, drawn as a card, sorted by how deep in it appears, with the
// ones you cannot be offered greyed and told why. It answers three questions the run cannot:
//   · what is in this game at all — the thing a player asks before deciding to care about it
//   · which of it is MINE, which is the pitch for the pet collection the whole Den is built on
//   · what my pets look like now, because the face wears their level
//
// ⚠️ IT IS A CABINET, NOT A SHOP. Nothing here can be bought, picked or equipped, and no number on this
// screen is a number the run reads — see the note on petArtMap about why levelling buys the picture and never
// the damage. A collection screen that starts handing out advantages is a second game with no balance.
const panelFont = Cinzel({ subsets: ["latin"], weight: ["600", "700"], display: "swap" });

// ── FIVE DOORS, ONE ROW ──────────────────────────────────────────────────────────────────────────────────
// Three of these filter the cards and two swap the grid for a catalogue, which is normally an argument for
// two rows of chrome. It is one row on purpose: on a phone a second row of tabs costs more height than the
// thing it is organising, and every one of them is the same question — show me this part of the game.
const TABS = [
    { key: "all", label: "All" },
    { key: "mine", label: "Mine" },
    { key: "locked", label: "Locked" },
    { key: "trinkets", label: "Trinkets" },
    { key: "potions", label: "Potions" },
];

export default function CardCollection({ cards, art, trinkets = [], potions = [], counts }) {
    const router = useRouter();
    const [filter, setFilter] = useState("all");
    // The card you pressed, held big with its pet named underneath. A 96px card is a card you can identify;
    // it is not a card you can READ, and the whole point of a cabinet is reading the thing.
    const [look, setLook] = useState(null);

    const items = filter === "trinkets" ? trinkets : filter === "potions" ? potions : null;
    const shown = useMemo(
        () => (filter === "all" ? cards : filter === "mine" ? cards.filter((c) => c.owned)
            : filter === "locked" ? cards.filter((c) => !c.owned) : []),
        [cards, filter]
    );
    const looked = look ? cards.find((c) => c.id === look) : null;
    const count = (key) => (key === "all" ? counts.total : key === "mine" ? counts.owned
        : key === "locked" ? counts.total - counts.owned
            : key === "trinkets" ? trinkets.length : potions.length);

    return (
        <div className={`cc ${panelFont.className}`} style={{ "--cf-card-font": CARD_FONT.style.fontFamily }}>
            <div className="cc-room" aria-hidden="true" />

            <div className="cc-bar">
                <span className="cc-who">The Collection</span>
                <b className="cc-count">{counts.owned}<span>/{counts.total}</span></b>
            </div>

            <div className="cc-head">
                <p className="cc-say">
                    Every card is a pet. Own the pet and its card can be dealt to you; take that pet up a level
                    and the card is drawn as what it grew into.
                </p>
                <div className="cc-tabs" role="tablist">
                    {TABS.map((f) => (
                        <button
                            key={f.key}
                            type="button"
                            role="tab"
                            aria-selected={filter === f.key}
                            className={`cc-tab${filter === f.key ? " is-on" : ""}`}
                            onClick={() => { setLook(null); setFilter(f.key); }}
                        >
                            {f.label}
                            <em>{count(f.key)}</em>
                        </button>
                    ))}
                </div>
            </div>

            {/* ── THE TRINKETS AND THE POTIONS ────────────────────────────────────────────────────────
                Not cards, and not drawn as cards: a trinket works by sitting on the strip and a potion is
                drunk, so pretending either is a playable card would be the screen lying about the rules.
                They get the shape the game already uses for a thing with a rule on it — sprite, name,
                sentence — plus the one line a run never tells you, which is where they come from. */}
            {items ? (
                <div className="cc-items">
                    {items.map((it) => (
                        <span key={it.id} className="cc-item">
                            <Sprite src={it.art} />
                            <span>
                                <b>{it.name}</b>
                                <i>{it.text}</i>
                                <em>{it.from}</em>
                            </span>
                        </span>
                    ))}
                </div>
            ) : null}

            <div className="cc-grid">
                {shown.map((c) => (
                    <button
                        key={c.id}
                        type="button"
                        className={`cc-slot${c.owned ? "" : " is-locked"}`}
                        onClick={() => setLook(c.id)}
                        aria-label={`${c.name}${c.owned ? "" : " — locked"}`}
                    >
                        <span className="cf-card"><CardFace card={c} art={art[c.pet]} dim={!c.owned} /></span>
                        {/* WHY it is locked, and WHOSE it is. "Locked" on its own is the game telling you no
                            without telling you what to do about it; the answer is always the same and always
                            somewhere else in the Den — go and get that animal.

                            ⚠️ UNDER THE CARD, NOT ON IT. Pinned inside the frame it landed squarely on the
                            card's last line of rules text — the one thing on a locked card worth reading. */}
                        {c.owned ? null : <span className="cc-lock">{c.need || art[c.pet]?.name || c.pet}</span>}
                    </button>
                ))}
                {/* Only when the CARD grid is the thing on screen and it is empty. It was printing
                    "Nothing here yet." under a full list of trinkets, which is the screen contradicting
                    itself in the same scroll. */}
                {shown.length || items ? null : <p className="cc-none">Nothing here yet.</p>}
            </div>

            {looked ? (
                <div className="cc-over" onClick={() => setLook(null)} role="presentation">
                    <div className="cc-look" onClick={(e) => e.stopPropagation()} role="presentation">
                        <span className="cf-card is-big"><CardFace card={looked} art={art[looked.pet]} /></span>
                        <b className="cc-look-pet">{art[looked.pet]?.name || looked.pet}</b>
                        <p className="cc-look-note">
                            {looked.owned
                                ? art[looked.pet]?.level > 1
                                    ? `Yours, at level ${art[looked.pet].level}.`
                                    : "Yours. Equip the pet and level it, and this card grows with it."
                                : looked.need
                                    // EARNED, NOT COLLECTED — and the sentence has to say what to go and do,
                                    // because that is the only actionable half of the word "locked".
                                    ? `${looked.need}, and this one joins the deck.`
                                    : "You do not own this pet yet, so this card cannot be dealt to you."}
                        </p>
                        <button type="button" className="cc-close" onClick={() => setLook(null)}>Close</button>
                    </div>
                </div>
            ) : null}

            {/* ⚠️ THE RIBBON FLOATS OVER A SCROLLING GRID, so the cards have to go BEHIND it rather than
                collide with it. The list keeps a ribbon's worth of padding at its end (nothing is stranded
                underneath at rest) and this hem darkens the band on the way past, which is the difference
                between a card that is hidden and a card that looks broken. */}
            <div className="cc-hem" aria-hidden="true" />

            <button type="button" className="cc-return" onClick={() => router.push("/marketplace/cards/table")}>
                Return
            </button>

            <style jsx global>{`
                .cc { position: fixed; inset: 0; z-index: 4000; overflow-y: auto; overscroll-behavior: contain;
                    display: flex; flex-direction: column; align-items: center;
                    padding: 0 10px 86px; background: #0a0b0f; color: #efe3cd; }
                .cc-room { position: fixed; inset: 0; z-index: -1;
                    background: #0a0b0f url(/images/cards/chrome/table-room.png) center/cover no-repeat; }
                .cc-room::after { content: ""; position: absolute; inset: 0;
                    background: radial-gradient(ellipse at 50% 40%, rgba(10,11,15,0.35), rgba(6,7,10,0.95) 78%); }

                /* The bar every card screen wears. */
                .cc-bar { position: sticky; top: 0; z-index: 6; align-self: stretch;
                    display: flex; align-items: center; gap: 7px; padding: 7px 12px; margin: 0 -10px;
                    background: #3d4550; border-bottom: 1px solid rgba(0,0,0,0.35); }
                .cc-who { font-size: 13px; letter-spacing: 0.06em; opacity: 0.85; margin-right: auto; }
                .cc-count { font-size: 15px; color: #ffd9a6; font-variant-numeric: tabular-nums; }
                .cc-count span { color: #9d8a72; font-size: 12px; }

                .cc-head { width: min(760px, 100%); display: flex; flex-direction: column; align-items: center;
                    gap: 8px; padding: 10px 0 8px; }
                .cc-say { margin: 0; max-width: 460px; text-align: center; font-size: 12.5px; line-height: 1.4;
                    color: #c3b49c; font-style: italic; text-shadow: 0 1px 3px rgba(0,0,0,0.9); }
                /* WRAPS, because five pills is 420px of tabs on a 375px phone and a row that overflows hides
                   the first and last one — which here are "All" and "Potions", the two you reach for most. */
                .cc-tabs { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
                .cc-tab { display: inline-flex; align-items: center; gap: 5px; padding: 5px 12px;
                    border-radius: 999px; cursor: pointer; font: inherit; font-size: 12.5px;
                    border: 1px solid rgba(201,162,83,0.35); background: rgba(12,15,21,0.8); color: #c9bda6; }
                .cc-tab em { font-style: normal; font-size: 11px; color: #8e8069; }
                .cc-tab.is-on { border-color: #c9a253; background: rgba(201,162,83,0.18); color: #ffe6c2; }
                .cc-tab.is-on em { color: #d8bc86; }

                .cc-grid { width: min(760px, 100%); display: flex; flex-wrap: wrap; justify-content: center;
                    gap: 10px; }
                .cc-slot { position: relative; padding: 0; border: 0; background: none; cursor: pointer;
                    display: flex; flex-direction: column; align-items: center; gap: 3px; }
                /* LOCKED IS COLD AND STILL LEGIBLE. A card you cannot have is greyed rather than hidden — the
                   point of the cabinet is the empty slots. */
                .cc-slot.is-locked .cf-card { filter: grayscale(0.85) brightness(0.5)
                    drop-shadow(0 4px 7px rgba(0,0,0,0.6)); }
                .cc-lock { max-width: 96px; font-size: 10px; line-height: 1.2; letter-spacing: 0.04em;
                    color: #9d8f79; }
                .cc-none { color: #8e8069; font-size: 13px; }

                /* ── THE CATALOGUE ROWS ── the carrying panel's shape from the map, because a trinket read on
                   the sheet and the same trinket read here should not be two different objects. */
                .cc-items { width: min(560px, 100%); display: grid; gap: 8px; }
                .cc-item { display: flex; align-items: center; gap: 12px; padding: 9px 11px; border-radius: 10px;
                    background: rgba(12,15,21,0.86); box-shadow: inset 0 0 0 1px rgba(201,162,83,0.22); }
                .cc-item img { width: 44px; height: 44px; flex: 0 0 44px; object-fit: contain;
                    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.7)); }
                .cc-item b { display: block; font-size: 14px; color: #ffd9a6; }
                .cc-item i { display: block; margin-top: 1px; font-style: normal; font-size: 12.5px;
                    line-height: 1.35; color: #d3d9e2; }
                .cc-item em { display: block; margin-top: 3px; font-style: normal; font-size: 11px;
                    letter-spacing: 0.03em; color: #8e8069; }

                .cc .cf-card { position: relative; width: 96px; height: 138px; padding: 0 0 8px;
                    display: flex; flex-direction: column; align-items: center;
                    background: none; border: 0; border-radius: 9px;
                    filter: drop-shadow(0 4px 7px rgba(0,0,0,0.6)); }
                .cc .cf-card::after { content: ""; position: absolute; inset: -1px; z-index: 2;
                    pointer-events: none; background-image: url(/images/cards/chrome/frame.png);
                    background-repeat: no-repeat; background-size: 100% 100%; }
                /* Held up: the same face at a size the sentence on it can be read at. */
                .cc .cf-card.is-big { width: 168px; height: 242px; }

                .cc-over { position: fixed; inset: 0; z-index: 4100; display: grid; place-items: center;
                    padding: 16px; background: rgba(4,5,8,0.88); }
                .cc-look { display: flex; flex-direction: column; align-items: center; gap: 10px;
                    padding: 18px; border-radius: 12px; background: rgba(12,15,21,0.96);
                    border: 1px solid rgba(201,162,83,0.35); }
                .cc-look-pet { font-size: 15px; color: #ffd9a6; }
                .cc-look-note { margin: 0; max-width: 260px; text-align: center; font-size: 12.5px;
                    line-height: 1.4; color: #c6cdd6; }
                .cc-close { padding: 8px 20px; border-radius: 999px; cursor: pointer;
                    border: 2px solid #c9a253; background: rgba(18,22,30,0.92); color: #f2e2bd;
                    font: inherit; font-weight: 700; }

                .cc-hem { position: fixed; left: 0; right: 0; bottom: 0; height: 84px; z-index: 9;
                    pointer-events: none;
                    background: linear-gradient(180deg, rgba(6,7,10,0), rgba(6,7,10,0.86) 62%, rgba(6,7,10,0.96)); }

                /* The ribbon, pinned, with the grid's own bottom padding keeping cards from under it. */
                .cc-return { position: fixed; left: 0; bottom: 18px; z-index: 10; width: 158px; height: 52px;
                    padding: 0 34px 0 10px; border: 0; cursor: pointer; background-color: transparent;
                    background-image: url(/images/cards/chrome/return-ribbon.png);
                    background-size: 100% 100%; background-repeat: no-repeat;
                    font-family: inherit; font-weight: 700; font-size: 15px; color: #ffe6a6;
                    text-shadow: 0 2px 3px rgba(0,0,0,0.7); text-align: center;
                    filter: drop-shadow(0 4px 8px rgba(0,0,0,0.55)); }
                .cc-return:hover { filter: brightness(1.1); }

                @media (min-width: 760px) {
                    .cc-say { font-size: 13.5px; max-width: 560px; }
                }
            `}</style>
        </div>
    );
}
