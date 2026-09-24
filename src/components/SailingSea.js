"use client";

// ── THE SEA ──────────────────────────────────────────────────────────────────────────────────────────────────
// The ocean scene, as one component that takes plain props.
//
// ⚠️ WHY THIS FILE EXISTS. It was 160 lines of JSX welded into the middle of SailingClient, reading voyage
// state directly — so the expedition, which is also a boat on water, could not use it. What the expedition
// got instead was a bespoke 220px strip with a boat glyph lerped across it on an inline `left:%`. Luke, on
// looking at that: *"it's like a shitty animation, and I'm just like thinking, why are you doing that versus
// just using the real sailing animation panel that we already have and already use?"* Correct, and the answer
// was that it could not be used, which is a reason and not an excuse.
//
// So the scene is the component and the voyage is a caller. Same markup, same `.sail-*` rules in globals.css
// — NOT a second copy of 550 lines of CSS, because two copies of a thing is how the deck map ended up
// declared twice and read from two different tables in one file. See [[reuse-the-rule-never-restate-it]].
//
// ⚠️ AND IT CAN SHOW YOU SOMETHING COMING. That is the one genuinely new capability here. Every encounter in
// this game has always arrived as a modal appearing over a scene that did not react — there is no approach in
// the whole codebase. `approach` draws a thing on the horizon that grows as it closes, so a sail or an island
// is something you SEE before it is something you are told about.

import { GiBat, GiPumpkinLantern } from "react-icons/gi";
import { useCallback, useEffect, useRef, useState } from "react";

import { boatDeck } from "@/lib/marketplace/deck-lines.js";

// How long a gust runs. Declared here because the animation that owns it lives here now.
export const GUST_MS = 3000;

/** Confetti for a departure or a landfall. Sixteen spans and a CSS variable each. */
function Confetti() {
    return <div className="sail-confetti" aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <span key={i} style={{ "--i": i }} />)}</div>;
}

// Tailwind gust FX: a screen flash, a burst of horizontal SPEED LINES ripping past (the main "we just surged"
// cue), and a few leaves/debris for texture — all streaming left-to-right across the scene.
function WindGust() {
    return (
        <div className="sail-gustfx" aria-hidden="true">
            <span className="sail-flash" />
            {Array.from({ length: 18 }, (_, i) => (
                <span key={`s${i}`} className="sail-speedline"
                    style={{ "--i": i, top: `${3 + (i * 61) % 94}%`, width: `${34 + ((i * 13) % 5) * 10}%`, animationDelay: `${(i % 9) * 28}ms` }} />
            ))}
            {Array.from({ length: 9 }, (_, i) => (
                <span key={`l${i}`} className="sail-leaf"
                    style={{ "--i": i, top: `${8 + (i * 53) % 82}%`, animationDelay: `${(i % 5) * 55}ms`, fontSize: `${0.7 + ((i * 7) % 4) * 0.2}rem` }}>
                    {["🍃", "🍂", "·"][i % 3]}
                </span>
            ))}
        </div>
    );
}

/** Weather mood from the rolled horizon art, which drives cloud density, chop, rain and wildlife. */
export function moodOf(sky) {
    const t = ((sky || "").match(/sky-([a-z]+)\.png/) || [])[1] || "";
    if (t === "storm") return "storm";
    if (t === "night" || t === "aurora") return "night";
    if (t === "overcast" || t === "fog") return "overcast";
    return "calm";
}
const skyTypeOf = (sky) => ((sky || "").match(/sky-([a-z]+)\.png/) || [])[1] || "";

