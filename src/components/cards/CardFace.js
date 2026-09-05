"use client";

import { useEffect, useRef, useState } from "react";
import { Kreon } from "next/font/google";
import {
    GiBiceps, GiCardDraw, GiCrackedShield, GiCrossedSwords, GiHeartPlus, GiShield,
    GiSlowBlob, GiSmallFire, GiThunderStruck,
} from "react-icons/gi";

import { KEYWORDS, typeLook, upgradedFields } from "@/lib/marketplace/cards-kit.js";
import { RARITY_META } from "@/lib/marketplace/rarity.js";

// ── ONE CARD, DRAWN THE SAME WHEREVER IT IS ──────────────────────────────────────────────────────────────────
// This lived inside CardFightClient, which was correct while the fight was the only screen that showed a card.
// It is not any more: the merchant sells them, and a shop that renders its stock as `<b>{card.name}</b>` in a
// bordered button is not selling cards — it is selling three strings, and the thing you are actually deciding
// between never appears on the screen. Luke, on the merchant: "it doesn't Slay the Spire." Theirs lays the
// cards out AS CARDS and that is most of the difference.
//
// ⚠️ THE SECOND COPY IS THE FAILURE MODE, NOT THE IMPORT. The obvious fix is for the shop to draw its own
// small version of a card, and then there are two card renderers and the rarity ladder, the type-shaped
// window and the keyword colouring drift apart between them one commit at a time. There is one face. The
// screens differ in the BOX around it — the fight's fans out and is dragged, the shop's stands on a shelf —
// and that box belongs to each screen, so `.cf-card` and its states stay where they are used.
//
// ⚠️ AND THE STYLES CAME WITH IT, GLOBAL. styled-jsx scopes a rule to the elements the component
// holding the <style> tag renders ITSELF — not its children, and not the rest of the file. That is why the
// fight's block is `style jsx global` (a scoped `.cf-sprite` there once matched nothing and rendered the foe
// at its natural 1024px) and it is why this one has to be too: the picture in the window is drawn by
// <CardArt>, one level down. The `.cf-` prefix is the namespace that makes that safe — it is the card game
// and nothing else on the site. Left scoped, this file would render a card as a column of unstyled spans.

// ── THE CARD FACE IS NOT SET IN THE UI FONT ──────────────────────────────────────────────────────────────
// Luke: "i really dont like the font on the description". It was inheriting the site body face, which is a
// clean modern sans chosen to make a shop legible — correct for a page and wrong on a painted card, where it
// reads as a caption pasted onto a game. Kreon is a slab serif with the same weight of stroke as the ink
// contour the art is drawn with, and is the closest free face to the one Spire sets its own cards in.
//
// Exported rather than re-declared per screen: every screen that draws a card sets --cf-card-font from THIS,
// so a card in the shop and the same card in the hand are set in the same face.
export const CARD_FONT = Kreon({ subsets: ["latin"], weight: ["400", "600", "700"], display: "swap" });

/**
 * ── AN IMAGE THAT ALREADY FAILED BEFORE REACT WAS LISTENING ──────────────────────────────────────────────
 * ⚠️ onError IS NOT ENOUGH ON A SERVER-RENDERED PAGE, and this cost a shop full of broken-image icons.
 *
 * The markup arrives as HTML, so the browser starts fetching every <img> in it while the JS bundle is still
 * downloading. A 404 fires its error event THEN — before hydration attaches a single handler — and React does
 * not replay events it missed. The fallback never runs and the card keeps a torn-page glyph where its picture
 * should be, permanently, until something else re-renders it.
 *
 * Most cards have no illustration of their own yet (only a handful of `/images/cards/*.webp` exist) and are
 * MEANT to fall back to the pet's portrait, so this was every card in the game on a cold load, not an edge
 * case. `complete && naturalWidth === 0` is the DOM's own record of "this one is finished and it has nothing
 * in it", which is the only way to ask about an event that happened before you existed.
 */
const alreadyFailed = (el) => Boolean(el && el.complete && el.naturalWidth === 0);

