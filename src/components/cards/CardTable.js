"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Cinzel } from "next/font/google";

import { RUN_LENGTH, stopLabel } from "@/lib/marketplace/cards-kit.js";

// ── THE TABLE YOU SIT DOWN AT ────────────────────────────────────────────────────────────────────────────
// The card game had no front room. Every other feature in the Den has one — the mine has a shaft head, the
// kitchen has a kitchen, the tavern has a floor you stand on — and the way out of each of them is a step back
// into that room, not a step out of the game. Cards had a map and then the town: Luke, on the sheet, "it's
// weird when you're looking at the map that you kinda get lost, and you wanna go to return, but then it takes
// you all the way back out of the entire game. I think it should take you to like a screen like we do for our
// other features."
//
// THE FICTION WAS ALREADY WRITTEN. You reach the run through the stranger at the back table of the tavern —
// he shuffles without looking at his hands and says "Sit. One run, eight rooms. You in?" (SHARP_LINES in
// TavernInterior). This is that table, from your side of it: the back room, the lamp, and him waiting.
//
// SO RETURN MEANS "GET UP", not "leave". The map's ribbon and the fight's Leave both land here now, and the
// only thing on this screen that puts you back in the town is the ribbon at the bottom — one more press, and
// a press you meant.
const panelFont = Cinzel({ subsets: ["latin"], weight: ["600", "700"], display: "swap" });

