"use client";

// ── A BEAT ───────────────────────────────────────────────────────────────────────────────────────────────────
// Luke, twice, about the two places the journey used to just... continue:
//   *"it's clearly stated, like there's a whole beat dedicated to you understanding what you got from the
//    captain and why."*
//   *"when you finish that, it needs to clearly, at a whole beat, elaborate on what exactly happened and why,
//    and what's the result. Like, you're going to an island because of why. Like, why does any of it matter?"*
//
// Both were the same hole. The old feature handed you a chart with a card at the end of a battle and a count on
// a button, and told you where you were going by simply putting you there. Everything a player needs in order
// to CARE existed in the database and nowhere on the screen.
//
// So there are two beats and they are full screens, not toasts. Each one holds still, names the thing, says
// what it is worth, and has one button out. They are the only places in the journey where nothing is moving
// and nothing is being asked of you, which is what makes the sailing either side of them read as motion.
//
// ⚠️ ONE FRAME, TWO CONTENTS, AND NOT ONE GENERIC BEAT. The temptation was a <Beat title body art /> that both
// call. It would have been shorter and it would have flattened the two moments into the same shape — a man
// handing something over and a place worth going are not the same picture, and the whole job here is that they
// land differently.

import { useEffect } from "react";

import Exp from "@/lib/marketplace/expedition-audio.js";

const STAR_WORD = {
    1: "A Sounding", 2: "A Bearing", 3: "A Bearing", 4: "A Reckoning", 5: "A Certainty",
};
// What a chart of this grade actually buys, said in the terms the player is about to experience it in: how
// forgiving the glass will be, and how rich the water it points at is. Not "grade 4 of 5".
const STAR_MEANS = {
    1: "He was barely sure himself. The marks will be hard to hold, and where he is sending you is thin water.",
    2: "He knew the water, roughly. You will have to work for the marks.",
    3: "He knew it well enough. The marks will sit still long enough to call.",
    4: "He knew it exactly, and said so. The marks will come easily, and it is deep water he named.",
    5: "He wrote it down himself. Every mark is a slot, and the place he named is the best there is.",
};

/** ⭐ as five drawn pips rather than an emoji, so the row is the same on every device. See [[no-emoji-in-ui]]. */
function Stars({ n }) {
    return (
        <span className="beat-stars" aria-label={`${n} of 5 stars`}>
            {Array.from({ length: 5 }, (_, i) => <i key={i} className={i < n ? "on" : ""} />)}
        </span>
    );
}

// ── BEAT ONE: SHE IS TAKEN ───────────────────────────────────────────────────────────────────────────────────
export function SpoilsBeat({ spoils, busy, onNext }) {
    const cap = spoils?.captain || null;
    const stars = Math.max(1, Math.min(5, Number(spoils?.stars) || 1));
    useEffect(() => { Exp.captainTaken(); const t = setTimeout(() => Exp.chartGiven(stars), 620); return () => clearTimeout(t); }, [stars]);

    return (
        <div className="beat beat-spoils">
            <div className="beat-glow" aria-hidden="true" />
            <p className="beat-kicker">She has struck her colours</p>

            <div className="beat-portrait">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {cap?.portrait ? <img src={cap.portrait} alt="" draggable="false" /> : null}
                <span className="beat-portrait-ring" aria-hidden="true" />
            </div>

            <h2 className="beat-name">{cap?.name || "Her captain"}</h2>
            <p className="beat-sub">late of the <b>{spoils?.ship?.name || cap?.ship}</b>{spoils?.ship?.cls ? ` · ${spoils.ship.cls}` : ""}</p>

            <div className="beat-rule" aria-hidden="true" />

            {/* WHAT YOU GOT. The whole reason this screen exists. */}
            <div className="beat-prize">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="beat-prize-art" src="/images/islands/chrome/chart.png?v=1" alt="" draggable="false" />
                <div className="beat-prize-text">
                    <span className="beat-prize-what">His chart</span>
                    <Stars n={stars} />
                    <span className="beat-prize-band">{STAR_WORD[stars]}</span>
                </div>
            </div>

            {/* AND WHY IT MATTERS. */}
            <p className="beat-says">{cap?.handover || "He gives it up, and tells you where."}</p>
            <p className="beat-means">{STAR_MEANS[stars]}</p>

            <button className="beat-go" disabled={busy} onClick={onNext}>Raise the glass</button>
            {/* ⚠️ BOTH BEATS MOUNT THE STYLE. They are never on screen together, and a `<style jsx global>`
                that only one of them renders is a screen with no CSS the other half of the time — which is
                the styled-jsx custom-component trap in [[styled-jsx-landmines]] wearing a different hat. */}
            <Style />
        </div>
    );
}

