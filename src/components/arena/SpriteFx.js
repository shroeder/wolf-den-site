"use client";

// ── PAINTED VFX ──────────────────────────────────────────────────────────────────────────────────────────────
// An 8-frame sprite strip played with CSS steps(). One <span>, one background-position animation, no canvas,
// no library, no per-frame JavaScript — the compositor does all of it.
//
// WHY THIS EXISTS ALONGSIDE SkillFx. SkillFx builds effects out of coloured DOM shapes, which is genuinely
// free and scales to any new archetype without art. What it cannot do is look PAINTED: a diamond is a diamond
// however you tween it, so every skill came out as the same scatter in a different hue. These are real drawn
// effects — fire that gutters, blades that trail, ribbons that siphon inward.
//
// WHY THE SHEETS ARE GENERATED ON BLACK. Asking an image model for transparency around fire gives you a hard
// keyed edge; asking for black and deriving alpha from BRIGHTNESS keeps every soft ember soft. The alpha is
// baked in at generation time rather than blended at runtime — mix-blend-mode: screen was the first attempt
// and it does not survive this DOM, because .ar-floor and .ar-ring both create stacking contexts that isolate
// the blend and leave the effect playing inside an opaque black rectangle.
// It also means there is no cutout edge anywhere, so the white-halo problem the house rule about outlines,
// sticker rims and drop shadows exists to prevent cannot occur here.
//
// Sheets are 8 frames × 192px in one row (see scripts/gen-arena-vfx.mjs). A single row is deliberate: a 4×2
// grid would need two step animations on two axes to stay in sync, and one row needs one.

const FRAMES = 8;
const DUR = 560;   // ms — about 14fps, which is the length of a hit anyway

// Every one of the eleven kinds has painted art now. SkillFx is still the fallback, so a NEW archetype added
// later is never left with no effect at all — but nothing in the game currently reaches it.
const SHEETS = {
    rend: "/images/arena/vfx/rend-strip.webp",
    flurry: "/images/arena/vfx/flurry-strip.webp",
    drain: "/images/arena/vfx/drain-strip.webp",
    sunder: "/images/arena/vfx/sunder-strip.webp",
    riposte: "/images/arena/vfx/riposte-strip.webp",
    spell: "/images/arena/vfx/spell-strip.webp",
    ward: "/images/arena/vfx/ward-strip.webp",
    surge: "/images/arena/vfx/surge-strip.webp",
    gamble: "/images/arena/vfx/gamble-strip.webp",
    // A plain swing and a committed strike both land as an impact.
    strike: "/images/arena/vfx/impact-strip.webp",
    hit: "/images/arena/vfx/impact-strip.webp",
    execute: "/images/arena/vfx/impact-strip.webp",
    guard: "/images/arena/vfx/ward-strip.webp",
    heal: "/images/arena/vfx/surge-strip.webp",
};

export const hasSheet = (kind) => Boolean(SHEETS[kind]);

export default function SpriteFx({ kind = "hit", side = "right", size = 210, crit = false, charge = false }) {
    const sheet = SHEETS[kind];
    if (!sheet) return null;
    // Things you do to YOURSELF (a ward, a surge, a drink) belong over your own body; things you do to THEM
    // belong where the two of you meet, which is inboard of centre rather than in the middle of a half.
    const onSelf = kind === "ward" || kind === "surge" || kind === "heal" || kind === "guard";
    return (
        <span className={`sfx is-${side}${crit ? " is-crit" : ""}${onSelf ? " is-self" : ""}${charge ? " is-charge" : ""}`}
            aria-hidden="true">
            <i style={{ backgroundImage: `url(${sheet})`, width: `${size}px`, height: `${size}px` }} />
            <style jsx>{`
                /* Anchored low and inboard — where two fighters standing on sand actually make contact —
                   rather than dead centre of a half, which put every impact in the same patch of sky. */
                .sfx { position: absolute; top: 0; bottom: 0; width: 52%; z-index: 22;
                    display: flex; align-items: flex-end; justify-content: center;
                    padding-bottom: 12%; pointer-events: none; }
                .sfx.is-right { right: 0; justify-content: flex-start; }
                .sfx.is-left { left: 0; justify-content: flex-end; }
                /* A thing you do to yourself sits over your own body, not at the meeting point. */
                .sfx.is-self.is-right { justify-content: center; }
                .sfx.is-self.is-left { justify-content: center; }
                /* The strip itself. background-size 800% lays eight frames across the box; stepping
                   background-position from 0% to 100% in 8 steps walks them exactly once. */
                .sfx > i {
                    display: block;
                    background-repeat: no-repeat;
                    background-size: ${FRAMES * 100}% 100%;
                    background-position: 0% 0;
                    /* The sheets carry REAL alpha (baked from brightness at generation time), so this needs
                       no blend mode. mix-blend-mode: screen was the first attempt and it does not survive
                       this DOM: .ar-floor and .ar-ring both create stacking contexts, which isolate the
                       blend — so every effect played inside an opaque black rectangle. */
                    filter: saturate(1.15);
                    animation: sfxPlay ${DUR}ms steps(${FRAMES}) forwards;
                    will-change: background-position;
                }
                @keyframes sfxPlay { from { background-position: 0% 0; } to { background-position: 100% 0; } }
                /* A crit gets a bigger, brighter, slightly slower version of the same effect. */
                .sfx.is-crit > i { transform: scale(1.35); filter: brightness(1.35) saturate(1.2);
                    animation-duration: ${Math.round(DUR * 1.15)}ms; }
                /* ── THE CHARGE ── a cast and its impact used the same sheet at the same size, so every skill
                   flashed the identical effect twice: once over the caster, once over the target, reading as
                   a stutter rather than as cause and effect. The wind-up is now smaller, dimmer and slower —
                   power GATHERING — and only the blow that lands plays at full size. */
                .sfx.is-charge { align-items: center; padding-bottom: 0; }
                .sfx.is-charge > i { transform: scale(.58); opacity: .8;
                    filter: brightness(.85) saturate(1.3) blur(.4px);
                    animation-duration: ${Math.round(DUR * 1.7)}ms; }
            `}</style>
        </span>
    );
}
