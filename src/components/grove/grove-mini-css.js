// ── THE TEN, DRESSED ────────────────────────────────────────────────────────────────────────────────────────
// Styles for GroveMinis.js. Its own file because grove-css.js is already enormous and these ten are a unit:
// they ship together, they are read together, and one of them going wrong is a thing you want to find by
// opening one file.
//
// ⚠️ NO BACKTICKS ANYWHERE IN HERE, INCLUDING IN COMMENTS. This is a template literal, so a stray backtick
// ends it and the build fails with a parse error a long way from the cause. Same rule and same scar as
// grove-css.js -- see styled-jsx-no-backticks-in-comments, and run npm run check:css.
//
// ── WHAT THE TEN HAVE IN COMMON ─────────────────────────────────────────────────────────────────────────────
// Each game gets --tint from its registry row and spends it on the ONE thing the player is supposed to look
// at. Everything else is the same near-black board, the same frame and the same clock rail, so the pool reads
// as one forge with ten tools rather than ten unrelated screens.
export const GROVE_MINI_CSS = `
/* ⚠️ min() NOT A FLAT 268px, BECAUSE THE ACT IS NOT THE LAB. The bench gives a game a whole page; the
   craft act gives it whatever is left under a painted forge scene, in a panel that is bottom-aligned and
   capped at 86% of the viewport. A fixed 268px fit the lab and pushed the play area clean off the bottom
   of the real act -- the first screenshot of the wired version showed the title and the pips with the
   game itself below the fold. Shrinks on a short screen, never grows past what the design wants. */
.gm { position: relative; display: grid; grid-template-rows: auto 1fr auto; gap: 10px;
    min-height: min(268px, 32vh); padding: 12px 12px 10px; border-radius: 12px;
    background: radial-gradient(120% 90% at 50% 0%, rgba(255,255,255,0.05), rgba(0,0,0,0) 62%),
        rgba(8,10,12,0.72);
    border: 1px solid rgba(0,0,0,0.6); box-shadow: inset 0 3px 18px rgba(0,0,0,0.6); }

.gm-head { display: flex; align-items: baseline; gap: 10px; }
.gm-head b { font-size: 0.82rem; font-weight: 900; letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--tint); text-shadow: 0 0 14px color-mix(in srgb, var(--tint) 55%, transparent); }
.gm-head i { margin-left: auto; font-style: normal; font-size: 0.72rem; font-weight: 800;
    color: rgba(255,255,255,0.5); font-variant-numeric: tabular-nums; }
.gm-body { position: relative; display: grid; place-items: center; min-height: 0; }

/* The one element common to all ten: a rail that drains. It is the only clock a player needs. */
.gm-clock { display: block; height: 4px; border-radius: 999px; overflow: hidden;
    background: rgba(255,255,255,0.08); }
.gm-clock i { display: block; height: 100%; border-radius: 999px; background: var(--tint);
    box-shadow: 0 0 10px color-mix(in srgb, var(--tint) 70%, transparent); }

/* The shared primary button. Big, because every one of these is played with a thumb. */
.gm-big { pointer-events: auto; cursor: pointer; font: inherit; font-weight: 900; letter-spacing: 0.1em;
    min-width: 128px; padding: 14px 22px; border-radius: 14px; color: #0d0f10;
    background: linear-gradient(180deg, color-mix(in srgb, var(--tint) 92%, white 8%), var(--tint));
    border: 0; box-shadow: 0 6px 0 color-mix(in srgb, var(--tint) 55%, black 45%), 0 10px 22px rgba(0,0,0,0.5);
    touch-action: manipulation; user-select: none; }
.gm-big:active { transform: translateY(3px);
    box-shadow: 0 3px 0 color-mix(in srgb, var(--tint) 55%, black 45%), 0 6px 14px rgba(0,0,0,0.5); }

/* ── 1. BELLOWS ─────────────────────────────────────────────────────────────────────────── */
.gm-bellows { display: grid; gap: 14px; justify-items: center; width: 100%; }
.gm-gauge { position: relative; width: min(100%, 300px); height: 20px; border-radius: 999px;
    background: rgba(255,255,255,0.07); overflow: hidden; }
.gm-gauge i { display: block; height: 100%;
    background: linear-gradient(90deg, #7a2d06, var(--tint) 70%, #fff3d0);
    box-shadow: 0 0 18px color-mix(in srgb, var(--tint) 70%, transparent); transition: width 70ms linear; }
.gm-gauge em { position: absolute; inset: 0; display: grid; place-items: center; font-style: normal;
    font-size: 0.68rem; font-weight: 900; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.9);
    font-variant-numeric: tabular-nums; }
.gm-sparks { position: absolute; left: 50%; bottom: 52px; width: 1px; height: 1px; pointer-events: none; }
.gm-sparks i { position: absolute; width: calc(3px + 2px * var(--hot)); height: calc(3px + 2px * var(--hot));
    margin: -2px; border-radius: 999px; transform: rotate(var(--a));
    background: rgb(calc(214 + 41 * var(--hot)) calc(74 + 155 * var(--hot)) calc(22 + 190 * var(--hot)));
    box-shadow: 0 0 calc(5px + 7px * var(--hot)) rgba(255,160,60,0.9);
    animation: gm-fly 460ms ease-out forwards; }
@keyframes gm-fly { 0% { opacity: 0; transform: rotate(var(--a)) translateY(0) scale(0.5); }
    18% { opacity: 1; }
    100% { opacity: 0; transform: rotate(var(--a)) translateY(calc(var(--d) * -1)) scale(1.1); } }

/* ── 2. ANVIL ───────────────────────────────────────────────────────────────────────────── */
.gm-anvil { display: grid; gap: 14px; justify-items: center; width: 100%; }
.gm-track { position: relative; width: min(100%, 320px); height: 26px; border-radius: 8px;
    background: rgba(255,255,255,0.06); overflow: hidden; }
.gm-zone { position: absolute; left: 30%; width: 40%; top: 0; bottom: 0;
    background: color-mix(in srgb, var(--tint) 22%, transparent); }
.gm-core { position: absolute; left: 44.5%; width: 11%; top: 0; bottom: 0;
    background: color-mix(in srgb, var(--tint) 58%, transparent);
    box-shadow: 0 0 20px color-mix(in srgb, var(--tint) 70%, transparent); }
.gm-mark { position: absolute; top: -3px; bottom: -3px; width: 4px; margin-left: -2px; border-radius: 3px;
    background: #fff; box-shadow: 0 0 12px rgba(255,255,255,0.95); }
.gm-ring { position: absolute; left: 50%; top: 50%; width: 10px; height: 10px; margin: -5px;
    border-radius: 50%; border: 2px solid var(--tint); pointer-events: none;
    animation: gm-ring 420ms ease-out forwards; }
@keyframes gm-ring { to { transform: scale(11); opacity: 0; } }
.gm-pips { display: flex; gap: 7px; list-style: none; margin: 0; padding: 0; }
.gm-pips li { width: 9px; height: 9px; border-radius: 50%; background: rgba(255,255,255,0.14); }
.gm-pips li.is-perfect { background: #7ef0c4; box-shadow: 0 0 10px #7ef0c4; }
.gm-pips li.is-ok { background: var(--tint); }
.gm-pips li.is-miss { background: #6a6052; }

/* ── 3. QUENCH ──────────────────────────────────────────────────────────────────────────── */
.gm-quench { width: 100%; height: 100%; min-height: min(170px, 22vh); border: 0; background: none; padding: 0;
    display: grid; place-items: center; cursor: pointer; touch-action: manipulation; }
.gm-col { position: relative; width: 74px; height: 170px; border-radius: 12px;
    background: linear-gradient(180deg, rgba(255,255,255,0.07), rgba(0,0,0,0.3));
    border: 1px solid rgba(255,255,255,0.1); overflow: hidden; }
.gm-band { position: absolute; left: 0; right: 0;
    background: color-mix(in srgb, var(--tint) 30%, transparent);
    border-top: 2px solid var(--tint); border-bottom: 2px solid var(--tint);
    box-shadow: 0 0 22px color-mix(in srgb, var(--tint) 60%, transparent); }
.gm-steel { position: absolute; left: 8px; right: 8px; height: 14px; margin-top: -7px; border-radius: 4px;
    background: var(--c); box-shadow: 0 0 20px var(--c); }

/* ── 4. DRAW ────────────────────────────────────────────────────────────────────────────── */
.gm-draw { width: 100%; border: 0; background: none; padding: 0; display: grid; gap: 12px;
    justify-items: center; cursor: pointer; touch-action: none; user-select: none; }
.gm-bar { position: relative; width: min(100%, 300px); height: 30px; border-radius: 10px;
    background: rgba(255,255,255,0.07); overflow: hidden; }
.gm-bar i { display: block; height: 100%;
    background: linear-gradient(90deg, var(--tint), #ffd75e 78%, #ff5e5e);
    box-shadow: 0 0 20px color-mix(in srgb, var(--tint) 60%, transparent); }
/* The line you are aiming to reach and must not pass. */
.gm-bar em { position: absolute; top: -4px; bottom: -4px; width: 3px; margin-left: -1.5px;
    background: #fff; box-shadow: 0 0 10px #fff; }
.gm-draw b { font-size: 0.8rem; font-weight: 900; letter-spacing: 0.16em; color: rgba(255,255,255,0.7); }
.gm-draw.is-hot b { color: #ffd75e; text-shadow: 0 0 14px rgba(255,215,94,0.8); }

/* ── 5. FOLD ────────────────────────────────────────────────────────────────────────────── */
.gm-fold { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; width: 100%; height: 100%;
    min-height: min(160px, 21vh); }
.gm-plate { border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; cursor: pointer;
    background: rgba(255,255,255,0.04); touch-action: manipulation; }
/* --beat falls from 1 to 0 across the beat, so the lit plate visibly decays and late reads as late. */
.gm-plate.is-on { background: color-mix(in srgb, var(--tint) calc(12% + 46% * var(--beat)), transparent);
    border-color: color-mix(in srgb, var(--tint) 75%, transparent);
    box-shadow: inset 0 0 calc(10px + 40px * var(--beat)) color-mix(in srgb, var(--tint) 55%, transparent); }

/* ── 6. GRIND ───────────────────────────────────────────────────────────────────────────── */
.gm-grind { position: relative; width: 100%; height: 100%; min-height: min(170px, 22vh); border-radius: 12px;
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
    touch-action: none; cursor: ew-resize; overflow: hidden; }
.gm-edge { position: absolute; left: 6%; right: 6%; top: 50%; height: 8px; margin-top: -4px;
    border-radius: 4px; background: linear-gradient(90deg, #6a7480, #cfd8e2, #6a7480); }
.gm-grit { position: absolute; left: 50%; top: 50%; width: 1px; height: 1px; }
/* Fat, slow sparks mean you are off the speed; tight quiet ones mean you are on it. The error is drawn. */
.gm-grit i { position: absolute; border-radius: 50%; background: #ffd089;
    width: calc(2px + 7px * var(--err)); height: calc(2px + 7px * var(--err));
    box-shadow: 0 0 calc(4px + 14px * var(--err)) rgba(255,190,100,0.9);
    opacity: calc(0.25 + 0.75 * var(--err));
    animation: gm-grit 700ms linear infinite; animation-delay: calc(var(--i) * -0.1s); }
@keyframes gm-grit { from { transform: translate(0,0) scale(1); opacity: 0.9; }
    to { transform: translate(calc(-30px - 40px * var(--err)), -26px) scale(0.3); opacity: 0; } }

/* ── 7. TEMPER ──────────────────────────────────────────────────────────────────────────── */
.gm-temper { position: relative; border: 0; background: none; padding: 0; cursor: pointer;
    display: grid; place-items: center; touch-action: manipulation; }
.gm-dial { position: relative; width: 150px; height: 150px; border-radius: 50%;
    background: conic-gradient(from 0deg,
        rgba(255,255,255,0.05) 0deg 350deg, color-mix(in srgb, var(--tint) 70%, transparent) 350deg 360deg);
    border: 2px solid rgba(255,255,255,0.14); transform: rotate(var(--deg)); }
.gm-notch { position: absolute; left: 50%; top: 4px; width: 5px; height: 26px; margin-left: -2.5px;
    border-radius: 3px; background: var(--tint);
    box-shadow: 0 0 16px color-mix(in srgb, var(--tint) 80%, transparent); }
/* The mark the notch has to stop under. Outside the rotating element, or it would turn with it. */
.gm-mark-top { position: absolute; top: -2px; width: 0; height: 0;
    border-left: 9px solid transparent; border-right: 9px solid transparent; border-top: 14px solid #fff;
    filter: drop-shadow(0 0 8px rgba(255,255,255,0.9)); }

/* ── 8. RIVETS ──────────────────────────────────────────────────────────────────────────── */
.gm-rivets { position: relative; width: 100%; height: 100%; min-height: min(180px, 23vh); }
.gm-rivet { position: absolute; border: 0; cursor: pointer; padding: 0; border-radius: 50%;
    width: calc(72px - 34px * var(--age)); height: calc(72px - 34px * var(--age));
    margin: calc(-36px + 17px * var(--age));
    background: radial-gradient(circle at 34% 30%, #fff8e0, var(--tint) 62%, #6b3c06);
    box-shadow: 0 0 calc(10px + 18px * (1 - var(--age))) color-mix(in srgb, var(--tint) 75%, transparent);
    opacity: calc(0.35 + 0.65 * (1 - var(--age))); touch-action: manipulation; }

/* ── 9. POLISH ──────────────────────────────────────────────────────────────────────────── */
.gm-polish { display: grid; grid-template-columns: repeat(6, 1fr); grid-template-rows: repeat(4, 1fr);
    gap: 3px; width: 100%; height: 100%; min-height: min(170px, 22vh); touch-action: none; cursor: crosshair; }
.gm-polish i { border-radius: 5px; background: rgba(255,255,255,0.05);
    transition: background 180ms ease, box-shadow 180ms ease; }
.gm-polish i.is-lit { background: color-mix(in srgb, var(--tint) 46%, transparent);
    box-shadow: inset 0 0 14px color-mix(in srgb, var(--tint) 60%, transparent); }

/* ── 10. INLAY ──────────────────────────────────────────────────────────────────────────── */
.gm-inlay { position: relative; width: 100%; height: 100%; min-height: min(180px, 23vh); touch-action: none;
    cursor: crosshair; }
.gm-inlay svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.gm-chan { fill: none; stroke: rgba(255,255,255,0.1); stroke-width: 9; stroke-linecap: round;
    vector-effect: non-scaling-stroke; }
.gm-gold { fill: none; stroke: var(--tint); stroke-width: 7; stroke-linecap: round;
    vector-effect: non-scaling-stroke;
    filter: drop-shadow(0 0 7px color-mix(in srgb, var(--tint) 75%, transparent)); }
.gm-bead { position: absolute; width: 18px; height: 18px; margin: -9px; border-radius: 50%;
    background: radial-gradient(circle at 34% 30%, #fff, var(--tint) 70%);
    box-shadow: 0 0 18px color-mix(in srgb, var(--tint) 85%, transparent); pointer-events: none; }

@media (prefers-reduced-motion: reduce) {
    .gm-sparks, .gm-grit, .gm-ring { display: none; }
}
`;
