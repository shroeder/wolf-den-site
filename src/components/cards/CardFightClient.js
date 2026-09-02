"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GiBiceps, GiCrackedShield, GiCrossedSwords, GiShield, GiSwordWound } from "react-icons/gi";

import {
    DRAG_SLOP, KEYWORDS, canPlay, cardById, endTurn, foeIntent, intentDamage, playCard, startFight,
} from "@/lib/marketplace/cards-kit.js";
import { RARITY_META } from "@/lib/marketplace/rarity.js";

// ── ONE FIGHT, ON A PHONE ────────────────────────────────────────────────────────────────────────────────────
// You on the left, something off the Long Road on the right, five cards in your hand and a pile at each corner.
// Drag a card onto the foe, or tap it and then tap the foe — BOTH, deliberately: a phone wants the drag and a
// desktop rig wants the tap, and a card that can only be dragged is a card that cannot be tested from here.
//
// NO POINTER CAPTURE. setPointerCapture on the card is the obvious way to follow a drag and it silently kills
// mouse clicks in this codebase — it has already cost one afternoon. Window listeners instead, with a slop
// threshold below which a press is a tap and not a drag.

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
/** Frame paint for one card: a tinted slab and its edge. */
const frameStyle = (hue) => ({
    background: `linear-gradient(180deg, ${deep(hue, 0.5)} 0%, ${deep(hue, 0.68)} 26%, ${deep(hue, 0.84)} 100%)`,
    borderColor: deep(hue, 0.28),
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
const CardFace = ({ card, art, dim }) => {
    const meta = RARITY_META[art?.rarity] || RARITY_META.common;
    const hue = art?.color || meta.color;
    return (
        <>
            <span className={`cf-cost${dim ? " is-dim" : ""}`}><i>{card.cost}</i></span>
            {/* The ribbon sits ABOVE the picture with its folded ends draping over the window's top corners —
                which is where Spire puts it. Laid fully across the art, its own clipped underside let the
                picture show through directly under the name, and that reads as the sprite covering it. */}
            <span
                className="cf-banner"
                style={{
                    background: `linear-gradient(180deg, ${meta.color} 0%, ${meta.color} 62%, ${shade(meta.color, 0.68)} 100%)`,
                    color: inkOn(meta.color),
                    textShadow: inkOn(meta.color) === "#ffffff" ? "0 1px 2px rgba(0,0,0,0.6)" : "0 1px 0 rgba(255,255,255,0.3)",
                }}
            >
                {card.name}
            </span>
            {/* THE WINDOW'S SHAPE IS THE CARD'S TYPE. An attack comes to a point at the bottom, a skill is a
                rounded rectangle — Spire's own tell, and it means you can sort a hand by what the cards DO
                without reading one of them. The rim is the rarity, painted as the container behind a 2px
                inset rather than as a border, because a border does not follow a clip-path and the pointed
                bottom would lose its edge. */}
            <span className={`cf-art is-${card.kind}`} style={{ background: meta.color }}>
                <span className="cf-art-in" style={{ background: `radial-gradient(ellipse at 50% 62%, ${wash(hue, 0.34)}, rgba(6,8,12,0.94))` }}>
                    <CardArt card={card} pet={art} />
                </span>
            </span>
            <span className="cf-type" style={{ background: meta.color, color: inkOn(meta.color) }}>
                {card.kind === "attack" ? "Attack" : "Skill"}
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
        foe: fixture.foe,
    }));
    const [selected, setSelected] = useState(null);
    const [drag, setDrag] = useState(null);
    const [floats, setFloats] = useState([]);
    const [peek, setPeek] = useState(null);
    const [acting, setActing] = useState(false);

    const dragRef = useRef(null);
    const foeRef = useRef(null);
    const fieldRef = useRef(null);
    const floatSeq = useRef(0);

    const intent = foeIntent(fight);
    const incoming = intentDamage(fight);

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

    const commit = useCallback((uid) => {
        if (!canPlay(fight, uid)) return;
        const { state, events } = playCard(fight, uid);
        setFight(state);
        pushFloats(events);
        setSelected(null);
    }, [fight, pushFloats]);

    const onEndTurn = useCallback(() => {
        if (fight.over || acting) return;
        setSelected(null);
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

    /** Would a release here play this card? Foe cards want the foe; a card you play on yourself wants the field. */
    const dropAccepts = useCallback((uid, x, y) => {
        const entry = fight.hand.find((c) => c.uid === uid);
        const card = cardById(entry?.id);
        if (!card) return false;
        const box = (card.target === "foe" ? foeRef.current : fieldRef.current)?.getBoundingClientRect();
        if (!box) return false;
        // A thumb is not a cursor: the drop zone is the sprite plus a generous margin.
        const pad = 26;
        return x >= box.left - pad && x <= box.right + pad && y >= box.top - pad && y <= box.bottom + pad;
    }, [fight.hand]);

    useEffect(() => {
        const move = (e) => {
            const d = dragRef.current;
            if (!d) return;
            const moved = d.moved || Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > DRAG_SLOP;
            dragRef.current = { ...d, x: e.clientX, y: e.clientY, moved };
            setDrag(dragRef.current);
        };
        const up = (e) => {
            const d = dragRef.current;
            if (!d) return;
            dragRef.current = null;
            setDrag(null);
            // Under the slop it was a TAP: select the card, or unselect it if it was already the chosen one.
            if (!d.moved) { setSelected((cur) => (cur === d.uid ? null : d.uid)); return; }
            if (dropAccepts(d.uid, e.clientX, e.clientY)) commit(d.uid);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
        return () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", up);
        };
    }, [commit, dropAccepts]);

    const startDrag = (e, uid) => {
        if (fight.over || acting) return;
        dragRef.current = { uid, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
        setDrag(dragRef.current);
    };

    // Tapping the foe fires whatever is selected — the half of the interaction that works with a mouse.
    const onFoeTap = () => {
        if (!selected) return;
        const card = cardById(fight.hand.find((c) => c.uid === selected)?.id);
        if (card?.target === "foe") commit(selected);
    };

    const newFight = () => router.push(`/marketplace/cards?seed=${Math.floor(Math.random() * 900000) + 1000}`);
    const replay = () => {
        setFloats([]);
        setSelected(null);
        setFight(startFight({ seed: fixture.seed, hero: fixture.hero, foe: fixture.foe }));
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
        const seam = fieldRef.current?.getBoundingClientRect().bottom;
        return { x: drag.sx, y: Number.isFinite(seam) ? seam : drag.y };
    })();

    const aimArrow = useMemo(() => {
        if (!drag?.moved || dragCard?.target !== "foe" || !ghostAt) return null;
        const w = typeof window === "undefined" ? 0 : window.innerWidth;
        const h = typeof window === "undefined" ? 0 : window.innerHeight;
        // Struck from the held card itself rather than from where the thumb first pressed, because that is
        // where the card now IS.
        // Started INSIDE the card, not at its edge: the ghost is drawn above the arrow, so a tail tucked
        // under it disappears, while a tail starting below the card pokes out as a loose stub.
        const [sx, sy, ex, ey] = [ghostAt.x, ghostAt.y - 34, drag.x, drag.y];
        // The bow: lifted above the higher of the two ends, and deeper the further the throw.
        const cx = (sx + ex) / 2;
        const cy = Math.min(sy, ey) - Math.min(150, 60 + Math.hypot(ex - sx, ey - sy) * 0.25);
        // A quadratic's direction at the end is simply control -> end, which is the angle the head sits at.
        const ang = Math.atan2(ey - cy, ex - cx);
        const head = [[0, -9], [20, 0], [0, 9]]
            .map(([px, py]) => [
                ex + px * Math.cos(ang) - py * Math.sin(ang) - 12 * Math.cos(ang),
                ey + px * Math.sin(ang) + py * Math.cos(ang) - 12 * Math.sin(ang),
            ])
            .map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`)
            .join(" ");
        return { w, h, sx, sy, cx, cy, ex, ey, head, live: dropAccepts(drag.uid, ex, ey) };
    }, [drag, dragCard, dropAccepts, ghostAt?.x, ghostAt?.y]);
    const selectedCard = cardById(fight.hand.find((c) => c.uid === selected)?.id);
    const aiming = dragCard?.target === "foe" || selectedCard?.target === "foe";
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
    const overlap = handSize > 5 ? -46 : -24;
    const spread = handSize > 5 ? 2.8 : 4;
    const fanOf = (i) => {
        const mid = (handSize - 1) / 2;
        const off = i - mid;
        // The tilt is linear off the middle; the drop is quadratic, which is what makes it an arc rather
        // than a slope.
        return { rot: off * spread, drop: (off ** 2) * 2.4 };
    };

    const foeLit = drag?.moved ? Boolean(aimArrow?.live) : selectedCard?.target === "foe";

    const pileList = useMemo(() => {
        if (!peek) return [];
        const list = peek === "draw" ? fight.draw : fight.discard;
        // The DRAW pile is shown sorted, never in order — seeing the order would hand you the next five cards
        // and there would be nothing left to decide. The discard is shown as it fell, which is public anyway.
        const cards = list.map((c) => cardById(c.id));
        return peek === "draw" ? [...cards].sort((a, b) => a.name.localeCompare(b.name)) : cards;
    }, [peek, fight.draw, fight.discard]);

    return (
        <div className="cf">
            {/* ── THE FIELD ─────────────────────────────────────────────────────────────────────────── */}
            <div className={`cf-field${aiming ? " is-aiming" : ""}`} ref={fieldRef}>
                <Sprite src="/images/arena/arena-bg.webp" className="cf-bg" />

                <div className="cf-chrome">
                    <button type="button" className="cf-chip" onClick={() => router.push("/marketplace/town")}>Leave</button>
                    <span className="cf-seed">seed {fight.seed}</span>
                </div>

                <div className="cf-turn">Turn {fight.turn}</div>

                <div className={`cf-fighter cf-hero${hurt("hero") ? " is-hit" : ""}`}>
                    <div className="cf-floats">
                        {floats.filter((f) => f.on === "hero").map((f) => (
                            <span key={f.id} className={`cf-float is-${f.kind}`}>{f.text}</span>
                        ))}
                    </div>
                    <Sprite src={fixture.hero.art} className="cf-sprite" flip={fixture.hero.flip} />
                    <Bar unit={fight.hero} name={fight.hero.name} />
                </div>

                <div
                    className={`cf-fighter cf-foe${hurt("foe") ? " is-hit" : ""}${acting ? " is-acting" : ""}${foeLit ? " is-target" : ""}`}
                    ref={foeRef}
                    onClick={onFoeTap}
                >
                    <div className="cf-intent" style={{ borderColor: fight.foe.color }}>
                        {intent.block ? <GiShield aria-hidden="true" /> : null}
                        <GiCrossedSwords aria-hidden="true" />
                        <b>{incoming}</b>
                        <span className="cf-intent-label">{intent.label}</span>
                    </div>
                    <div className="cf-floats">
                        {floats.filter((f) => f.on === "foe").map((f) => (
                            <span key={f.id} className={`cf-float is-${f.kind}`}>{f.text}</span>
                        ))}
                    </div>
                    {/* Every fighter on the Road is drawn facing right, so on this side of the sand they all turn round. */}
                    <Sprite src={fixture.foe.art} fallback={fixture.foe.artFallback} className="cf-sprite" flip />
                    <Bar unit={fight.foe} name={fight.foe.name} accent={fight.foe.color} />
                </div>
            </div>

            {/* ── THE HAND ──────────────────────────────────────────────────────────────────────────── */}
            <div className="cf-tray">
                <div className="cf-hand">
                    {fight.hand.map((entry, i) => {
                        const card = cardById(entry.id);
                        const playable = canPlay(fight, entry.uid);
                        const isDragging = drag?.uid === entry.uid && drag.moved;
                        return (
                            <button
                                key={entry.uid}
                                type="button"
                                className={`cf-card${selected === entry.uid ? " is-picked" : ""}${playable ? "" : " is-spent"}${isDragging ? " is-ghosted" : ""}`}
                                style={{
                                    ...frameStyle(fixture.petArt[card.pet]?.color),
                                    marginLeft: i === 0 ? 0 : overlap,
                                    // The picked card comes OUT of the fan — straightened, lifted and grown,
                                    // and above its neighbours, because it is the one being read.
                                    transform: selected === entry.uid
                                        ? "translateY(-22px) scale(1.16)"
                                        : `rotate(${fanOf(i).rot}deg) translateY(${fanOf(i).drop}px)`,
                                    zIndex: selected === entry.uid ? 6 : i,
                                }}
                                onPointerDown={(e) => startDrag(e, entry.uid)}
                            >
                                <CardFace card={card} art={fixture.petArt[card.pet]} dim={!playable} />
                            </button>
                        );
                    })}
                </div>

                <div className="cf-bar">
                    <button type="button" className="cf-pile" onClick={() => setPeek("draw")}>
                        <b>{fight.draw.length}</b> draw
                    </button>
                    <div className="cf-energy"><b>{fight.energy}</b><span>/{fight.energyMax}</span></div>
                    <button type="button" className="cf-end" onClick={onEndTurn} disabled={Boolean(fight.over) || acting}>
                        {acting ? "…" : "End turn"}
                    </button>
                    <button type="button" className="cf-pile" onClick={() => setPeek("discard")}>
                        <b>{fight.discard.length}</b> discard
                    </button>
                </div>
            </div>

            {/* ── THE AIM ──────────────────────────────────────────────────────────────────────────────
                Spire draws a thick curved arrow from the card to whatever you are pointing at, and it is not
                decoration: on a phone your thumb is ON the target, so without it the only feedback that you
                are aiming at the right thing is hidden under your own hand. It arcs (a straight line reads as
                a UI connector), and it turns gold and thickens the moment the release would actually land. */}
            {aimArrow ? (
                <svg className="cf-aim" viewBox={`0 0 ${aimArrow.w} ${aimArrow.h}`} aria-hidden="true">
                    <path
                        className={`cf-aim-line${aimArrow.live ? " is-live" : ""}`}
                        d={`M ${aimArrow.sx} ${aimArrow.sy} Q ${aimArrow.cx} ${aimArrow.cy} ${aimArrow.ex} ${aimArrow.ey}`}
                    />
                    <polygon className={`cf-aim-head${aimArrow.live ? " is-live" : ""}`} points={aimArrow.head} />
                </svg>
            ) : null}

            {/* The card under your thumb, drawn at the pointer so it is never hidden by the finger holding it. */}
            {dragCard ? (
                <div className="cf-drag" style={{ ...frameStyle(fixture.petArt[dragCard.pet]?.color), left: ghostAt.x, top: ghostAt.y }}>
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
                                <div key={`${card.id}-${i}`} className="cf-card is-static" style={frameStyle(fixture.petArt[card.pet]?.color)}>
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
                        <h2>{fight.over === "win" ? `${fight.foe.name} is down` : "You fall"}</h2>
                        <p className="cf-note">
                            {fight.over === "win"
                                ? `Turn ${fight.turn}, and you walked out on ${fight.hero.hp} of ${fight.hero.hpMax}.`
                                : `${fight.foe.name} had ${fight.foe.hp} left.`}
                        </p>
                        <div className="cf-result-btns">
                            <button type="button" className="cf-btn" onClick={replay}>Replay seed {fight.seed}</button>
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
                .cf { position: fixed; inset: 0; height: 100dvh; z-index: 4000; display: flex; flex-direction: column;
                    background: #0a0b0f; color: #e9edf2; user-select: none; -webkit-user-select: none; overflow: hidden; }

                .cf-field { position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden; }
                .cf-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.82; }
                .cf-field::after { content: ""; position: absolute; inset: 0;
                    background: linear-gradient(180deg, rgba(8,9,13,0.55), rgba(8,9,13,0.1) 40%, rgba(8,9,13,0.75)); pointer-events: none; }

                /* Both on the LEFT. The seed sat top-right and a foe with a long intent ("GUARDED SWING") grew its pill
                   straight through it — and the intent is the one thing on this screen that must never be
                   obstructed. */
                .cf-chrome { position: absolute; top: 8px; left: 8px; right: 8px; display: flex; gap: 10px;
                    justify-content: flex-start; align-items: center; z-index: 3; }
                .cf-chip { background: rgba(10,12,16,0.7); border: 1px solid #2c3340; color: #cfd7e2; border-radius: 999px;
                    padding: 5px 12px; font-size: 12px; font-weight: 700; }
                .cf-seed { font-size: 11px; color: #8b97a8; letter-spacing: 0.04em; }
                .cf-turn { position: absolute; top: 40px; left: 50%; transform: translateX(-50%); z-index: 3;
                    font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: #9fb0c4; }

                .cf-fighter { position: absolute; bottom: 12px; width: 44%; display: flex; flex-direction: column;
                    align-items: center; z-index: 2; }
                .cf-hero { left: 3%; }
                .cf-foe { right: 3%; cursor: pointer; }
                .cf-sprite { width: 100%; height: clamp(96px, 26vh, 190px); object-fit: contain;
                    filter: drop-shadow(0 10px 12px rgba(0,0,0,0.55)); }
                .cf-foe.is-target .cf-sprite { filter: drop-shadow(0 0 12px #ffd75e) drop-shadow(0 10px 12px rgba(0,0,0,0.55)); }
                .cf-fighter.is-hit { animation: cfShake 260ms ease-out; }
                .cf-foe.is-acting { transform: translateX(-14px); transition: transform 200ms ease-out; }

                .cf-intent { display: inline-flex; align-items: center; gap: 5px; margin-bottom: 6px; padding: 4px 10px;
                    background: rgba(10,12,16,0.82); border: 1px solid #3a4354; border-radius: 999px; font-size: 13px; }
                .cf-intent b { font-size: 15px; }
                .cf-intent-label { font-size: 10px; color: #9fb0c4; text-transform: uppercase; letter-spacing: 0.06em; }

                /* Clear of the intent pill, which is the first thing in this box — a -6 landing on top of "11 LUNGE"
                   obscures the one number the next decision is made from. */
                .cf-floats { position: absolute; top: 34px; left: 0; right: 0; display: flex; flex-direction: column;
                    align-items: center; gap: 2px; pointer-events: none; z-index: 4; }
                .cf-float { font-size: 22px; font-weight: 800; text-shadow: 0 2px 6px rgba(0,0,0,0.8);
                    animation: cfFloat 900ms ease-out forwards; }
                .cf-float.is-damage { color: #ff8f9a; }
                .cf-float.is-block { color: #8fd3ff; }
                .cf-float.is-debuff { color: #ffcf6a; font-size: 14px; }

                .cf-tray { flex: 0 0 auto; padding: 6px 8px calc(8px + env(safe-area-inset-bottom));
                    background: linear-gradient(180deg, rgba(10,12,16,0), #0d1016 22%); }
                /* The lift on a picked card happens INSIDE this padding, and the cost badge sits inside the
                   card rather than hanging off it — at the end of a five-card hand the outside corner is
                   half a screen-edge away and the badge was being cut in half by it. */
                .cf-hand { display: flex; justify-content: center; align-items: flex-end; padding: 30px 22px 6px; }
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
                .cf-card { position: relative; flex: 0 0 auto; width: 84px; height: 106px; padding: 0 0 5px;
                    display: flex; flex-direction: column; align-items: center; touch-action: none;
                    border: 1px solid; border-radius: 9px;
                    box-shadow: 0 5px 12px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.09);
                    transform-origin: 50% 130%; transition: transform 140ms ease-out; }
                /* The picked card STRAIGHTENS out of the fan, lifts and grows. Its transform is set inline
                   (the fan angle is per-card data), so this rule carries only what does not vary. */
                .cf-card.is-picked { border-color: #ffd75e; box-shadow: 0 14px 24px rgba(0,0,0,0.66),
                    inset 0 1px 0 rgba(255,255,255,0.12); }
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
                .cf-banner { position: relative; z-index: 3; width: calc(100% + 12px);
                    margin: 5px -6px -7px; padding: 2px 8px 7px;
                    font-size: 9px; font-weight: 800; letter-spacing: 0.01em; line-height: 1.1;
                    text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                    clip-path: polygon(0 0, 100% 0, 100% 100%, calc(100% - 8px) 66%, 8px 66%, 0 100%);
                    filter: drop-shadow(0 2px 3px rgba(0,0,0,0.55)); }
                /* FULL BLEED inside a thick coloured window. The sprite floating on a dark panel with margins
                   read as a sticker stuck to a card; theirs is a painted illustration filling the frame. */
                /* The rim is the CONTAINER, and the picture is inset 2px inside it — so the rim follows the
                   clipped shape, which a border cannot do. */
                .cf-art { position: relative; width: calc(100% - 8px); height: 46px; margin: 0 4px;
                    display: block; padding: 2px; border-radius: 5px; }
                .cf-art-in { position: relative; display: grid; place-items: center; width: 100%; height: 100%;
                    border-radius: 3px; overflow: hidden; box-shadow: inset 0 0 10px rgba(0,0,0,0.6); }
                /* ATTACK COMES TO A POINT; a SKILL is a rounded rectangle. Spire's tell for what a card does,
                   readable before a single word is. Powers get the circle when powers exist. */
                .cf-art.is-attack { border-radius: 5px 5px 3px 3px;
                    clip-path: polygon(0 0, 100% 0, 100% 66%, 50% 100%, 0 66%); }
                .cf-art.is-attack .cf-art-in { clip-path: polygon(0 0, 100% 0, 100% 64%, 50% 100%, 0 64%); }
                .cf-art.is-skill { border-radius: 9px; }
                .cf-art.is-skill .cf-art-in { border-radius: 7px; }
                .cf-art-img { max-width: 96%; max-height: 40px; object-fit: contain;
                    filter: drop-shadow(0 2px 3px rgba(0,0,0,0.55)); }
                /* Sitting ON the art window's bottom border, in the rarity colour with dark text. */
                .cf-type { margin-top: -6px; padding: 0 7px 1px; border-radius: 3px; font-size: 7px;
                    font-weight: 800; letter-spacing: 0.07em; text-transform: uppercase; color: #14181f;
                    border: 1px solid rgba(0,0,0,0.4); z-index: 3; }
                /* Bounded, or a two-clause card writes straight out through the side of itself — which is what
                   Pounce did, and it looked like a rendering fault rather than a card. */
                /* Clipped, not spilled. The card is a fixed box and a three-line card was writing its last line out
                   through the bottom edge onto the tray behind it. */
                .cf-text { flex: 1; width: 100%; padding: 3px 4px 0; font-size: 8.5px; line-height: 1.2;
                    text-align: center; color: #e2e8f2; overflow: hidden; overflow-wrap: break-word; }
                /* The two words that decide the turn, lit. */
                .cf-key { color: #ffd75e; font-weight: 800; }

                .cf-bar { display: grid; grid-template-columns: auto auto 1fr auto; align-items: center; gap: 8px; padding-top: 6px; }
                .cf-pile { background: #141922; border: 1px solid #2c3340; color: #b7c2d2; border-radius: 8px;
                    padding: 6px 9px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
                .cf-pile b { display: block; font-size: 15px; color: #e9edf2; }
                .cf-energy { display: flex; align-items: baseline; gap: 1px; justify-self: start;
                    padding: 4px 12px; border-radius: 999px; background: #1a2340; border: 1px solid #6f86c0; }
                .cf-energy b { font-size: 20px; font-weight: 800; color: #dbe6ff; }
                .cf-energy span { font-size: 12px; color: #93a3c8; }
                .cf-end { justify-self: end; padding: 11px 18px; border-radius: 10px; border: 1px solid #7a6320;
                    background: linear-gradient(180deg, #ffd75e, #e0a92c); color: #241a03; font-weight: 800; font-size: 14px; }
                .cf-end:disabled { opacity: 0.5; }

                /* Full-bleed art fills its window; the fallback portrait is CONTAINED, because a pet sprite
                   cropped to a letterbox loses its head. Two jobs, two fits. */
                .cf-art-full { width: 100%; height: 100%; object-fit: cover; display: block; }

                /* ── THE AIM ── over everything, hit-testing nothing. */
                .cf-aim { position: fixed; inset: 0; width: 100vw; height: 100dvh; z-index: 4900;
                    pointer-events: none; }
                .cf-aim-line { fill: none; stroke: rgba(226,232,242,0.55); stroke-width: 5; stroke-linecap: round;
                    stroke-dasharray: 13 9; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.7)); }
                .cf-aim-line.is-live { stroke: #ffd75e; stroke-width: 7; stroke-dasharray: none; }
                .cf-aim-head { fill: rgba(226,232,242,0.6); filter: drop-shadow(0 2px 4px rgba(0,0,0,0.7)); }
                .cf-aim-head.is-live { fill: #ffd75e; }

                .cf-drag { position: fixed; z-index: 5000; width: 84px; height: 106px; padding: 0 0 5px;
                    display: flex; flex-direction: column; align-items: center; pointer-events: none;
                    /* HELD ABOVE THE POINTER, not on it. Centred on the thumb, the card covered the foe
                       completely — you were aiming at a thing you could no longer see, and on a phone the
                       thumb is already taking a bite out of that half of the screen. */
                    transform: translate(-50%, -118%) scale(0.94) rotate(-3deg); border: 1px solid;
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
function Bar({ unit, name, accent }) {
    const pct = Math.max(0, Math.min(100, (unit.hp / unit.hpMax) * 100));
    return (
        <div className="cfb">
            <div className="cfb-name" style={accent ? { color: accent } : undefined}>{name}</div>
            <div className="cfb-track">
                <div className="cfb-fill" style={{ width: `${pct}%` }} />
                <span className="cfb-hp">{unit.hp} / {unit.hpMax}</span>
            </div>
            {/* ── STATUS AS ICONS, NOT SENTENCES ──────────────────────────────────────────────────────
                Spire puts a row of small marked icons under the health bar, and the reason is arithmetic:
                three statuses written as words ("Vulnerable 2", "Weak 1", "Strength 3") is a wrapping
                paragraph under a 168px bar on a phone. The title carries the word for anyone who needs it. */}
            <div className="cfb-tags">
                {unit.block > 0 ? (
                    <span className="cfb-tag is-block" title={`Block ${unit.block}`}><GiShield aria-hidden="true" />{unit.block}</span>
                ) : null}
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
                .cfb { width: 100%; max-width: 168px; }
                .cfb-name { font-size: 11px; font-weight: 800; text-align: center; margin-bottom: 3px;
                    text-shadow: 0 1px 4px rgba(0,0,0,0.9); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .cfb-track { position: relative; height: 16px; border-radius: 4px; overflow: hidden;
                    background: #2a1116; border: 1px solid #4a2028; }
                .cfb-fill { height: 100%; background: linear-gradient(180deg, #ff6b78, #c62d3d); transition: width 240ms ease-out; }
                .cfb-hp { position: absolute; inset: 0; display: grid; place-items: center; font-size: 10px;
                    font-weight: 800; text-shadow: 0 1px 3px rgba(0,0,0,0.9); }
                .cfb-tags { display: flex; gap: 4px; justify-content: center; flex-wrap: wrap; margin-top: 4px; min-height: 16px; }
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
