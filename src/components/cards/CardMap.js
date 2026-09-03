"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Cinzel } from "next/font/google";
import {
    GiCampfire, GiCrownedSkull, GiHornedSkull, GiMonsterGrasp, GiOpenTreasureChest, GiSwapBag,
} from "react-icons/gi";

import { MAP_LANES, reachable } from "@/lib/marketplace/cards-map.js";
import { RUN_LENGTH } from "@/lib/marketplace/cards-kit.js";

const panelFont = Cinzel({ subsets: ["latin"], weight: ["600", "700"], display: "swap" });

// ── THE OVERWORLD ────────────────────────────────────────────────────────────────────────────────────────────
// Slay the Spire's map, rebuilt from an audit of the real thing rather than from memory of it. Luke: "audit
// Slay the Spire, figure out how they do their overworld, and implement that — look at every detail."
//
// WHAT THEIR SHEET IS, read off a screenshot of the game:
//   · a PARCHMENT COLUMN scrolled vertically, torn down both long edges, with faint sketches printed into the
//     paper behind the rooms
//   · rooms are small BLACK LINE GLYPHS — a horned face, a bigger horned skull, a campfire, a money bag, a
//     chest, a question mark. No panels, no plates, no colour anywhere on the sheet.
//   · routes are DASHED, CURVED lines. Not one straight segment on the whole map: a ruled line reads as a
//     diagram, and theirs reads as something drawn by hand.
//   · a room out of reach is FAINT. A room you can walk to is solid black inside a drawn ring. That contrast
//     is the entire interface — there is no "you are here" marker and no highlighting beyond it.
//   · a legend is pinned to the side listing every glyph, because a map of unlabelled symbols is a map you
//     have to learn before you can read.
//   · you climb: the bottom row is where you start, the boss sits above the top row.
//
// The map itself is GENERATED in cards-map.js to their documented rules — fifteen rows, six paths, the fixed
// floors, the weights. This file is only how it is drawn.

const GLYPH = {
    fight: GiMonsterGrasp,
    elite: GiHornedSkull,
    rest: GiCampfire,
    merchant: GiSwapBag,
    treasure: GiOpenTreasureChest,
    boss: GiCrownedSkull,
};
const LABEL = {
    fight: "Enemy", elite: "Elite", rest: "Rest", merchant: "Merchant",
    treasure: "Treasure", unknown: "Unknown", boss: "Boss",
};

// The sheet is drawn at a fixed intrinsic size and scaled to whatever screen it lands on, so none of these
// numbers ever has to know how wide a phone is.
// ⚠️ THESE ARE VIEWBOX UNITS AND THE SHEET IS SCALED TO WIDTH, so a row gap is ROW_H x (screen width / W).
// At 46 on a 412px phone that came out as 190px between rows and barely four rooms fit on the screen — a map
// you cannot see the shape of is not a map, it is a corridor. 26 puts about six rows in view, which is what
// theirs shows.
const W = 100;
const ROW_H = 26;
const PAD_TOP = 26;
const PAD_BOTTOM = 18;
const H = PAD_TOP + (RUN_LENGTH - 1) * ROW_H + PAD_BOTTOM;

const xOf = (lane) => 10 + (lane / (MAP_LANES - 1)) * (W - 20);
// Row 0 at the BOTTOM, like theirs. You climb the sheet rather than reading down it.
const yOf = (row) => H - PAD_BOTTOM - row * ROW_H;

