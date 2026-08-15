"use client";

// ── PAINTED VFX ──────────────────────────────────────────────────────────────────────────────────────────────
// ONE crisp image per effect, moved by CSS. Deliberately NOT a sprite sheet.
//
// WHY NOT A SPRITE SHEET — I tried, three generations and a normalisation pass deep, and it does not work with
// an image model. The model draws each cell independently: it does not hold an anchor, a scale or a silhouette
// across a row. Played back, the effect DRIFTS sideways and pulses in size, which reads exactly like a texture
// sliding behind a window rather than like an animation — and rescaling a ~173px crop up into a 210px box
// blurs it on top. That is not a tuning problem. Frame-to-frame coherence is the one thing the generator
// cannot give, and no amount of prompting or post-processing puts it back.
//
// What the model IS excellent at is a single striking image. So each effect is its best frame at full 256px
// (scripts/extract-arena-vfx-peak.mjs) and the MOTION is CSS transforms. That is coherent by construction —
// the same pixels, moving — crisp, because 256px art drawn at ~210px is a DOWNSCALE rather than an upscale,
// tiny at 8-27kb each, and free on a phone: transform and opacity are the two things a compositor animates
// without touching layout or paint.
//
// Each kind gets its OWN gesture, because that is where the identity lives now: a flurry stutters across, a
// drain is pulled inward, a rend climbs, a sunder blows apart. One technique, eleven different movements.

// Durations are LITERALS in the CSS below, not interpolated. styled-jsx did not parse `${DUR}ms` inside the
// `animation` shorthand — getComputedStyle reported animation-duration: 0s, so every effect skipped straight
// to its final keyframe (opacity 0) and nothing rendered at all. Kept here for reference only.
const DUR = 520;

// The peak frame of each generated effect. `surge` and `gamble` are deliberately absent — both came back from
// the generator twice as a soft glow wash that blocks badly under compression and reads as a yellow smear over
// the fighter. SkillFx draws rising embers and tumbling coins better, from shapes, with no artifacts at all.
const ART = {
    rend: "/images/arena/vfx/rend-peak.webp",
    flurry: "/images/arena/vfx/flurry-peak.webp",
    drain: "/images/arena/vfx/drain-peak.webp",
    sunder: "/images/arena/vfx/sunder-peak.webp",
    riposte: "/images/arena/vfx/riposte-peak.webp",
    spell: "/images/arena/vfx/spell-peak.webp",
    ward: "/images/arena/vfx/ward-peak.webp",
    guard: "/images/arena/vfx/ward-peak.webp",
    strike: "/images/arena/vfx/impact-peak.webp",
    hit: "/images/arena/vfx/impact-peak.webp",
    execute: "/images/arena/vfx/impact-peak.webp",
    // Generated as single frames rather than harvested from a sheet — see gen-arena-vfx-frame.mjs, which
    // acts on the conclusion the peak extractor already reached.
    freeze: "/images/arena/vfx/freeze-peak.webp",
    disarm: "/images/arena/vfx/disarm-peak.webp",
};

// Which movement each kind uses. The name is the gesture, not the art.
const MOVE = {
    rend: "rise", flurry: "stutter", drain: "siphon", sunder: "burst",
    riposte: "ringback", spell: "spin", ward: "raise", guard: "raise",
    strike: "punch", hit: "punch", execute: "punch",
    // A freeze LOCKS SHUT, so it snaps in and holds rather than rising or bursting; a shattered guard blows
    // apart, so it borrows the sunder gesture. The name is the gesture, not the art.
    freeze: "raise", disarm: "burst",
};

export const hasSheet = (kind) => Boolean(ART[kind]);

