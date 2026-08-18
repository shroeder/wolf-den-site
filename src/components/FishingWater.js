"use client";

import { useEffect, useRef, useState } from "react";

// ── THE WATER ────────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "right now it's really laborious... I don't like that it's not very immersive. I'd rather see it like
// we can see our dude on the ship actually fishing, with a bobber going up and down, and then you actually see
// everything pop up out of the water as you haul it in."
//
// So this is the whole minigame now, and it REPLACES the tap-then-hold reel rather than wrapping it. The input
// is one tap, on purpose — he said he does not mind it being easy — and everything that used to be spent on a
// timing bar is spent on what you are looking at instead:
//
//   WAITING   the boat rides the swell, your hero stands on the deck, the line runs out to a bobber that bobs.
//   BITE      the bobber goes UNDER, the line snaps taut, rings run out from where it went down.
//   HAULING   whatever is on the end rises THROUGH the waterline — you watch it clear the water and find out
//             what it is at the moment it breaks the surface, which is the beat the old version had no room
//             for because the reel bar was in the way.
//
// WHY THE ART IS ALL REAL. The boat is the member's own hull at its real tier, the figure on the deck is their
// own hero sprite, the fish are the 34 species plates and the monsters are the marine-encounter creatures.
// Nothing here is a placeholder or an emoji standing in for a picture — see check-existing-sprites-first; all
// of it already existed and none of it needed generating.
//
// THE ANIMATION IS CSS, DRIVEN BY ONE `data-phase`. No rAF loop and no per-frame React state: the bob, the
// swell, the line and the rings are keyframes that run on their own, and a phase change is one attribute
// write. A scene that re-renders sixty times a second to move a bobber is how the farm's pet-walk once cost a
// whole frame budget.
export default function FishingWater({
    phase,          // "idle" | "waiting" | "tell" | "bite" | "hauling" | "done"
    sky,            // scrolling seascape behind the boat
    boat,           // the member's hull at its real tier
    hero,           // { art, flip } — their own fighter, on the deck
    haul,           // { art, name, kind } once something is coming up
    onStrike,       // the one tap: hook it
    busy = false,
}) {
    // A miss has to be visible for a moment or the bobber simply stops and nothing explains why.
    const [splash, setSplash] = useState(0);
    const lastPhase = useRef(phase);
    useEffect(() => {
        if (lastPhase.current !== phase && phase === "bite") setSplash((n) => n + 1);
        lastPhase.current = phase;
    }, [phase]);

    const live = phase === "waiting" || phase === "tell" || phase === "bite";
    return (
        <div
            className="fw"
            data-phase={phase}
            role={live ? "button" : undefined}
            tabIndex={live ? 0 : undefined}
            aria-label={phase === "bite" ? "Something is on the line — tap to hook it" : "Waiting for a bite"}
            onPointerDown={live && !busy ? onStrike : undefined}
            onKeyDown={live && !busy ? (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onStrike?.(); } } : undefined}
        >
            {/* SKY — the same scrolling seascapes the voyage uses, so the rail and the crossing are the same sea. */}
            {sky ? <div className="fw-sky" style={{ backgroundImage: `url(${sky})` }} aria-hidden="true" /> : <div className="fw-sky is-plain" aria-hidden="true" />}

            {/* THE WATER. Two bands moving at different speeds is the cheapest honest parallax there is. */}
            <div className="fw-sea" aria-hidden="true">
                <span className="fw-swell fw-swell-a" />
                <span className="fw-swell fw-swell-b" />
            </div>

            {/* WHAT IS COMING UP — behind the boat, rising through the waterline. Rendered before the hull so
                the hull always occludes it, which is what sells the "out of the water" part. */}
            {/* ── SCALE ────────────────────────────────────────────────────────────────────────────────
                `haul.scale` is worked out from what the thing actually IS (see haulScale in FishingScene) and
                applied as a multiplier on one base width. Everything used to surface at the same 104px, so a
                chest came up the size of a leviathan and a sardine came up the size of the chest — which made
                the one moment the whole rework is built around say nothing about what you caught. */}
            {haul?.art ? (
                <div className="fw-haul" key={haul.art} style={{ "--haul": haul.scale || 1 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={haul.art} alt={haul.name || ""} draggable="false" />
                    <span className="fw-haul-spray" aria-hidden="true" />
                </div>
            ) : null}

            {/* THE BOAT, and the person on it. */}
            <div className="fw-boat" aria-hidden="true">
                {boat ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="fw-hull" src={boat} alt="" draggable="false" />
                ) : null}
                {hero?.art ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="fw-hero" src={hero.art} alt="" draggable="false"
                        style={{ transform: `translateX(-50%) scaleX(${hero.flip ? -1 : 1})` }} />
                ) : null}
                <span className="fw-rod" />
            </div>

            {/* THE LINE. An SVG with explicit endpoints rather than a rotated div: a rotated bar has to have
                its angle and length solved by hand for every viewport, and the first cut of this drew a stick
                floating in the sky beside the boat because that arithmetic was wrong. The viewBox is in
                percent, so both ends stay pinned wherever the scene is sized. */}
            <svg className="fw-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <line x1="47" y1="34" x2="74" y2="62" />
            </svg>
            {/* The float is a painted object now, not two rounded divs — it sits in the middle of a scene
                where the hull, the hero, the fish and the monsters are all art, and it was the one thing on
                screen that plainly was not. scripts/gen-fishing-art.mjs. */}
            <div className="fw-bobber" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/sailing/bobber.png" alt="" draggable="false" />
            </div>

            {/* ── THE TELL ─────────────────────────────────────────────────────────────────────────────
                A shadow crosses under the float a moment before it goes down. The bite used to arrive out of
                nowhere — a random wait, then a flash — so the only skill was noticing a colour change, and
                nothing in the water ever meant anything. Now the water tells you first, which is the whole
                difference between watching a screen and watching a float. Purely cosmetic: the bite window
                is unchanged and hooking still only needs the one tap. */}
            <div className="fw-shadow" aria-hidden="true" />

            {/* RINGS, from where the bobber went under. Keyed on the strike so a fresh bite re-runs them. */}
            <div className="fw-rings" key={splash} aria-hidden="true">
                <span /><span /><span />
            </div>

            <p className="fw-hint">
                {phase === "waiting" ? "Line's out. Watch the bobber."
                    : phase === "tell" ? "Something's circling…"
                    : phase === "bite" ? "IT'S UNDER — tap!"
                        : phase === "hauling" ? "Hauling it in…"
                            : ""}
            </p>
        </div>
    );
}