/**
 * @param {object}   p
 * @param {string}   p.sky        one of the ten /images/sailing/sky-*.png horizons
 * @param {object}   p.boat       { art, tier } — the member's own hull
 * @param {object}   [p.hero]     { art, flip } the avatar standing on the deck
 * @param {object}   [p.pet]      { url, flip }
 * @param {boolean}  [p.sailing]  underway: wake, bow wave, scrolling horizon, faster everything
 * @param {number}   [p.gustKey]  increment to replay the tailwind gust
 * @param {boolean}  [p.casting]  the cast-off lurch
 * @param {Array}    [p.ambient]  other members drifting across the horizon
 * @param {Function} [p.onWave]   called with the ambient boat that was tapped
 * @param {object}   [p.approach] { kind:"ship"|"island", art, at:0..1, name } — a thing closing on you
 * @param {string}   [p.banner]   a big word across the scene ("LAND HO!")
 * @param {boolean}  [p.cheer]    confetti with the banner
 * @param {boolean}  [p.halloween] the town's Halloween flag is up — dress the water
 * @param {string}   [p.className]
 */
export default function SailingSea({
    halloween = false,
    sky, boat, hero, pet, sailing = false, gustKey = 0, casting = false,
    ambient = [], onWave, approach = null, banner = null, cheer = false,
    className = "", children,
}) {
    const mood = moodOf(sky);
    const skyType = skyTypeOf(sky);
    const tier = Number(boat?.tier) || 1;
    const deck = boatDeck(tier);

    // ── THE GUST, RESTART-SAFE ───────────────────────────────────────────────────────────────────────────
    // Catching a second tailwind while one is playing must replay the animation, and re-adding a class the
    // element already carries is a no-op. Drop it for one paint, then put it back — two rAFs, because one is
    // not enough to guarantee the class removal has been committed. Cleanup rides on the boat's own
    // animationend; the timer is only a backstop for a missed event.
    const [gusting, setGusting] = useState(false);
    const gustTimer = useRef(null);
    useEffect(() => {
        if (!gustKey) return undefined;
        // The class has to be ABSENT for one paint or the animation no-ops on a class the element already
        // carries. The cleanup below is what drops it — re-keying on gustKey runs cleanup then setup, which
        // is the drop and the re-add, and it keeps the setState out of the effect BODY where it cascades.
        let a = 0, b = 0;
        a = requestAnimationFrame(() => { b = requestAnimationFrame(() => setGusting(true)); });
        gustTimer.current = setTimeout(() => setGusting(false), GUST_MS + 150);
        return () => {
            cancelAnimationFrame(a); cancelAnimationFrame(b);
            if (gustTimer.current) clearTimeout(gustTimer.current);
            setGusting(false);
        };
    }, [gustKey]);

    const endGust = useCallback((e) => { if (e.animationName === "sailGust") setGusting(false); }, []);

    // ── THE APPROACH ─────────────────────────────────────────────────────────────────────────────────────
    // `at` runs 0 (a speck on the horizon) to 1 (alongside). Everything about it is derived from that one
    // number so a caller can drive it off any clock it likes.
    // ⚠️ IT RISES AS IT GROWS. A thing that only scales up reads as a zoom; a thing that also comes DOWN the
    // frame reads as closing across water, because the horizon is where far things live.
    const ap = approach ? Math.max(0, Math.min(1, Number(approach.at) || 0)) : 0;
    const isIsland = approach?.kind === "island";
    const apScale = 0.1 + ap * ap * 0.95;
    // ⚠️ A SHIP CLOSES, LAND DOES NOT. A hull coming alongside travels DOWN the frame as it grows, because it
    // is crossing water toward you. An island does not move — you move toward it — so it stays pinned near
    // the horizon and only gets bigger. Dropping it 26% of the screen the way a ship drops put a band of
    // snowbound coastline up in the middle of a sunset sky, with the sea visible underneath it.
    const apBottom = isIsland ? 40 - ap * 8 : 54 - ap * 26;
    const apSide = 78 - ap * 34;

    return (
        <div className={`sail-sea sail-mood-${mood}${halloween ? " is-halloween" : ""}${gusting ? " is-gust" : ""}${className ? ` ${className}` : ""}`}>
            {/* The horizon. FOUR copies with every other one mirrored (in CSS) so the strip tiles SEAMLESSLY —
                the art is not edge-matched, but a mirrored copy's edge always equals its neighbour's. */}
            {skyType === "night" ? (
                // A pure-CSS moonless night. Tiles seamlessly with no moon to mirror — the painted night art
                // put a moon on every mirrored copy.
                <div className="sail-nightsky" aria-hidden="true" />
            ) : (
                <div className={`sail-sky-scroll${sailing ? " is-scrolling" : ""}`} aria-hidden="true">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {[0, 1, 2, 3].map((n) => <img key={n} src={sky} alt="" />)}
                </div>
            )}
            <div className={`sail-clouds${sailing ? " is-fast" : ""}`} aria-hidden="true"><i /><i /><i /></div>
            <div className="sail-reflection" aria-hidden="true" />
            <div className={`sail-glints${sailing ? " is-fast" : ""}`} aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
            <div className={`sail-nearwater${sailing ? " is-scrolling" : ""}`} aria-hidden="true"><i /><i /><i /></div>
            <div className="sail-depth" aria-hidden="true" />
            <div className="sail-wildlife" aria-hidden="true">
                <svg className="sail-gull g1" viewBox="0 0 40 14"><path d="M2 12 Q11 2 20 11 Q29 2 38 12" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <svg className="sail-gull g2" viewBox="0 0 40 14"><path d="M2 12 Q11 2 20 11 Q29 2 38 12" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span className="sail-fish"><svg viewBox="0 0 28 16"><path d="M2 8 C7 1 18 1 22 8 C18 15 7 15 2 8 Z M22 8 L27 4 L27 12 Z" fill="currentColor" /></svg><span className="sail-fish-splash" /></span>
            </div>
            {mood === "storm" ? <div className="sail-rain" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div> : null}

            {/* ── THE HALLOWEEN DRESSING ───────────────────────────────────────────────────────────────────
                ⚠️ NOT A TINT OVER THE TOP. A multiply scrim across the scene flattens every layer to one
                colour and the boat stops reading as painted — the plaza already learned that. The mood here
                comes from REPLACED ART (sky-haunted.png) plus these DISCRETE objects at their own depths.

                ⚠️ AND THE MOON LIVES HERE, NOT IN THE SKY ART. The horizon strip is four copies with every
                other one mirrored, so anything singular painted into it appears four times — which is what
                killed the original painted night sky. As a DOM element it is drawn once, and it can hang
                still while the clouds scroll behind it, which is what a moon actually does. */}
            {halloween ? (
                <>
                    <div className="sail-hw-moon" aria-hidden="true" />
                    <div className="sail-hw-mist" aria-hidden="true"><i /><i /></div>
                    <div className={`sail-hw-bats${sailing ? " is-fast" : ""}`} aria-hidden="true">
                        {[0, 1, 2, 3, 4].map((i) => (
                            <span key={i} className="sail-hw-bat" style={{ "--i": i }}>
                                <GiBat />
                            </span>
                        ))}
                    </div>
                    {/* Jack-o'-lanterns bobbing past on the water — the same trick the ambient boats use, so
                        they sit in the water rather than on top of the picture. */}
                    <div className={`sail-hw-buoys${sailing ? " is-scrolling" : ""}`} aria-hidden="true">
                        {[0, 1, 2].map((i) => (
                            <span key={i} className="sail-hw-buoy" style={{ "--i": i }}>
                                <GiPumpkinLantern />
                            </span>
                        ))}
                    </div>
                </>
            ) : null}

            {/* Other sailors drifting across the horizon behind your boat. */}
            <div className="sail-ambient">
                {ambient.map((b) => {
                    const waveable = Boolean(onWave) && sailing && Boolean(b.name);
                    return (
                        <span key={b.id}
                            className={`sail-ambient-boat${b.dir === "left" ? " is-rev" : ""}${b.faceLeft ? " is-faceleft" : ""}${waveable ? " is-waveable" : ""}`}
                            style={{ top: `${b.top}%`, animationDuration: `${b.dur}s` }}
                            {...(waveable ? {
                                role: "button", tabIndex: 0, "aria-label": `Wave to ${b.name}`,
                                onClick: (e) => { e.stopPropagation(); onWave(b); },
                                onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onWave(b); } },
                            } : {})}>
                            <span className="sail-ambient-hull" style={{ "--rider-b": `${boatDeck(b.tier)}%`, "--pet-b": `${boatDeck(b.tier)}%` }}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={b.art} alt="" />
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                {b.pet ? <img className="sail-ambient-pet" src={b.pet} alt="" style={b.petFlip ? { transform: "translateX(-50%) scaleX(-1)" } : undefined} /> : null}
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                {b.rider ? <img className="sail-ambient-rider" src={b.rider} alt="" style={b.riderFlip ? { transform: "translateX(-50%) scaleX(-1)" } : undefined} /> : null}
                            </span>
                            {b.name ? <span className="sail-ambient-name">{b.name}</span> : null}
                            {waveable ? <span className="sail-wave-btn" aria-hidden="true">👋 Wave</span> : null}
                        </span>
                    );
                })}
            </div>

            {/* ⚠️ THE THING COMING. Behind your own hull, in front of the horizon traffic.
                ⚠️ AND LAND IS DRAWN COMPLETELY DIFFERENTLY FROM A HULL. A ship is a die-cut sprite, so it can
                be an <img> that scales and slides. An island's plate is a 3:1 painted SCENE — drawn that way
                it is a photograph floating on the water with four hard edges, which is what it looked like
                for three straight screenshots while I kept trying to soften the edges with masks. The fix was
                not a better mask: a coastline has no left or right edge, so it is a FULL-WIDTH band that
                rises out of the horizon as you close on it, and the only edge left to hide is the top one. */}
            {approach?.art && isIsland ? (
                <div className="sail-approach is-island" aria-hidden="true"
                    style={{
                        backgroundImage: `url(${approach.art})`,
                        height: `${16 + ap * 30}%`,
                        bottom: `${apBottom}%`,
                        opacity: 0.3 + ap * 0.7,
                        filter: `blur(${(1 - ap) * 2.2}px)`,
                    }} />
            ) : approach?.art ? (
                <div className="sail-approach is-ship" aria-hidden="true"
                    style={{ left: `${apSide}%`, bottom: `${apBottom}%` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={approach.art} alt=""
                        style={{ transform: `scale(${apScale})`, opacity: 0.25 + ap * 0.75, filter: `blur(${(1 - ap) * 2.4}px)` }} />
                </div>
            ) : null}
            {approach?.name && ap > 0.34 ? (
                <div className="sail-approach-name" style={{ opacity: Math.min(1, (ap - 0.34) * 3) }}>{approach.name}</div>
            ) : null}

            <div className={`sail-boat${sailing ? " is-underway" : ""}`}>
                <div className={`sail-boat-inner${casting ? " is-casting" : ""}${gusting ? " is-gusting" : ""}${sailing ? " is-sailing" : ""}`}
                    onAnimationEnd={endGust}>
                    {sailing ? (
                        <>
                            <span className="sail-wake" aria-hidden="true"><i /><i /><i /><i /></span>
                            <span className="sail-bowwave" aria-hidden="true"><i /><i /></span>
                            <span className="sail-wind" aria-hidden="true"><i /><i /><i /></span>
                            <span className="sail-mist" aria-hidden="true"><i /><i /><i /></span>
                        </>
                    ) : null}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className={`sail-boat-img boat-aura-${tier}`} src={boat?.art} alt="Your boat" />
                    <span className="sail-crew" style={{ "--crew-bottom": `${deck}%` }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {pet?.url ? <img className="sail-pet" src={pet.url} alt="" style={pet.flip ? { transform: "scaleX(-1)" } : undefined} /> : null}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {hero?.art ? <img className="sail-hero" src={hero.art} alt="" style={hero.flip ? { transform: "scaleX(-1)" } : undefined} />
                            // eslint-disable-next-line @next/next/no-img-element
                            : hero?.avatarUrl ? <img className="sail-hero sail-hero-avatar" src={hero.avatarUrl} alt="" /> : null}
                    </span>
                </div>
            </div>

            {banner ? <div className="sail-landho">{banner}</div> : null}
            {cheer ? <Confetti /> : null}
            {gusting ? <WindGust key={gustKey} /> : null}
            {children}
        </div>
    );
}