export default function SpriteFx({ kind = "hit", side = "right", size = 210, crit = false, charge = false }) {
    const art = ART[kind];
    if (!art) return null;
    const move = MOVE[kind] || "punch";
    return (
        <span className={`sfx is-${side}${crit ? " is-crit" : ""}${charge ? " is-charge" : ""}`} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={`sfx-art is-${move}`} src={art} alt="" draggable="false"
                style={{ width: `${size}px`, height: `${size}px` }} />
            <style jsx>{`
                /* OVER THE BODY of whoever it happened to. Aiming these at the "contact point" pushed
                   is-right to flex-start and is-left to flex-end, which are the SAME PLACE — the middle of
                   the ring — so an enemy blow played between the fighters and read as the enemy hitting
                   themselves, and nothing ever landed on anybody. */
                .sfx { position: absolute; top: 0; bottom: 0; width: 52%; z-index: 22;
                    display: flex; align-items: center; justify-content: center;
                    padding-bottom: 6%; pointer-events: none; }
                .sfx.is-right { right: 0; }
                .sfx.is-left { left: 0; }

                /* ── SCREEN BLENDING IS NOT OPTIONAL ─────────────────────────────────────────────────────
                   Every one of these frames is painted on PURE BLACK, deliberately: gen-arena-vfx.mjs says so
                   in its own header — "pure black is load-bearing: it is what mix-blend-mode: screen turns
                   into transparency". Without this rule the black is just black, so the effect arrives as a
                   dark rectangle with a picture in it, sitting over the fighters. The art has been generated
                   for screen compositing since the day it was made; this is the line that honours it. */
                .sfx-art { display: block; object-fit: contain; transform-origin: 50% 60%;
                    mix-blend-mode: screen;
                    filter: saturate(1.12); will-change: transform, opacity; }

                /* ── THE GESTURES ── one per kind, so two effects can never move alike. */
                .is-punch { animation: fxPunch 520ms cubic-bezier(.16,.9,.3,1) both; }
                @keyframes fxPunch {
                    0% { opacity: 0; transform: scale(.35) rotate(-8deg); }
                    18% { opacity: 1; transform: scale(1.18) rotate(2deg); }
                    46% { transform: scale(1) rotate(0deg); }
                    100% { opacity: 0; transform: scale(1.3); } }

                /* Three quick cuts, not one — the volume IS the move. */
                .is-stutter { animation: fxStutter 640ms cubic-bezier(.3,.1,.3,1) both; }
                @keyframes fxStutter {
                    0% { opacity: 0; transform: translateX(-18px) scale(.8) rotate(-12deg); }
                    14% { opacity: 1; transform: translateX(-10px) scale(1.02) rotate(-9deg); }
                    38% { opacity: .95; transform: translateX(3px) scale(1.08) rotate(3deg); }
                    64% { opacity: .9; transform: translateX(15px) scale(1.14) rotate(13deg); }
                    100% { opacity: 0; transform: translateX(24px) scale(1.2) rotate(18deg); } }

                /* Pulled back toward the caster rather than thrown away from the target. */
                .is-siphon { animation: fxSiphon 680ms cubic-bezier(.4,0,.5,1) both; }
                @keyframes fxSiphon {
                    0% { opacity: 0; transform: scale(1.45) rotate(0deg); }
                    22% { opacity: 1; transform: scale(1.2) rotate(-40deg); }
                    100% { opacity: 0; transform: scale(.35) rotate(-190deg); } }

                .is-burst { animation: fxBurst 520ms cubic-bezier(.1,.85,.3,1) both; }
                @keyframes fxBurst {
                    0% { opacity: 0; transform: scale(.3) rotate(-20deg); }
                    16% { opacity: 1; transform: scale(1.1) rotate(-4deg); }
                    100% { opacity: 0; transform: scale(1.6) rotate(14deg); } }

                /* Fire climbs. */
                .is-rise { animation: fxRise 760ms cubic-bezier(.2,.7,.3,1) both; }
                @keyframes fxRise {
                    0% { opacity: 0; transform: translateY(18px) scale(.5, .35); }
                    20% { opacity: 1; transform: translateY(2px) scale(1.05, 1.12); }
                    60% { opacity: 1; transform: translateY(-4px) scale(1, 1); }
                    100% { opacity: 0; transform: translateY(-26px) scale(.86, .8); } }

                /* Out, then home again — a blow returned. */
                .is-ringback { animation: fxRingback 720ms cubic-bezier(.3,.1,.3,1) both; }
                @keyframes fxRingback {
                    0% { opacity: 0; transform: scale(.4); }
                    28% { opacity: 1; transform: scale(1.35); }
                    62% { opacity: 1; transform: scale(.9); }
                    100% { opacity: 0; transform: scale(1.5); } }

                .is-spin { animation: fxSpin 680ms cubic-bezier(.2,.8,.3,1) both; }
                @keyframes fxSpin {
                    0% { opacity: 0; transform: scale(.4) rotate(-70deg); }
                    24% { opacity: 1; transform: scale(1.12) rotate(10deg); }
                    100% { opacity: 0; transform: scale(1.32) rotate(80deg); } }

                /* A shield comes UP and holds before it goes. */
                .is-raise { animation: fxRaise 820ms cubic-bezier(.2,1.3,.35,1) both; }
                @keyframes fxRaise {
                    0% { opacity: 0; transform: translateY(26px) scale(.6); }
                    22% { opacity: 1; transform: translateY(0) scale(1.05); }
                    62% { opacity: 1; transform: translateY(0) scale(1); }
                    100% { opacity: 0; transform: translateY(-8px) scale(1.08); } }

                /* A crit is the same gesture, bigger and brighter. */
                .sfx.is-crit { transform: scale(1.28); }
                .sfx.is-crit .sfx-art { filter: saturate(1.3) brightness(1.3)
                    drop-shadow(0 0 18px rgba(255,220,140,.8)); }

                /* ── THE CHARGE ── the wind-up before a skill lands. Smaller, dimmer, slower: power
                   GATHERING. Without it a cast and its impact were the same picture twice, which reads as a
                   stutter rather than as cause and effect. */
                .sfx.is-charge { transform: scale(.55); opacity: .85; }
                .sfx.is-charge .sfx-art { filter: saturate(1.4) brightness(.9);
                    animation-duration: 990ms; }
            `}</style>
        </span>
    );
}