// ── BEAT TWO: WHERE YOU ARE GOING, AND WHY ───────────────────────────────────────────────────────────────────
export function CourseBeat({ view, busy, onNext }) {
    const isle = view?.island || {};
    const course = view?.course || {};
    const band = view?.band || {};
    const marks = course.marks || [];
    useEffect(() => { Exp.courseSet(); }, []);

    return (
        <div className="beat beat-course">
            {/* The place itself, across the head of the screen. It is the first time it has been named. */}
            <div className="beat-banner" style={{ backgroundImage: `url(${isle.art})` }} aria-hidden="true" />
            <p className="beat-kicker">The fix is made</p>
            <h2 className="beat-name">{isle.name}</h2>
            <p className="beat-sub">{isle.biomeName}{isle.rung ? ` · the ${ordinal(isle.rung)} rung of the archipelago` : ""}</p>

            {/* HOW WELL YOU READ HIM — the three bearings, each named and marked, so the number that decides
                your tide has a story rather than being a percentage nobody asked for. */}
            <div className="beat-marks">
                {marks.map((m, i) => (
                    <div key={i} className={`beat-mark is-${m.band?.id || "poor"}`}>
                        <span className="beat-mark-name">{m.mark}</span>
                        <span className="beat-mark-band">{m.band?.say}</span>
                    </div>
                ))}
            </div>
            <p className="beat-band"><b>{band.name}</b> — {band.say}</p>

            <div className="beat-rule" aria-hidden="true" />

            {/* WHY IT MATTERS. The thing on the mark, which exists nowhere else in the game. */}
            <div className="beat-prize">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {isle.prize?.art ? <img className="beat-prize-art" src={isle.prize.art} alt="" draggable="false" /> : null}
                <div className="beat-prize-text">
                    <span className="beat-prize-what">On the mark</span>
                    <span className="beat-prize-band is-big">{isle.prize?.name}</span>
                    <span className="beat-prize-why">Nowhere else in the archipelago.</span>
                </div>
            </div>
            <p className="beat-means">{isle.blurb}</p>

            <button className="beat-go" disabled={busy} onClick={onNext}>Make sail</button>
            <Style />
        </div>
    );
}

