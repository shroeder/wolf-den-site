"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Cinzel } from "next/font/google";

import CardFace, { CARD_FONT, Sprite } from "@/components/cards/CardFace";
import { MAP_LANES, reachable } from "@/lib/marketplace/cards-map.js";
import { POTIONS, RUN_LENGTH, actName, cardById, perkById } from "@/lib/marketplace/cards-kit.js";

const panelFont = Cinzel({ subsets: ["latin"], weight: ["600", "700"], display: "swap" });

// ── THE OVERWORLD ────────────────────────────────────────────────────────────────────────────────────────────
// Slay the Spire's map. This is the third pass and the first one built off a CLOSE crop of the real screen
// rather than a memory of it — Luke: "why are you not making it look exactly like the one that they have?"
//
// WHAT THE CROP SHOWED, and every one of these was wrong before:
//
//   · A ROOM HAS NO DISC AND NO BORDER. I had put every glyph on a cream circle with a ring around it. Theirs
//     is bare: a bold brush-drawn black mark straight on the paper. It survives the dashed routes because it
//     is THICK, not because it is masked.
//   · HOVER IS A WHITE STICKER OUTLINE around the mark's own silhouette. Not a ring, not a glow.
//   · A VISITED ROOM IS A SMALL MARK INSIDE A ROUGH HAND-DRAWN CIRCLE — a brush ring with the ends not quite
//     meeting. That is a drawing, so it is a sprite here too.
//   · THE MARKS ARE CHUNKY PICTOGRAMS. Two eyes, two horns, a mouth. Mine were detailed engravings, which is
//     what Luke meant by "it's like a goblin face".
//   · THE ROUTES ARE OPAQUE. Mine were drawn with alpha, so wherever two crossed, the overlap went darker —
//     "when they overlap each other they multiply the transparency". Theirs is one flat ink tone that looks
//     identical whether one line is there or three.
//   · THE TOP BAR HAS NO BOXES. Flat slate, sprites, coloured numerals, nothing outlined and nothing rounded.
//   · EMPTY POTION SLOTS ARE NOT DRAWN AT ALL.
//   · THE LEGEND IS A PINNED SCROLL and RETURN IS A RED RIBBON. Both are art in their game; both were CSS in
//     mine, which is why neither looked like anything.

const MARK = {
    fight: "/images/cards/chrome/map-fight.png",
    elite: "/images/cards/chrome/map-elite.png",
    rest: "/images/cards/chrome/map-rest.png",
    merchant: "/images/cards/chrome/map-merchant.png",
    treasure: "/images/cards/chrome/map-treasure.png",
    boss: "/images/cards/chrome/map-boss.png",
    // ⚠️ THE ONE ROOM IN FIVE THAT WAS STILL TYPOGRAPHY. Every other mark is a stamped pictogram and the
    // unknown was a text "?" in an inline <b> — Luke: "the question mark is teeny." It could not be fixed
    // with a font-size either, because the sizing on .cm-ink is width/height and neither does anything to
    // inline text. It is a drawn mark now, like the other six, and the fallback below is dead code kept
    // only so a kind nobody has drawn yet still renders something.
    unknown: "/images/cards/chrome/map-unknown.png",
};
const LABEL = {
    fight: "Enemy", elite: "Elite", rest: "Rest", merchant: "Merchant",
    treasure: "Treasure", unknown: "Unknown", boss: "Boss",
};

const W = 100;
const ROW_H = 26;
const PAD_TOP = 26;
const PAD_BOTTOM = 18;
const H = PAD_TOP + (RUN_LENGTH - 1) * ROW_H + PAD_BOTTOM;

const xOf = (lane) => 10 + (lane / (MAP_LANES - 1)) * (W - 20);
const yOf = (row) => H - PAD_BOTTOM - row * ROW_H;

const Ink = ({ kind, className }) => (MARK[kind]
    // eslint-disable-next-line @next/next/no-img-element
    ? <img className={className} src={MARK[kind]} alt="" draggable="false" />
    : <b className={className}>?</b>);