/**
 * An <img> that gives up quietly. A sprite that 404s must not take the screen with it — the fight's piles,
 * its energy gem and the card's fallback portrait all go through this, and a missing file has to cost one
 * picture rather than the room.
 *
 * Shared with the fight screen, which is only safe because BOTH screens style the card game from a
 * `style jsx global` block. A component that renders markup for somebody else's stylesheet can only be
 * shared when the stylesheet is not scoped; if either block is ever made scoped, this has to split in two.
 */
export const Sprite = ({ src, fallback, className, flip }) => {
    const [bad, setBad] = useState(false);
    const img = useRef(null);
    useEffect(() => { if (alreadyFailed(img.current)) setBad(true); }, [src]);
    const url = bad ? fallback : src;
    if (!url) return <span className={className} aria-hidden="true" />;
    // eslint-disable-next-line @next/next/no-img-element
    return (
        <img
            ref={img}
            className={className} src={url} alt="" draggable="false"
            style={flip ? { transform: "scaleX(-1)" } : undefined}
            onError={() => setBad(true)}
        />
    );
};

// ── READING A HAND AT SPEED ──────────────────────────────────────────────────────────────────────────────
// Nobody reads sentences on a card; they spot the two words that decide the turn. Spire colours its keywords
// inside the text and that is most of why its cards are legible at a glance, so ours do the same — off the
// vocabulary the RULES own (cards-kit), not a list this file invented.
const KEY_RE = new RegExp(`\\b(${KEYWORDS.join("|")})\\b`, "g");
const withKeywords = (text) => String(text).split(KEY_RE).map((part, i) => (
    KEYWORDS.includes(part) ? <b key={`k${i}`} className="cf-key">{part}</b> : part
));

/**
 * ── THE CARD'S SENTENCE, WITH THE REAL NUMBERS IN IT ─────────────────────────────────────────────────────
 * The text is a template over the card's own fields ("Deal {damage} damage."), and the values come from
 * resolveCard, so a Bite thrown at something Vulnerable says nine on its face while it is being aimed.
 *
 * A number that has MOVED is coloured — green when the fight is working for you, red when against — because
 * a nine that looks exactly like the six it replaced is a number nobody notices changing. Only the delta is
 * marked; an unmodified number stays plain, or every card in the hand is a Christmas tree.
 *
 * `live` is null everywhere outside a fight, which is what the shop wants: a card on a shelf has no fight
 * moving its numbers, so it shows what it is worth, not what it would hit for.
 */
const KEY_FIELD = /\{(\w+)\}/g;
/**
 * How much room this card's sentence needs, as a class rather than a computed style — see the note by
 * `.cf-text`. Measured on the sentence with its NUMBERS IN, because "Deal {damage} damage" is nine characters
 * shorter than what a level-5 Crush actually prints, and it is the printed line that has to fit.
 */
const textSize = (card, live) => {
    const filled = String(card.text || "").replace(KEY_FIELD, (_, f) => {
        const now = live && live[f] != null ? live[f] : card[f];
        return String(now ?? "");
    });
    if (filled.length > 58) return " is-tiny";
    if (filled.length > 40) return " is-small";
    return "";
};
const withNumbers = (card, live) => {
    const parts = String(card.text || "").split(KEY_FIELD);
    // ── AND THE ONES THE FIRE MOVED STAY GREEN ───────────────────────────────────────────────────────────
    // Spire lights an upgraded card's improved numbers permanently, not only while something in the fight is
    // moving them, and it is the same green: green means "better than the card this started as", whether the
    // reason is a Smith or a Vulnerable. A Bite+ sitting in the shop reads as upgraded before you buy it.
    const sharpened = upgradedFields(card);
    return parts.map((part, i) => {
        // split() on a capturing group alternates literal, capture, literal, capture...
        if (i % 2 === 0) return <span key={`t${i}`}>{withKeywords(part)}</span>;
        const base = Number(card[part]) || 0;
        const now = live && live[part] != null ? Number(live[part]) : base;
        const cls = now > base ? " is-up" : now < base ? " is-down" : sharpened.has(part) ? " is-up" : "";
        return <b key={`n${i}`} className={`cf-num${cls}`}>{now}</b>;
    });
};

