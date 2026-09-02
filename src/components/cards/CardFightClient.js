"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Kreon } from "next/font/google";
import {
    GiBiceps, GiCrackedShield, GiCrossedSwords, GiExitDoor, GiShield, GiSmallFire, GiSwordWound,
} from "react-icons/gi";

import {
    DRAG_SLOP, KEYWORDS, canPlay, cardById, endTurn, foeIntent, forfeit, incomingTotal, intentDamage,
    playCard, startFight, typeLook,
} from "@/lib/marketplace/cards-kit.js";
import { RARITY_META } from "@/lib/marketplace/rarity.js";

// 44% of the 460ms lunge below — the frame the animal actually reaches what it was thrown at. The health bar,
// the floating number and the screen jolt are all timed off this one value, because the whole point of the
// animation is that the consequence arrives WITH the cause rather than before it.
const IMPACT_MS = 200;

// ── ONE FIGHT, ON A PHONE ────────────────────────────────────────────────────────────────────────────────────
// You on the left, something off the Long Road on the right, five cards in your hand and a pile at each corner.
// Drag a card onto the foe, or tap it and then tap the foe — BOTH, deliberately: a phone wants the drag and a
// desktop rig wants the tap, and a card that can only be dragged is a card that cannot be tested from here.
//
// NO POINTER CAPTURE. setPointerCapture on the card is the obvious way to follow a drag and it silently kills
// mouse clicks in this codebase — it has already cost one afternoon. Window listeners instead, with a slop
// threshold below which a press is a tap and not a drag.

// ── THE CARD FACE IS NOT SET IN THE UI FONT ──────────────────────────────────────────────────────────────
// Luke: "i really dont like the font on the description". It was inheriting the site body face, which is a
// clean modern sans chosen to make a shop legible — correct for a page and wrong on a painted card, where it
// reads as a caption pasted onto a game. Kreon is a slab serif with the same weight of stroke as the ink
// contour the art is drawn with, and is the closest free face to the one Spire sets its own cards in. Scoped
// to this screen through next/font, so nothing else on the site changes and the file is fetched only by the
// people who open the fight.
const cardFont = Kreon({ subsets: ["latin"], weight: ["400", "600", "700"], display: "swap" });

