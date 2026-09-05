"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Cinzel } from "next/font/google";

import { MAP_LANES, reachable } from "@/lib/marketplace/cards-map.js";
import { PERKS, POTIONS, RUN_LENGTH, cardById } from "@/lib/marketplace/cards-kit.js";

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

const clock = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const Ink = ({ kind, className }) => (MARK[kind]
    // eslint-disable-next-line @next/next/no-img-element
    ? <img className={className} src={MARK[kind]} alt="" draggable="false" />
    : <b className={className}>?</b>);

export default function CardMap({ run }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [peek, setPeek] = useState(null);
    const [deckOpen, setDeckOpen] = useState(false);
    // ⚠️ NULL UNTIL MOUNTED. Seeding this with Date.now() means the server renders one number and the client
    // renders a different one a moment later, and React throws the whole tree away and re-renders it —
    // "server rendered text didn't match the client". A clock is the classic case: there is no value the
    // server can print that will still be right when the browser reads it, so it prints nothing.
    const [now, setNow] = useState(null);
    const sheet = useRef(null);

    const map = run.map;
    const trail = useMemo(() => run.trail || [], [run.trail]);
    const taken = useMemo(() => new Set(trail.map((t) => `${t.row}:${t.lane}`)), [trail]);
    const last = trail.length ? trail[trail.length - 1] : null;
    const open = useMemo(
        () => new Set(reachable(map, last).map((n) => `${n.row}:${n.lane}`)),
        [map, last]
    );

    useEffect(() => {
        setNow(Date.now());
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);

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

    return (
        <div className={`cm ${panelFont.className}`}>
            {/* ── THE TOP BAR ── flat, no boxes, sprites and coloured numerals. Theirs has not one rounded
                rectangle on it and that is most of why it reads as part of the game rather than as chrome. */}
            <div className="cm-bar">
                <span className="cm-who">The Sand</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="cm-ui" src="/images/cards/chrome/ui-heart.png" alt="" />
                <b className="cm-hp">{run.hp}/{run.hpMax}</b>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="cm-ui" src="/images/cards/chrome/ui-ember.png" alt="" />
                <b className="cm-em">{run.embers || 0}</b>
                {/* EMPTY SLOTS ARE NOT DRAWN. Luke: "if it's an empty potion slot, just don't show anything." */}
                {potions.map((p, i) => (
                    <span
                        key={`${p.id}${i}`}
                        className="cm-potion"
                        onPointerEnter={() => setPeek(`${p.name} — ${p.text}`)}
                        onPointerLeave={() => setPeek(null)}
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="cm-ui" src={'/images/cards/potions/' + p.id + '.png'} alt={p.name} />
                    </span>
                ))}
                <span className="cm-gap" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="cm-ui" src="/images/cards/chrome/ui-floor.png" alt="" />
                <b className="cm-fl">{last ? last.row + 1 : 0}</b>
                <span className="cm-clock">{now ? clock(now - (run.startedAt || now)) : "0:00"}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <button type="button" className="cm-tool is-on" aria-label="Map">
                    <img src="/images/cards/chrome/ui-mapbook.png" alt="" />
                </button>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <button type="button" className="cm-tool" aria-label="Your deck" onClick={() => setDeckOpen(true)}>
                    <img src="/images/cards/chrome/ui-deckbook.png" alt="" />
                </button>
            </div>

            {/* ── THE DARK STRIP THE PERKS SIT IN ── Luke: "they have an empty space on the left that's dark,
                and that's where they show their perks." It is always there, occupied or not. */}
            <div className="cm-perkbar">
                {perks.map((id) => {
                    const perk = PERKS[id];
                    return (
                        <span
                            key={id}
                            className="cm-perk"
                            onPointerEnter={() => setPeek(`${perk.name} — ${perk.text}`)}
                            onPointerLeave={() => setPeek(null)}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={'/images/cards/items/' + id + '.png'} alt={perk.name} />
                        </span>
                    );
                })}
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
                            const bend = ROW_H * 0.28;
                            // A per-edge dash offset so no two routes tick in step — theirs are hand-drawn and
                            // no two dashes line up. Derived from position, so it is stable across renders.
                            const off = ((n.row * 7 + n.lane * 3 + lane) % 5) * 1.3;
                            return (
                                <path
                                    key={`${n.row}-${n.lane}-${lane}`}
                                    className={`cm-edge${walked ? " is-walked" : ""}`}
                                    strokeDashoffset={off}
                                    d={`M ${x1} ${y1} C ${x1} ${y1 - bend}, ${x2} ${y2 + bend}, ${x2} ${y2}`}
                                />
                            );
                        }))}
                        {map.nodes.filter((n) => n.row === RUN_LENGTH - 1).map((n) => (
                            <path
                                key={`boss-${n.lane}`}
                                className="cm-edge"
                                d={`M ${xOf(n.lane)} ${yOf(n.row)} C ${xOf(n.lane)} ${yOf(n.row) - ROW_H * 0.4}, ${W / 2} ${PAD_TOP + ROW_H * 0.4}, ${W / 2} ${PAD_TOP - 4}`}
                            />
                        ))}
                    </svg>

                    {map.nodes.filter((n) => n.kind !== "boss").map((n) => {
                        const k = `${n.row}:${n.lane}`;
                        const isOpen = open.has(k);
                        const isTaken = taken.has(k);
                        return (
                            <button
                                key={k}
                                type="button"
                                disabled={!isOpen || busy}
                                className={`cm-node${isOpen ? " is-open" : ""}${isTaken ? " is-taken" : ""}`}
                                style={{ left: `${xOf(n.lane)}%`, top: `${(yOf(n.row) / H) * 100}%` }}
                                onClick={() => enter(n)}
                                onPointerEnter={() => setPeek(LABEL[n.kind])}
                                onPointerLeave={() => setPeek(null)}
                                aria-label={`${LABEL[n.kind]}, floor ${n.row + 1}`}
                            >
                                {/* The visited ring is a DRAWING, hung behind a shrunken mark — theirs is a
                                    brush circle with the ends not quite meeting, not a border-radius. */}
                                {isTaken ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img className="cm-ring" src="/images/cards/chrome/map-visited.png" alt="" />
                                ) : null}
                                <Ink kind={n.kind} className="cm-ink" />
                            </button>
                        );
                    })}

                    <button
                        type="button"
                        disabled={!bossOpen || busy || !bossNode}
                        className={`cm-node cm-boss${bossOpen ? " is-open" : ""}`}
                        style={{ left: "50%", top: `${((PAD_TOP - 4) / H) * 100}%` }}
                        onClick={() => bossNode && enter(bossNode)}
                        onPointerEnter={() => setPeek(LABEL.boss || "Boss")}
                        onPointerLeave={() => setPeek(null)}
                        aria-label="The boss"
                    >
                        <Ink kind="boss" className="cm-ink" />
                    </button>
                </div>
                {/* ── THE SHEET RUNS ON PAST THE LAST ROOM ────────────────────────────────────────────
                    The bottom row is the one you are standing on — the sheet opens there, because you climb
                    it — and the Return ribbon is pinned to the bottom-left of the same box. On a phone those
                    are the same place: measured at 390x844, the ribbon covered 0-158 x 774-826 and the run's
                    ONLY reachable room sat at 23-55 x 758-790 underneath it. A hit-test at the room's dead
                    centre returned `cm-return`, so the tap opening the run could not be made at all.
                    (The wide layout never showed it — the ribbon is far left of a centred column there.)
                    A tail of dead parchment gives the scroll somewhere to go, so the opening scroll can put
                    the row at the 62% it always meant to and the ribbon has only sheet underneath it. Height
                    covers the ribbon's band (18px up, 52 tall) plus a node's half-height and a margin. */}
                <div className="cm-tail" aria-hidden="true" />
            </div>

            {/* ── THE LEGEND ── on the scroll, where theirs is. */}
            <aside className="cm-legend">
                <b className="cm-legend-title">Legend</b>
                {["unknown", "merchant", "treasure", "rest", "fight", "elite"].map((kind) => (
                    <span key={kind} className="cm-leg">
                        <Ink kind={kind} className="cm-leg-ink" />
                        {LABEL[kind]}
                    </span>
                ))}
            </aside>

            {/* ⚠️ RETURN MEANS "GET UP FROM THE TABLE", NOT "LEAVE THE GAME". It used to push straight to the
                town, which is a whole feature deep: Luke, lost on the sheet, "you wanna go to return, but then
                it takes you all the way back out of the entire game." It lands in the card game's own front
                room now (see CardTable), and the ribbon THERE is the one that puts you in the town. */}
            <button type="button" className="cm-return" onClick={() => router.push("/marketplace/cards/table")}>
                Return
            </button>

            {peek ? <span className="cm-peek">{peek}</span> : null}

            {deckOpen ? (
                <div className="cm-over" onClick={() => setDeckOpen(false)} role="presentation">
                    <div className="cm-deck" onClick={(e) => e.stopPropagation()} role="presentation">
                        <h2>Your deck — {(run.deck || []).length} cards</h2>
                        <div className="cm-deck-list">
                            {deck.map(({ card, n }) => (
                                <span key={card.id} className="cm-deck-row">
                                    <b>{n}x</b> {card.name}
                                    <i>{String(card.text).replace(/\{(\w+)\}/g, (_, f) => card[f])}</i>
                                </span>
                            ))}
                        </div>
                        <button type="button" className="cm-close" onClick={() => setDeckOpen(false)}>Close</button>
                    </div>
                </div>
            ) : null}

            <style jsx global>{`
                .cm { position: fixed; inset: 0; z-index: 4000; background: #0a0b0f; color: #e9edf2;
                    display: grid; grid-template-rows: auto auto 1fr; overflow: hidden; }

                /* Flat slate, no boxes, no rounded anything — theirs has none. */
                .cm-bar { display: flex; align-items: center; gap: 7px; padding: 7px 12px;
                    background: #3d4550; border-bottom: 1px solid rgba(0,0,0,0.35); }
                .cm-who { font-size: 15px; font-weight: 700; color: #f2f4f7; margin-right: 6px; }
                .cm-ui { width: 21px; height: 21px; object-fit: contain; }
                .cm-hp { font-size: 15px; font-weight: 700; color: #ff5f5f; font-variant-numeric: tabular-nums; }
                .cm-em { font-size: 15px; font-weight: 700; color: #ffb63d;
                    font-variant-numeric: tabular-nums; }
                .cm-fl { font-size: 15px; font-weight: 700; color: #e8ecf1; font-variant-numeric: tabular-nums; }
                .cm-potion { display: inline-flex; }
                .cm-gap { flex: 1; }
                .cm-clock { font-size: 13px; color: #aeb6c2; font-variant-numeric: tabular-nums; margin: 0 4px; }
                .cm-tool { display: grid; place-items: center; width: 26px; height: 26px; padding: 0;
                    border: 0; background: none; cursor: pointer; opacity: 0.72; }
                .cm-tool.is-on, .cm-tool:hover { opacity: 1; }
                .cm-tool img { width: 24px; height: 24px; object-fit: contain; }

                /* The dark strip perks live in, present whether or not anything is in it. */
                .cm-perkbar { display: flex; align-items: center; gap: 6px; min-height: 30px;
                    padding: 2px 12px; background: #22272f; border-bottom: 1px solid rgba(0,0,0,0.4); }
                .cm-perk img { width: 20px; height: 20px; object-fit: contain; }

                .cm-sheet { position: relative; overflow-y: auto; overflow-x: hidden; height: 100%; }
                .cm-inner { position: relative; width: min(520px, 100%); margin: 0 auto;
                    background: linear-gradient(180deg, #c9bb9a, #bdad89); }
                .cm-svg { display: block; width: 100%; height: auto; }
                /* Same parchment as the sheet's bottom edge, so it reads as more map rather than a gap. */
                .cm-tail { width: min(520px, 100%); margin: 0 auto; height: 96px; background: #bdad89; }

                /* ── OPAQUE INK ─────────────────────────────────────────────────────────────────────────
                   No alpha anywhere on these strokes. With alpha, two routes crossing drew twice and the
                   overlap went darker — Luke: "when they overlap each other they multiply the transparency."
                   A flat colour looks identical whether one line is there or three, which is what theirs does.
                   The dash pattern is uneven on purpose; a regular one reads as a plot. */
                .cm-edge { fill: none; stroke: #8f8c78; stroke-width: 0.9;
                    stroke-dasharray: 2.6 2.9 1.5 3.2; stroke-linecap: round; }
                .cm-edge.is-walked { stroke: #2b2418; stroke-width: 1.25; stroke-dasharray: 3.2 2.4; }

                /* ── A MARK, AND NOTHING ELSE ───────────────────────────────────────────────────────────
                   No disc, no ring, no border: theirs is a bare brush mark on the paper and it survives the
                   routes because it is thick. Three states and one hover. */
                .cm-node { position: absolute; transform: translate(-50%, -50%); width: 36px; height: 36px;
                    display: grid; place-items: center; padding: 0; border: 0; background: none;
                    cursor: default; transition: transform 120ms ease-out; }
                .cm-ink { width: 100%; height: 100%; object-fit: contain; opacity: 0.3; }
                .cm-node.is-open { cursor: pointer; }
                .cm-node.is-open .cm-ink { opacity: 1; }
                /* Hover is a WHITE STICKER OUTLINE round the mark's own silhouette — stacked drop-shadows,
                   because that is the only thing that follows an alpha shape rather than a box. */
                .cm-node.is-open:hover { transform: translate(-50%, -50%) scale(1.1); }
                .cm-node.is-open:hover .cm-ink {
                    filter: drop-shadow(1.5px 0 0 #fff) drop-shadow(-1.5px 0 0 #fff)
                            drop-shadow(0 1.5px 0 #fff) drop-shadow(0 -1.5px 0 #fff)
                            drop-shadow(1px 1px 0 #fff) drop-shadow(-1px -1px 0 #fff); }
                /* Visited: a small mark inside the drawn ring. */
                .cm-node.is-taken .cm-ink { width: 52%; height: 52%; opacity: 0.92; }
                .cm-ring { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain;
                    opacity: 0.92; pointer-events: none; }
                .cm-boss { width: 52px; height: 52px; }
                .cm-boss .cm-ink { opacity: 0.42; }
                .cm-boss.is-open .cm-ink { opacity: 1; }

                /* ── THE LEGEND, ON A SCROLL ────────────────────────────────────────────────────────────── */
                /* The curls at each end of the scroll are part of the picture, so the list has to start
                   BELOW the top one and stop above the bottom one — at 26px of padding the title sat on the
                   roll and "Elite" fell off the end. */
                /* ⚠️ THE SIDE PADDING IS PIXELS, AND NEVER A PERCENTAGE. The rolls are WIDER than the paper —
                   the written surface spans 14%–85% of the art — so the list has to start 14% of the SCROLL'S
                   width in, and 12px did not reach it: the marks sat out on the rolled edge. A percentage
                   looks like the fix and is not: percentage padding resolves against the CONTAINING BLOCK,
                   which here is .cm (the whole viewport), so 14% became 55px on a 128px-wide scroll, the
                   text was shoved past the right roll, and it bled off the other side instead. These are 14%
                   and 15% of 146 and of 128, worked out by hand. Re-do the sums if either width changes. */
                .cm-legend { position: absolute; right: 6px; top: 78px; width: 146px; padding: 52px 22px 54px 21px;
                    /* justify-CONTENT centres the whole list as one block on the paper; justify-ITEMS keeps
                       the rows left-aligned to each other so the marks still read as a column. Left-aligned
                       alone leaves the block hugging the left roll, because the longest row is well short of
                       the paper's width. */
                    display: grid; gap: 5px; justify-content: center; justify-items: start;
                    color: #1b2430; font-size: 11.5px;
                    background-image: url(/images/cards/chrome/legend-scroll.png);
                    background-size: 100% 100%; background-repeat: no-repeat;
                    /* ⚠️ IT IS A KEY, NOT A CONTROL, AND IT SITS ON TOP OF THE LANES. There is nothing on this
                       scroll to press, and it covers the top-right corner of the sheet — so without this, a
                       room that scrolls underneath it becomes a room you cannot walk into, and the tap dies
                       silently on a piece of paper. The same z-order trap the farm's decorations and the map's
                       own Return ribbon have both sprung before. */
                    pointer-events: none;
                    filter: drop-shadow(0 6px 14px rgba(0,0,0,0.5)); }
                .cm-legend-title { justify-self: center; font-size: 14px; font-weight: 700; margin-bottom: 2px; }
                .cm-leg { display: flex; align-items: center; gap: 7px; }
                /* The grid box is kept for the fallback <b>: width and height do NOTHING to inline text, so
                   any kind that ever loses its drawing would otherwise sit narrower than the rest and drag
                   its label left of every other one. Every kind has a mark today. */
                .cm-leg-ink { flex: 0 0 15px; width: 15px; height: 15px; object-fit: contain;
                    display: grid; place-items: center; font-size: 12px; }

                /* ── RETURN, ON THE RIBBON ──────────────────────────────────────────────────────────────── */
                .cm-return { position: absolute; left: 0; bottom: 18px; width: 158px; height: 52px;
                    padding: 0 34px 0 10px; border: 0; cursor: pointer;
                    font-family: inherit; font-weight: 700; font-size: 15px; color: #ffe6a6;
                    text-shadow: 0 2px 3px rgba(0,0,0,0.7); text-align: center; }
                /* ⚠️ NOT a ::before with z-index -1. That put the ribbon behind the button's own background
                   layer and it rendered as nothing at all — the text floated on the map with no ribbon under
                   it. The image is the button's background, which cannot be outrun by a stacking context. */
                .cm-return { background-color: transparent;
                    background-image: url(/images/cards/chrome/return-ribbon.png);
                    background-size: 100% 100%; background-repeat: no-repeat;
                    filter: drop-shadow(0 4px 8px rgba(0,0,0,0.55)); }
                .cm-return:hover { filter: brightness(1.1); }

                .cm-peek { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%);
                    max-width: 62vw; padding: 6px 12px; border-radius: 4px; font-size: 11.5px;
                    text-align: center; background: rgba(10,12,16,0.92); color: #f2e2bd; }

                .cm-over { position: fixed; inset: 0; z-index: 4100; display: grid; place-items: center;
                    padding: 16px; background: rgba(4,5,8,0.88); }
                .cm-deck { width: min(460px, 100%); max-height: 78dvh; overflow-y: auto; padding: 16px;
                    display: grid; gap: 10px; background: rgba(12,15,21,0.96); border-radius: 12px;
                    border: 1px solid rgba(201,162,83,0.35); }
                .cm-deck h2 { margin: 0; font-size: 17px; color: #f3e7c8; text-align: center; }
                .cm-deck-list { display: grid; gap: 5px; }
                .cm-deck-row { display: flex; gap: 6px; align-items: baseline; font-size: 12.5px; color: #dbe2ea; }
                .cm-deck-row b { color: #ffd08a; }
                .cm-deck-row i { font-style: normal; color: #8e96a3; }
                .cm-close { justify-self: center; padding: 8px 20px; border-radius: 999px; cursor: pointer;
                    border: 2px solid #c9a253; background: rgba(18,22,30,0.92); color: #f2e2bd;
                    font-family: inherit; font-weight: 700; }

                @media (max-width: 520px) {
                    .cm-bar { gap: 5px; padding: 6px 8px; }
                    .cm-who { display: none; }
                    .cm-legend { width: 128px; top: 72px; font-size: 10.5px; padding: 46px 19px 48px 18px; }
                    .cm-node { width: 32px; height: 32px; }
                }
                /* ── AND ON A SHORT SCREEN THE KEY GETS OUT OF THE WAY ────────────────────────────────────
                   A phone is 441px tall once the browser's own chrome is off it, and the scroll at its 520px
                   width was 128 wide by about 250 tall — a third of the width and better than half the height
                   of the map, sitting on top of the right-hand lanes. Theirs is pinned in the corner of a
                   screen four times this size, where the same panel is a twelfth of it.
                   SCALED, not re-padded: two thirds of the scroll's height is the painted rolls at its top and
                   bottom, and squeezing the padding to shrink it compresses those rolls into flat bands. A
                   transform takes the whole drawing down together and the art keeps its proportions. */
                @media (max-height: 560px) {
                    .cm-legend { transform: scale(0.68); transform-origin: top right; }
                }
            `}</style>
        </div>
    );
}