export default function CardTable({ run }) {
    const router = useRouter();
    // The push is a server render away (auth, the run row, then a map), so the button has to say it heard you
    // or it reads as dead — the same half-second the map's room buttons cover with `busy`.
    const [going, setGoing] = useState(false);

    // A run that ended is not a run you can walk back into: the page behind this one will start a new one the
    // moment you sit. Saying so is the difference between "Sit back down" lying to you and the sharp dealing.
    const live = Boolean(run && !run.done);
    const sit = () => { setGoing(true); router.push("/marketplace/cards"); };

    return (
        <div className={`ct ${panelFont.className}`}>
            <div className="ct-room" aria-hidden="true" />

            <div className="ct-stage">
                <p className="ct-say">
                    {live
                        ? "Your seat's still warm. The deck hasn't moved."
                        : run?.done === "won"
                            ? "You walked out of the last one. Sit down and we'll go again."
                            : run?.done === "dead"
                                ? "That one went badly. Cut the deck, start over."
                                : `One run, ${RUN_LENGTH} rooms. You in?`}
                </p>

                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="ct-sharp" src="/images/cards/chrome/table-sharp.png" alt="" draggable="false" />

                {/* ── WHAT IS ON THE TABLE ── the run, in one line, before you commit to going back to it.
                    A front room that cannot tell you how far in you are is a door with a picture on it. */}
                {live ? (
                    <p className="ct-state">
                        {stopLabel(run.stop || 1)}
                        <span className="ct-dot" aria-hidden="true">·</span>
                        <b className="ct-hp">{run.hp}/{run.hpMax}</b> health
                        <span className="ct-dot" aria-hidden="true">·</span>
                        <b className="ct-em">{(run.embers || 0).toLocaleString()}</b> embers
                        <span className="ct-dot" aria-hidden="true">·</span>
                        {(run.deck || []).length} cards
                    </p>
                ) : null}

                <button type="button" className="ct-do" disabled={going} onClick={sit}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="ct-plate" src="/images/cards/chrome/button-plate.png" alt="" />
                    <span className="ct-do-label">{going ? "…" : live ? "Sit back down" : "Sit down"}</span>
                </button>

                {/* ── THE CABINET, FROM THE FRONT ROOM ────────────────────────────────────────────────
                    The collection is the thing you can look at when you do NOT want to start a run, which is
                    exactly what a front room is for. Quiet, under the button: the sharp is asking you to sit,
                    not to browse. */}
                <button type="button" className="ct-see" onClick={() => router.push("/marketplace/cards/collection")}>
                    See every card
                </button>
            </div>

            {/* The same ribbon the map and the rooms leave on, and from here it does what it says. */}
            <button type="button" className="ct-return" onClick={() => router.push("/marketplace/town")}>
                Return
            </button>

            {/* Global for the same reason the shop's and the rooms' are: every selector is under `.ct`, which
                is this screen and nothing else on the site. */}
            <style jsx global>{`
                .ct { position: fixed; inset: 0; z-index: 4000; overflow: hidden;
                    display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
                    padding: 0 10px 18px; background: #0a0b0f; color: #efe3cd; }
                .ct-room { position: fixed; inset: 0; z-index: -1;
                    background: #0a0b0f url(/images/cards/chrome/table-room.png) center/cover no-repeat; }
                /* The room is painted dim and lit from one lamp; the vignette is what keeps the corners from
                   competing with him once the image is stretched over a wide screen. */
                .ct-room::after { content: ""; position: absolute; inset: 0;
                    background: radial-gradient(ellipse at 50% 42%, rgba(10,11,15,0.05), rgba(6,7,10,0.88) 78%); }

                .ct-stage { flex: 1; width: min(680px, 100%);
                    display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
                    gap: 10px; padding-bottom: 6px; }

                /* ── HIM ── bottom-anchored, because he is drawn seated behind a table and the table edge is
                   the bottom of the cutout. Floating him in the middle of the room stands him up. */
                .ct-sharp { width: min(320px, 66vw); height: auto; object-fit: contain; margin-bottom: -4px;
                    filter: drop-shadow(0 14px 22px rgba(0,0,0,0.85)); }

                .ct-say { margin: 0; max-width: 340px; text-align: center; font-size: 13.5px; line-height: 1.4;
                    color: #c3b49c; font-style: italic; text-shadow: 0 1px 3px rgba(0,0,0,0.9); }

                .ct-state { margin: 0; display: flex; flex-wrap: wrap; justify-content: center; gap: 0 6px;
                    font-size: 13px; color: #d8c9ad; text-shadow: 0 1px 3px rgba(0,0,0,0.9); }
                .ct-state b { font-variant-numeric: tabular-nums; }
                .ct-hp { color: #ff8f7a; }
                .ct-em { color: #ffb45e; }
                .ct-dot { opacity: 0.5; }

                .ct-do { position: relative; width: 210px; height: 50px; padding: 0; border: 0;
                    background: none; cursor: pointer; display: grid; place-items: center; }
                .ct-plate { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill;
                    filter: drop-shadow(0 3px 6px rgba(0,0,0,0.7)); }
                .ct-do-label { position: relative; font-size: 15px; font-weight: 700; letter-spacing: 0.02em;
                    color: #ffe6d2; text-shadow: 0 1px 3px rgba(0,0,0,0.9); }
                .ct-do:disabled { cursor: default; }
                .ct-do:disabled .ct-plate { filter: grayscale(0.7) brightness(0.62); }
                /* A LINK, NOT A SECOND PLATE. Two painted buttons of the same weight is a screen asking two
                   questions; this one is a door in the corner of the room. */
                .ct-see { margin-top: -2px; padding: 4px 8px; border: 0; background: none; cursor: pointer;
                    font: inherit; font-size: 12.5px; letter-spacing: 0.04em; color: #c3b49c;
                    text-decoration: underline; text-underline-offset: 3px;
                    text-decoration-color: rgba(195,180,156,0.4);
                    text-shadow: 0 1px 3px rgba(0,0,0,0.9); }
                .ct-see:hover { color: #ffe6d2; }

                /* ⚠️ PINNED, AND NOTHING UNDERNEATH IT. The map's own ribbon covered the run's only reachable
                   room on a phone (see the note in CardMap), and the first cut of this screen sprang the same
                   trap: at 375 the ribbon runs 0-158 and a centred 210px button runs 82-292, so Return sat on
                   top of Sit back down. On a wide screen the column is far to the right of it; on a narrow one
                   the stage is given the ribbon's whole band as padding below. */
                .ct-return { position: absolute; left: 0; bottom: 18px; width: 158px; height: 52px;
                    padding: 0 34px 0 10px; border: 0; cursor: pointer; background-color: transparent;
                    background-image: url(/images/cards/chrome/return-ribbon.png);
                    background-size: 100% 100%; background-repeat: no-repeat;
                    font-family: inherit; font-weight: 700; font-size: 15px; color: #ffe6a6;
                    text-shadow: 0 2px 3px rgba(0,0,0,0.7); text-align: center;
                    filter: drop-shadow(0 4px 8px rgba(0,0,0,0.55)); }
                .ct-return:hover { filter: brightness(1.1); }

                @media (max-width: 560px) { .ct-stage { padding-bottom: 74px; } }
                @media (min-width: 760px) {
                    .ct-sharp { width: min(400px, 34vw); }
                    .ct-say { font-size: 15px; max-width: 440px; }
                }
                /* A phone leaves about 441px once the browser's chrome is off it, and he is the tallest thing
                   on the screen — the same fold the campfire's second button fell under. He gives way; the
                   button he is asking you to press does not. */
                @media (max-height: 560px) {
                    .ct-sharp { width: min(190px, 44vw); }
                    .ct-say { font-size: 12.5px; }
                    .ct-stage { gap: 6px; }
                    .ct-do { height: 44px; width: 190px; }
                    .ct-do-label { font-size: 13.5px; }
                    .ct-return { width: 132px; height: 46px; bottom: 12px; font-size: 13.5px; }
                }
            `}</style>
        </div>
    );
}