const Sprite = ({ src, fallback, className, flip }) => {
    const [bad, setBad] = useState(false);
    const url = bad ? fallback : src;
    if (!url) return <span className={className} aria-hidden="true" />;
    // eslint-disable-next-line @next/next/no-img-element
    return (
        <img
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

// A hex from RARITY_META, softened to a wash — the banner is tinted BY the rarity rather than painted in it,
// or a Legendary card is a solid orange brick with unreadable text on it.
const rgb = (hex) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
    const n = m ? parseInt(m[1], 16) : 0x9aa0a6;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const wash = (hex, alpha) => `rgba(${rgb(hex).join(",")},${alpha})`;
/** The same colour, darker — the underside of a ribbon, so it reads as folded cloth rather than a flat bar. */
const shade = (hex, k) => `rgb(${rgb(hex).map((c) => Math.round(c * k)).join(",")})`;
/**
 * Ink that survives its own background. The pets run from a near-white bunny to a deep slate wolf, and a
 * ribbon painted in the pet's colour cannot assume white text works — on the pale ones it vanishes.
 * Rec. 601 luma, which is the cheap standard and correct enough for a decision with two outcomes.
 */
const inkOn = (hex) => {
    const [r, g, b] = rgb(hex);
    return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#16191f" : "#ffffff";
};
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
    if (!noArt) {
        // eslint-disable-next-line @next/next/no-img-element
        return (
            <img
                className="cf-art-full" src={`/images/cards/${card.id}.webp`} alt="" draggable="false"
                onError={() => setNoArt(true)}
            />
        );
    }
    return <Sprite src={pet?.url} className="cf-art-img" />;
};

/**
 * One card face, in the anatomy Spire settled on: the cost hanging off the corner, a name banner whose colour
 * IS the rarity, a framed window for the art, a tab naming the type, and the text underneath with its keywords
 * lit. Every one of those is a channel that does not cost a word — you can tell an Attack from a Skill, and a
 * Legendary from a Common, without reading anything.
 */
/** The emblem on the type plate. Crossed swords is an attack, a shield is a skill, a flame is a power. */
const TypeMark = ({ kind }) => {
    if (kind === "attack") return <GiCrossedSwords aria-hidden="true" />;
    if (kind === "power") return <GiSmallFire aria-hidden="true" />;
    return <GiShield aria-hidden="true" />;
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

const CardFace = ({ card, art, dim }) => {
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
            <span className="cf-banner" style={{ backgroundImage: `url(/images/cards/chrome/banner-${tint}.png)` }}>
                {card.name}
            </span>
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
                <TypeMark kind={card.kind} />
            </span>
            <span className="cf-text">{withKeywords(card.text)}</span>
        </>
    );
};

export default function CardFightClient({ fixture }) {
    const router = useRouter();
    const [fight, setFight] = useState(() => startFight({
        seed: fixture.seed,
        hero: fixture.hero,
        foes: fixture.foes,
    }));
    // ── THE HAND IS ALWAYS INSPECTING SOMETHING ─────────────────────────────────────────────────────
    // Luke: "I dont know that tap and hold is gonna be ideal. Oftentimes when you're playing Slay the Spire on
    // the computer you quickly hover over a bunch of different cards... it should already be in inspection
    // mode where it's like a radial dial when you swipe the cards left and right. Whatever's in the middle
    // would be active. And then you would drag it up to play it and target."
    //
    // He is right, and the reason is that hold-to-read charges you 320ms EVERY TIME to answer a question you
    // ask constantly. A mouse hover is free and instant; the phone equivalent has to be free and instant too.
    // So one card is always raised and readable, swiping left or right walks the hand, and playing is a
    // separate gesture entirely — up and out. Nothing is ever "armed" and nothing has to be held.
    const [active, setActive] = useState(2);
    const [drag, setDrag] = useState(null);
    const [floats, setFloats] = useState([]);
    const [peek, setPeek] = useState(null);
    const [acting, setActing] = useState(false);
    const [played, setPlayed] = useState(null);
    const [strike, setStrike] = useState(null);
    const [shaking, setShaking] = useState(false);
    // The card that has been thrown but whose damage has not landed yet: gone from the hand on screen, still
    // in the state underneath.
    const [spending, setSpending] = useState(null);

    const dragRef = useRef(null);
    const foeRefs = useRef([]);
    const partyRef = useRef(null);
    const fieldRef = useRef(null);
    const heroRef = useRef(null);
    const trayRef = useRef(null);
    const floatSeq = useRef(0);
    const playSeq = useRef(0);

    // The whole party's next swing. With one enemy this was the number over its head; with three it is
    // the only figure that answers what a turn actually asks — can I afford to take this?
    // A fresh hand of five arrives every turn and the thing you are reading should be the middle of it —
    // that is what "whatever's in the middle would be active" means once cards start moving. Keyed on the turn
    // rather than on the hand, so playing a card does NOT yank the carousel back to centre underneath you.
    const turnNo = fight.turn;
    useEffect(() => { setActive(2); }, [turnNo]);

    const incoming = incomingTotal(fight);
    // A hand shrinks as it is played, so the active index has to stay inside it — and when the last card on
    // the right is played, the one that takes its place is the new right-hand end, not a gap.
    const activeIndex = Math.max(0, Math.min(active, fight.hand.length - 1));
    const activeEntry = fight.hand[activeIndex] || null;

    // ── WHAT JUST HAPPENED, THROWN OFF WHOEVER IT HAPPENED TO ────────────────────────────────────────────
    // The engine hands back events precisely so this does not have to diff two states and guess. A number that
    // floats off the thing it happened to is the difference between "45" changing to "39" and being HIT.
    const pushFloats = useCallback((events) => {
        const made = [];
        for (const e of events) {
            if (e.type === "damage") made.push({ id: (floatSeq.current += 1), on: e.on, kind: "damage", text: `-${e.amount}` });
            else if (e.type === "block") made.push({ id: (floatSeq.current += 1), on: e.on, kind: "block", text: `+${e.amount}` });
            else if (e.type === "debuff") made.push({ id: (floatSeq.current += 1), on: e.on, kind: "debuff", text: `${e.key} ${e.amount}` });
        }
        if (!made.length) return;
        setFloats((cur) => [...cur, ...made]);
        const ids = new Set(made.map((m) => m.id));
        setTimeout(() => setFloats((cur) => cur.filter((f) => !ids.has(f.id))), 900);
    }, []);

    // ── ONE BEAT, ONE THING TO WATCH ─────────────────────────────────────────────────────────────────────
    // Spire holds the card you played LARGE in the middle while its effect resolves, and copying that was the
    // right call when a played card otherwise vanished into the discard and threw a number. It stops being
    // the right call the moment the PET starts crossing the sand, because then there are two things asking to
    // be looked at in the same third of a second and they are in the same part of the screen. Filmed, the card
    // rose straight through the party at the exact frame the wolf landed on the bruiser.
    //
    // So the two are now exclusive, and the rule is simply WHICH ONE IS THE EVENT:
    //   · an attack that sends an animal → the animal is the event, and no card is held up
    //   · a block, a heal, a buff → nothing crosses the sand, so the card is the only acknowledgement there is
    // Either way exactly one thing performs, which is what makes either of them readable.
    const commit = useCallback((uid, target = 0) => {
        if (!canPlay(fight, uid)) return;
        const entry = fight.hand.find((c) => c.uid === uid);
        const { state, events } = playCard(fight, uid, target === "self" ? 0 : target);
        const willStrike = Boolean(
            cardById(entry.id)?.damage
            && fixture.petArt[cardById(entry.id).pet]?.url
            && foeRefs.current[target === "self" ? 0 : target]
            && heroRef.current
        );
        if (!willStrike) {
            const shown = { id: (playSeq.current += 1), card: cardById(entry.id) };
            setPlayed(shown);
            setTimeout(() => setPlayed((cur) => (cur?.id === shown.id ? null : cur)), 360);
        }

        // ── AND THE ANIMAL ACTUALLY GOES AND DOES IT ─────────────────────────────────────────────────
        // Luke: "the animal that is associated to the card, that sprite would actually attack the enemy."
        // A number appearing over a foe says a thing happened TO it; a wolf crossing the sand and the screen
        // jolting says something DID it. The pet flies from the card to whatever was targeted, the floor
        // shakes when it lands, and the health bar tweens down behind it rather than snapping.
        const card = cardById(entry.id);
        const petArt = fixture.petArt[card.pet]?.url;
        if (petArt && card.damage) {
            const box = foeRefs.current[target === "self" ? 0 : target]?.getBoundingClientRect();
            const home = heroRef.current?.getBoundingClientRect();
            if (box && home) {
                const hit = {
                    id: (playSeq.current += 1), art: petArt,
                    x0: home.left + home.width / 2, y0: home.top + home.height * 0.45,
                    // Not the foe's centre: a sprite dropped dead-centre on another sprite ERASES it, and
                    // filming showed the bruiser simply replaced by a wolf. Landing a third of the way in from
                    // the near edge overlaps him, which is what a blow looks like, and leaves him on screen.
                    x1: box.left + box.width * 0.34, y1: box.top + box.height * 0.45,
                };
                setStrike(hit);
                // ── THE DAMAGE ARRIVES WHEN THE ANIMAL DOES ──────────────────────────────────────────
                // Filmed, the first version had the bar reading 62/68 and a red -6 floating at 166ms, and the
                // wolf did not reach the bruiser until 300. The consequence was on screen before the cause —
                // which is precisely the thing the animation was added to fix, so it was making the problem
                // worse while looking like it was solving it.
                // So the fight's state is HELD until impact. The card is out of your hand from the frame you
                // let go — the spending marker hides it, and the card rising over the tray is the receipt —
                // and the numbers, the bar and the jolt all land together a fifth of a second later.
                setSpending(uid);
                setTimeout(() => {
                    setFight(state);
                    pushFloats(events);
                    setSpending(null);
                    setShaking(true);
                }, IMPACT_MS);
                setTimeout(() => setShaking(false), IMPACT_MS + 220);
                setTimeout(() => setStrike((cur) => (cur?.id === hit.id ? null : cur)), 500);
                return;
            }
        }
        // Everything with nothing in flight — blocks, heals, a card played with no reachable target — resolves
        // on the spot. There is no blow to wait for.
        setFight(state);
        pushFloats(events);
    }, [fight, pushFloats]);

    // Giving up ends the fight as a loss, decided in the rules rather than by poking the state from here.
    const onForfeit = useCallback(() => {
        if (fight.over) return;
        setFight(forfeit(fight));
    }, [fight]);

    const onEndTurn = useCallback(() => {
        if (fight.over || acting) return;
        // A beat before the foe swings. Without it the damage lands in the same frame as the tap and reads as
        // the button hurting you rather than the thing across the sand.
        setActing(true);
        setTimeout(() => {
            const { state, events } = endTurn(fight);
            setFight(state);
            pushFloats(events);
            setActing(false);
        }, 420);
    }, [fight, acting, pushFloats]);

    /**
     * WHICH of them is under the pointer. Returns a foe index, or -1.
     *
     * A thumb is not a cursor, so each foe claims a generous box — and because three boxes side by side will
     * overlap once padded, the NEAREST centre wins rather than the first box that happens to contain the
     * point. Otherwise the left-hand foe quietly eats every drop aimed between two of them.
     */
    const foeUnder = useCallback((x, y) => {
        let best = -1;
        let bestDist = Infinity;
        fight.foes.forEach((foe, i) => {
            if (foe.hp <= 0) return;
            const box = foeRefs.current[i]?.getBoundingClientRect();
            if (!box) return;
            const pad = 22;
            const inside = x >= box.left - pad && x <= box.right + pad && y >= box.top - pad && y <= box.bottom + pad;
            if (!inside) return;
            const d = Math.hypot(x - (box.left + box.width / 2), y - (box.top + box.height / 2));
            if (d < bestDist) { bestDist = d; best = i; }
        });
        return best;
    }, [fight.foes]);

    /** Would a release here play this card, and at whom? Returns an index, "self", or null. */
    const dropTarget = useCallback((uid, x, y) => {
        const entry = fight.hand.find((c) => c.uid === uid);
        const card = cardById(entry?.id);
        if (!card) return null;
        if (card.target === "foe") {
            const i = foeUnder(x, y);
            return i >= 0 ? i : null;
        }
        // A card you play on yourself is dropped anywhere on the field, which is what Spire does with its
        // untargeted cards: there is nothing to point at, so pointing is not asked for.
        const box = fieldRef.current?.getBoundingClientRect();
        if (!box) return null;
        return y >= box.top && y <= box.bottom ? "self" : null;
    }, [fight.hand, foeUnder]);


    useEffect(() => {
        const move = (e) => {
            const d = dragRef.current;
            if (!d) return;
            const dx = e.clientX - d.sx;
            const dy = e.clientY - d.sy;
            const moved = d.moved || Math.hypot(dx, dy) > DRAG_SLOP;
            // Axis locked on the first real movement and never revisited.
            const axis = d.axis || (moved ? (Math.abs(dx) > Math.abs(dy) ? "swipe" : "lift") : null);
            if (axis === "swipe") {
                const steps = Math.round(-dx / 46);
                const want = Math.max(0, Math.min(fight.hand.length - 1, d.fromActive + steps));
                setActive(want);
                dragRef.current = { ...d, x: e.clientX, y: e.clientY, moved, axis };
                setDrag(null);
                return;
            }
            dragRef.current = { ...d, x: e.clientX, y: e.clientY, moved, axis };
            setDrag(dragRef.current);
        };
        const up = (e) => {
            const d = dragRef.current;
            if (!d) return;
            dragRef.current = null;
            setDrag(null);
            // A swipe has already done its work on the way; there is nothing to resolve on release.
            if (d.axis === "swipe") return;
            // Under the slop it was a TAP: that card becomes the one being read.
            if (!d.moved) { setActive(d.index); return; }
            const target = dropTarget(d.uid, e.clientX, e.clientY);
            if (target !== null) commit(d.uid, target);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
        return () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", up);
        };
    }, [commit, dropTarget]);

    /**
     * ── WHAT "HOVER" MEANS WITHOUT A MOUSE ──────────────────────────────────────────────────────────
     * On a desktop you rest the pointer on a card and it comes up to be read. A phone has no resting
     * state — a finger is either off the glass or pressing it — so the equivalent has to be borrowed from
     * time instead of position: PRESS AND HOLD.
     *
     * A tap still selects, a drag still throws, and holding still for a third of a second reads the card.
     * The three do not collide because they are separated by what the finger does next: lift quickly, move
     * past the slop, or do neither. The hold is cancelled the moment either of the other two happens, so
     * nobody who meant to drag ever gets a card in their face.
     */
    /**
     * One press, three possible meanings, decided by what the finger does next:
     *   · sideways  → walk the hand, one card per 46px, and read whatever lands in the middle
     *   · upward    → pick the card up and aim it
     *   · neither   → make the card you touched the active one
     * The axis is decided ONCE, on the first movement past the slop, and then held — otherwise a throw that
     * drifts sideways halfway up turns into a swipe and drops the card.
     */
    const startDrag = (e, uid, index) => {
        if (fight.over || acting) return;
        dragRef.current = {
            uid, index, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY,
            moved: false, axis: null, fromActive: activeIndex,
        };
        setDrag(dragRef.current);
    };

    // Tapping a body plays the ACTIVE card at it — the half of the interaction a mouse can do, and the half
    // that has to name a target now there are three of them. Tapping yourself is how a heal finds you.
    const onFoeTap = (i) => {
        if (!activeEntry || fight.foes[i]?.hp <= 0) return;
        if (cardById(activeEntry.id)?.target === "foe") commit(activeEntry.uid, i);
    };
    const onHeroTap = () => {
        if (!activeEntry) return;
        if (cardById(activeEntry.id)?.target === "self") commit(activeEntry.uid, "self");
    };

    const newFight = () => router.push(`/marketplace/cards?seed=${Math.floor(Math.random() * 900000) + 1000}`);
    const replay = () => {
        setFloats([]);
        setActive(0);
        setFight(startFight({ seed: fixture.seed, hero: fixture.hero, foes: fixture.foes }));
    };

    const dragCard = drag?.moved ? cardById(fight.hand.find((c) => c.uid === drag.uid)?.id) : null;

    // ── WHERE THE ARROW GOES ─────────────────────────────────────────────────────────────────────────────
    // Struck from where the card started in the hand to wherever the pointer is now, bowed upward so it reads
    // as a throw rather than as a wire. Only for cards that take a target: a card you play on yourself has
    // nothing to point at, and Spire draws no arrow for those either.
    //
    // AND THE CARD STAYS PUT WHILE IT DOES. Glued to the pointer, a card dragged at a foe near the top of the
    // screen runs clean off the top edge — you end up aiming with something you cannot see. Spire pins the
    // held card above the hand and lets the ARROW travel, which is both legible and one less thing under your
    // thumb. Cards with no target still follow the pointer: there is nothing to point at, so the card IS the
    // feedback.
    const ghostAt = (() => {
        if (!drag?.moved || !dragCard) return null;
        if (dragCard.target !== "foe") return { x: drag.x, y: drag.y };
        // PARKED AT THE BOTTOM CENTRE while you aim, small, and out of the way. Pinned above the card you
        // picked up, it sat directly under the party — so it covered the enemy you were pointing at, and the
        // arrow from it to the pointer was two inches long and hidden behind it. That was the "janky" arrow:
        // there was barely an arrow. Down here the throw is always a real distance and nothing is under it.
        const seam = trayRef.current?.getBoundingClientRect().top;
        const w = typeof window === "undefined" ? 0 : window.innerWidth;
        // Parked to the LEFT, over your own side, not dead centre. Centred it sat directly under the party and
        // the arrow came out a seventeen-pixel vertical sliver hidden behind it — measured, not guessed. From
        // over here every throw is a diagonal with real length, and nothing covers the thing being aimed at.
        //
        // AND PARKED OFF THE BOTTOM EDGE, not off the tray seam. Hung at the seam the card is 104px tall and
        // the fighters stand in the 190px directly above it, so moving it off the enemy just moved it onto the
        // hero: at 412x780 it covered his feet AND his health bar, which is the one number you are reading
        // while you decide who to hit. Measuring down from the bottom of the screen instead puts it clear of
        // every bar at both 780 and the 441 a real phone leaves, and it lands on the HAND — the only thing on
        // screen that does not matter while you are aiming.
        const h = typeof window === "undefined" ? 0 : window.innerHeight;
        const y = h ? h - 24 : (Number.isFinite(seam) ? seam : drag.y);
        return { x: w * 0.2, y, small: true };
    })();

    const aimArrow = useMemo(() => {
        if (!drag?.moved || dragCard?.target !== "foe" || !ghostAt) return null;
        const w = typeof window === "undefined" ? 0 : window.innerWidth;
        const h = typeof window === "undefined" ? 0 : window.innerHeight;
        // Struck from the held card itself rather than from where the thumb first pressed, because that is
        // where the card now IS.
        // Leaves from the TOP of the parked card rather than its middle, so no part of the ribbon is behind it.
        const [sx, sy, ex, ey] = [ghostAt.x, ghostAt.y - 96, drag.x, drag.y];
        // The bow: lifted above the higher of the two ends, and deeper the further the throw.
        const cx = (sx + ex) / 2;
        const cy = Math.min(sy, ey) - Math.min(120, 40 + Math.hypot(ex - sx, ey - sy) * 0.22);
        // A quadratic's direction at the end is simply control -> end, which is the angle the head sits at.
        const ang = Math.atan2(ey - cy, ex - cx);
        // The head is not a separate triangle any more — it is the last three points of the ribbon itself
        // (Luke: "make it not so clear that the triangle part is so different than the line"). Two overlapping
        // shapes always show their seam, however carefully they are placed; one shape has no seam to show.
        const rot = ([px, py]) => [
            ex + px * Math.cos(ang) - py * Math.sin(ang) - 15 * Math.cos(ang),
            ey + px * Math.sin(ang) + py * Math.cos(ang) - 15 * Math.sin(ang),
        ];
        const barbL = rot([0, -13]);
        const barbR = rot([0, 13]);
        const tip = rot([25, 0]);

        // ── A TAPERED RIBBON RATHER THAN A STROKED LINE ──────────────────────────────────────────────
        // An SVG stroke is one width for its whole length, and a bezier drawn that way reads as a wire
        // between two objects. Theirs swells toward the target, which is what makes it read as thrown. So
        // the curve is walked, the perpendicular is taken at each step, and the two offset edges are joined
        // into one polygon — thin at the card, wide under the head.
        const STEPS = 22;
        const at = (u) => [
            (1 - u) * (1 - u) * sx + 2 * (1 - u) * u * cx + u * u * ex,
            (1 - u) * (1 - u) * sy + 2 * (1 - u) * u * cy + u * u * ey,
        ];
        const left = [];
        const right = [];
        for (let i = 0; i <= STEPS; i += 1) {
            const u = i / STEPS;
            const [px, py] = at(u);
            // Direction from the derivative of the quadratic, normalised; the perpendicular is (-dy, dx).
            const dx = 2 * (1 - u) * (cx - sx) + 2 * u * (ex - cx);
            const dy = 2 * (1 - u) * (cy - sy) + 2 * u * (ey - cy);
            const len = Math.hypot(dx, dy) || 1;
            const half = (2 + 7 * u) / 2;
            const nx = (-dy / len) * half;
            const ny = (dx / len) * half;
            left.push([px + nx, py + ny]);
            right.push([px - nx, py - ny]);
        }
        // Up one edge, out to the left barb, to the tip, back to the right barb, and down the other edge.
        const ribbon = [...left, barbL, tip, barbR, ...right.reverse()]
            .map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`)
            .join(" ");

        return { w, h, sx, sy, cx, cy, ex, ey, ribbon, live: foeUnder(ex, ey) >= 0 };
    }, [drag, dragCard, foeUnder, ghostAt?.x, ghostAt?.y]);
    const selectedCard = activeEntry ? cardById(activeEntry.id) : null;
    const aiming = dragCard?.target === "foe" || selectedCard?.target === "foe";
    // Your own body lights when the card in the middle is one you would play on yourself.
    const selfLit = dragCard ? dragCard.target === "self" : selectedCard?.target === "self";
    // ── THE GLOW MEANS "THIS WILL LAND" ──────────────────────────────────────────────────────────────────
    // It used to mean "you are holding an attack", which is true for the whole drag and therefore tells you
    // nothing — the foe sat lit while you hovered over your own hero. Lit follows the same test the release
    // does. With no pointer in play (the tap path) a selected attack lights it, because there the selection IS
    // the aim.
    const hurt = (who) => floats.some((f) => f.on === who && f.kind === "damage");
    // ── THE HAND IS A FAN, NOT A SHELF ───────────────────────────────────────────────────────────────────
    // Spire's cards sit tilted at rest, each rotated a few degrees and dropped slightly at the edges, so a
    // hand reads as something HELD. Ours were five upright rectangles in a row, which reads as a toolbar —
    // and that difference is most of why they looked like UI and Spire's look like cards.
    //
    // Rotated about a point below the card (transform-origin 50% 130%) so the arc is struck from somewhere
    // near the wrist. The angle widens with a fuller hand, and the overlap tightens to match, because ten
    // cards and five have to live in the same 375px.
    const handSize = fight.hand.length;
    // 5 x 84 wide at -18 is a 348px row, and 22px of shoulder each side for the fan put it at 392 —
    // seventeen wider than the phone it has to sit in, so the outer cost gems hung off the screen. At -24 the
    // row is 368 and everything is on the glass. What you lose is the tail of a sentence at REST, which is
    // what picking the card up is for.
    const overlap = handSize > 5 ? -58 : -38;
    const spread = handSize > 5 ? 2.8 : 4;
    const fanOf = (i) => {
        const mid = (handSize - 1) / 2;
        const off = i - mid;
        // The tilt is linear off the middle; the drop is quadratic, which is what makes it an arc rather
        // than a slope.
        return { rot: off * spread, drop: (off ** 2) * 2.4 };
    };

    // WHICH foe is lit: the one the pointer is over while dragging. With a card merely selected and no
    // pointer in play, every living one lights, because any of them is a legal tap.
    const aimAt = drag?.moved && dragCard?.target === "foe" ? foeUnder(drag.x, drag.y)
        : selectedCard?.target === "foe" ? "any" : -1;

    const pileList = useMemo(() => {
        if (!peek) return [];
        const list = peek === "draw" ? fight.draw : fight.discard;
        // The DRAW pile is shown sorted, never in order — seeing the order would hand you the next five cards
        // and there would be nothing left to decide. The discard is shown as it fell, which is public anyway.
        const cards = list.map((c) => cardById(c.id));
        return peek === "draw" ? [...cards].sort((a, b) => a.name.localeCompare(b.name)) : cards;
    }, [peek, fight.draw, fight.discard]);

    return (
        // The font's class goes on the root and reaches the faces through a variable, so the piles, the HUD
        // and the buttons stay in the site's own face — a card is set in a card font, a button is not.
        <div className={`cf${shaking ? " is-shaking" : ""}`} style={{ "--cf-card-font": cardFont.style.fontFamily }}>
            {/* ── THE FIELD ─────────────────────────────────────────────────────────────────────────── */}
            <div className={`cf-field${aiming ? " is-aiming" : ""}`} ref={fieldRef}>
                <Sprite src="/images/cards/scene-arena.webp" className="cf-bg" />

                {/* ── EVERYTHING BUT THE CARDS LIVES UP HERE ──────────────────────────────────────────
                    Luke's call, looking at the restaged screen: the piles, the energy and End Turn go to the
                    TOP and the bottom of the phone belongs entirely to the hand. It is a departure from
                    Spire — theirs sits beside the cards, which a landscape frame can afford — and it is the
                    right one for a thumb: the controls are out of the arc the hand is dragged through, and
                    nothing you press by accident is next to the card you meant to pick up.
                    The seed is gone from the screen with them; it lives in the URL, which is where it is
                    actually used. */}
                <div className="cf-top">
                    <button type="button" className="cf-pile" onClick={() => setPeek("draw")} aria-label={`Draw pile, ${fight.draw.length} cards`}>
                        <Sprite src="/images/cards/chrome/card-back.png" className="cf-pile-art" />
                        <span className="cf-pile-n">{fight.draw.length}</span>
                    </button>
                    <div className="cf-energy" aria-label={`${fight.energy} of ${fight.energyMax} energy`}>
                        <Sprite src="/images/cards/chrome/energy-gem.png" className="cf-energy-art" />
                        <span className="cf-energy-n">{fight.energy}<i>/{fight.energyMax}</i></span>
                    </div>
                    {/* Small, in the middle, and a door rather than a word — it is the one control up here
                        you are not meant to reach for. */}
                    <button type="button" className="cf-forfeit" onClick={onForfeit} disabled={Boolean(fight.over)} title="Forfeit" aria-label="Forfeit">
                        <GiExitDoor aria-hidden="true" />
                    </button>
                    <button type="button" className="cf-end" onClick={onEndTurn} disabled={Boolean(fight.over) || acting}>
                        <Sprite src="/images/cards/chrome/button-plate.png" className="cf-end-art" />
                        <span className="cf-end-label">{acting ? "…" : "End turn"}</span>
                    </button>
                    <button type="button" className="cf-pile is-discard" onClick={() => setPeek("discard")} aria-label={`Discard pile, ${fight.discard.length} cards`}>
                        <Sprite src="/images/cards/chrome/card-back.png" className="cf-pile-art" />
                        <span className="cf-pile-n">{fight.discard.length}</span>
                    </button>
                </div>

                <div className="cf-turn">Turn {fight.turn}</div>

                <div
                    className={`cf-fighter cf-hero${hurt("hero") ? " is-hit" : ""}${selfLit ? " is-target" : ""}`}
                    ref={heroRef}
                    onClick={onHeroTap}
                >
                    <div className="cf-floats">
                        {floats.filter((f) => f.on === "hero").map((f) => (
                            <span key={f.id} className={`cf-float is-${f.kind}`}>{f.text}</span>
                        ))}
                    </div>
                    <span className="cf-body"><Sprite src={fixture.hero.art} className="cf-sprite" flip={fixture.hero.flip} /></span>
                    <span className="cf-shade" aria-hidden="true" />
                    <Bar unit={fight.hero} />
                </div>

                {/* ── THE PARTY ────────────────────────────────────────────────────────────────────────
                    Three of them, and each one is its own target: its own health, its own block, its own
                    announced swing, and its own place to drop a card. One enemy could only ever ask "do I
                    attack or do I block"; three ask the question a hand of cards is actually for, which is
                    where the damage should go. */}
                <div className="cf-party" ref={partyRef}>
                    {fight.foes.map((foe, i) => {
                        const dead = foe.hp <= 0;
                        const swing = intentDamage(fight, i);
                        const beat = foeIntent(fight, i);
                        return (
                            <div
                                key={foe.id}
                                ref={(el) => { foeRefs.current[i] = el; }}
                                className={`cf-fighter cf-foe${hurt(foe.id) ? " is-hit" : ""}${acting ? " is-acting" : ""}`
                                    + `${aimAt === i || aimAt === "any" ? " is-target" : ""}${dead ? " is-down" : ""}`}
                                onClick={() => onFoeTap(i)}
                            >
                                {dead ? null : (
                                    <div className="cf-intent" title={beat.label}>
                                        <span className="cf-intent-marks">
                                            {beat.damage ? <GiCrossedSwords aria-hidden="true" /> : null}
                                            {beat.block ? <GiShield className="is-guard" aria-hidden="true" /> : null}
                                        </span>
                                        {beat.damage ? <b>{swing}</b> : null}
                                    </div>
                                )}
                                <div className="cf-floats">
                                    {floats.filter((f) => f.on === foe.id).map((f) => (
                                        <span key={f.id} className={`cf-float is-${f.kind}`}>{f.text}</span>
                                    ))}
                                </div>
                                {/* Every fighter on the Road is drawn facing right, so on this side of the
                                    sand they all turn round — and the mirror lives on the WRAPPER, not on the
                                    image, because a CSS animation overrides an inline style for as long as it
                                    runs. The breath was replacing the scaleX(-1) and quietly turning every foe
                                    back to face the wall. */}
                                <span className="cf-body is-mirrored">
                                    <Sprite src={foe.art} fallback={foe.artFallback} className="cf-sprite" />
                                </span>
                                <span className="cf-shade" aria-hidden="true" />
                                {dead ? null : <Bar unit={foe} />}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── THE HAND ──────────────────────────────────────────────────────────────────────────── */}
            <div className="cf-tray" ref={trayRef}>
                <div className="cf-hand">
                    {fight.hand.map((entry, i) => {
                        const card = cardById(entry.id);
                        const playable = canPlay(fight, entry.uid);
                        const isDragging = drag?.uid === entry.uid && drag.moved;
                        return (
                            <button
                                key={entry.uid}
                                type="button"
                                className={`cf-card${i === activeIndex ? " is-picked" : ""}${playable ? "" : " is-spent"}${isDragging || entry.uid === spending ? " is-ghosted" : ""}`}
                                style={{
                                    marginLeft: i === 0 ? 0 : overlap,
                                    // The picked card comes OUT of the fan — straightened, lifted and grown,
                                    // and above its neighbours, because it is the one being read.
                                    // ── A DIAL SHRINKS ITS NEIGHBOURS; IT DOES NOT INFLATE ITS MIDDLE ──
                                    // Measured at 412x780, the first cut put the raised card's top at y=556
                                    // with the health bars at 623 and the sprites' feet at 619 — so reading a
                                    // card covered both the thing you were aiming at and the number telling
                                    // you whether it was worth it. There is no room above the hand to grow
                                    // into, because the fighters are standing there.
                                    // So the emphasis is made by CONTRAST instead: the middle card sits at its
                                    // true size and its neighbours are turned down and away, which is what a
                                    // physical dial actually looks like and costs no vertical space at all.
                                    transform: i === activeIndex
                                        ? "translateY(-22px) scale(1.04)"
                                        : `rotate(${fanOf(i).rot}deg) translateY(${fanOf(i).drop}px) scale(0.84)`,
                                    // ── SCALE FROM THE CARD'S OWN FOOT ──────────────────────────────────
                                    // The fan's origin is 50% 130%, a point below the tray, which is right for
                                    // rotating a spread of cards around a common pivot and badly wrong for
                                    // growing one: an origin that far below the card converts a 4% scale into
                                    // a ~40px climb, which is how the raised card ended up standing in the
                                    // health bars. Anchored to its own bottom edge, the lift is the lift.
                                    transformOrigin: i === activeIndex ? "50% 100%" : "50% 130%",
                                    zIndex: i === activeIndex ? 6 : i,
                                    filter: i === activeIndex ? "none" : "brightness(0.72) saturate(0.8)",
                                }}
                                onPointerDown={(e) => startDrag(e, entry.uid, i)}
                                onContextMenu={(e) => e.preventDefault()}
                            >
                                <CardFace card={card} art={fixture.petArt[card.pet]} dim={!playable} />
                            </button>
                        );
                    })}
                </div>

            </div>

            {/* ── THE AIM ──────────────────────────────────────────────────────────────────────────────
                Spire draws a thick curved arrow from the card to whatever you are pointing at, and it is not
                decoration: on a phone your thumb is ON the target, so without it the only feedback that you
                are aiming at the right thing is hidden under your own hand. It arcs (a straight line reads as
                a UI connector), and it turns gold and thickens the moment the release would actually land. */}
            {aimArrow ? (
                <svg className="cf-aim" viewBox={`0 0 ${aimArrow.w} ${aimArrow.h}`} aria-hidden="true">
                    {/* Textured rather than flat: a gradient down the length so it has a lit edge and a shaded
                        one, which is what stops a solid colour reading as a UI shape. */}
                    <defs>
                        <linearGradient id="cfAimFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#fff2c4" />
                            <stop offset="45%" stopColor="#ffd75e" />
                            <stop offset="100%" stopColor="#c98a12" />
                        </linearGradient>
                        <linearGradient id="cfAimDead" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="rgba(236,242,250,0.6)" />
                            <stop offset="100%" stopColor="rgba(150,162,178,0.42)" />
                        </linearGradient>
                    </defs>
                    <polygon className={`cf-aim-line${aimArrow.live ? " is-live" : ""}`} points={aimArrow.ribbon} />
                </svg>
            ) : null}

            {/* The pet crossing the sand to land the blow. */}
            {strike ? (
                <img
                    key={strike.id}
                    className="cf-strike" src={strike.art} alt="" draggable="false"
                    style={{
                        left: strike.x0, top: strike.y0,
                        "--cf-dx": `${strike.x1 - strike.x0}px`,
                        "--cf-dy": `${strike.y1 - strike.y0}px`,
                    }}
                />
            ) : null}

            {/* The card you just played, held large in the middle for half a second while its effect lands. */}
            {played ? (
                <div className="cf-played" key={played.id}>
                    <div className="cf-played-card">
                        <CardFace card={played.card} art={fixture.petArt[played.card.pet]} />
                    </div>
                </div>
            ) : null}

            {/* The card under your thumb, drawn at the pointer so it is never hidden by the finger holding it. */}
            {dragCard ? (
                <div className={`cf-drag${ghostAt.small ? " is-parked" : ""}`} style={{ left: ghostAt.x, top: ghostAt.y }}>
                    <CardFace card={dragCard} art={fixture.petArt[dragCard.pet]} />
                </div>
            ) : null}

            {peek ? (
                <div className="cf-over" onClick={() => setPeek(null)}>
                    <div className="cf-sheet" onClick={(e) => e.stopPropagation()}>
                        <h2>{peek === "draw" ? "Draw pile" : "Discard"}</h2>
                        <p className="cf-note">{peek === "draw" ? "Sorted — the order is the game." : "In the order it fell."}</p>
                        <div className="cf-sheet-cards">
                            {pileList.map((card, i) => (
                                <div key={`${card.id}-${i}`} className="cf-card is-static">
                                    <CardFace card={card} art={fixture.petArt[card.pet]} />
                                </div>
                            ))}
                            {pileList.length ? null : <p className="cf-note">Empty.</p>}
                        </div>
                        <button type="button" className="cf-btn" onClick={() => setPeek(null)}>Close</button>
                    </div>
                </div>
            ) : null}

            {fight.over ? (
                <div className="cf-over">
                    <div className="cf-sheet cf-result">
                        <GiSwordWound className="cf-result-ico" aria-hidden="true" />
                        {/* Giving up is not the same as being killed, and the engine already knows which one
                            happened, so the sheet says the true thing rather than the convenient one. */}
                        <h2>
                            {fight.over === "win" ? "The sand is yours"
                                : fight.gaveUp ? "You walked away" : "You fall"}
                        </h2>
                        <p className="cf-note">
                            {fight.over === "win"
                                ? `Turn ${fight.turn}, and you walked out on ${fight.hero.hp} of ${fight.hero.hpMax}.`
                                : `${fight.foes.filter((f) => f.hp > 0).length} of them still standing.`}
                        </p>
                        {/* The seed is off the screen everywhere now, this button included — it lives in the
                            URL, which is what a replay actually reads. And with the old Leave chip gone from
                            the top strip, the way back to the town is here. */}
                        <div className="cf-result-btns">
                            <button type="button" className="cf-btn" onClick={() => router.push("/marketplace/town")}>Leave</button>
                            <button type="button" className="cf-btn" onClick={replay}>Replay this fight</button>
                            <button type="button" className="cf-btn is-primary" onClick={newFight}>New fight</button>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* ── GLOBAL, AND IT HAS TO BE ────────────────────────────────────────────────────────────
                styled-jsx scopes a rule to the elements THIS component renders, and the sprite and the card
                face are rendered by <Sprite> and <CardFace> one level down — so a scoped `.cf-sprite` matched
                nothing at all and the foe rendered at its natural 1024px, which is a screenshot worth keeping
                as a warning. Every selector below is under the `.cf` prefix, which is this screen and nothing
                else. Same trap the mine hit; the answer there was global CSS too. */}
            <style jsx global>{`
                /* ── ONE SPACE, NOT A PICTURE ABOVE A SHELF ──────────────────────────────────────────────
                   Measured off Spire's own frame with a percentage grid laid on it: their fighters stand with
                   their feet at 62%, health bars at 70%, the hand from 78% — and the FLOOR RUNS EDGE TO EDGE
                   behind all of it. There is no UI band anywhere on that screen.
                   Ours had the fighters at about the same height and then stopped the world at 70% and put a
                   black slab under it, which is exactly why they read as being "at the top" (Luke): everything
                   below them was dead. The scene is the whole screen now and the hand floats over it. */
                .cf { -webkit-touch-callout: none; position: fixed; inset: 0; height: 100dvh; z-index: 4000;
                    background: #0a0b0f; color: #e9edf2; user-select: none; -webkit-user-select: none; overflow: hidden;
                    /* ── THE FLOOR IS WHEREVER THE HAND ISN'T ────────────────────────────────────────────
                       The fighters were placed with a percentage and the tray is a FIXED height, because a
                       card is a fixed number of pixels tall — so the two only agreed at one screen size. At
                       412x780 the party stood 12px inside its own health bars; at 375x441, which is what a
                       real phone leaves after browser chrome, the entire fighter column sat 44px INSIDE the
                       hand. It looked like a layout choice on the tall screen and like a bug on the short one,
                       and it was the same bug both times.
                       One number instead: how much of the bottom of the screen the hand owns. Everything that
                       has to stand on the ground is placed off it, so the two cannot drift apart again. */
                    --cf-tray-h: 188px; }

                .cf-field { position: absolute; inset: 0; overflow: hidden; }
                /* ── THE ARENA IS ZOOMED IN, AND THAT IS THE FIX FOR THE FLOATING ───────────────────────
                   arena-bg puts its sand at 76% of the picture — everything above that is seating and sky.
                   Shown edge to edge on a portrait phone the image fills the height exactly, so the sand
                   landed at 76% of the SCREEN while the fighters stood at 62%: they were standing in mid-air
                   in front of the stands, a hundred pixels above the floor. Anchored to the bottom and scaled
                   past the frame, the sand rises to about 64% and they stand ON it. What that costs is the
                   bunting and the sky, which is the right thing to lose — Spire's camera is low and close for
                   the same reason. */
                .cf-bg { position: absolute; left: 0; right: 0; bottom: 0; width: 100%; height: max(100%, 560px);
                    object-fit: cover; object-position: 50% 100%; opacity: 0.95; }
                /* Darkened at the foot rather than ENDED there, so the cards have something to sit against
                   while the floor keeps going. */
                .cf-field::after { content: ""; position: absolute; inset: 0; pointer-events: none;
                    background: linear-gradient(180deg, rgba(8,9,13,0.5), rgba(8,9,13,0.05) 34%,
                        rgba(8,9,13,0.3) 60%, rgba(8,9,13,0.86) 86%, rgba(8,9,13,0.95)); }

                /* Both on the LEFT. The seed sat top-right and a foe with a long intent ("GUARDED SWING") grew its pill
                   straight through it — and the intent is the one thing on this screen that must never be
                   obstructed. */
                /* ── THE CONTROL STRIP ────────────────────────────────────────────────────────────────────
                   Everything that is not a card, across the top, clear of the arc a thumb drags through.
                   The seed went with the old chrome: it lives in the URL, which is where it is used. */
                .cf-top { position: absolute; top: 0; left: 0; right: 0; z-index: 6;
                    display: flex; align-items: center; justify-content: space-between; gap: 6px;
                    padding: calc(6px + env(safe-area-inset-top)) 8px 12px;
                    background: linear-gradient(180deg, rgba(8,9,13,0.92), rgba(8,9,13,0.5) 64%, rgba(8,9,13,0)); }
                .cf-forfeit { display: grid; place-items: center; width: 28px; height: 28px; padding: 0;
                    background: rgba(10,12,16,0.5); border: 1px solid #39424f; border-radius: 999px;
                    color: #9aa6b4; font-size: 15px; }
                .cf-forfeit:disabled { opacity: 0.35; }
                .cf-turn { position: absolute; top: calc(62px + env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); z-index: 3;
                    font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: #9fb0c4; }

                /* Feet at ~62% of the screen and bars at ~66% — where Spire stands its fighters, measured. */
                /* clamp, not a bare percentage. The tray is a roughly FIXED height — a control strip plus a hand — so
                   on a short screen a percentage puts the fighters underneath it: at 375x441, which is what a 667-tall
                   phone actually leaves, 29% landed the health bars behind the End Turn plate. The floor is 215px
                   above the bottom at worst, 38% when there is room, and never more than 320. */
/* LOWER. There is a whole band of empty floor between the fighters and the hand, and standing them
                   down into it is most of what makes them look like they are ON it rather than hung in front
                   of it. */
                .cf-fighter { position: absolute; bottom: calc(var(--cf-tray-h) + 10px); width: 44%; display: flex; flex-direction: column;
                    align-items: center; z-index: 2; }
                .cf-hero { left: 2%; width: 34%; }
                /* ── THE PARTY SHARES THE RIGHT-HAND HALF ────────────────────────────────────────────────
                   A row of slots rather than one fighter: they sit shoulder to shoulder, each with its own
                   footing on the same floor line, and the row itself is what the fighters are positioned by.
                   Ends aligned to the BASE, because they are all standing on the same ground and a party
                   centred on its own boxes would have three different foot heights. */
                .cf-party { position: absolute; right: 0; bottom: 0; top: 0; width: 66%;
                    display: flex; align-items: flex-end; justify-content: center; pointer-events: none; }
                /* Negative margins: they stand close enough to overlap, which is what lets them be full size. */
                .cf-foe { position: relative; left: auto; right: auto; bottom: calc(var(--cf-tray-h) + 10px);
                    width: 38%; margin: 0 -4%; cursor: pointer; pointer-events: auto; }
                /* The one you are pointing at comes to the front of the crowd. */
                .cf-foe.is-target { z-index: 3; }
/* SAME SCALE AS THE PLAYER. Shrinking them to fit three abreast made the fight look like a man
                   against three toys; Luke's call is that overlapping is the lesser evil, and he is right — a
                   crowd standing shoulder to shoulder is what three enemies in an arena would actually look
                   like. They keep the hero's sprite size and the row lets them overlap. */
                /* 22vh of a 441px viewport is 97px and 22vh of a 780px one is 172 — the same rule reads
                   as "as big as there is room for", which is exactly right, and the floor under them no longer
                   moves when it changes. */
                .cf-party .cf-sprite { height: clamp(78px, 22vh, 190px); }
                /* ── FOUR BARS, NOT ONE BAR ──────────────────────────────────────────────────────────
                   At 375 wide the three foe bars plus the hero's ran edge to edge at the same height and
                   touched, and the eye reads a continuous red strip as ONE gauge — the screen was telling you
                   the party had 34/34/68/68/48/48 hit points. A bar belongs to a body, so it has to be
                   narrower than the body it hangs under and there has to be air between it and the next one. */
                .cf-party .cfb { max-width: 74px; }
                .cf-party .cfb-hp { font-size: 13px; }
                .cf-party .cf-intent b { font-size: 17px; }
                .cf-party .cf-intent-marks { font-size: 17px; }
                /* A body on the sand: no bar, no telegraph, and it stops breathing. */
                .cf-foe.is-down { opacity: 0.34; filter: grayscale(0.85); pointer-events: none; }
                .cf-foe.is-down .cf-body { animation: none; transform: scaleX(-1) rotate(88deg) translateY(14%); }
                .cf-foe.is-down .cf-shade { animation: none; opacity: 0.5; }
                /* Smaller on a short screen, or the fighter block grows tall enough to push its INTENT PILL up behind
                   the control strip — and the intent is the one thing on this screen that can never be covered. */
/* ── THEY BREATHE ────────────────────────────────────────────────────────────────────────
                   A fighter standing perfectly still is a picture of a fighter. Two or three pixels of rise
                   and fall is the whole difference between a scene and a screenshot, and it costs nothing —
                   the two are deliberately out of step (different durations, one delayed) so they do not
                   bob in unison like a pair of metronomes. The shadow under each pulses very slightly against
                   the body, which is what sells the lift as a lift rather than a slide. */
                .cf-body { display: block; width: 100%; transform-origin: 50% 100%;
                    animation: cfBreathe 3.4s ease-in-out infinite; }
                .cf-body.is-mirrored { transform: scaleX(-1); animation-name: cfBreatheMirrored; }
                .cf-body.is-mirrored .cf-sprite { animation: none; }
                .cf-foe .cf-body { animation-duration: 4.1s; animation-delay: -1.2s; }
                .cf-sprite { display: block; width: 100%; height: clamp(78px, 22vh, 190px); object-fit: contain;
                    filter: drop-shadow(0 6px 6px rgba(0,0,0,0.45)); }
                .cf-shade { animation: cfShade 3.4s ease-in-out infinite; }
                .cf-foe .cf-shade { animation-duration: 4.1s; animation-delay: -1.2s; }
                /* The hit shake takes the sprite over entirely: a shove has to beat a breath. */
                .cf-fighter.is-hit .cf-body { animation: cfShake 260ms ease-out; }
                /* THE POOL ON THE GROUND. A drop-shadow is a copy of the sprite offset behind it, which reads
                   as a sticker lifted off the page; what puts a figure ON a floor is a soft dark ellipse at
                   its feet, and every fighter in Spire has one. This is the "no contact shadow = pasted on"
                   note from the farm, and it was the whole of "our characters are floating". */
/* Tighter and closer: a pool the width of a stance rather than the width of the column, pulled up
                   under the feet. A wide soft shadow reads as a figure hovering over a smudge. */
                .cf-shade { width: 42%; height: 13px; margin: -12px 0 2px;
                    background: radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0.85), rgba(0,0,0,0.45) 40%, transparent 68%); }
                .cf-foe.is-target .cf-sprite { filter: drop-shadow(0 0 12px #ffd75e) drop-shadow(0 10px 12px rgba(0,0,0,0.55)); }
                .cf-foe.is-acting { transform: translateX(-14px); transition: transform 200ms ease-out; }

                .cf-intent { display: flex; flex-direction: column; align-items: center; gap: 1px;
                    margin-bottom: 4px; }
                .cf-intent-marks { display: inline-flex; align-items: center; gap: 3px; font-size: 21px;
                    color: #ffd0c4; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.9)); }
                .cf-intent-marks .is-guard { font-size: 17px; color: #9fd2ff; }
                /* Outlined rather than boxed, the way a number painted onto a scene has to be. */
                .cf-intent b { font-family: var(--cf-card-font); font-size: 20px; font-weight: 700; color: #fff;
                    line-height: 1;
                    text-shadow: 0 0 4px rgba(0,0,0,0.95), 1px 1px 0 rgba(0,0,0,0.95), -1px 1px 0 rgba(0,0,0,0.95),
                        1px -1px 0 rgba(0,0,0,0.95), -1px -1px 0 rgba(0,0,0,0.95); }

                /* Clear of the intent, which is the first thing in this box — a -6 landing on top of the
                   number he is about to hit you for obscures the one thing the next decision is made from. */
                .cf-floats { position: absolute; top: 46px; left: 0; right: 0; display: flex; flex-direction: column;
                    align-items: center; gap: 2px; pointer-events: none; z-index: 4; }
                .cf-float { font-size: 22px; font-weight: 800; text-shadow: 0 2px 6px rgba(0,0,0,0.8);
                    animation: cfFloat 900ms ease-out forwards; }
                .cf-float.is-damage { color: #ff8f9a; }
                .cf-float.is-block { color: #8fd3ff; }
                .cf-float.is-debuff { color: #ffcf6a; font-size: 14px; }

                /* ── THE TRAY FLOATS ON THE SCENE ────────────────────────────────────────────────────────
                   column-reverse, so the controls sit ABOVE the hand while staying second in the markup. In
                   Spire's landscape frame the energy, End Turn and the piles sit BESIDE the hand; a portrait
                   phone has no room either side of five cards, so on ours they become a strip across the top
                   of the tray. Done in CSS rather than by reordering the JSX, because the hand and the
                   controls have separate reasons to be in the order they are read. */
                /* The tray was flush with the bottom edge and the fanned cards hang BELOW their tray by
                   design, so the bottom line of every resting card was off-screen — measured 813 on a 780
                   viewport. A card whose text is cut off is a card you have to pick up to read, which is the
                   whole thing the dial exists to avoid. */
                .cf-tray { position: absolute; left: 0; right: 0; bottom: 40px; z-index: 5; background: none;
                    display: flex; flex-direction: column-reverse;
                    padding: 0 6px calc(2px + env(safe-area-inset-bottom)); }
                /* The lift on a picked card happens INSIDE this padding, and the cost badge sits inside the
                   card rather than hanging off it — at the end of a five-card hand the outside corner is
                   half a screen-edge away and the badge was being cut in half by it. */
                /* BLED OFF THE BOTTOM. Their cards run past the edge of the screen, so what you read at rest is the
                   cost, the name, the picture and the type — the sentence is what picking one up is for. Ours were
                   fully visible and therefore had to be tiny to fit. */
                .cf-hand { display: flex; justify-content: center; align-items: flex-end; padding: 26px 10px 0;
                    margin-bottom: -18px; }
                /* 80x108 — near enough Spire's 0.78 wide-to-tall, and the reason the text can be read at all.
                   The 72x114 this started at was a 0.63 card, too narrow for its own sentence, which is what
                   forced the font down to 8px in the first place. */
                /* ── BUILT THE WAY THEIRS IS BUILT ───────────────────────────────────────────────────────
                   Read off Spire's own shop screen at full size, which corrected the guess made from the
                   small card images: the card BODY is neutral grey stone on every card in the game, and the
                   rarity colour lives in three places only — the ribbon, the art window's border, and the
                   type tab. Forethought (uncommon, blue) and Chrysalis (rare, gold) sit on the identical
                   grey slab. Colouring the whole frame by rarity, which is what a first look suggests, makes
                   a hand of five look like five different games. */
                /* The box paints NOTHING — no background, no border. The drawn moulding is the card's outside
                   edge, and anything the box painted would show past it wherever the two silhouettes disagree,
                   which is exactly what put a green line down the side of the frog. */
                .cf-card { position: relative; flex: 0 0 auto; width: 96px; height: 138px; padding: 0 0 8px;
                    display: flex; flex-direction: column; align-items: center; touch-action: none;
                    background: none; border: 0; border-radius: 9px;
                    filter: drop-shadow(0 4px 7px rgba(0,0,0,0.55));
                    transform-origin: 50% 130%; transition: transform 140ms ease-out; }
                .cf-stock { position: absolute; inset: 4px; z-index: 0; border-radius: 6px; }
                /* The picked card STRAIGHTENS out of the fan, lifts and grows. Its transform is set inline
                   (the fan angle is per-card data), so this rule carries only what does not vary. */
                .cf-card.is-picked { filter: drop-shadow(0 0 5px rgba(255,215,94,0.85)) drop-shadow(0 10px 16px rgba(0,0,0,0.6)); }
                /* ── THE MOULDING ── one painted frame for every card in the game, hollow, laid over the
                   pet-coloured stock. Neutral metal on purpose: the colour comes from the card underneath,
                   the way their frame takes the character's. Above the art, under the ribbon and the cost. */
/* Every card that is DRAWN anywhere gets the moulding, not just the ones sitting in the hand.
                   Luke: "why does the card lose its border when it's played?" — because this rule was hung on
                   .cf-card alone, and the card you are holding and the card performing centre stage are two
                   other elements. A card is a card wherever it is. */
                .cf-card::after, .cf-drag::after, .cf-played-card::after {
                    content: ""; position: absolute; inset: -1px; z-index: 2; pointer-events: none;
                    background-image: url(/images/cards/chrome/frame.png);
                    background-repeat: no-repeat; background-size: 100% 100%; }
                .cf-card.is-spent { opacity: 0.5; }
                .cf-card.is-ghosted { opacity: 0.22; }
                .cf-card.is-static { margin: 0; box-shadow: none; transform: none; }
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
                /* THE RIBBON OVERHANGS THE CARD and its ends fold down past the top edge — it is draped over
                   the card rather than printed on it. Solid rarity colour, white text: on their cards the
                   ribbon IS the rarity read, so it has to be the strongest colour on the face. */
                /* LAID OVER THE ART, IN THE PET'S OWN COLOUR. Two faults in one strip: it sat in its own lane
                   above the picture rather than on it, and keyed to rarity it was a grey bar on every card in
                   a starting deck — the fox is orange, the frog green, the wolf slate, and those are the
                   colours a hand should be. Rendered after the art and pulled back up over it, so it overlaps
                   the top of the window the way a banner nailed across a frame does. */
                /* THE RIBBON, AND THE BUG THAT WAS IN IT. The clip below makes the two ENDS hang lower than
                   the bar — folded tails. Laid across the middle of the art, that clipped underside let the
                   picture show through immediately beneath the name, which reads exactly as "the sprite is
                   covering the banner" (Luke, off his phone). It belongs above the window with only the tails
                   draping over its top corners, which is where Spire's sits, and the bar is tall enough now
                   that the clip takes tail and not text. */
                /* PAINTED CLOTH, not a clipped div. The folded tails are in the picture now, which is what the
                   clip-path was faking — and faking badly: its clipped underside was letting the card art show
                   through beneath the name, which read as the sprite covering the banner. */
                /* Set in the card face, not the UI face — see the note on cardFont at the top. */
                .cf-banner { font-family: var(--cf-card-font); font-weight: 700; font-size: 10.5px;
                    position: relative; z-index: 3; width: calc(100% + 14px);
                    margin: 4px -7px -6px; padding: 3px 9px 6px;
                    background-repeat: no-repeat; background-size: 100% 100%;
                    font-size: 9px; font-weight: 800; letter-spacing: 0.01em; line-height: 1.1;
                    text-align: center; color: #1b1e24; text-shadow: 0 1px 0 rgba(255,255,255,0.35);
                    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                    filter: drop-shadow(0 2px 3px rgba(0,0,0,0.5)); }
                /* FULL BLEED inside a thick coloured window. The sprite floating on a dark panel with margins
                   read as a sticker stuck to a card; theirs is a painted illustration filling the frame. */
                /* ── A PAINTED RIM OVER A CLIPPED PICTURE ────────────────────────────────────────────────
                   The rim is a drawn asset laid on top (one per type, tinted per rarity), and the picture
                   underneath is clipped to roughly the same silhouette so it cannot spill past the metal.
                   The clip is inset a shade tighter than the art so the rim covers the cut edge — a clip and
                   a painted rim never agree to the pixel, and the way to make that invisible is to let the
                   metal be the thing that ends the picture. */
                .cf-art { position: relative; width: calc(100% - 16px); height: 53px; margin: 0 8px;
                    display: block; }
                .cf-art-in { position: absolute; inset: 3px; display: grid; place-items: center;
                    border-radius: 4px; overflow: hidden; box-shadow: inset 0 0 10px rgba(0,0,0,0.6); }
                .cf-rim { position: absolute; inset: 0; z-index: 2; pointer-events: none;
                    background-repeat: no-repeat; background-size: 100% 100%;
                    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5)); }
                /* ATTACK COMES TO A POINT; a SKILL is a rounded rectangle — Spire's tell for what a card does,
                   readable before a single word is. Powers have their ring drawn and waiting. */
                /* Inset INSIDE the painted opening, not flush with the box. A clip that reaches the corners
                   lets the picture sit outside the shield's shoulders — a sliver of sky above the fox, which
                   at a glance looks like the art is leaking out of its frame. The metal has to be the last
                   thing on every edge. */
                .cf-art.is-attack .cf-art-in { inset: 5px 6px 4px;
                    clip-path: polygon(2% 0, 98% 0, 98% 58%, 50% 100%, 2% 58%); }
                .cf-art.is-skill .cf-art-in { border-radius: 9px; }
                .cf-art-img { max-width: 96%; max-height: 40px; object-fit: contain;
                    filter: drop-shadow(0 2px 3px rgba(0,0,0,0.55)); }
                /* Sitting ON the art window's bottom border, in the rarity colour with dark text. */
                .cf-type { position: relative; z-index: 3; margin-top: -7px; width: 34px; height: 15px;
                    display: grid; place-items: center; background-repeat: no-repeat; background-size: 100% 100%;
                    color: #1b1f27; font-size: 10px; line-height: 1;
                    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5)); }
                /* Bounded, or a two-clause card writes straight out through the side of itself — which is what
                   Pounce did, and it looked like a rendering fault rather than a card. */
                /* Clipped, not spilled. The card is a fixed box and a three-line card was writing its last line out
                   through the bottom edge onto the tray behind it. */
                /* POSITIONED, or the stock eats it. The card's colour is an absolutely-positioned layer at
                   z-index 0, and a STATIC element paints below every positioned sibling no matter what order
                   they are in the markup — so the sentence went under the slab the moment the stock arrived,
                   and the cards shipped for two commits with no rules text on them at all. The banner and the
                   type tab survived only because they already carried a z-index of their own. */
                .cf-text { font-family: var(--cf-card-font); position: relative; z-index: 1; flex: 1; width: 100%;
                    padding: 4px 9px 0; font-size: 10.5px; line-height: 1.16; text-align: center; color: #eef2f8;
                    overflow: hidden; overflow-wrap: break-word; }
                /* The two words that decide the turn, lit. */
                .cf-key { color: #ffd75e; font-weight: 800; }


                /* A little card back with the count struck on it, and its name under it. Ours keeps the word
                   where Spire drops it, because a draw pile and a discard pile drawn from the same back are
                   otherwise the same picture twice. */
                .cf-pile { position: relative; width: 34px; padding: 0; background: none; border: 0;
                    display: flex; flex-direction: column; align-items: center; }
                .cf-pile-art { width: 30px; height: 42px; object-fit: contain;
                    filter: drop-shadow(0 3px 5px rgba(0,0,0,0.6)); }
                .cf-pile.is-discard .cf-pile-art { transform: rotate(7deg); opacity: 0.82; }
                .cf-pile-n { position: absolute; top: 26px; left: 50%; transform: translateX(-50%);
                    min-width: 19px; padding: 1px 4px; border-radius: 999px; background: #b8322f;
                    border: 1px solid #12161c; color: #fff; font-size: 11px; font-weight: 800; line-height: 1.3;
                    text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.6); }

                /* THE BIGGEST THING IN THE TRAY, which is what it should be: every decision on a turn is made
                   against it, and it used to be the smallest. */
                .cf-energy { position: relative; width: 46px; height: 46px;
                    display: grid; place-items: center; }
                .cf-energy-art { width: 100%; height: 100%; object-fit: contain;
                    filter: drop-shadow(0 3px 6px rgba(0,0,0,0.6)); }
                .cf-energy-n { position: absolute; font-family: var(--cf-card-font); font-size: 18px;
                    font-weight: 700; color: #fff; text-shadow: 0 2px 3px rgba(0,0,0,0.85); line-height: 1; }
                .cf-energy-n i { font-style: normal; font-size: 11px; opacity: 0.85; }

                .cf-end { position: relative; width: 104px; height: 40px; padding: 0;
                    background: none; border: 0; display: grid; place-items: center; }
                .cf-end-art { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill;
                    filter: drop-shadow(0 3px 5px rgba(0,0,0,0.55)); }
                .cf-end-label { position: relative; font-family: var(--cf-card-font); font-size: 14px;
                    font-weight: 700; color: #1b1f27; text-shadow: 0 1px 0 rgba(255,255,255,0.35); }
                .cf-end:disabled { opacity: 0.55; }

                /* Full-bleed art fills its window; the fallback portrait is CONTAINED, because a pet sprite
                   cropped to a letterbox loses its head. Two jobs, two fits. */
                .cf-art-full { width: 100%; height: 100%; object-fit: cover; display: block; }

                /* ── THE AIM ── over everything, hit-testing nothing. */
                .cf-aim { position: fixed; inset: 0; width: 100vw; height: 100dvh; z-index: 4900;
                    pointer-events: none; }
                .cf-aim-line { fill: url(#cfAimDead); stroke: rgba(0,0,0,0.5); stroke-width: 1.2;
                    stroke-linejoin: round; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.7)); }
                .cf-aim-line.is-live { fill: url(#cfAimFill); stroke: rgba(60,36,0,0.75); }

                /* The animal, mid-flight. Fires from the card, arrives at the target, lands, gone — half a
                   second in total, which is as long as a blow is allowed to take when a turn holds three. */
                /* A LUNGE, NOT A VISIT. The first cut reached the target at 52% and then spent the whole
                   back half of the animation hovering there, which films as a wolf teleporting onto a man and
                   standing on him. Out fast, connect at 44%, and immediately back toward home — the retreat is
                   what makes the arrival read as a hit rather than as an arrival. */
                .cf-strike { position: fixed; z-index: 4980; width: 76px; height: 76px; object-fit: contain;
                    pointer-events: none; transform: translate(-50%, -50%);
                    filter: drop-shadow(0 6px 10px rgba(0,0,0,0.6));
                    animation: cfStrike 460ms cubic-bezier(0.35, 0, 0.3, 1) forwards; }
                @keyframes cfStrike {
                    0% { transform: translate(-50%, -50%) scale(0.6) rotate(-16deg); opacity: 0; }
                    18% { transform: translate(calc(-50% + var(--cf-dx) * 0.28), calc(-50% + var(--cf-dy) * 0.28))
                        scale(0.95) rotate(-8deg); opacity: 1; }
                    44% { transform: translate(calc(-50% + var(--cf-dx)), calc(-50% + var(--cf-dy)))
                        scale(1.16) rotate(8deg); opacity: 1; }
                    58% { transform: translate(calc(-50% + var(--cf-dx) * 1.06), calc(-50% + var(--cf-dy) * 1.0))
                        scale(1.12) rotate(11deg); opacity: 1; }
                    100% { transform: translate(calc(-50% + var(--cf-dx) * 0.42), calc(-50% + var(--cf-dy) * 0.5))
                        scale(0.72) rotate(-4deg); opacity: 0; }
                }
                /* The whole arena takes the hit, briefly. Small — a jolt, not an earthquake. */
                .cf.is-shaking .cf-field { animation: cfJolt 200ms ease-out; }
                @keyframes cfJolt {
                    0% { transform: translate(0, 0); }
                    25% { transform: translate(-4px, 3px); }
                    55% { transform: translate(3px, -2px); }
                    80% { transform: translate(-2px, 1px); }
                    100% { transform: translate(0, 0); }
                }

                /* NOTE: the press-and-hold read overlay lived here and is gone — the hand inspects
                   continuously now, so there is nothing to summon. */
                .cf-read { position: fixed; inset: 0; z-index: 5100; display: grid; place-items: center;
                    background: rgba(6,7,10,0.72); pointer-events: none; }
                .cf-read-card { position: relative; width: 96px; height: 138px; padding: 0 0 8px;
                    display: flex; flex-direction: column; align-items: center;
                    transform: scale(2.1); animation: cfRead 140ms ease-out; }
                .cf-read-card::after { content: ""; position: absolute; inset: -1px; z-index: 2;
                    pointer-events: none; background-image: url(/images/cards/chrome/frame.png);
                    background-repeat: no-repeat; background-size: 100% 100%; }
                @keyframes cfRead { from { transform: scale(1.5); opacity: 0; } to { transform: scale(2.1); opacity: 1; } }

                /* ── THE CARD, LEAVING ─────────────────────────────────────────────────────────────────
                   This used to be the whole show: the card held centre-field at 1.5x for 640ms, because
                   without it a played card vanished into the discard and threw a number, and that one missing
                   beat was most of what made the screen feel cheap next to Spire's.
                   It is not the show any more. The PET crosses the sand now, and filming the two together made
                   the problem obvious — for the entire flight the card was parked on top of the arena at one
                   and a half times size, so the blow we had just built happened behind it. Two things
                   competing to be the acknowledgement, and the one that covered the other won.
                   So the card gives way. It rises off the hand, small, and is gone in a third of a second,
                   low enough that it never crosses the fighters. The animal is the event; this is just the
                   card getting out of the way on its path to the discard. */
                .cf-played { position: fixed; left: 0; right: 0; bottom: 22%; z-index: 4950;
                    display: grid; place-items: center; pointer-events: none; }
                .cf-played-card { position: relative; width: 96px; height: 138px; padding: 0 0 8px;
                    display: flex; flex-direction: column; align-items: center;
                    animation: cfPerform 340ms cubic-bezier(0.2, 0.9, 0.3, 1) forwards; }

                /* Parked: smaller and lower, because while it is aiming it is a label for what is being
                   thrown rather than the thing you are looking at. */
                .cf-drag.is-parked { transform: translate(-50%, -104%) scale(0.72) rotate(0deg); opacity: 0.94; }
                .cf-drag { position: fixed; z-index: 5000; width: 96px; height: 138px; padding: 0 0 8px;
                    display: flex; flex-direction: column; align-items: center; pointer-events: none;
                    background: none;
                    /* HELD ABOVE THE POINTER, not on it. Centred on the thumb, the card covered the foe
                       completely — you were aiming at a thing you could no longer see, and on a phone the
                       thumb is already taking a bite out of that half of the screen. */
                    transform: translate(-50%, -118%) scale(0.94) rotate(-3deg); border: 0;
                    border: 1px solid #ffd75e; border-radius: 10px; box-shadow: 0 14px 26px rgba(0,0,0,0.6); }

                .cf-over { position: fixed; inset: 0; z-index: 5200; display: grid; place-items: center; padding: 16px;
                    background: rgba(6,7,10,0.78); }
                .cf-sheet { width: min(420px, 100%); max-height: 82dvh; overflow-y: auto; padding: 16px;
                    background: #12161f; border: 1px solid #2c3340; border-radius: 14px; text-align: center; }
                .cf-sheet h2 { margin: 0 0 4px; font-size: 18px; }
                .cf-note { margin: 0 0 12px; font-size: 12px; color: #93a1b3; }
                .cf-sheet-cards { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-bottom: 14px; }
                .cf-result-ico { font-size: 34px; color: #ff8f9a; }
                .cf-result-btns { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
                .cf-btn { padding: 10px 14px; border-radius: 10px; border: 1px solid #2c3340; background: #1a202b;
                    color: #e9edf2; font-weight: 700; font-size: 13px; }
                .cf-btn.is-primary { border-color: #7a6320; background: linear-gradient(180deg, #ffd75e, #e0a92c); color: #241a03; }

                /* Named for this screen so they cannot collide with another component's keyframes — which has
                   happened here before, and the symptom is somebody else's animation playing on your element. */
                /* Up out of the hand, held big, then gone — the card doing the thing rather than vanishing. */
                @keyframes cfPerform {
                    0% { opacity: 0; transform: translateY(40px) scale(0.82); }
                    30% { opacity: 1; transform: translateY(0) scale(1.02); }
                    100% { opacity: 0; transform: translateY(-30px) scale(0.86); }
                }
                /* 3px was honest and invisible — filmed at ten frames over two and a half seconds you could
                   not tell it from a still. A breath has to be seen to be doing its job, so it is six pixels
                   with a degree of sway, which reads as weight shifting rather than a sprite sliding. */
                @keyframes cfBreathe {
                    0%, 100% { transform: translateY(0) rotate(-0.5deg) scaleY(1); }
                    50% { transform: translateY(-6px) rotate(0.5deg) scaleY(1.02); }
                }
                /* The foe is mirrored by its wrapper, so its breath has to carry the mirror too — otherwise
                   the animation's transform drops the scaleX and he spins round twice a cycle. */
                @keyframes cfBreatheMirrored {
                    0%, 100% { transform: scaleX(-1) translateY(0) rotate(0.5deg) scaleY(1); }
                    50% { transform: scaleX(-1) translateY(-6px) rotate(-0.5deg) scaleY(1.02); }
                }
                @keyframes cfShade {
                    0%, 100% { opacity: 1; transform: scaleX(1); }
                    50% { opacity: 0.74; transform: scaleX(0.9); }
                }
                @keyframes cfFloat { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-36px); } }
                @keyframes cfShake {
                    0% { transform: translateX(0); } 25% { transform: translateX(-7px); }
                    50% { transform: translateX(6px); } 75% { transform: translateX(-3px); } 100% { transform: translateX(0); }
                }
            `}</style>
        </div>
    );
}

/** Name, health, and the block standing in front of it. */
/** Health, and whatever is stuck to the body it belongs to. No name: the fighter is the identification. */
function Bar({ unit }) {
    const pct = Math.max(0, Math.min(100, (unit.hp / unit.hpMax) * 100));
    return (
        <div className="cfb">
            <div className={`cfb-track${unit.block > 0 ? " is-guarded" : ""}`}>
                <div className="cfb-fill" style={{ width: `${pct}%` }} />
                <span className="cfb-hp">{unit.hp} / {unit.hpMax}</span>
                {/* ── BLOCK SITS ON THE BAR, AT THE FRONT ──────────────────────────────────────────────
                    Armour is the thing standing in front of your health, so it is drawn in front of the bar
                    rather than filed in the status row underneath with the debuffs. A shield with a number,
                    at the near end, and the bar takes a cold edge while it holds. */}
                {unit.block > 0 ? (
                    <span className="cfb-guard" title={`Block ${unit.block}`}>
                        <GiShield aria-hidden="true" /><i>{unit.block}</i>
                    </span>
                ) : null}
            </div>
            {/* ── STATUS AS ICONS, NOT SENTENCES ──────────────────────────────────────────────────────
                Spire puts a row of small marked icons under the health bar, and the reason is arithmetic:
                three statuses written as words ("Vulnerable 2", "Weak 1", "Strength 3") is a wrapping
                paragraph under a 168px bar on a phone. The title carries the word for anyone who needs it. */}
            <div className="cfb-tags">
                {unit.vulnerable > 0 ? (
                    <span className="cfb-tag is-vuln" title={`Vulnerable ${unit.vulnerable} — takes 50% more damage`}>
                        <GiCrackedShield aria-hidden="true" />{unit.vulnerable}
                    </span>
                ) : null}
                {unit.weak > 0 ? (
                    <span className="cfb-tag is-weak" title={`Weak ${unit.weak} — deals 25% less damage`}>
                        <GiSwordWound aria-hidden="true" />{unit.weak}
                    </span>
                ) : null}
                {unit.strength > 0 ? (
                    <span className="cfb-tag is-str" title={`Strength ${unit.strength}`}>
                        <GiBiceps aria-hidden="true" />{unit.strength}
                    </span>
                ) : null}
            </div>
            <style jsx global>{`
/* Narrower and thinner than it was: theirs is about as wide as the fighter, not as wide as the
                   column he stands in, and the NUMBER is the loud part rather than the bar. */
                .cfb { width: 100%; max-width: 96px; }
                /* LEANER, and sitting under the fighter rather than being a widget beside them. Theirs is a
                   thin bar with the number over it; ours was a fat rounded pill, which is the shape of a
                   progress indicator on a settings page. */
/* Theirs is a lean trough with the number drawn OVER it, bigger than the bar is tall, outlined
                   rather than boxed — it reads as part of the picture instead of a widget with a caption. Ours
                   was a rounded pill with a border, which is a progress indicator on a settings page. */
                .cfb-track { position: relative; height: 8px; border-radius: 1px; overflow: visible;
                    background: #17090c; box-shadow: inset 0 1px 2px rgba(0,0,0,0.9), 0 0 0 1px rgba(0,0,0,0.55); }
                .cfb-track.is-guarded { box-shadow: inset 0 1px 2px rgba(0,0,0,0.9), 0 0 0 1px rgba(150,205,255,0.75); }
                .cfb-guard { position: absolute; left: -13px; top: 50%; transform: translateY(-50%);
                    display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px;
                    color: #bfe2ff; font-size: 22px; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.9)); }
                .cfb-guard i { position: absolute; font-style: normal; font-family: var(--cf-card-font);
                    font-size: 12px; font-weight: 700; color: #10222f; }
                .cfb-fill { height: 100%; border-radius: 1px; background: linear-gradient(180deg, #f0505c, #8f1420);
                    box-shadow: inset 0 1px 0 rgba(255,255,255,0.25);
                    transition: width 420ms cubic-bezier(0.2, 0.8, 0.3, 1); }
                .cfb-hp { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%);
                    display: grid; place-items: center; font-family: var(--cf-card-font); font-size: 17px;
                    font-weight: 700; letter-spacing: 0.01em; color: #fff;
                    text-shadow: 0 0 3px rgba(0,0,0,0.95), 1px 1px 0 rgba(0,0,0,0.95), -1px 1px 0 rgba(0,0,0,0.95),
                        1px -1px 0 rgba(0,0,0,0.95), -1px -1px 0 rgba(0,0,0,0.95); }
/* Under the bar for both fighters, the way theirs are — buffs and debuffs belong to the body they
                   are stuck to, not to a panel somewhere else on the screen. */
                .cfb-tags { display: flex; gap: 4px; justify-content: center; flex-wrap: wrap; margin-top: 6px; min-height: 18px; }
                .cfb-tag { display: inline-flex; align-items: center; gap: 2px; padding: 1px 5px; border-radius: 999px;
                    font-size: 10px; font-weight: 800; background: rgba(10,12,16,0.85); border: 1px solid #3a4354; }
                .cfb-tag.is-block { color: #8fd3ff; border-color: #33566e; }
                .cfb-tag.is-vuln { color: #ffcf6a; border-color: #6e5a24; }
                .cfb-tag.is-weak { color: #c8a6ff; border-color: #4c3d6e; }
                .cfb-tag.is-str { color: #ff9f6a; border-color: #6e4a2c; }
            `}</style>
        </div>
    );
}
