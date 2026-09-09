"use client";

import { useState } from "react";
import CardFoot from "@/components/cards/CardFoot";
import { useRouter } from "next/navigation";
import { Cinzel } from "next/font/google";

import { ACTS, ASC_MAX, RUN_LENGTH, actName, ascRules, stopLabel } from "@/lib/marketplace/cards-kit.js";

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

export default function CardTable({ run, history = null }) {
    const router = useRouter();
    // The push is a server render away (auth, the run row, then a map), so the button has to say it heard you
    // or it reads as dead — the same half-second the map's room buttons cover with `busy`.
    const [going, setGoing] = useState(false);
    // ── WHICH RUNG YOU ARE CLIMBING ──────────────────────────────────────────────────────────────────
    // Opens on the highest one you have earned, because that is the one somebody who has been climbing wants
    // and nobody wants to press the arrow eight times. It can be walked back down: a bad week is allowed.
    const rank = history?.rank || null;
    // The shut unlock nearest to opening — the only one that changes what a player does next.
    const [showAll, setShowAll] = useState(false);
    const track = history?.track || [];
    const next = [...track].filter((t) => !t.open).sort((a, b) => b.part - a.part)[0] || null;
    const open = Math.max(0, Math.min(ASC_MAX, Number(history?.open) || 0));
    const [asc, setAsc] = useState(open);

    // A run that ended is not a run you can walk back into: the page behind this one will start a new one the
    // moment you sit. Saying so is the difference between "Sit back down" lying to you and the sharp dealing.
    const live = Boolean(run && !run.done);
    // ── SITTING DOWN AFTER A FINISHED RUN DEALS A NEW ONE ────────────────────────────────────────────
    // The page used to do this by accident, because loading a run quietly replaced a finished one. Now that
    // the ending survives a reload (see the note in the page), starting again has to be an actual request —
    // which is also the honest shape: the seat is where you choose to go again.
    const sit = async () => {
        setGoing(true);
        // A finished run is replaced by a new one AT THE CHOSEN RUNG — which is the only place the ladder is
        // ever picked, so it has to travel with the request rather than be assumed.
        if (run?.done) {
            await fetch("/api/marketplace/cards/run", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ action: "restart", asc }),
            }).catch(() => null);
        }
        router.push("/marketplace/cards");
    };

    return (
        <div className={`ct ${panelFont.className}`}>
            <div className="ct-room" aria-hidden="true" />

            <div className="ct-stage">
                {/* ── THE FIRST THING ON THE SCREEN IS THE THING THAT ONLY GOES UP ────────────────────
                    ⚠️ THIS WAS AT THE BOTTOM AND NOBODY WOULD EVER HAVE SEEN IT. Photographed at 375x667:
                    the rank sat under a five-row list of deaths, half of it behind the Return ribbon, and
                    the unlock track was entirely off the screen. A progress bar below the fold is not
                    progress, it is a fact stored somewhere. It goes first now, before the dealer. */}
                {rank ? (
                    <div className="ct-rank">
                        <div className="ct-rank-top">
                            <b className="ct-rank-name">{rank.name}</b>
                            <span className="ct-rank-lv">Rank {rank.level}</span>
                        </div>
                        <div className="ct-bar" role="presentation">
                            <i style={{ width: `${Math.round(rank.part * 100)}%` }} />
                        </div>
                        <p className="ct-rank-say">
                            {rank.next
                                ? <>{rank.need.toLocaleString()} more to <b>{rank.next.name}</b></>
                                : "Top of the ladder."}
                        </p>
                    </div>
                ) : null}

                <p className="ct-say">
                    {live
                        ? "Your seat's still warm. The deck hasn't moved."
                        : run?.done === "won"
                            ? "You walked out of the last one. Sit down and we'll go again."
                            : run?.done === "dead"
                                ? "That one went badly. Cut the deck, start over."
                                : `One run, three acts, ${ACTS * RUN_LENGTH} rooms. You in?`}
                </p>

                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="ct-sharp" src="/images/cards/chrome/table-sharp.png" alt="" draggable="false" />

                {/* ── WHAT IS ON THE TABLE ── the run, in one line, before you commit to going back to it.
                    A front room that cannot tell you how far in you are is a door with a picture on it. */}
                {live ? (
                    <p className="ct-state">
                        {stopLabel(run.stop || 1, { act: run.act })}
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

                {/* ── AND ONE LINE ABOUT WHAT IS COMING ───────────────────────────────────────────────
                    The track was eight rows of mostly-finished goals, which is a checklist rather than a
                    pull. The one that is CLOSEST is the only row that changes what somebody does next, so
                    that is the row it shows — with the rest a tap away for anybody who wants the list. */}
                {next ? (
                    <button type="button" className="ct-next" onClick={() => setShowAll((v) => !v)}>
                        <span className="ct-next-tag">Next card</span>
                        {/* The count sits BESIDE the sentence, not under the bar — grid fills in DOM order,
                            and a bar that spans both columns pushes anything after it onto a new row. */}
                        <b>{next.how}</b>
                        <em>{next.at}/{next.want}</em>
                        <span className="ct-next-bar"><i style={{ width: `${Math.round(next.part * 100)}%` }} /></span>
                    </button>
                ) : track.length ? (
                    <button type="button" className="ct-next is-done" onClick={() => setShowAll((v) => !v)}>
                        <span className="ct-next-tag">Cards from playing</span>
                        <b>All {track.length} earned</b>
                    </button>
                ) : null}

                {showAll && track.length ? (
                    <ul className="ct-track-list">
                        {track.map((t) => (
                            <li key={t.id} className={t.open ? "is-open" : ""}>
                                <span className="ct-track-name">{t.open ? t.name : "Locked"}</span>
                                {t.open
                                    ? <i className="ct-track-by">{t.by === "rank" ? `Rank ${t.level}` : "Earned"}</i>
                                    : <><i className="ct-track-how">{t.how}</i><em className="ct-track-at">{t.at}/{t.want}</em></>}
                            </li>
                        ))}
                    </ul>
                ) : null}

                {/* ── THE CABINET, FROM THE FRONT ROOM ────────────────────────────────────────────────
                    The collection is the thing you can look at when you do NOT want to start a run, which is
                    exactly what a front room is for. Quiet, under the button: the sharp is asking you to sit,
                    not to browse. */}
                {/* ── WHAT YOU HAVE DONE BEFORE ────────────────────────────────────────────────────────
                    A finished run used to leave one sentence and nothing else, so there was never a number to
                    beat — which is most of why there was no reason to play a second one. The best score sits
                    where you can see it before you sit down, and the last few runs say plainly how each one
                    ended and how far it got. */}
                {/* ── THE LADDER ───────────────────────────────────────────────────────────────────────
                    Only shown once a rung is open, which means a first-time player never sees it: the game
                    has to be beaten once before it offers to be made harder. Theirs works the same way, and
                    it is the difference between a difficulty setting and something you earned.
                    The rules in force are listed rather than summarised, because "harder" is not a thing
                    anybody can plan around and "elites are tougher, and you start hurt" is. */}
                {open > 0 && !live ? (
                    <div className="ct-ladder">
                        <div className="ct-rungs">
                            <button type="button" className="ct-rung" disabled={asc <= 0}
                                aria-label="A lower rung" onClick={() => setAsc((n) => Math.max(0, n - 1))}>-</button>
                            <span className="ct-rung-n">
                                {asc === 0 ? "No ladder" : `Rung ${asc}`}
                                <i>of {open} open</i>
                            </span>
                            <button type="button" className="ct-rung" disabled={asc >= open}
                                aria-label="A higher rung" onClick={() => setAsc((n) => Math.min(open, n + 1))}>+</button>
                        </div>
                        {asc > 0 ? (
                            <ul className="ct-rung-rules">
                                {ascRules(asc).map((r) => <li key={r.n}>{r.says}</li>)}
                            </ul>
                        ) : null}
                    </div>
                ) : null}

                {history?.best ? (
                    <div className="ct-record">
                        <p className="ct-best">
                            <span>Best</span>
                            <b>{Number(history.best.score).toLocaleString()}</b>
                            <i>
                                {history.best.outcome === "won"
                                    ? "the whole climb"
                                    : `${actName(history.best.act)}, stop ${history.best.stop}`}
                                {history.best.asc_level > 0 ? ` · rung ${history.best.asc_level}` : ""}
                            </i>
                        </p>
                        <ul className="ct-runs">
                            {/* Three, not five. A front room whose largest element is a list of the ways
                                you have died is a screen that argues against sitting down. */}
                            {history.recent.slice(0, 3).map((r, i) => (
                                <li key={i} className={r.outcome === "won" ? "is-won" : ""}>
                                    <span>{r.outcome === "won" ? "Won" : "Died"}</span>
                                    <i>{r.outcome === "won"
                                        ? "all three acts"
                                        : `${actName(r.act)}, stop ${r.stop}`}</i>
                                    <b>{Number(r.score).toLocaleString()}</b>
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : null}

                <button type="button" className="ct-see" onClick={() => router.push("/marketplace/cards/collection")}>
                    See every card
                </button>
            </div>

            {/* The same ribbon the map and the rooms leave on, and from here it does what it says. */}
            <CardFoot label="Return" onClick={() => router.push("/marketplace/town")} />

            {/* Global for the same reason the shop's and the rooms' are: every selector is under `.ct`, which
                is this screen and nothing else on the site. */}
            <style jsx global>{`
                /* ── THE RECORD ── quiet furniture on the table, not a scoreboard. The best score is the one
                   figure worth being big; the runs under it are a list you skim. */
                /* ── THE LADDER ── a stepper and the list of what it does. Deliberately plain: it is a thing
                   you read once before you commit and never look at again during the run. */
                .ct-ladder { width: min(360px, 100%); margin: 4px auto 2px; }
                .ct-rungs { display: flex; align-items: center; justify-content: center; gap: 10px; }
                .ct-rung { width: 30px; height: 30px; border-radius: 50%; cursor: pointer;
                    border: 1px solid rgba(226,199,143,0.34); background: rgba(20,16,12,0.7);
                    color: #e8dcc6; font-size: 17px; line-height: 1; }
                .ct-rung:disabled { opacity: 0.3; cursor: default; }
                .ct-rung-n { min-width: 118px; text-align: center; font-size: 14px; color: #ffd9a6;
                    letter-spacing: 0.03em; }
                .ct-rung-n i { display: block; font-style: normal; font-size: 10.5px; letter-spacing: 0.12em;
                    text-transform: uppercase; color: #8e8371; }
                .ct-rung-rules { list-style: none; margin: 6px 0 0; padding: 0; display: flex;
                    flex-direction: column; gap: 2px; }
                .ct-rung-rules li { font-size: 11.5px; line-height: 1.35; color: #b3a68f; text-align: center; }

                .ct-record { width: min(360px, 100%); margin: 2px auto 0; }
                .ct-best { display: flex; align-items: baseline; justify-content: center; gap: 8px;
                    margin: 0 0 6px; font-family: var(--ct-card-font, inherit); }
                .ct-best span { font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: #8e8371; }
                .ct-best b { font-size: 25px; color: #ffd9a6; text-shadow: 0 2px 6px rgba(0,0,0,0.9); }
                .ct-best i { font-size: 12px; font-style: normal; color: #b3a68f; }
                .ct-runs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
                .ct-runs li { display: flex; align-items: baseline; gap: 8px; padding: 3px 8px;
                    border-radius: 7px; background: rgba(18,16,20,0.5); font-size: 12px; color: #b3a68f; }
                .ct-runs li span { min-width: 34px; color: #9a8e7c; }
                .ct-runs li.is-won span { color: #9be08a; }
                .ct-runs li i { flex: 1; font-style: normal; }
                .ct-runs li b { color: #e8dcc6; font-variant-numeric: tabular-nums; }

                /* ⚠️ BOTTOM-ANCHORED WITHOUT THROWING THE TOP AWAY. This was overflow:hidden with
                   justify-content:flex-end, which clips anything too tall off the TOP and gives you no way to
                   reach it — and the moment the run record was added under the dealer, his greeting went off
                   the screen. Photographed: the page opened on the top of his ears.
                   flex-end also cannot be scrolled back into in most browsers, which is why the anchoring is
                   done with margin-top:auto on the stage instead and the column simply scrolls. */
                .ct { position: fixed; inset: 0; z-index: 4000; overflow-y: auto; overscroll-behavior: contain;
                    display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
                    /* the Return ribbon is fixed in the bottom-left corner; the column has to end above it */
                .ct-room { position: fixed; inset: 0; z-index: -1;
                    background: #0a0b0f url(/images/cards/chrome/table-room.png) center/cover no-repeat; }
                /* The room is painted dim and lit from one lamp; the vignette is what keeps the corners from
                   competing with him once the image is stretched over a wide screen. */
                .ct-room::after { content: ""; position: absolute; inset: 0;
                    background: radial-gradient(ellipse at 50% 42%, rgba(10,11,15,0.05), rgba(6,7,10,0.88) 78%); }

                /* ⚠️ THE COLUMN HAD NO SIDE PADDING AT ALL. Luke: "no padding its right up against the
                   walls of the phone." Every panel under the dealer was a full-width block butted against
                   the bezel, which is the one thing that makes a screen read as unfinished however good the
                   art on it is. The gutter is on the STAGE rather than on each panel so a panel added later
                   inherits it instead of having to remember. */
                .ct-stage { margin-top: auto; width: min(680px, 100%);
                    display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
                    gap: 10px; padding: 0 16px 6px; box-sizing: border-box; }

                /* ── HIM ── bottom-anchored, because he is drawn seated behind a table and the table edge is
                   the bottom of the cutout. Floating him in the middle of the room stands him up. */
                .ct-sharp { width: min(230px, 50vw); height: auto; object-fit: contain; margin-bottom: -4px;
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

                /* ── THE RANK ── the one number on this screen that only goes up. Big name, small level,
                   and a bar that is worth watching move: the fill is lit rather than flat, because a bar
                   that glows is the difference between a statistic and a reward. */
                .ct-rank { width: min(360px, 100%); margin: 2px auto 0; text-align: center; }
                .ct-rank-top { display: flex; align-items: baseline; justify-content: center; gap: 9px; }
                .ct-rank-name { font-size: 19px; letter-spacing: 0.06em; color: #ffd9a6;
                    text-shadow: 0 0 14px rgba(255,190,110,0.35), 0 2px 5px rgba(0,0,0,0.9); }
                .ct-rank-lv { font-size: 10.5px; letter-spacing: 0.16em; text-transform: uppercase;
                    color: #8e8371; }
                .ct-bar { position: relative; height: 9px; margin: 6px 0 4px; border-radius: 999px;
                    background: rgba(10,9,12,0.75); box-shadow: inset 0 0 0 1px rgba(226,199,143,0.2); overflow: hidden; }
                .ct-bar i { display: block; height: 100%; border-radius: 999px;
                    background: linear-gradient(90deg, #b6702c, #ffc061 70%, #ffe6b8);
                    box-shadow: 0 0 10px rgba(255,178,80,0.55); transition: width 600ms ease; }
                .ct-rank-say { margin: 0; font-size: 11.5px; color: #b3a68f; }
                .ct-rank-say b { color: #e8dcc6; font-weight: 700; }

                /* ── THE TRACK ── eight rows, because eight chips in a strip cannot say how close you are
                   and how close you are is the entire point. An open one is a name in gold and stops
                   talking; a shut one keeps its bar and its count. */
                /* ── THE ONE THING THAT IS CLOSE ─────────────────────────────────────────────────────
                   A row you can press, because pressing it is how you get the other seven. Laid out as a
                   grid rather than a flex row so the bar keeps its width whatever the sentence is. */
                .ct-next { width: min(360px, 100%); margin: 0 auto; display: grid;
                    grid-template-columns: 1fr auto; gap: 3px 10px; align-items: baseline;
                    padding: 8px 11px; border-radius: 10px; cursor: pointer; text-align: left;
                    font: inherit; color: inherit; background: rgba(40,30,16,0.5);
                    border: 1px solid rgba(255,190,110,0.24); }
                .ct-next-tag { grid-column: 1 / -1; font-size: 10px; letter-spacing: 0.16em;
                    text-transform: uppercase; color: #8e8371; }
                .ct-next b { font-size: 12.5px; font-weight: 700; color: #ffd9a6; }
                .ct-next em { font-style: normal; font-size: 11px; color: #b3a68f;
                    font-variant-numeric: tabular-nums; }
                .ct-next-bar { grid-column: 1 / -1; height: 4px; border-radius: 999px;
                    background: rgba(10,9,12,0.8); overflow: hidden; }
                .ct-next-bar i { display: block; height: 100%; border-radius: 999px;
                    background: linear-gradient(90deg, #6b5330, #ffc061); }
                .ct-next.is-done b { color: #9be08a; }

                .ct-track-list { list-style: none; margin: 0; padding: 0; display: flex;
                    flex-direction: column; gap: 3px; }
                .ct-track-list li { display: grid; grid-template-columns: 72px 1fr auto; align-items: center;
                    gap: 8px; padding: 5px 9px; border-radius: 8px; background: rgba(18,16,20,0.55);
                    box-shadow: inset 0 0 0 1px rgba(226,199,143,0.08); }
                .ct-track-list li.is-open { background: rgba(40,30,16,0.55);
                    box-shadow: inset 0 0 0 1px rgba(255,190,110,0.26); }
                .ct-track-name { font-size: 12px; color: #7d7263; letter-spacing: 0.02em; }
                .is-open .ct-track-name { color: #ffd9a6; font-weight: 700; }
                .ct-track-how { grid-column: 2; font-style: normal; font-size: 10.5px; color: #9a8e7c;
                    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .ct-track-by { grid-column: 2 / span 2; font-style: normal; font-size: 10.5px;
                    letter-spacing: 0.1em; text-transform: uppercase; color: #9be08a; text-align: right; }
                .ct-track-bar { grid-column: 2; grid-row: 2; height: 4px; border-radius: 999px;
                    background: rgba(10,9,12,0.8); overflow: hidden; }
                .ct-track-bar i { display: block; height: 100%; border-radius: 999px;
                    background: linear-gradient(90deg, #6b5330, #d6a45c); }
                .ct-track-at { font-style: normal; font-size: 10.5px; color: #b3a68f;
                    font-variant-numeric: tabular-nums; }

                /* ⚠️ PINNED, AND NOTHING UNDERNEATH IT. The map's own ribbon covered the run's only reachable
                   room on a phone (see the note in CardMap), and the first cut of this screen sprang the same
                   trap: at 375 the ribbon runs 0-158 and a centred 210px button runs 82-292, so Return sat on
                   top of Sit back down. On a wide screen the column is far to the right of it; on a narrow one
                   the stage is given the ribbon's whole band as padding below. */

                @media (max-width: 560px) { .ct-stage { padding-bottom: 74px; } }
                @media (min-width: 760px) {
                    .ct-sharp { width: min(300px, 26vw); }
                    .ct-say { font-size: 15px; max-width: 440px; }
                }
                /* A phone leaves about 441px once the browser's chrome is off it, and he is the tallest thing
                   on the screen — the same fold the campfire's second button fell under. He gives way; the
                   button he is asking you to press does not. */
                @media (max-height: 560px) {
                    .ct-sharp { width: min(150px, 36vw); }
                    .ct-say { font-size: 12.5px; }
                    .ct-stage { gap: 6px; }
                    .ct-do { height: 44px; width: 190px; }
                    .ct-do-label { font-size: 13.5px; }
                }
            `}</style>
        </div>
    );
}