export default function CardMap({ run }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [peek, setPeek] = useState(null);
    const sheet = useRef(null);


    const map = run.map;
    // Memoised on the run's own array rather than on `run.trail || []`, which builds a NEW empty array every
    // render and would make both memos below recompute forever.
    const trail = useMemo(() => run.trail || [], [run.trail]);
    const taken = useMemo(() => new Set(trail.map((t) => `${t.row}:${t.lane}`)), [trail]);
    const last = trail.length ? trail[trail.length - 1] : null;

    // Where the run may go next. With nothing walked yet that is the whole bottom row — their six entrances.
    const open = useMemo(
        () => new Set(reachable(map, last).map((n) => `${n.row}:${n.lane}`)),
        [map, last]
    );

// ── OPEN AT THE BOTTOM ───────────────────────────────────────────────────────────────────────────────
    // You climb this sheet, so the start of it is the bottom edge — and a scroller opens at the top unless it
    // is told otherwise, which put the boss on screen and the six entrances a page and a half below.
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

    return (
        <div className={`cm ${panelFont.className}`}>
            <div className="cm-top">
                <span>Floor {last ? last.row + 1 : 0} of {RUN_LENGTH}</span>
                <span className="cm-hp">{run.hp} / {run.hpMax}</span>
                <span className="cm-em">{run.embers || 0} embers</span>
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
                            return (
                                <path
                                    key={`${n.row}-${n.lane}-${lane}`}
                                    className={`cm-edge${walked ? " is-walked" : ""}`}
                                    d={`M ${x1} ${y1} C ${x1} ${y1 - ROW_H * 0.5}, ${x2} ${y2 + ROW_H * 0.5}, ${x2} ${y2}`}
                                />
                            );
                        }))}
                        {map.nodes.filter((n) => n.row === RUN_LENGTH - 1).map((n) => (
                            <path
                                key={`boss-${n.lane}`}
                                className="cm-edge"
                                d={`M ${xOf(n.lane)} ${yOf(n.row)} C ${xOf(n.lane)} ${yOf(n.row) - 20}, ${W / 2} ${PAD_TOP + 16}, ${W / 2} ${PAD_TOP - 4}`}
                            />
                        ))}
                    </svg>

                    {map.nodes.map((n) => {
                        const k = `${n.row}:${n.lane}`;
                        const Icon = GLYPH[n.kind];
                        const isOpen = open.has(k);
                        return (
                            <button
                                key={k}
                                type="button"
                                disabled={!isOpen || busy}
                                className={`cm-node${isOpen ? " is-open" : ""}${taken.has(k) ? " is-taken" : ""}`}
                                style={{ left: `${xOf(n.lane)}%`, top: `${(yOf(n.row) / H) * 100}%` }}
                                onClick={() => enter(n)}
                                onPointerEnter={() => setPeek(LABEL[n.kind])}
                                onPointerLeave={() => setPeek(null)}
                                aria-label={`${LABEL[n.kind]}, floor ${n.row + 1}`}
                            >
                                {Icon ? <Icon aria-hidden="true" /> : <b>?</b>}
                            </button>
                        );
                    })}

                    <div
                        className={`cm-node cm-boss${bossOpen ? " is-open" : ""}`}
                        style={{ left: "50%", top: `${((PAD_TOP - 4) / H) * 100}%` }}
                    >
                        <GiCrownedSkull aria-hidden="true" />
                    </div>
                </div>
            </div>

            <aside className="cm-legend">
                {["unknown", "merchant", "treasure", "rest", "fight", "elite"].map((kind) => {
                    const Icon = GLYPH[kind];
                    return (
                        <span key={kind} className="cm-leg">
                            {Icon ? <Icon aria-hidden="true" /> : <b>?</b>}
                            {LABEL[kind]}
                        </span>
                    );
                })}
            </aside>

            {peek ? <span className="cm-peek">{peek}</span> : null}

            <style jsx global>{`
                .cm { position: fixed; inset: 0; z-index: 4000; background: #0a0b0f; color: #e9edf2;
                    display: grid; grid-template-rows: auto 1fr; overflow: hidden; }
                .cm-top { display: flex; align-items: center; justify-content: center; gap: 18px;
                    padding: 10px 12px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase;
                    color: #b8a878; background: rgba(0,0,0,0.55); }
                .cm-hp { color: #ff8f9a; }
                .cm-em { color: #ff9a4d; }

                /* The paper. Flat warm fill rather than a texture: theirs is nearly flat too, and what
                   carries the screen is the drawing on it, not the grain of it. */
                .cm-sheet { position: relative; overflow-y: auto; overflow-x: hidden; height: 100%; }
                .cm-inner { position: relative; width: min(520px, 100%); margin: 0 auto;
                    background: linear-gradient(180deg, #cdbd9a, #c3b08c);
                    box-shadow: 0 0 70px rgba(0,0,0,0.65) inset; }
                .cm-svg { display: block; width: 100%; height: auto; }
                .cm-edge { fill: none; stroke: rgba(38,30,18,0.42); stroke-width: 0.7;
                    stroke-dasharray: 2.4 2.4; stroke-linecap: round; }
                .cm-edge.is-walked { stroke: rgba(38,30,18,0.95); stroke-width: 1.2; stroke-dasharray: none; }

                /* Out of reach it is faint; reachable it goes solid black inside a drawn ring. That contrast
                   IS the interface — theirs has no "you are here" marker beyond it. */
                .cm-node { position: absolute; transform: translate(-50%, -50%); width: 38px; height: 38px;
                    display: grid; place-items: center; padding: 0; border: 0; border-radius: 50%;
                    background: none; color: rgba(38,30,18,0.34); font-size: 21px; cursor: default; }
                .cm-node.is-taken { color: rgba(38,30,18,0.72); }
                .cm-node.is-open { color: #14100a; cursor: pointer; border: 2px solid #14100a;
                    background: rgba(255,252,240,0.55); }
                .cm-node.is-open:hover { background: #fffdf2; transform: translate(-50%, -50%) scale(1.12); }
                .cm-boss { width: 46px; height: 46px; font-size: 27px; color: rgba(38,30,18,0.45); }
                .cm-boss.is-open { color: #14100a; }

                .cm-legend { position: absolute; right: 8px; top: 60px; display: grid; gap: 6px;
                    padding: 10px 12px; border-radius: 10px; font-size: 11px; letter-spacing: 0.04em;
                    background: rgba(10,12,16,0.85); border: 1px solid rgba(201,162,83,0.35); color: #d8cba8; }
                .cm-leg { display: flex; align-items: center; gap: 7px; }
                .cm-peek { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%);
                    padding: 6px 12px; border-radius: 999px; font-size: 12px; letter-spacing: 0.08em;
                    text-transform: uppercase; background: rgba(10,12,16,0.92); color: #f2e2bd;
                    border: 1px solid rgba(201,162,83,0.4); }

                @media (max-width: 520px) {
                    .cm-legend { right: 4px; top: 52px; padding: 7px 8px; font-size: 10px; }
                    .cm-node { width: 30px; height: 30px; font-size: 17px; }
                }
            `}</style>
        </div>
    );
}