export default function CardMap({ run, art = {} }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [deckOpen, setDeckOpen] = useState(false);
    // The legend, behind a button. See the note in the render: a key pinned open over the sheet was covering
    // the quarter of the map you most needed to look at.
    const [keyOpen, setKeyOpen] = useState(false);
    // ── WHAT YOU ARE CARRYING, ON A SCREEN YOU CAN OPEN ──────────────────────────────────────────────
    // Luke: "seeing perks from the map like Slay the Spire."
    //
    // Theirs is a row of relics you can point at and read. Ours was a row of 22px sprites whose only
    // explanation was `onPointerEnter` — a HOVER, on a game played on a phone. There is no hover on a
    // touchscreen: the strip was six unlabelled pictures, and the thing the perk actually does (the whole
    // reason the strip exists) could not be read at all on the device it is played on.
    //
    // So the strip is pressable now and it opens the list: every perk and every potion, sprite, name and
    // rule, in one panel. The hover peek stays for a mouse, because a tooltip is faster than a panel when
    // you have one — but it is no longer the only way in.
    const [carry, setCarry] = useState(null);
    const sheet = useRef(null);

    const map = run.map;
    const trail = useMemo(() => run.trail || [], [run.trail]);
    const taken = useMemo(() => new Set(trail.map((t) => `${t.row}:${t.lane}`)), [trail]);
    const last = trail.length ? trail[trail.length - 1] : null;
    const open = useMemo(
        () => new Set(reachable(map, last).map((n) => `${n.row}:${n.lane}`)),
        [map, last]
    );

    // You climb this sheet, so it opens at the bottom.
    useLayoutEffect(() => {
        const el = sheet.current;
        if (!el) return;
        const rowY = last ? (yOf(last.row) / H) * el.scrollHeight : el.scrollHeight;
        el.scrollTop = Math.max(0, rowY - el.clientHeight * 0.62);
    }, [last]);

    const enter = useCallback(async (node) => {
        if (busy) return;
        setBusy(true);
        await fetch("/api/marketplace/cards/run", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "enter", row: node.row, lane: node.lane }),
        }).catch(() => null);
        setBusy(false);
        router.refresh();
    }, [busy, router]);

    // ── THE BOSS IS A ROOM YOU WALK INTO ─────────────────────────────────────────────────────────────
    // It used to be a drawing with no node behind it and no handler on it: the sheet showed a boss, lit it up
    // once you reached the top row, and there was nothing to press. buildMap gives it a real node now and
    // every room on the last row leads to it, so `open` decides this the same way it decides every other room
    // and `enter` takes it the same way. `bossNode` falls back to the map's own boss field for a run whose
    // map was generated before the node existed.
    const bossNode = useMemo(
        () => map.nodes.find((n) => n.kind === "boss") || (map.boss ? { ...map.boss, kind: "boss" } : null),
        [map]
    );
    const bossOpen = Boolean(bossNode) && open.has(`${bossNode.row}:${bossNode.lane}`);
    const perks = run.perks || [];
    const potions = (run.potions || []).map((id) => POTIONS[id]).filter(Boolean);
    const deck = useMemo(() => {
        const counted = new Map();
        for (const id of run.deck || []) counted.set(id, (counted.get(id) || 0) + 1);
        return [...counted.entries()].map(([id, n]) => ({ card: cardById(id), n })).filter((x) => x.card);
    }, [run.deck]);

    // Where you are standing: the pip on the sheet, and the room the live routes lead out of.
    const here = last ? `${last.row}:${last.lane}` : null;

    return (
        <div className={`cm ${panelFont.className}`}>
            {/* ══ THE DESCENT ═════════════════════════════════════════════════════════════════════════════
                Third design of this screen, and the first that is not a photocopy of Spire's parchment.
                Luke: "let's just redo the map entirely, it looks terrible... I like functionally how it works
                but I really don't like the way it's looking on screen, and I especially don't like that the
                legend covers everything up. Make it more mobile centric."

                WHAT WAS WRONG, and none of it was the rooms or the routes — those he likes:
                  · A CREAM SHEET in a game whose every other screen is a dark room. The map was the only lit
                    thing in the Den and it read as a page torn out of a different game.
                  · A LEGEND THE SIZE OF A HAND covering the top-right quarter of that sheet, permanently, on
                    the one screen where you are trying to see where you can go. A key you cannot move is
                    worse than no key, and it is only wanted until you have learnt six pictures.
                  · A BLACK GUTTER down the left holding a single dashed circle, and a banner nailed to the
                    floor. Chrome eating a third of a phone to say nothing.

                WHAT IT IS NOW: the dark the rest of the game is made of, with light only where you can act.
                The rooms you can reach are lit AND NAMED — which is the thing that actually retires the
                legend — the ones you cannot are cold, and the trail behind you is drawn in brass. The key is
                still there for anybody who wants it: one small button that opens over the map and leaves. */}
            <div className="cm-bar">
                {/* THE ACT HAS A NAME — The Sand, The Deep, The Spire — and a wide screen has room to say it.
                   A phone does not, and the phone is what this is played on, so it is the first thing to go;
                   the act still travels on the fight's own line and on the front room's summary. */}
                <span className={`cm-who${(run.act || 1) > 1 ? " is-deep" : ""}`}>{actName(run.act || 1)}</span>
                <Sprite className="cm-ui" src="/images/cards/chrome/ui-heart.png" />
                <b className="cm-hp">{run.hp}/{run.hpMax}</b>
                <Sprite className="cm-ui" src="/images/cards/chrome/ui-ember.png" />
                <b className="cm-em">{run.embers || 0}</b>

                {/* WHAT YOU ARE CARRYING, INLINE. The trinkets had a band of their own, and then a column of
                    their own; both were furniture for something you own between zero and four of. They sit
                    beside the potions now — one row, one tap each, and nothing at all when empty. */}
                {perks.map((id) => {
                    const perk = perkById(id);
                    if (!perk) return null;
                    return (
                        <button key={id} type="button" className="cm-hold" onClick={() => setCarry(id)}
                            aria-label={`${perk.name} — ${perk.text}`}>
                            <Sprite className="cm-ui" src={`/images/cards/items/${id}.png`} />
                        </button>
                    );
                })}
                {potions.map((p, i) => (
                    <button key={`${p.id}${i}`} type="button" className="cm-hold" onClick={() => setCarry(p.id)}
                        aria-label={`${p.name} — ${p.text}`}>
                        <Sprite className="cm-ui" src={`/images/cards/potions/${p.id}.png`} />
                    </button>
                ))}

                <span className="cm-gap" />
                <Sprite className="cm-ui" src="/images/cards/chrome/ui-floor.png" />
                <b className="cm-fl">{last ? last.row + 1 : 0}</b>
                <button type="button" className="cm-tool" aria-label="Your deck" onClick={() => setDeckOpen(true)}>
                    <Sprite src="/images/cards/chrome/ui-deckbook.png" />
                </button>
                <button type="button" className="cm-tool cm-key" aria-label="What the marks mean"
                    onClick={() => setKeyOpen(true)}>?</button>
            </div>

            <div className="cm-sheet" ref={sheet}>
                <div className="cm-inner">
                    <svg className="cm-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
                        {map.nodes.map((n) => n.next.map((lane) => {
                            const x1 = xOf(n.lane);
                            const y1 = yOf(n.row);
                            const x2 = xOf(lane);
                            const y2 = yOf(n.row + 1);
                            const walked = taken.has(`${n.row}:${n.lane}`) && taken.has(`${n.row + 1}:${lane}`);
                            // THE ROUTE OUT OF WHERE YOU STAND IS ITS OWN STATE: walked is history, live is
                            // the decision in front of you, and the rest is the shape of the act to come.
                            const live = here === `${n.row}:${n.lane}` && open.has(`${n.row + 1}:${lane}`);
                            const bend = ROW_H * 0.3;
                            return (
                                <path
                                    key={`${n.row}-${n.lane}-${lane}`}
                                    className={`cm-edge${walked ? " is-walked" : ""}${live ? " is-live" : ""}`}
                                    d={`M ${x1} ${y1} C ${x1} ${y1 - bend}, ${x2} ${y2 + bend}, ${x2} ${y2}`}
                                />
                            );
                        }))}
                        {map.nodes.filter((n) => n.row === RUN_LENGTH - 1).map((n) => (
                            <path
                                key={`boss-${n.lane}`}
                                className={`cm-edge${here === `${n.row}:${n.lane}` && bossOpen ? " is-live" : ""}`}
                                d={`M ${xOf(n.lane)} ${yOf(n.row)} C ${xOf(n.lane)} ${yOf(n.row) - ROW_H * 0.4}, ${W / 2} ${PAD_TOP + ROW_H * 0.4}, ${W / 2} ${PAD_TOP - 4}`}
                            />
                        ))}
                    </svg>

                    {map.nodes.filter((n) => n.kind !== "boss").map((n) => {
                        const k = `${n.row}:${n.lane}`;
                        const isOpen = open.has(k);
                        const isTaken = taken.has(k);
                        const isHere = here === k;
                        return (
                            <button
                                key={k}
                                type="button"
                                disabled={!isOpen || busy}
                                className={`cm-node${isOpen ? " is-open" : ""}${isTaken ? " is-taken" : ""}${isHere ? " is-here" : ""}`}
                                style={{ left: `${xOf(n.lane)}%`, top: `${(yOf(n.row) / H) * 100}%` }}
                                onClick={() => enter(n)}
                                aria-label={`${LABEL[n.kind]}, floor ${n.row + 1}`}
                            >
                                <span className="cm-disc" aria-hidden="true" />
                                <Ink kind={n.kind} className="cm-ink" />
                                {/* ⚠️ THIS IS WHAT REPLACED THE LEGEND. A room you can walk into says what it
                                    is, in one word, right under it — so the six pictures are learnt in a
                                    single run rather than looked up on a scroll pinned over the map. */}
                                {isOpen ? <i className="cm-name">{LABEL[n.kind]}</i> : null}
                            </button>
                        );
                    })}

                    <button
                        type="button"
                        disabled={!bossOpen || busy || !bossNode}
                        className={`cm-node cm-boss${bossOpen ? " is-open" : ""}`}
                        style={{ left: "50%", top: `${((PAD_TOP - 4) / H) * 100}%` }}
                        onClick={() => bossNode && enter(bossNode)}
                        aria-label="The boss"
                    >
                        <span className="cm-disc" aria-hidden="true" />
                        <Ink kind="boss" className="cm-ink" />
                        <i className="cm-name">The Boss</i>
                    </button>
                </div>
                {/* The trail runs on past the last room, so the opening scroll can put your row where it
                    means to and the foot has empty ground under it rather than a room. */}
                <div className="cm-tail" aria-hidden="true" />
            </div>

            {/* ── THE FOOT ── one line of type: the way out, and what to do. No banner nailed to the floor. */}
            <div className="cm-foot">
                <button type="button" className="cm-leave" onClick={() => router.push("/marketplace/cards/table")}>
                    &lsaquo; Leave
                </button>
                <span className="cm-hint">{busy ? "…" : "Tap a lit room"}</span>
            </div>

            {/* ── THE KEY, WHEN IT IS ASKED FOR ─────────────────────────────────────────────────────── */}
            {keyOpen ? (
                <div className="cm-over" onClick={() => setKeyOpen(false)} role="presentation">
                    <div className="cm-panel" onClick={(e) => e.stopPropagation()} role="presentation">
                        <h2>What the marks mean</h2>
                        <div className="cm-keys">
                            {["unknown", "merchant", "treasure", "rest", "fight", "elite", "boss"].map((kind) => (
                                <span key={kind} className="cm-keyrow">
                                    <span className="cm-keymark"><Ink kind={kind} className="cm-ink" /></span>
                                    {LABEL[kind]}
                                </span>
                            ))}
                        </div>
                        <p className="cm-panel-note">Lit rooms are the ones you can walk into from here.</p>
                        <button type="button" className="cm-close" onClick={() => setKeyOpen(false)}>Close</button>
                    </div>
                </div>
            ) : null}

            {/* ── YOUR DECK, AS CARDS ── the same CardFace the fight and the shelf draw; only the box around
                it belongs to this screen. A deck you cannot see is a deck you cannot plan with. */}
            {deckOpen ? (
                <div className="cm-over" onClick={() => setDeckOpen(false)} role="presentation">
                    <div className="cm-panel is-wide" onClick={(e) => e.stopPropagation()} role="presentation"
                        style={{ "--cf-card-font": CARD_FONT.style.fontFamily }}>
                        <h2>Your deck — {(run.deck || []).length} cards</h2>
                        <div className="cm-deck-list">
                            {deck.map(({ card, n }) => (
                                <span key={card.id} className="cm-deck-card">
                                    <span className="cf-card"><CardFace card={card} art={art[card.pet]} /></span>
                                    {n > 1 ? <b className="cm-deck-n">×{n}</b> : null}
                                </span>
                            ))}
                        </div>
                        <div className="cm-panel-foot">
                            <button type="button" className="cm-close" onClick={() => setDeckOpen(false)}>Close</button>
                            <button type="button" className="cm-see"
                                onClick={() => router.push("/marketplace/cards/collection")}>
                                See every card
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* ── WHAT YOU ARE CARRYING ── opened by pressing any trinket or potion; the one you pressed is
                lit, so a press on the third relic answers the question you actually asked. */}
            {carry ? (
                <div className="cm-over" onClick={() => setCarry(null)} role="presentation">
                    <div className="cm-panel" onClick={(e) => e.stopPropagation()} role="presentation">
                        <h2>What you&rsquo;re carrying</h2>
                        {perks.length || potions.length ? null : (
                            <p className="cm-panel-note">Nothing yet. Trinkets come out of chests and elites.</p>
                        )}
                        {perks.map((id) => {
                            const perk = perkById(id);
                            if (!perk) return null;
                            return (
                                <span key={id} className={`cm-carry-row${carry === id ? " is-lit" : ""}`}>
                                    <Sprite src={`/images/cards/items/${id}.png`} />
                                    <span><b>{perk.name}</b><i>{perk.text}</i></span>
                                </span>
                            );
                        })}
                        {potions.map((p, i) => (
                            <span key={`${p.id}${i}`} className={`cm-carry-row${carry === p.id ? " is-lit" : ""}`}>
                                <Sprite src={`/images/cards/potions/${p.id}.png`} />
                                <span><b>{p.name} <em>potion</em></b><i>{p.text}</i></span>
                            </span>
                        ))}
                        {potions.length ? <p className="cm-panel-note">Potions are drunk in a fight.</p> : null}
                        <button type="button" className="cm-close" onClick={() => setCarry(null)}>Close</button>
                    </div>
                </div>
            ) : null}

            <style jsx global>{`
                .cm { position: fixed; inset: 0; z-index: 4000; color: #e9edf2;
                    display: grid; grid-template-rows: auto 1fr auto; overflow: hidden;
                    /* The ground the rest of the game is made of: near-black, warmed from below as though
                       the trail is lit from where you are standing. */
                    background:
                        radial-gradient(120% 55% at 50% 100%, rgba(94,63,32,0.45), rgba(0,0,0,0) 62%),
                        linear-gradient(180deg, #0b0d12 0%, #12151c 55%, #0b0d12 100%); }

                /* ── THE BAR ── one row, small, and everything on it is a thing you can press. */
                .cm-bar { display: flex; align-items: center; gap: 6px; padding: 7px 10px;
                    background: rgba(10,12,17,0.92); border-bottom: 1px solid rgba(255,255,255,0.06); }
                .cm-ui { width: 21px; height: 21px; object-fit: contain; }
                .cm-hp { font-size: 14px; font-weight: 700; color: #ff8f7a; font-variant-numeric: tabular-nums; }
                .cm-em { font-size: 14px; font-weight: 700; color: #ffb63d; font-variant-numeric: tabular-nums; }
                .cm-fl { font-size: 14px; font-weight: 700; color: #cdd6e2; font-variant-numeric: tabular-nums; }
                .cm-gap { flex: 1 1 auto; }
                .cm-who { display: none; font-size: 14px; font-weight: 700; letter-spacing: 0.04em;
                    color: #e6ecf4; margin-right: 4px; }
                /* ⚠️ PAST THE FIRST BOSS IT EARNS THE SPACE ON A PHONE TOO. "The Sand" on act one is telling
                   somebody the name of the only place they have ever been; "The Deep" on act two is telling
                   them the boss they just killed bought them something. */
                .cm-who.is-deep { display: inline; font-size: 12.5px; color: #ffd9a6; white-space: nowrap; }
                .cm-hold { padding: 0 1px; border: 0; background: none; cursor: pointer; line-height: 0; }
                .cm-hold:active { transform: translateY(1px); }
                .cm-tool { width: 30px; height: 30px; padding: 0; border: 0; background: none; cursor: pointer;
                    display: grid; place-items: center; }
                .cm-tool img { width: 24px; height: 24px; object-fit: contain; }
                .cm-key { border-radius: 50%; font: inherit; font-size: 14px; font-weight: 700;
                    color: #a9b6c6; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.18); }
                .cm-key:hover { color: #ffe6a6; box-shadow: inset 0 0 0 1px rgba(255,214,140,0.5); }

                /* ── THE TRAIL ── full bleed, and the only thing on it is the act. */
                .cm-sheet { position: relative; overflow-y: auto; overflow-x: hidden; height: 100%;
                    overscroll-behavior: contain; }
                .cm-inner { position: relative; width: min(460px, 100%); margin: 0 auto; }
                .cm-svg { display: block; width: 100%; height: auto; }
                .cm-tail { height: 40px; }

                /* ── THE ROUTES ── three states, three different questions: where you have been, where you
                   can step, and the shape of everything still ahead. */
                .cm-edge { fill: none; stroke: rgba(150,167,190,0.16); stroke-width: 0.7;
                    stroke-linecap: round; stroke-dasharray: 2.2 2.6; }
                .cm-edge.is-walked { stroke: rgba(201,162,83,0.5); stroke-dasharray: none; stroke-width: 0.9; }
                /* The step in front of you, drawn like a live wire. */
                .cm-edge.is-live { stroke: #ffce7a; stroke-width: 1.1; stroke-dasharray: 2.2 2.2;
                    filter: drop-shadow(0 0 1.4px rgba(255,190,90,0.9)); animation: cmFlow 1.1s linear infinite; }
                @keyframes cmFlow { to { stroke-dashoffset: -4.4; } }

                /* ── THE ROOMS ── 46px of touch target, which is the number a thumb wants. The disc is what
                   you see; the button is what you hit. */
                .cm-node { position: absolute; width: 46px; height: 46px; transform: translate(-50%, -50%);
                    padding: 0; border: 0; background: none; cursor: default;
                    display: grid; place-items: center; }
                .cm-disc { position: absolute; inset: 4px; border-radius: 50%;
                    background: radial-gradient(circle at 50% 38%, #232936, #141821 70%);
                    box-shadow: inset 0 0 0 1px rgba(160,180,205,0.18), 0 2px 5px rgba(0,0,0,0.6); }
                /* The mark is BLACK INK drawn for parchment (map-*.png). Inverted, it is chalk on slate — the
                   same six drawings keep working on a ground they were never drawn for. */
                .cm-ink { position: relative; width: 24px; height: 24px; object-fit: contain;
                    filter: invert(1); opacity: 0.42; }

                .cm-node.is-taken .cm-disc { background: #101319;
                    box-shadow: inset 0 0 0 1px rgba(201,162,83,0.35); }
                .cm-node.is-taken .cm-ink { opacity: 0.3; }
                /* YOU ARE HERE — the one room on the sheet that is not a choice, so it is marked rather than
                   lit: a brass ring, no glow, no pulse. */
                .cm-node.is-here .cm-disc { box-shadow: inset 0 0 0 2px #c9a253, 0 2px 8px rgba(0,0,0,0.7); }
                .cm-node.is-here .cm-ink { opacity: 0.75; }

                /* A ROOM YOU CAN WALK INTO IS THE BRIGHTEST THING ON THE SCREEN. Everything else here is
                   information; these are the only buttons. */
                .cm-node.is-open { cursor: pointer; }
                .cm-node.is-open .cm-disc {
                    background: radial-gradient(circle at 50% 36%, #4a3a24, #221a11 72%);
                    box-shadow: inset 0 0 0 2px #ffce7a, 0 0 14px rgba(255,190,90,0.45), 0 3px 8px rgba(0,0,0,0.7);
                    animation: cmBreathe 2.4s ease-in-out infinite; }
                .cm-node.is-open .cm-ink { opacity: 1;
                    filter: invert(1) sepia(0.55) saturate(2.4) hue-rotate(-14deg); }
                .cm-node.is-open:active .cm-disc { transform: scale(0.94); }
                @keyframes cmBreathe {
                    0%, 100% { box-shadow: inset 0 0 0 2px #ffce7a, 0 0 12px rgba(255,190,90,0.35), 0 3px 8px rgba(0,0,0,0.7); }
                    50% { box-shadow: inset 0 0 0 2px #ffe0a4, 0 0 20px rgba(255,200,110,0.6), 0 3px 8px rgba(0,0,0,0.7); }
                }
                /* THE NAME UNDER A LIT ROOM. This is the legend now: it only ever says the handful of things
                   you are being asked to choose between, and it can never be in the way because it is
                   attached to the thing it names. */
                .cm-name { position: absolute; top: 46px; left: 50%; transform: translateX(-50%);
                    font-style: normal; font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase;
                    color: #ffd9a6; white-space: nowrap; text-shadow: 0 1px 4px rgba(0,0,0,0.95); }

                .cm-boss { width: 62px; height: 62px; }
                .cm-boss .cm-ink { width: 32px; height: 32px; }
                .cm-boss .cm-disc { background: radial-gradient(circle at 50% 36%, #3a1c1c, #150c0c 72%);
                    box-shadow: inset 0 0 0 2px rgba(214,106,86,0.55), 0 3px 10px rgba(0,0,0,0.75); }
                .cm-boss .cm-name { top: 62px; color: #ff9e86; }
                .cm-boss.is-open .cm-disc { box-shadow: inset 0 0 0 2px #ff9e86,
                    0 0 20px rgba(230,110,80,0.5), 0 3px 10px rgba(0,0,0,0.75); }
                .cm-boss.is-open .cm-ink { filter: invert(1) sepia(0.5) saturate(3) hue-rotate(-30deg); }

                /* ── THE FOOT ── a line of type, not a banner. */
                .cm-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px;
                    padding: 9px 14px; background: rgba(10,12,17,0.92);
                    border-top: 1px solid rgba(255,255,255,0.06); }
                .cm-leave { padding: 4px 2px; border: 0; background: none; cursor: pointer; font: inherit;
                    font-size: 14px; letter-spacing: 0.04em; color: #c3b49c; }
                .cm-leave:hover { color: #ffe6d2; }
                /* A HINT, NOT A HEADLINE. At 11.5px uppercase and letter-spaced it was reading as loud as
                   the thing it is describing; it exists for the first run and then wants to disappear. */
                .cm-hint { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
                    color: #56606f; }

                /* ── PANELS ── one shape for the key, the deck and the belt. */
                .cm-over { position: fixed; inset: 0; z-index: 4100; display: grid; place-items: center;
                    padding: 16px; background: rgba(4,5,8,0.9); }
                .cm-panel { width: min(360px, 100%); max-height: 82dvh; overflow-y: auto; padding: 16px;
                    display: grid; gap: 10px; justify-items: center; text-align: center;
                    background: rgba(14,17,24,0.98); border-radius: 14px;
                    border: 1px solid rgba(201,162,83,0.35); box-shadow: 0 18px 50px rgba(0,0,0,0.75); }
                .cm-panel.is-wide { width: min(520px, 100%); }
                .cm-panel h2 { margin: 0; font-size: 17px; color: #f3e7c8; }
                .cm-panel-note { margin: 0; font-size: 12px; color: #8e96a3; }
                .cm-panel-foot { display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
                    justify-content: center; }
                .cm-keys { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 14px; justify-items: start; }
                .cm-keyrow { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #dbe2ea; }
                .cm-keymark { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center;
                    background: #171b23; box-shadow: inset 0 0 0 1px rgba(160,180,205,0.18); }
                .cm-keymark .cm-ink { width: 18px; height: 18px; opacity: 0.85; }

                .cm-carry-row { align-self: stretch; display: flex; align-items: center; gap: 10px;
                    padding: 7px 9px; border-radius: 9px; text-align: left; background: rgba(255,255,255,0.03); }
                .cm-carry-row.is-lit { background: rgba(201,162,83,0.16);
                    box-shadow: inset 0 0 0 1px rgba(201,162,83,0.5); }
                .cm-carry-row img { width: 34px; height: 34px; object-fit: contain; flex: 0 0 34px;
                    filter: drop-shadow(0 2px 3px rgba(0,0,0,0.6)); }
                .cm-carry-row b { display: block; font-size: 13.5px; color: #ffd9a6; }
                .cm-carry-row b em { font-style: normal; font-size: 10.5px; letter-spacing: 0.08em;
                    text-transform: uppercase; color: #9d8a72; }
                .cm-carry-row i { display: block; margin-top: 1px; font-style: normal; font-size: 12px;
                    line-height: 1.35; color: #c6cdd6; }

                .cm-deck-list { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
                .cm-deck-card { position: relative; }
                .cm-deck-n { position: absolute; right: -3px; bottom: 4px; z-index: 5;
                    min-width: 17px; height: 17px; padding: 0 3px; border-radius: 9px;
                    display: grid; place-items: center; background: rgba(10,12,16,0.92);
                    border: 1px solid rgba(201,162,83,0.6); color: #ffd08a; font-size: 11px; font-weight: 800; }
                .cm .cf-card { position: relative; width: 96px; height: 138px; padding: 0 0 8px;
                    display: flex; flex-direction: column; align-items: center;
                    background: none; border: 0; border-radius: 9px;
                    filter: drop-shadow(0 4px 7px rgba(0,0,0,0.6)); }
                .cm .cf-card::after { content: ""; position: absolute; inset: -1px; z-index: 2;
                    pointer-events: none; background-image: url(/images/cards/chrome/frame.png);
                    background-repeat: no-repeat; background-size: 100% 100%; }

                .cm-close { padding: 8px 20px; border-radius: 999px; cursor: pointer;
                    border: 2px solid #c9a253; background: rgba(18,22,30,0.92); color: #f2e2bd;
                    font: inherit; font-weight: 700; }
                .cm-see { padding: 4px 8px; border: 0; background: none; cursor: pointer; font: inherit;
                    font-size: 12.5px; color: #c3b49c; text-decoration: underline; text-underline-offset: 3px;
                    text-decoration-color: rgba(195,180,156,0.4); }
                .cm-see:hover { color: #ffe6d2; }

                /* A wide screen gets a wider trail and bigger rooms. It does not get a different map. */
                @media (min-width: 760px) {
                    .cm-who { display: inline; }
                    .cm-inner { width: min(560px, 100%); }
                    .cm-node { width: 54px; height: 54px; }
                    .cm-ink { width: 28px; height: 28px; }
                    .cm-name { top: 54px; font-size: 11.5px; }
                    .cm-boss { width: 74px; height: 74px; }
                    .cm-boss .cm-name { top: 74px; }
                }
            `}</style>
        </div>
    );
}