// A hex from RARITY_META, softened to a wash — the banner is tinted BY the rarity rather than painted in it,
// or a Legendary card is a solid orange brick with unreadable text on it.
const rgb = (hex) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
    const n = m ? parseInt(m[1], 16) : 0x9aa0a6;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const wash = (hex, alpha) => `rgba(${rgb(hex).join(",")},${alpha})`;
/**
 * The colour, sunk toward the card stock. Spire's frame is painted in the CHARACTER's colour — red for the
 * Ironclad, green for the Silent — which is what stops a deck of commons being a tray of grey. Our pets carry
 * their own colours, so the pet's is the frame's, sunk far enough that white text still sits on it.
 */
const deep = (hex, k) => {
    const [r, g, b] = rgb(hex);
    const mix = (c, d) => Math.round(c + (d - c) * k);
    return `rgb(${mix(r, 20)},${mix(g, 23)},${mix(b, 29)})`;
};
/**
 * The card STOCK — the coloured slab the painted moulding sits on.
 *
 * This used to be painted on the card box itself, with the frame laid over the top, and a sliver of it showed
 * all the way down the outside edge: "there is a little green peaking out" (Luke, zoomed in on the frog). A
 * drawn frame has its own silhouette and a CSS box has border-radius, and the two do not agree — so the colour
 * escaped wherever the picture's edge sat inside the box's. It is an inner layer now, inset far enough that
 * the moulding covers its boundary on every side, and the card box paints nothing at all.
 */
const stockStyle = (hue) => ({
    background: `linear-gradient(180deg, ${deep(hue, 0.5)} 0%, ${deep(hue, 0.68)} 26%, ${deep(hue, 0.84)} 100%)`,
});

// ── THE PICTURE IN THE WINDOW, AND WHAT HAPPENS BEFORE IT EXISTS ─────────────────────────────────────────
// A card shows its pet DOING the thing (scripts/gen-card-art.mjs), full-bleed inside the frame. If that file
// has not been drawn yet the card falls back to the pet's own portrait sprite, contained rather than cropped —
// so a new card can be written, played and balanced today and get its illustration whenever. The art is never
// allowed to be a blocker on the rules.
const CardArt = ({ card, pet }) => {
    const [noArt, setNoArt] = useState(false);
    const img = useRef(null);
    useEffect(() => { if (alreadyFailed(img.current)) setNoArt(true); }, [card.id]);
    if (!noArt) {
        // eslint-disable-next-line @next/next/no-img-element
        return (
            <img
                ref={img}
                className="cf-art-full" src={`/images/cards/${card.id}.webp`} alt="" draggable="false"
                onError={() => setNoArt(true)}
            />
        );
    }
    return <Sprite src={pet?.url} className="cf-art-img" flip={pet?.flip} />;
};

/** The emblem on the type plate. Crossed swords is an attack, a shield is a skill, a flame is a power. */
// ── THE PLATE SAYS WHAT THE CARD DOES, BECAUSE THE WINDOW ALREADY SAYS WHAT IT IS ────────────────────────
// Luke: "drawing two cards is not a defensive skill, it's more of a utility." He is right, and the reason it
// was wrong is that the plate and the window were saying the SAME thing: an attack window comes to a point, a
// skill window is a rounded rectangle — the shape is already the type — and then the plate underneath showed a
// shield for every skill in the game. So Hoot, which draws two cards, wore a shield.
//
// The plate is free to carry something the shape cannot, so it carries the EFFECT. Shape = what kind of card
// this is; emblem = what it will do to somebody. Read off the card's own fields in the order that decides how
// it gets played: a card that deals damage is an attack whatever else it also does.
const TypeMark = ({ card, kind }) => {
    const c = card || {};
    if (c.damage) return <GiCrossedSwords aria-hidden="true" />;
    if (c.block) return <GiShield aria-hidden="true" />;
    if (c.heal) return <GiHeartPlus aria-hidden="true" />;
    if (c.draw || c.energy) return <GiCardDraw aria-hidden="true" />;
    if (c.strength) return <GiBiceps aria-hidden="true" />;
    if (c.weak) return <GiSlowBlob aria-hidden="true" />;
    if (c.vulnerable) return <GiCrackedShield aria-hidden="true" />;
    // Nothing matched: fall back to the TYPE, which is what this used to be entirely.
    if (kind === "attack") return <GiCrossedSwords aria-hidden="true" />;
    if (kind === "power") return <GiThunderStruck aria-hidden="true" />;
    return <GiSmallFire aria-hidden="true" />;
};

