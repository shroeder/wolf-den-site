"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Cinzel } from "next/font/google";
import {
    GiBackpack, GiCampfire, GiCardRandom, GiCrownedSkull, GiHeartPlus, GiHornedSkull, GiLanternFlame,
    GiMonsterGrasp, GiOpenTreasureChest, GiPawPrint, GiPotionBall, GiRoundShield, GiScrollUnfurled,
    GiSwapBag, GiSwordWound, GiTreasureMap,
} from "react-icons/gi";

import { MAP_LANES, reachable } from "@/lib/marketplace/cards-map.js";
import { PERKS, POTIONS, POTION_SLOTS, RUN_LENGTH, cardById } from "@/lib/marketplace/cards-kit.js";

const panelFont = Cinzel({ subsets: ["latin"], weight: ["600", "700"], display: "swap" });

// ── THE OVERWORLD ────────────────────────────────────────────────────────────────────────────────────────────
// Slay the Spire's map, rebuilt against a screenshot of the real thing. Luke, on the first cut: "there's a lot
// of differences between ours and theirs — really get it to match."
//
// WHAT THIS PASS FIXED, in his words, in order of how much each mattered:
//
//   1. "THEIR SPRITES HAVE A FILL SO THEY DON'T CONFLICT WITH THE WALKED TRAIL." Ours were transparent glyphs
//      and the dashed routes ran straight through them, so a room read as part of a line rather than a thing
//      sitting ON the paper. Every room now sits on an opaque disc of the paper's own colour. That one trick
//      is why their sheet stays legible where six routes cross.
//   2. "THEY SHOW THE ONES YOU'VE COMPLETED WITH A LITTLE CIRCLE AROUND IT." Visited rooms carry a drawn ring.
//      Reachable rooms are solid black on cream. Everything else is faint. Three states, no more.
//   3. "OUR PATHS LOOK WAY WORSE." Theirs bow GENTLY. Ours put control points half a row deep, which threw
//      loops that crossed neighbouring routes and made the sheet unreadable.
//   4. The top bar carries what theirs carries: health, the zone, potions, the floor and the run clock, with
//      the map and the deck on the right.
//   5. Perks sit under the bar on the left and Return sits at the bottom left, both where theirs are.

// ── MAP INK, NOT UI ICONS ────────────────────────────────────────────────────────────────────────────────
// Luke: "the key difference between us and them is that they have actual sprites." These were react-icons
// glyphs — even-stroke shapes designed to sit in a toolbar — and theirs are stamped map symbols with the
// weight of something drawn onto a chart. That difference is most of why their sheet reads as a map and ours
// read as a diagram.
//
// Flat black on transparency, so ONE file serves all three states: faint, reachable and visited are opacity
// and rings in CSS rather than three drawings. Unknown stays a typed "?" because a question mark IS the
// symbol — drawing one would only make it worse.
const GLYPH = {
    fight: "/images/cards/chrome/map-fight.png",
    elite: "/images/cards/chrome/map-elite.png",
    rest: "/images/cards/chrome/map-rest.png",
    merchant: "/images/cards/chrome/map-merchant.png",
    treasure: "/images/cards/chrome/map-treasure.png",
    boss: "/images/cards/chrome/map-boss.png",
};
const Mark = ({ kind }) => (GLYPH[kind]
    // eslint-disable-next-line @next/next/no-img-element
    ? <img className="cm-mark" src={GLYPH[kind]} alt="" draggable="false" />
    : <b className="cm-q">?</b>);
const LABEL = {
    fight: "Enemy", elite: "Elite", rest: "Rest", merchant: "Merchant",
    treasure: "Treasure", unknown: "Unknown", boss: "Boss",
};
// Perks and potions are DATA in cards-kit; the picture for each lives here, because an icon is a rendering
// decision and the rules file has no business knowing react-icons exists.
const MARK = {
    heart: GiHeartPlus, sword: GiSwordWound, shield: GiRoundShield, paw: GiPawPrint,
    lantern: GiLanternFlame, ration: GiBackpack, draw: GiCardRandom, heal: GiHeartPlus,
    energy: GiLanternFlame,
};