// ── BEAT THREE: WHAT THE WHOLE THING CAME TO ─────────────────────────────────────────────────────────────────
// ⚠️ IT IS A BEAT, NOT A CARD ON A PAGE. The ending used to drop out of the full-screen journey into a
// centred card in the marketplace layout — six beats of one unbroken thing and then, at the moment it is
// meant to land, the site header comes back. That is the seam the whole rebuild exists to remove, and it was
// sitting at the end of it.
export function LandfallBeat({ summary, onDone }) {
    const isle = summary?.island || {};
    const gotPrize = Boolean(summary?.prize);
    useEffect(() => { if (gotPrize) Exp.chartSolved(); else Exp.dock(); }, [gotPrize]);

    return (
        <div className="beat beat-course beat-end">
            <div className="beat-banner" style={{ backgroundImage: `url(${isle.art})` }} aria-hidden="true" />
            <p className="beat-kicker">{gotPrize ? "You have it" : "Put to sea"}</p>
            <h2 className="beat-name">{isle.name}</h2>
            <p className="beat-sub">{summary?.band?.name} — {summary?.band?.say}</p>

            {/* What was standing on the mark, whether or not it came home. Greyed when it did not, because a
                member who walked past the prize should be able to SEE what they walked past — the words
                alone ("the mark was left standing") name nothing. */}
            {isle.prize?.art ? (
                <div className={`beat-endprize${gotPrize ? "" : " is-missed"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={isle.prize.art} alt="" draggable="false" />
                </div>
            ) : null}
            <p className="beat-prize-band is-big">{gotPrize ? summary.prize.name : "The mark was left standing"}</p>

            <div className="beat-rule" aria-hidden="true" />

            <div className="beat-tally">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <span><img src="/images/sailing/doubloon.png" alt="" draggable="false" /><b>{summary?.purse || 0}</b> doubloons</span>
                <span><b>{summary?.took || 0}</b> taken off the island</span>
            </div>

            <button className="beat-go" onClick={onDone}>Back to the harbour</button>
            <Style />
        </div>
    );
}

function ordinal(n) {
    const v = Number(n) || 0;
    const s = ["th", "st", "nd", "rd"];
    const k = v % 100;
    return `${v}${s[(k - 20) % 10] || s[k] || s[0]}`;
}

export function BeatStyle() { return <Style />; }

function Style() {
    return (
        <style jsx global>{`
            /* ⚠️ overflow-x MUST BE HIDDEN, EXPLICITLY. Setting only the Y axis to auto computes the other
               axis to auto as well — and the glow below is 120vw, so every beat grew a horizontal scrollbar, a
               15px gutter on BOTH axes, and a scrollable area that let the captain's portrait be dragged off
               the top of the screen. Measured at 1440x900: offsetWidth 1440 vs clientWidth 1425, scrollLeft
               driving to 229. A cinematic beat you can accidentally scroll sideways is not a beat. */
            /* ⚠️ SAFE CENTRING, NOT PLAIN CENTRING. A centred flex column that overflows its box pushes content off
               BOTH ends, and the top end cannot be scrolled to — scrollTop 0 is already the minimum. On a
               375x441 iOS viewport that put "She has struck her colours" at y=-7 (half a line cut, forever)
               and the primary button 7px past the bottom. The safe keyword falls back to flex-start the
               moment the content does not fit, which is the one behaviour that never hides anything. */
            .beat { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center;
                justify-content: center; justify-content: safe center;
                text-align: center; gap: clamp(5px, 1.3vh, 11px);
                padding: calc(16px + env(safe-area-inset-top)) 20px calc(16px + env(safe-area-inset-bottom));
                overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain;
                background: radial-gradient(120% 90% at 50% 18%, #1d2c3a 0%, #0a121a 62%, #060b11 100%); }

            /* A slow warm bloom behind the subject. The one thing making these screens feel like an event
               rather than a form, and it is deliberately the ONLY thing moving on them. */
            /* Capped, so it is a bloom behind a face rather than a 3115px wash nobody can see the edge of. */
            .beat-glow { position: absolute; left: 50%; top: 30%; width: min(120vw, 900px); height: min(120vw, 900px);
                transform: translate(-50%, -50%); pointer-events: none;
                background: radial-gradient(circle, rgba(255,196,96,0.22) 0%, transparent 62%);
                animation: beatGlow 5.5s ease-in-out infinite; }
            @keyframes beatGlow { 0%, 100% { opacity: 0.55; transform: translate(-50%,-50%) scale(1); }
                50% { opacity: 1; transform: translate(-50%,-50%) scale(1.09); } }

            .beat-kicker { position: relative; margin: 0; font-size: 0.72rem; font-weight: 800;
                letter-spacing: 0.18em; text-transform: uppercase; color: #8fb2c9; }
            .beat-name { position: relative; margin: 0; font-size: clamp(1.4rem, 6.4vw, 3rem); color: #f7e9c9;
                text-shadow: 0 3px 16px rgba(0,0,0,0.85); animation: beatIn 520ms cubic-bezier(.2,1.2,.4,1) both; }
            .beat-sub { position: relative; margin: 0; font-size: clamp(0.78rem, 3.3vw, 0.92rem); color: #b9a986; }
            @keyframes beatIn { from { opacity: 0; transform: translateY(14px) scale(0.94); } }

            .beat-portrait { position: relative; width: clamp(104px, 34vw, 260px); aspect-ratio: 1;
                animation: beatIn 620ms cubic-bezier(.2,1.2,.4,1) both; }
            .beat-portrait img { width: 100%; height: 100%; object-fit: contain;
                filter: drop-shadow(0 8px 20px rgba(0,0,0,0.75)); }
            .beat-portrait-ring { position: absolute; inset: -6%; border-radius: 50%;
                border: 2px solid rgba(232,192,105,0.35); box-shadow: 0 0 40px rgba(255,190,90,0.25) inset; }

            .beat-rule { width: min(70%, 16rem); height: 1px; flex: 0 0 auto;
                background: linear-gradient(90deg, transparent, rgba(232,192,105,0.5), transparent); }

            .beat-stars { display: inline-flex; gap: 4px; }
            .beat-stars i { width: 10px; height: 10px; border-radius: 50%; background: rgba(255,255,255,0.16);
                box-shadow: inset 0 0 0 1px rgba(0,0,0,0.4); }
            .beat-stars i.on { background: #e8c069; box-shadow: 0 0 8px rgba(232,192,105,0.7); }

            .beat-prize { position: relative; display: flex; align-items: center; gap: 14px; text-align: left;
                padding: 12px 20px 12px 12px; border-radius: 14px; max-width: min(92vw, 34rem);
                background: rgba(255,226,150,0.07); border: 1px solid rgba(232,192,105,0.3);
                animation: beatIn 720ms cubic-bezier(.2,1.2,.4,1) both; }
            .beat-prize-art { width: clamp(52px, 15vw, 104px); height: clamp(52px, 15vw, 104px); object-fit: contain;
                flex: 0 0 auto; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.6)); }
            .beat-prize-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
            .beat-prize-what { font-size: 0.74rem; font-weight: 800; letter-spacing: 0.1em;
                text-transform: uppercase; color: #8fb2c9; }
            .beat-prize-band { font-size: 0.95rem; font-weight: 800; color: #f2e4c6; }
            .beat-prize-band.is-big { font-size: clamp(1rem, 4.4vw, 1.2rem); color: #ffe9b8; }
            .beat-prize-why { font-size: 0.72rem; color: #9fb4c4; font-style: italic; }

            .beat-says { position: relative; margin: 0; max-width: min(92vw, 30rem); font-style: italic;
                font-size: clamp(0.82rem, 3.6vw, 0.98rem); color: #d8e4ee; line-height: 1.5; }
            .beat-means { position: relative; margin: 0; max-width: min(92vw, 32rem);
                font-size: clamp(0.76rem, 3.2vw, 0.88rem); color: #9fb4c4; line-height: 1.5; }

            .beat-banner { position: absolute; left: 0; right: 0; top: 0; height: min(34%, 340px);
                background-size: cover; background-position: center 60%;
                -webkit-mask-image: linear-gradient(180deg, #000 30%, transparent 100%);
                mask-image: linear-gradient(180deg, #000 30%, transparent 100%); opacity: 0.85; }
            /* ⚠️ BOTTOM-WEIGHTED ONLY WHERE THERE IS NO ROOM. Justifying to the end plus an auto
               top-margin sinks the whole beat as the screen grows: the gap between the kicker and the island
               name measured 186px at 1280 and 504px at 2560, with every word below y=1030 of 1440. It hugs
               the banner instead, and centres once the screen is tall enough to hold it all. */
            .beat-course { justify-content: flex-start; padding-bottom: calc(22px + env(safe-area-inset-bottom)); }
            /* Clear of the banner's lower edge, not straddling it: the kicker is pale blue and the banner's
               bottom is snow and ice, so half a line on each read as a printing fault. */
            .beat-course .beat-kicker { margin-top: calc(min(30vh, 300px) + 14px); }
            .beat-course .beat-go { margin-top: auto; }
            /* ⚠️ THE ENDING CENTRES, IT DOES NOT BOTTOM-OUT. It inherits the course beat's frame for the
               island banner, but the course beat is bottom-weighted because it carries three mark chips and
               a blurb. The ending carries less, so the same rule left 350px of empty gradient between the
               banner and the prize — on the one screen that is supposed to land. */
            .beat-end { justify-content: flex-start; padding-top: 0; gap: clamp(7px, 1.8vh, 14px); }
            .beat-end .beat-kicker { margin-top: calc(min(22vh, 230px) + env(safe-area-inset-top)); }
            .beat-end .beat-name { margin-top: 0; }
            .beat-end .beat-go { margin-top: auto; margin-bottom: 4px; }

            .beat-marks { position: relative; display: flex; flex-wrap: wrap; gap: 6px; justify-content: center;
                max-width: min(94vw, 32rem); }
            .beat-mark { display: flex; flex-direction: column; gap: 1px; padding: 6px 12px; border-radius: 10px;
                background: rgba(0,0,0,0.42); border: 1px solid rgba(255,255,255,0.1); }
            /* ⚠️ NOTHING HERE GOES UNDER 10px. 0.64rem is 8.96px at this root, which was measured on a phone
               and is below the floor for a label anyone is expected to read — and with a 1.05 line-height it
               was also clipping its own descenders. */
            .beat-mark-name { font-size: 0.76rem; font-weight: 700; color: #e9dcbb; white-space: nowrap; }
            .beat-mark-band { font-size: 0.72rem; line-height: 1.3; color: #9fb4c4; white-space: nowrap; }
            .beat-mark.is-true { border-color: rgba(127,224,168,0.6); }
            .beat-mark.is-true .beat-mark-band { color: #7fe0a8; }
            .beat-mark.is-good { border-color: rgba(232,192,105,0.55); }
            .beat-mark.is-good .beat-mark-band { color: #ffe9b8; }
            .beat-mark.is-poor, .beat-mark.is-lost { border-color: rgba(255,140,110,0.45); }
            .beat-mark.is-poor .beat-mark-band, .beat-mark.is-lost .beat-mark-band { color: #ff9f86; }
            .beat-band { position: relative; margin: 0; font-size: 0.86rem; color: #cdbb98; }
            .beat-band b { color: #e8c069; }

            .beat-go { position: relative; margin-top: 4px; width: min(88vw, 26rem); padding: 16px 22px;
                border-radius: 12px; border: 0; cursor: pointer; font-size: 1rem; font-weight: 800;
                color: #2a1c06; background: linear-gradient(180deg, #f0cb79, #d5a445);
                box-shadow: 0 3px 0 #8d6a23, 0 8px 22px rgba(0,0,0,0.5);
                animation: beatIn 860ms cubic-bezier(.2,1.2,.4,1) both; }
            .beat-go:disabled { opacity: 0.55; cursor: default; }
            .beat-go:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 1px 0 #8d6a23; }

            /* ⚠️ A SHORT VIEWPORT IS NOT A NARROW ONE, AND THE PORTRAIT IS SIZED OFF WIDTH. On a 375x441 iOS
               screen (375 wide once the browser's own chrome is subtracted from 667) the captain's portrait
               took 127px of a 441px column and pushed "Raise the glass" 38px below the fold. Safe centring
               made it reachable by scrolling, which is not the same as visible — a beat is a held moment and
               a held moment does not begin with a scroll. Nothing is hidden here, only tightened: everything
               the beat says still says it. */
            @media (max-height: 540px) {
                .beat { gap: 3px; padding-top: calc(8px + env(safe-area-inset-top));
                    padding-bottom: calc(8px + env(safe-area-inset-bottom)); }
                .beat-portrait { width: clamp(68px, 19vh, 96px); }
                .beat-name { font-size: clamp(1.15rem, 5.4vw, 1.5rem); }
                .beat-says { font-size: 0.8rem; line-height: 1.38; }
                .beat-means { font-size: 0.74rem; line-height: 1.34; }
                .beat-prize { padding: 7px 14px 7px 8px; }
                .beat-prize-art { width: clamp(42px, 12vw, 56px); height: clamp(42px, 12vw, 56px); }
                .beat-go { padding: 12px 18px; margin-top: 2px; }
                .beat-rule { display: none; }
                .beat-course .beat-kicker { margin-top: calc(min(26vh, 150px) + 10px); }
                .beat-end .beat-kicker { margin-top: calc(min(18vh, 120px) + env(safe-area-inset-top)); }
                .beat-banner { height: min(30%, 150px); }
            }

            .beat-endprize { position: relative; margin: 2px 0 -2px;
                animation: beatIn 700ms cubic-bezier(.2,1.2,.4,1) both; }
            .beat-endprize img { display: block; width: clamp(96px, 30vw, 148px); height: clamp(96px, 30vw, 148px);
                object-fit: contain; filter: drop-shadow(0 6px 16px rgba(0,0,0,0.75)); }
            .beat-endprize.is-missed img { filter: grayscale(0.85) brightness(0.72) drop-shadow(0 6px 16px rgba(0,0,0,0.75));
                opacity: 0.62; }
            .beat-tally { position: relative; display: flex; flex-wrap: wrap; gap: 14px; justify-content: center;
                color: #cdbb98; font-size: 0.9rem; }
            .beat-tally b { color: #f2e4c6; }
            .beat-tally img { width: 16px; height: 16px; object-fit: contain; vertical-align: -3px; margin-right: 5px; }
        `}</style>
    );
}