// ── WHICH PAINTED TINT A RARITY WEARS ────────────────────────────────────────────────────────────────────
// The chrome is drawn once and tinted into three (scripts/gen-card-chrome.mjs). Nine rarities map onto those
// three rather than each demanding its own file: grey for common, steel blue through the middle, gold at the
// top. A rarity nobody has authored a card for yet still gets furniture.
const chromeTint = (rarity) => {
    const r = String(rarity || "common");
    if (r === "common") return "common";
    return ["rare", "epic"].includes(r) ? "rare" : "legendary";
};

/**
 * One card face, in the anatomy Spire settled on: the cost hanging off the corner, a name banner whose colour
 * IS the rarity, a framed window for the art, a tab naming the type, and the text underneath with its keywords
 * lit. Every one of those is a channel that does not cost a word — you can tell an Attack from a Skill, and a
 * Legendary from a Common, without reading anything.
 *
 * Renders the INSIDE of a card only. The caller owns the box: put it in an element with class `cf-card` and
 * the moulding, the size and the drop shadow come with it.
 */
export default function CardFace({ card, art, dim, live }) {
    const meta = RARITY_META[art?.rarity] || RARITY_META.common;
    const look = typeLook(card.kind);
    const hue = art?.color || meta.color;
    const tint = chromeTint(art?.rarity);
    return (
        <>
            <span className="cf-stock" style={stockStyle(hue)} />
            <span className={`cf-cost${dim ? " is-dim" : ""}`}><i>{card.cost}</i></span>
            {/* The ribbon sits ABOVE the picture with its folded ends draping over the window's top corners —
                which is where Spire puts it. Laid fully across the art, its own clipped underside let the
                picture show through directly under the name, and that reads as the sprite covering it. */}
            {/* THE TITLE GOES GREEN WITH THE "+", exactly as theirs does. The mark alone was doing the whole
                job of telling a hand of eight which Bite is the good one, and a "+" at 9px on a cloth banner
                is not a thing anybody spots mid-fight. */}
            <span className={`cf-banner${card.upgraded ? " is-sharp" : ""}`}
                style={{ backgroundImage: `url(/images/cards/chrome/banner-${tint}.png)` }}>
                {card.name}
            </span>
            {/* ── THE PET'S LEVEL, ON THE NAMEPLATE ───────────────────────────────────────────────────
                The picture in the window is already the level you have this pet at (see petArtMap): a bear
                you have fed for six weeks is drawn as the bear you fed. Without a number that is a mystery —
                two people compare screenshots of Swipe and one of them has a different animal on it — so the
                rung is written where a rung goes: a row of stars along the foot of the card. Luke: "we should
                use stars to reflect pet level across the bottom of the card, not the gold number thing." He is
                right about both halves — a numeral is a thing you read and then have to know the scale of,
                where five stars against a possible six is a quantity you take in without counting, and the
                bottom rail is the one band on a card with nothing on it.

                ⚠️ THE FAN STILL DECIDES WHERE IT GOES. The hand overlaps each card with the NEXT one, so
                only a strip down the LEFT of each card is ever visible — which is why the cost diamond lives
                there, and why the first two attempts at this mark were a badge at the top-left (it collided
                with the cost gem) and then one on the window rim. Stars along the BOTTOM are read from the
                left, so the strip the fan leaves you shows the first two or three of them: enough to know
                the card is levelled at all, with the whole row there the moment you raise it.

                LEVEL 1 WEARS NOTHING. Every card in a starter deck would otherwise carry a "1" that says
                only "this is normal", and a mark that is on everything is furniture rather than information.
                An enshrined pet says so with its stone's colour rather than a seventh numeral. */}
            {art?.level > 1 ? (
                <span
                    className={`cf-stars${art.stone ? ` is-${art.stone}` : ""}`}
                    aria-label={`Your ${art.name || card.pet} is level ${art.level}`}
                    title={`Your ${art.name || card.pet} is level ${art.level}${art.stone ? `, enshrined in ${art.stone}` : ""}`}
                >
                    {Array.from({ length: Math.min(6, art.level) }, (_, i) => (
                        <svg key={i} className="cf-star" viewBox="0 0 20 19" aria-hidden="true">
                            <path d="M10 0l2.9 6.2 6.8.9-5 4.7 1.3 6.8L10 15.3 3.9 18.6l1.3-6.8-5-4.7 6.8-.9z" />
                        </svg>
                    ))}
                </span>
            ) : null}
            {/* THE WINDOW'S SHAPE IS THE CARD'S TYPE. An attack comes to a point at the bottom, a skill is a
                rounded rectangle — Spire's own tell, and it means you can sort a hand by what the cards DO
                without reading one of them. The rim is the rarity, painted as the container behind a 2px
                inset rather than as a border, because a border does not follow a clip-path and the pointed
                bottom would lose its edge. */}
            <span className={`cf-art is-${card.kind}`}>
                <span className="cf-art-in" style={{ background: `radial-gradient(ellipse at 50% 62%, ${wash(hue, 0.34)}, rgba(6,8,12,0.94))` }}>
                    <CardArt card={card} pet={art} />
                </span>
                <span className="cf-rim" style={{ backgroundImage: `url(/images/cards/chrome/rim-${card.kind}-${tint}.png)` }} />
            </span>
            {/* ── THE TYPE PLATE ──────────────────────────────────────────────────────────────────────
                A painted plaque with an EMBLEM struck on it, not a CSS rectangle with a word in it. Two
                complaints in one, both Luke's: on a card whose every other edge is painted, the tab was the
                one piece that still looked like a web page, and the word was doing work the window's shape
                already does — an attack window comes to a point, a skill is a rounded rectangle, and now the
                plate under it carries crossed swords or a shield. The word is one line away if it is missed;
                the `label` it would use is still in the rules. */}
            <span className="cf-type" style={{ backgroundImage: `url(/images/cards/chrome/plate-${tint}.png)` }} aria-label={look.label}>
                <TypeMark card={card} kind={card.kind} />
            </span>
            {/* ── A LONG SENTENCE GETS A SMALLER ONE ──────────────────────────────────────────────────
                The card is 96x138 everywhere it appears, and its text box holds four lines at 10.5px. Most
                cards are one sentence and never come close; Firebreath ("Deal 11 damage to ALL enemies.
                Apply 1 Vulnerable.") is sixty-three characters and its last word — the word that says what
                the card DOES to you — was simply cut off by the bottom of the frame. A card whose rules you
                cannot finish reading is not a card.

                Stepped rather than fluid, because two sizes at a glance read as a design and a continuous
                scale reads as a bug: the cabinet would show twenty-six cards in twenty-six type sizes. */}
            <span className={`cf-text${textSize(card, live)}`}>{withNumbers(card, live)}</span>

            {/* ⚠️ GLOBAL, FOR THE SAME REASON THE FIGHT'S BLOCK IS. styled-jsx scopes a rule to the
                elements THIS component renders — and the picture in the window is rendered by <CardArt> and
                <Sprite> one level down, so a scoped `.cf-art-full` would match nothing and the illustration
                would come out at its natural size. Everything below is under the `.cf-` prefix, which is the
                card game and nothing else on the site. */}
            <style jsx global>{`
                .cf-stock { position: absolute; inset: 4px; z-index: 0; border-radius: 6px; }
                /* A DIAMOND HUNG OFF THE CORNER, in dark stone with a white numeral — theirs, and it reads
                   better than the amber disc did against a lit card. Rotated square, so the glyph inside is
                   counter-rotated. */
                .cf-cost { position: absolute; top: -8px; left: -8px; width: 22px; height: 22px; z-index: 4;
                    display: grid; place-items: center; transform: rotate(45deg); border-radius: 4px;
                    background: linear-gradient(145deg, #6b7280, #2c313a); border: 1px solid #10131a;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.28); }
                .cf-cost i { transform: rotate(-45deg); font-style: normal; font-size: 12px; font-weight: 800;
                    color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.9); }
                .cf-cost.is-dim { background: linear-gradient(145deg, #3a3f47, #23272e); }
                .cf-cost.is-dim i { color: #96a0ae; }
                /* PAINTED CLOTH, not a clipped div. The folded tails are in the picture now, which is what the
                   clip-path was faking — and faking badly: its clipped underside was letting the card art show
                   through beneath the name, which read as the sprite covering the banner.
                   Set in the card face, not the UI face — see the note on CARD_FONT at the top. */
                .cf-banner { font-family: var(--cf-card-font); font-weight: 700; font-size: 10.5px;
                    position: relative; z-index: 3; width: calc(100% + 14px);
                    margin: 4px -7px -6px; padding: 3px 9px 6px;
                    background-repeat: no-repeat; background-size: 100% 100%;
                    font-size: 9px; font-weight: 800; letter-spacing: 0.01em; line-height: 1.1;
                    text-align: center; color: #1b1e24; text-shadow: 0 1px 0 rgba(255,255,255,0.35);
                    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                    filter: drop-shadow(0 2px 3px rgba(0,0,0,0.5)); }
                /* Dark green on cream, not the hand's bright green on slate: the banner is a LIGHT cloth and
                   #7fe07f on it is unreadable. Same signal, legible on its own background. */
                .cf-banner.is-sharp { color: #10541c; }
                /* ── A PAINTED RIM OVER A CLIPPED PICTURE ────────────────────────────────────────────────
                   The rim is a drawn asset laid on top (one per type, tinted per rarity), and the picture
                   underneath is clipped to roughly the same silhouette so it cannot spill past the metal.
                   The clip is inset a shade tighter than the art so the rim covers the cut edge — a clip and
                   a painted rim never agree to the pixel, and the way to make that invisible is to let the
                   metal be the thing that ends the picture. */
                /* ── THE LEVEL, IN STARS, ALONG THE FOOT ────────────────────────────────────────────────
                   Small and gold on the card stock, sitting inside the moulding's bottom rail. Drawn as SVG
                   rather than set as a character: a star glyph is a different shape in every font and a
                   different WIDTH on every phone, and six of them have to fit inside 96px on every one. */
                .cf-stars { position: absolute; left: 0; right: 0; bottom: 4px; z-index: 4;
                    display: flex; justify-content: center; gap: 1.5px; pointer-events: none; }
                .cf-star { width: 8px; height: 8px; fill: #ffcb5e;
                    filter: drop-shadow(0 1px 1px rgba(0,0,0,0.85)); }
                /* THE SIXTH RUNG IS NOT A NUMBER AND NOT A STAR EITHER, IT IS A STONE. An enshrined pet wears
                   the form the stone gave it in the window; down here the stars take the stone's colour. */
                .cf-stars.is-light .cf-star { fill: #fff4d2; }
                .cf-stars.is-dark .cf-star { fill: #b9a4ef;
                    filter: drop-shadow(0 0 3px rgba(150,110,255,0.6)) drop-shadow(0 1px 1px rgba(0,0,0,0.85)); }

                .cf-art { position: relative; width: calc(100% - 16px); height: 53px; margin: 0 8px;
                    display: block; }
                .cf-art-in { position: absolute; inset: 3px; display: grid; place-items: center;
                    border-radius: 4px; overflow: hidden; box-shadow: inset 0 0 10px rgba(0,0,0,0.6); }
                .cf-rim { position: absolute; inset: 0; z-index: 2; pointer-events: none;
                    background-repeat: no-repeat; background-size: 100% 100%;
                    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5)); }
                /* ATTACK COMES TO A POINT; a SKILL is a rounded rectangle — Spire's tell for what a card does,
                   readable before a single word is. Powers have their ring drawn and waiting.
                   Inset INSIDE the painted opening, not flush with the box. A clip that reaches the corners
                   lets the picture sit outside the shield's shoulders — a sliver of sky above the fox, which
                   at a glance looks like the art is leaking out of its frame. The metal has to be the last
                   thing on every edge. */
                .cf-art.is-attack .cf-art-in { inset: 5px 6px 4px;
                    clip-path: polygon(2% 0, 98% 0, 98% 58%, 50% 100%, 2% 58%); }
                .cf-art.is-skill .cf-art-in { border-radius: 9px; }
                .cf-art-img { max-width: 96%; max-height: 40px; object-fit: contain;
                    filter: drop-shadow(0 2px 3px rgba(0,0,0,0.55)); }
                /* Full-bleed art fills its window; the fallback portrait is CONTAINED, because a pet sprite
                   cropped to a letterbox loses its head. Two jobs, two fits. */
                .cf-art-full { width: 100%; height: 100%; object-fit: cover; display: block; }
                /* Sitting ON the art window's bottom border, in the rarity colour with dark text. */
                .cf-type { position: relative; z-index: 3; margin-top: -7px; width: 34px; height: 15px;
                    display: grid; place-items: center; background-repeat: no-repeat; background-size: 100% 100%;
                    color: #1b1f27; font-size: 10px; line-height: 1;
                    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5)); }
                /* POSITIONED, or the stock eats it. The card's colour is an absolutely-positioned layer at
                   z-index 0, and a STATIC element paints below every positioned sibling no matter what order
                   they are in the markup — so the sentence went under the slab the moment the stock arrived,
                   and the cards shipped for two commits with no rules text on them at all. The banner and the
                   type tab survived only because they already carried a z-index of their own. */
                /* ⚠️ 12px OF SIDE PADDING, NOT 9. The moulding is a PICTURE laid over the card's edges
                   (frame.png, drawn with real rails), and the text box only knew about the box — so the
                   longest line on a card ran under the metal and came out with its first and last letters
                   sliced off: "Deal 11 damage to" reading as ")eal 11 damage tc" on the Firebreath card,
                   which looks like a rendering fault rather than a wide word. The rails are ~11px at this
                   size; the sentence stops before them and wraps instead. */
                .cf-text { font-family: var(--cf-card-font); position: relative; z-index: 1; flex: 1; width: 100%;
                    padding: 4px 12px 0; font-size: 10.5px; line-height: 1.16; text-align: center; color: #eef2f8;
                    overflow: hidden; overflow-wrap: break-word; }
                /* THE SIDE PADDING DOES NOT SHRINK WITH THE TYPE. It is there to clear the moulding's rails,
                   which are the same width whatever size the sentence is set at — buying two characters a
                   line back by moving the text under the metal is trading one clipped word for another. */
                .cf-text.is-small { font-size: 9.5px; line-height: 1.12; }
                .cf-text.is-tiny { font-size: 8.6px; line-height: 1.1; }
                /* The two words that decide the turn, lit. */
                .cf-key { color: #ffd75e; font-weight: 800; }
                /* An unmodified number is just text. One the fight has moved is called out — green up, red
                   down — and nothing else on the card changes, so the eye goes to the digit rather than to a
                   card that has started glowing. */
                .cf-num { font-weight: 800; font-style: normal; }
                .cf-num.is-up { color: #7fe07f; text-shadow: 0 0 6px rgba(80,220,110,0.5); }
                .cf-num.is-down { color: #ff8f7a; text-shadow: 0 0 6px rgba(255,90,60,0.45); }
            `}</style>
        </>
    );
}