const W = 100;
// ⚠️ VIEWBOX UNITS, and the sheet scales to width — a row gap on screen is ROW_H x (width / W). At 46 on a
// 412px phone that came out as 190px between rows, with four rooms visible.
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

export default function CardMap({ run }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [peek, setPeek] = useState(null);
    const [deckOpen, setDeckOpen] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const sheet = useRef(null);

    const map = run.map;
    const trail = useMemo(() => run.trail || [], [run.trail]);
    const taken = useMemo(() => new Set(trail.map((t) => `${t.row}:${t.lane}`)), [trail]);
    const last = trail.length ? trail[trail.length - 1] : null;
    const open = useMemo(
        () => new Set(reachable(map, last).map((n) => `${n.row}:${n.lane}`)),
        [map, last]
    );

    // The run clock, one second at a time, and only while this screen is up. It talks to nothing — check:polls
    // is about timers that hit the server, and this one never does.
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);

    // You climb this sheet, so it opens at the BOTTOM. A scroller starts at the top unless told otherwise,
    // which put the boss on screen and the six entrances a page and a half below it.
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

    const bossOpen = trail.some((t) => t.row === RUN_LENGTH - 1);
    const perks = run.perks || [];
    const potions = run.potions || [];
    const deck = useMemo(() => {
        const counted = new Map();
        for (const id of run.deck || []) counted.set(id, (counted.get(id) || 0) + 1);
        return [...counted.entries()].map(([id, n]) => ({ card: cardById(id), n })).filter((x) => x.card);
    }, [run.deck]);

    return (
        <div className={`cm ${panelFont.className}`}>
            {/* ── THE TOP BAR ── what theirs carries, in theirs' order: who and where on the left, the floor
                in the middle, the clock and the two books on the right. */}
            <div className="cm-bar">
                <span className="cm-zone">The Sand</span>
                <span className="cm-stat is-hp"><GiHeartPlus aria-hidden="true" />{run.hp}/{run.hpMax}</span>
                <span className="cm-stat is-em"><GiLanternFlame aria-hidden="true" />{run.embers || 0}</span>
                <span className="cm-potions">
                    {Array.from({ length: POTION_SLOTS }).map((_, i) => {
                        const p = POTIONS[potions[i]];
                        const Icon = p ? MARK[p.icon] || GiPotionBall : GiPotionBall;
                        return (
                            <i
                                key={`slot${i}`}
                                className={`cm-slot${p ? " is-full" : ""}`}
                                onPointerEnter={() => setPeek(p ? `${p.name} — ${p.text}` : "Empty potion slot")}
                                onPointerLeave={() => setPeek(null)}
                            >
                                <Icon aria-hidden="true" />
                            </i>
                        );
                    })}
                </span>
                <span className="cm-floor">Floor {last ? last.row + 1 : 0}/{RUN_LENGTH}</span>
                <span className="cm-clock">{clock(now - (run.startedAt || now))}</span>
                <button type="button" className="cm-icon is-on" aria-label="Map">
                    <GiTreasureMap aria-hidden="true" />
                </button>
                <button type="button" className="cm-icon" aria-label="Your deck" onClick={() => setDeckOpen(true)}>
                    <GiScrollUnfurled aria-hidden="true" />
                </button>
            </div>

            {/* ── PERKS ── under the bar on the left, where theirs sit. Hover names them. */}
            <div className="cm-perks">
                {perks.map((id) => {
                    const perk = PERKS[id];
                    const Icon = MARK[perk?.icon] || GiPawPrint;
                    return (
                        <i
                            key={id}
                            className="cm-perk"
                            onPointerEnter={() => setPeek(`${perk.name} — ${perk.text}`)}
                            onPointerLeave={() => setPeek(null)}
                        >
                            <Icon aria-hidden="true" />
                        </i>
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
                            // ── A GENTLE BOW, NOT A LOOP ────────────────────────────────────────────────
                            // Control points at roughly a quarter of the row gap. At a half they threw the
                            // big curves that swung across neighbouring routes; theirs bend just enough to
                            // read as drawn rather than plotted.
                            const bend = ROW_H * 0.28;
                            return (
                                <path
                                    key={`${n.row}-${n.lane}-${lane}`}
                                    className={`cm-edge${walked ? " is-walked" : ""}`}
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

                    {map.nodes.map((n) => {
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
                                <Mark kind={n.kind} />
                            </button>
                        );
                    })}

                    <div
                        className={`cm-node cm-boss${bossOpen ? " is-open" : ""}`}
                        style={{ left: "50%", top: `${((PAD_TOP - 4) / H) * 100}%` }}
                    >
                        <Mark kind="boss" />
                    </div>
                </div>
            </div>

            <aside className="cm-legend">
                {["unknown", "merchant", "treasure", "rest", "fight", "elite"].map((kind) => (
                    <span key={kind} className="cm-leg"><Mark kind={kind} />{LABEL[kind]}</span>
                ))}
            </aside>

            <button type="button" className="cm-return" onClick={() => router.push("/marketplace/town")}>
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
                    display: grid; grid-template-rows: auto 1fr; overflow: hidden; }

                .cm-bar { display: flex; align-items: center; gap: 12px; padding: 8px 12px;
                    font-size: 12px; letter-spacing: 0.04em; background: rgba(0,0,0,0.62);
                    border-bottom: 1px solid rgba(201,162,83,0.25); }
                .cm-zone { font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #d8cba8; }
                .cm-stat { display: inline-flex; align-items: center; gap: 4px; font-weight: 700;
                    font-variant-numeric: tabular-nums; }
                .cm-stat.is-hp { color: #ff8f9a; }
                .cm-stat.is-em { color: #ff9a4d; }
                .cm-potions { display: inline-flex; gap: 4px; }
                .cm-slot { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%;
                    border: 1px dashed rgba(201,162,83,0.4); color: rgba(201,162,83,0.35); font-size: 12px; }
                .cm-slot.is-full { border-style: solid; border-color: #c9a253; color: #ffd08a;
                    background: rgba(201,162,83,0.14); }
                .cm-floor { margin-left: auto; color: #b8a878; font-variant-numeric: tabular-nums; }
                .cm-clock { color: #8e96a3; font-variant-numeric: tabular-nums; }
                .cm-icon { display: grid; place-items: center; width: 28px; height: 28px; padding: 0;
                    border-radius: 7px; border: 1px solid rgba(201,162,83,0.3); background: rgba(255,255,255,0.04);
                    color: #d8cba8; font-size: 15px; cursor: pointer; }
                .cm-icon.is-on { border-color: #c9a253; background: rgba(201,162,83,0.18); color: #ffd08a; }

                .cm-perks { position: absolute; left: 10px; top: 46px; z-index: 3; display: flex; gap: 6px; }
                .cm-perk { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%;
                    background: rgba(10,12,16,0.85); border: 1px solid #c9a253; color: #ffd08a; font-size: 14px; }

                .cm-sheet { position: relative; overflow-y: auto; overflow-x: hidden; height: 100%; }
                .cm-inner { position: relative; width: min(520px, 100%); margin: 0 auto;
                    background: linear-gradient(180deg, #cdbd9a, #c3b08c);
                    box-shadow: 0 0 70px rgba(0,0,0,0.65) inset; }
                .cm-svg { display: block; width: 100%; height: auto; }
                .cm-edge { fill: none; stroke: rgba(46,36,22,0.4); stroke-width: 0.8;
                    stroke-dasharray: 2.2 2.6; stroke-linecap: round; }
                .cm-edge.is-walked { stroke: rgba(30,22,12,0.95); stroke-width: 1.3; stroke-dasharray: none; }

                /* ── A ROOM SITS ON THE PAPER, NOT IN THE LINE ───────────────────────────────────────────
                   The disc is the fix for "our sprites bleed in with the trail": it is opaque and the paper's
                   own colour, so a dashed route passes BEHIND a room instead of through it. The box-shadow
                   rings are drawn OUTSIDE that disc, which is how a completed room gets its circle without
                   the glyph moving a pixel. */
                .cm-node { position: absolute; transform: translate(-50%, -50%); width: 34px; height: 34px;
                    display: grid; place-items: center; padding: 0; border: 0; border-radius: 50%;
                    background: #cbb996; color: rgba(46,36,22,0.36); font-size: 19px; cursor: default;
                    box-shadow: 0 0 0 3px #cbb996; transition: transform 120ms ease-out; }
                /* One drawing, three states. The mark is black ink, so opacity alone reads as "out of reach"
                   without a second asset — the same trick that lets the chrome be tinted rather than redrawn. */
                .cm-mark { width: 74%; height: 74%; object-fit: contain; opacity: 0.34;
                    pointer-events: none; }
                .cm-node.is-taken .cm-mark { opacity: 0.8; }
                .cm-node.is-open .cm-mark { opacity: 1; }
                .cm-q { font-size: 0.95em; font-weight: 800; color: rgba(46,36,22,0.36); }
                .cm-node.is-taken .cm-q { color: rgba(30,22,12,0.85); }
                .cm-node.is-open .cm-q { color: #14100a; }
                .cm-leg .cm-mark { width: 15px; height: 15px; opacity: 0.95; filter: invert(88%) sepia(18%); }
                .cm-leg .cm-q { color: #d8cba8; }
                .cm-node.is-taken { color: rgba(30,22,12,0.85);
                    box-shadow: 0 0 0 3px #cbb996, 0 0 0 4.5px rgba(30,22,12,0.85); }
                .cm-node.is-open { color: #14100a; cursor: pointer; background: #fdf6e2;
                    box-shadow: 0 0 0 3px #fdf6e2, 0 0 0 5px #14100a; }
                .cm-node.is-open:hover { background: #fffdf4; transform: translate(-50%, -50%) scale(1.14);
                    box-shadow: 0 0 0 3px #fffdf4, 0 0 0 5px #14100a, 0 0 16px 5px rgba(255,240,190,0.85); }
                .cm-boss { width: 46px; height: 46px; font-size: 27px; }

                .cm-legend { position: absolute; right: 8px; top: 46px; display: grid; gap: 5px;
                    padding: 9px 11px; border-radius: 10px; font-size: 11px; letter-spacing: 0.04em;
                    background: rgba(10,12,16,0.85); border: 1px solid rgba(201,162,83,0.35); color: #d8cba8; }
                .cm-leg { display: flex; align-items: center; gap: 7px; }

                .cm-return { position: absolute; left: 12px; bottom: 14px; padding: 9px 20px; border-radius: 999px;
                    border: 2px solid #c9a253; background: rgba(18,22,30,0.92); color: #f2e2bd;
                    font-family: inherit; font-weight: 700; font-size: 13px; cursor: pointer; }
                .cm-peek { position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%);
                    max-width: 72vw; padding: 6px 12px; border-radius: 999px; font-size: 11.5px;
                    text-align: center; background: rgba(10,12,16,0.92); color: #f2e2bd;
                    border: 1px solid rgba(201,162,83,0.4); }

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
                    .cm-bar { gap: 8px; font-size: 11px; padding: 7px 8px; }
                    .cm-zone { display: none; }
                    .cm-legend { right: 4px; top: 42px; padding: 6px 8px; font-size: 10px; }
                    .cm-node { width: 30px; height: 30px; font-size: 17px; }
                }
            `}</style>
        </div>
    );
}
