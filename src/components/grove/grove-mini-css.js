// ── THE TEN, DRESSED ────────────────────────────────────────────────────────────────────────────────────────
// Styles for GroveMinis.js. Its own file because grove-css.js is already enormous and these ten are a unit:
// they ship together, they are read together, and one of them going wrong is a thing you want to find by
// opening one file.
//
// ⚠️ NO BACKTICKS ANYWHERE IN HERE, INCLUDING IN COMMENTS. This is a template literal, so a stray backtick
// ends it and the build fails with a parse error a long way from the cause. Same rule and same scar as
// grove-css.js -- see styled-jsx-no-backticks-in-comments, and run npm run check:css.
//
// ── THE SECOND PASS, AND WHY THERE HAD TO BE ONE ────────────────────────────────────────────────────────────
// Luke, on the first version: "all the new minigames need to take up a majority of the screen. They need to
// look really good. Feel free to do another pass to actually make it awesome. And just like bare minimum,
// because you tend to do that. You tend to make things bare minimum instead of actually making them awesome
// and giving the creative thought to each one they deserve."
//
// He was right. The first pass was ten correct games: a bar, a track, a column, a dial -- each one the
// smallest shape that could carry its rule, in a 32vh card pinned under a painting. Correct is not the brief.
//
// What changed, and the rules the pass was held to:
//
//   SIZE        every play surface fills the panel now, and the panel takes the screen while a phase runs.
//               A game you squint at is a game nobody looks forward to.
//
//   MATERIAL    nothing is a flat rectangle any more. Steel has a hot core and a cold skin, coals glow from
//               under, the grindstone is a stone, water has a surface. The forge already has a painted
//               visual language and these now speak it instead of being UI parked in front of it.
//
//   MOTION THAT MEANS SOMETHING    every animation here is driven by a number the game already has --
//               the heat, the error, how far down the rack. Nothing loops just to be busy.
//
//   ⚠️ AND STILL NO INSTRUCTIONS. Luke: "don't spell it all out for people. You got to make it intuitive."
//               Bigger is allowed to mean clearer; it is not allowed to mean captioned. Every rule in these
//               ten is still taught by something moving. See teach-by-showing-not-telling.
export const GROVE_MINI_CSS = `
/* ⚠️ THE GAME IS THE SCREEN, NOT A STRIP UNDER IT. 62vh with a floor, so a short phone still gets a real
   play area and a tall one does not leave the game floating in a void. */
.gm { position: relative; display: grid; grid-template-rows: auto 1fr auto; gap: 12px;
    min-height: min(62vh, 560px); padding: 14px 14px 12px; border-radius: 16px;
    background:
        radial-gradient(140% 100% at 50% -10%, color-mix(in srgb, var(--tint) 13%, transparent), transparent 58%),
        linear-gradient(180deg, rgba(14,16,18,0.9), rgba(6,7,9,0.96));
    border: 1px solid color-mix(in srgb, var(--tint) 26%, rgba(0,0,0,0.7));
    box-shadow: inset 0 2px 0 rgba(255,255,255,0.05), inset 0 -30px 60px rgba(0,0,0,0.6),
        0 20px 60px rgba(0,0,0,0.6); }

.gm-head { display: flex; align-items: baseline; gap: 10px; }
.gm-head b { font-size: 0.9rem; font-weight: 900; letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--tint); text-shadow: 0 0 18px color-mix(in srgb, var(--tint) 60%, transparent); }
.gm-head i { margin-left: auto; font-style: normal; font-size: 1.05rem; font-weight: 900;
    color: rgba(255,255,255,0.82); font-variant-numeric: tabular-nums;
    text-shadow: 0 1px 4px rgba(0,0,0,0.8); }
.gm-body { position: relative; display: grid; place-items: center; min-height: 0; width: 100%; }

/* The phase clock. The only thing common to all ten, and it drains rather than fills so the pressure is
   a thing disappearing. */
/* ── THE COUNT-IN ─────────────────────────────────────────────────────────────
   Three beats over a game that is already drawn. The veil is deliberately THIN — the whole purpose of the
   pause is that you read the picture underneath it, so anything opaque enough to hide the anvil would have
   defeated the feature while looking tidier.

   Each number is its own element (key={count}), so each one replays the animation from the start instead of
   one node quietly swapping its text. The number arrives large and loose and settles — the settling is what
   makes it read as a beat rather than a label. */
.gm-countin { position: absolute; inset: 0; display: grid; place-items: center; z-index: 5;
    background: radial-gradient(60% 60% at 50% 50%, rgba(6,8,12,0.52), rgba(6,8,12,0.78)); }
.gm-countin b { font-size: clamp(76px, 22vw, 150px); font-weight: 900; line-height: 1;
    font-variant-numeric: tabular-nums; color: var(--tint, #ffd75e);
    text-shadow: 0 0 34px color-mix(in srgb, var(--tint, #ffd75e) 60%, transparent), 0 6px 0 rgba(0,0,0,0.5);
    animation: gm-count 420ms cubic-bezier(.16,.9,.3,1) both; }
@keyframes gm-count {
    from { transform: scale(1.7); opacity: 0; letter-spacing: 0.3em; }
    55%  { transform: scale(1); opacity: 1; letter-spacing: 0; }
    to   { transform: scale(0.94); opacity: 0.72; letter-spacing: 0; }
}
.gm-clock { display: block; height: 6px; border-radius: 999px; overflow: hidden;
    background: rgba(255,255,255,0.07); box-shadow: inset 0 1px 3px rgba(0,0,0,0.7); }
.gm-clock i { display: block; height: 100%; border-radius: 999px;
    background: linear-gradient(90deg, color-mix(in srgb, var(--tint) 55%, black), var(--tint));
    box-shadow: 0 0 14px color-mix(in srgb, var(--tint) 80%, transparent); }

/* The shared primary button. Thumb-sized and then some; these are hit fast and under pressure. */
.gm-big { pointer-events: auto; cursor: pointer; font: inherit; font-weight: 900; letter-spacing: 0.12em;
    min-width: 168px; padding: 20px 30px; border-radius: 18px; color: #0c0e0f; font-size: 1.05rem;
    background: linear-gradient(180deg, color-mix(in srgb, var(--tint) 86%, white 14%), var(--tint) 62%,
        color-mix(in srgb, var(--tint) 80%, black 20%));
    border: 0; box-shadow: 0 7px 0 color-mix(in srgb, var(--tint) 46%, black 54%),
        0 16px 34px rgba(0,0,0,0.55), inset 0 2px 0 rgba(255,255,255,0.45);
    touch-action: manipulation; user-select: none; }
.gm-big:active { transform: translateY(5px);
    box-shadow: 0 2px 0 color-mix(in srgb, var(--tint) 46%, black 54%), 0 6px 16px rgba(0,0,0,0.55); }

/* ── 1. BELLOWS ─────────────────────────────────────────────────────────────────────────────
   A furnace mouth, not a progress bar. The fire climbs the throat as the bar fills, the coals under
   it brighten, and the whole thing breathes faster the hotter it gets -- so the number on the gauge
   is the LAST place you would look to know how you are doing. */
.gm-bellows { display: grid; grid-template-rows: 1fr auto; gap: 16px; justify-items: center;
    width: 100%; height: 100%; }
.gm-throat { position: relative; width: min(100%, 320px); height: 100%; min-height: 150px;
    border-radius: 14px 14px 10px 10px; overflow: hidden;
    background: linear-gradient(180deg, #0a0806, #1b120a 72%, #2a1a0c);
    box-shadow: inset 0 0 0 1px rgba(255,170,80,0.14), inset 0 -24px 40px rgba(0,0,0,0.7); }
/* The fire itself. Height is the heat; the gradient is a real flame ramp, dull red at the shoulders
   to white at the base. */
.gm-fire { position: absolute; left: 0; right: 0; bottom: 0; height: calc(16% + 84% * var(--hot));
    background: linear-gradient(180deg,
        rgba(255,92,20,0) 0%, rgba(255,110,24,0.5) 26%, rgba(255,168,48,0.9) 62%,
        rgba(255,226,150,0.98) 88%, #fff6df 100%);
    filter: blur(calc(1px + 2px * var(--hot)));
    animation: gm-breathe calc(900ms - 420ms * var(--hot)) ease-in-out infinite alternate; }
@keyframes gm-breathe { from { transform: scaleY(0.955) } to { transform: scaleY(1.03) } }
/* Coals along the floor of the throat, lit from under. */
.gm-coals { position: absolute; left: 0; right: 0; bottom: 0; height: 26px;
    background: radial-gradient(60% 150% at 20% 100%, rgba(255,150,40,calc(0.3 + 0.7 * var(--hot))), transparent 70%),
        radial-gradient(60% 150% at 52% 100%, rgba(255,190,70,calc(0.3 + 0.7 * var(--hot))), transparent 70%),
        radial-gradient(60% 150% at 82% 100%, rgba(255,130,30,calc(0.3 + 0.7 * var(--hot))), transparent 70%),
        #140c06; }
.gm-gauge { position: absolute; left: 10px; right: 10px; top: 10px; height: 10px; border-radius: 999px;
    background: rgba(0,0,0,0.5); overflow: hidden; box-shadow: inset 0 1px 3px rgba(0,0,0,0.8); }
.gm-gauge i { display: block; height: 100%;
    background: linear-gradient(90deg, #a13a06, #ffb43c 72%, #fff3d0);
    box-shadow: 0 0 16px rgba(255,170,60,0.9); transition: width 70ms linear; }
.gm-sparks { position: absolute; left: 50%; bottom: 34%; width: 1px; height: 1px; pointer-events: none; }
.gm-sparks i { position: absolute; width: calc(3px + 3px * var(--hot)); height: calc(3px + 3px * var(--hot));
    margin: -2px; border-radius: 999px; transform: rotate(var(--a));
    background: rgb(calc(214 + 41 * var(--hot)) calc(74 + 155 * var(--hot)) calc(22 + 190 * var(--hot)));
    box-shadow: 0 0 calc(6px + 10px * var(--hot)) rgba(255,160,60,0.95);
    animation: gm-fly 520ms ease-out forwards; }
@keyframes gm-fly { 0% { opacity: 0; transform: rotate(var(--a)) translateY(0) scale(0.5); }
    18% { opacity: 1; }
    100% { opacity: 0; transform: rotate(var(--a)) translateY(calc(var(--d) * -1)) scale(1.15); } }

/* ── 2. ANVIL ───────────────────────────────────────────────────────────────────────────────
   The track is a bar of hot steel lying on the anvil, not a slider: cold grey at the ends, working
   heat in the middle, white where it is perfect. You are being asked to hit the glowing part, which
   is a thing a blacksmith would already know. */
.gm-anvil { display: grid; grid-template-rows: 1fr auto auto; gap: 18px; justify-items: center;
    width: 100%; height: 100%; align-content: center; }
.gm-track { position: relative; width: min(100%, 360px); height: 74px; border-radius: 10px;
    background: linear-gradient(180deg, #2c3036, #171a1e 55%, #0e1013);
    box-shadow: inset 0 2px 0 rgba(255,255,255,0.08), inset 0 -10px 20px rgba(0,0,0,0.7); overflow: hidden; }
.gm-zone { position: absolute; left: 30%; width: 40%; top: 0; bottom: 0;
    background: linear-gradient(180deg, rgba(255,140,30,0.35), rgba(255,90,10,0.16));
    box-shadow: 0 0 40px rgba(255,130,30,0.4); }
.gm-core { position: absolute; left: 44.5%; width: 11%; top: 0; bottom: 0;
    background: linear-gradient(180deg, #fff6dc, #ffcf6a 60%, #ff9b22);
    box-shadow: 0 0 46px rgba(255,210,110,0.95); }
/* The hammer, not a line: a head on a haft, hanging over the bar. */
.gm-mark { position: absolute; top: -2px; bottom: -2px; width: 10px; margin-left: -5px; border-radius: 3px;
    background: linear-gradient(180deg, #f2f5f8, #9aa4ad 46%, #5c646c);
    box-shadow: 0 0 18px rgba(255,255,255,0.8), 0 6px 14px rgba(0,0,0,0.7); }
.gm-ring { position: absolute; left: 50%; top: 42%; width: 12px; height: 12px; margin: -6px;
    border-radius: 50%; border: 3px solid var(--tint); pointer-events: none;
    animation: gm-ring 460ms ease-out forwards; }
@keyframes gm-ring { to { transform: scale(14); opacity: 0; border-width: 1px; } }
.gm-pips { display: flex; gap: 10px; list-style: none; margin: 0; padding: 0; }
.gm-pips li { width: 13px; height: 13px; border-radius: 50%; background: rgba(255,255,255,0.12);
    box-shadow: inset 0 1px 2px rgba(0,0,0,0.8); }
.gm-pips li.is-perfect { background: #7ef0c4; box-shadow: 0 0 14px #7ef0c4; }
.gm-pips li.is-ok { background: var(--tint); box-shadow: 0 0 10px var(--tint); }
.gm-pips li.is-miss { background: #5d564a; }

/* ── 3. QUENCH ──────────────────────────────────────────────────────────────────────────────
   A tank of water with a surface, and a billet falling toward it. The band IS the water line, so
   "catch it in the band" needs no explaining: you are dunking hot steel at the right moment. */
.gm-quench { width: 100%; height: 100%; border: 0; background: none; padding: 0;
    display: grid; place-items: center; cursor: pointer; touch-action: manipulation; }
.gm-col { position: relative; width: min(100%, 230px); height: 100%; min-height: 200px; border-radius: 14px;
    background: linear-gradient(180deg, #0b0f14 0%, #0c1a24 58%, #06222e 100%);
    border: 1px solid rgba(120,200,230,0.16); overflow: hidden;
    box-shadow: inset 0 -30px 50px rgba(0,0,0,0.6); }
/* The water line, lit from within, with a slow ripple so it reads as liquid rather than as a target. */
.gm-band { position: absolute; left: 0; right: 0;
    background: linear-gradient(180deg, rgba(120,225,255,0.45), rgba(40,150,200,0.18));
    border-top: 2px solid #9fe8ff; border-bottom: 2px solid rgba(120,200,235,0.5);
    box-shadow: 0 0 34px rgba(120,220,255,0.65);
    animation: gm-ripple 2.6s ease-in-out infinite alternate; }
@keyframes gm-ripple { from { transform: scaleY(0.94) } to { transform: scaleY(1.07) } }
/* The billet. --c is its own cooling colour, handed in by the component. */
.gm-steel { position: absolute; left: 22%; right: 22%; height: 30px; margin-top: -15px; border-radius: 6px;
    background: linear-gradient(180deg, color-mix(in srgb, var(--c) 70%, white 30%), var(--c) 55%,
        color-mix(in srgb, var(--c) 70%, black 30%));
    box-shadow: 0 0 40px var(--c), 0 0 90px color-mix(in srgb, var(--c) 60%, transparent); }

/* ── 4. DRAW ────────────────────────────────────────────────────────────────────────────────
   The bar physically lengthens under the hammer and goes white where it is thinnest. The strain
   line is a scored mark in the steel; past it the whole piece shivers. */
.gm-draw { width: 100%; height: 100%; border: 0; background: none; padding: 0; display: grid;
    align-content: center; gap: 20px; justify-items: center; cursor: pointer; touch-action: none;
    user-select: none; }
/* The stock track is the full width of the card; the billet occupies 18% of it at rest and 90% at the
   moment it tears, so --h drives one number into both of its dimensions. */
.gm-stock { position: relative; width: 100%; height: 190px; display: flex; align-items: center; }
/* The jaw. Fixed, heavy, and slightly inset so the billet reads as coming OUT of it. */
.gm-jaw { position: absolute; left: 0; top: 50%; transform: translateY(-50%);
    width: 54px; height: 104px; border-radius: 10px 4px 4px 10px;
    background: linear-gradient(180deg, #3a4048, #171a1f 60%, #0e1013);
    box-shadow: inset 0 2px 0 rgba(255,255,255,0.12), 0 10px 22px rgba(0,0,0,0.6); z-index: 2; }
/* Longer and thinner on the same metal, and hotter as it thins — the colour is interpolated on --h so
   there is no step where it suddenly "turns" dangerous; it just keeps going. */
.gm-billet { position: absolute; left: 30px; top: 50%; transform: translateY(-50%);
    width: calc((18 + var(--h) * 72) * 1%);
    height: calc(84px - var(--h) * 58px);
    border-radius: 6px;
    background: linear-gradient(90deg,
        color-mix(in srgb, #ff7a2a calc(var(--h) * 100%), #6d3a12) 0%,
        color-mix(in srgb, #fff2cf calc(var(--h) * 100%), #ffae4a) 62%,
        color-mix(in srgb, #ff4d3a calc(var(--h) * 100%), #ff8a3c) 100%);
    box-shadow: 0 0 calc(18px + var(--h) * 54px) rgba(255,150,60, calc(0.45 + var(--h) * 0.5));
    transition: none; }
/* Scored into the steel rather than floating over it: the mark is where the smith knows to stop. */
.gm-strain { position: absolute; top: 18%; bottom: 18%; width: 5px; margin-left: -2px; z-index: 3;
    background: repeating-linear-gradient(180deg, rgba(255,255,255,0.95) 0 6px, rgba(255,255,255,0.18) 6px 12px);
    box-shadow: 0 0 16px rgba(255,255,255,0.8); }
.gm-draw.is-hot .gm-billet { animation: gm-shiver 90ms linear infinite; }
.gm-draw.is-torn .gm-billet { opacity: 0.35; filter: grayscale(0.7); }
@keyframes gm-shiver { 0%,100% { transform: translateY(-50%) translateX(0) } 50% { transform: translateY(-50%) translateX(2px) } }
.gm-draw b { font-size: 0.95rem; font-weight: 900; letter-spacing: 0.2em;
    color: rgba(255,255,255,0.6); }
.gm-draw.is-hot b { color: #ffd75e; text-shadow: 0 0 18px rgba(255,215,94,0.9); }
.gm-draw.is-torn b { color: #ff6a4a; text-shadow: 0 0 18px rgba(255,106,74,0.9); }
/* The number is for the player who wants one, set large and dim so it never competes with the metal. */
.gm-draw-read { font-size: 2.6rem; font-weight: 900; font-variant-numeric: tabular-nums; line-height: 1;
    color: rgba(255,255,255,0.14); }

/* ── 5. FOLD ────────────────────────────────────────────────────────────────────────────────
   Two halves of the billet. The lit one is raised and hot; the dark one has gone cold. Alternating
   is therefore not a rule you are told, it is the only thing that looks like it would work. */
.gm-fold { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; width: 100%; height: 100%; }
.gm-plate { position: relative; border: 1px solid rgba(255,255,255,0.08); border-radius: 14px;
    cursor: pointer; touch-action: manipulation; overflow: hidden;
    background: linear-gradient(180deg, #23252b, #101216);
    box-shadow: inset 0 2px 0 rgba(255,255,255,0.05), inset 0 -16px 30px rgba(0,0,0,0.7);
    transform: translateY(6px) scale(0.985); transition: transform 140ms ease; }
.gm-plate.is-on { transform: translateY(0) scale(1);
    background: linear-gradient(180deg,
        color-mix(in srgb, var(--tint) calc(22% + 48% * var(--beat)), #23252b),
        color-mix(in srgb, var(--tint) calc(8% + 26% * var(--beat)), #101216));
    border-color: color-mix(in srgb, var(--tint) 70%, transparent);
    box-shadow: 0 0 calc(14px + 54px * var(--beat)) color-mix(in srgb, var(--tint) 55%, transparent),
        inset 0 2px 0 rgba(255,255,255,0.18); }

/* ── 6. GRIND ───────────────────────────────────────────────────────────────────────────────
   A real wheel that turns with your thumb. Error fattens the sparks and reddens the stone, so the
   screen tells you to slow down without a word on it. */
.gm-grind { position: relative; width: 100%; height: 100%; min-height: 200px; border-radius: 14px;
    background: linear-gradient(180deg, #14171b, #0a0c0e); border: 1px solid rgba(255,255,255,0.07);
    touch-action: none; cursor: ew-resize; overflow: hidden; display: grid; place-items: center; }
.gm-wheel { width: min(56%, 190px); aspect-ratio: 1; border-radius: 50%;
    background:
        repeating-conic-gradient(rgba(255,255,255,0.05) 0deg 6deg, transparent 6deg 12deg),
        radial-gradient(circle at 38% 34%, #8c8578, #4d4941 62%, #2a2822);
    border: 6px solid #1b1915;
    box-shadow: 0 0 0 2px rgba(255,255,255,0.05), 0 18px 40px rgba(0,0,0,0.7),
        0 0 calc(10px + 60px * var(--err)) rgba(255,120,40,calc(0.15 + 0.6 * var(--err)));
    animation: gm-spin 1.1s linear infinite; }
@keyframes gm-spin { to { transform: rotate(360deg) } }
.gm-edge { position: absolute; left: 8%; right: 8%; top: 50%; height: 10px; margin-top: -5px;
    border-radius: 5px;
    background: linear-gradient(90deg, #4c545d, #e2e9f0 50%, #4c545d);
    box-shadow: 0 0 20px rgba(200,225,255,0.3); }
.gm-grit { position: absolute; left: 50%; top: 50%; width: 1px; height: 1px; }
.gm-grit i { position: absolute; border-radius: 50%; background: #ffd089;
    width: calc(2px + 9px * var(--err)); height: calc(2px + 9px * var(--err));
    box-shadow: 0 0 calc(5px + 18px * var(--err)) rgba(255,190,100,0.95);
    opacity: calc(0.25 + 0.75 * var(--err));
    animation: gm-grit 700ms linear infinite; animation-delay: calc(var(--i) * -0.1s); }
@keyframes gm-grit { from { transform: translate(0,0) scale(1); opacity: 0.95; }
    to { transform: translate(calc(-34px - 54px * var(--err)), -30px) scale(0.3); opacity: 0; } }

/* ── 7. TEMPER ──────────────────────────────────────────────────────────────────────────────
   A heavy brass dial with a ticked rim and a glowing index, under a fixed mark. It LOOKS like an
   instrument, so stopping it on the mark is the obvious thing to try. */
.gm-temper { position: relative; border: 0; background: none; padding: 0; cursor: pointer;
    display: grid; place-items: center; touch-action: manipulation; width: 100%; height: 100%; }
.gm-dial { position: relative; width: min(74%, 260px); aspect-ratio: 1; border-radius: 50%;
    background:
        repeating-conic-gradient(from 0deg, rgba(255,255,255,0.14) 0deg 1deg, transparent 1deg 15deg),
        conic-gradient(from 0deg, rgba(255,255,255,0.04) 0deg 348deg,
            color-mix(in srgb, var(--tint) 75%, transparent) 348deg 360deg),
        radial-gradient(circle at 36% 30%, #3a3129, #1a1713 70%);
    border: 3px solid rgba(255,255,255,0.12);
    box-shadow: inset 0 0 50px rgba(0,0,0,0.8), 0 18px 44px rgba(0,0,0,0.6);
    transform: rotate(var(--deg)); }
.gm-notch { position: absolute; left: 50%; top: 8px; width: 7px; height: 38px; margin-left: -3.5px;
    border-radius: 4px; background: linear-gradient(180deg, #fff, var(--tint));
    box-shadow: 0 0 24px color-mix(in srgb, var(--tint) 90%, transparent); }
.gm-mark-top { position: absolute; top: 2px; width: 0; height: 0;
    border-left: 13px solid transparent; border-right: 13px solid transparent; border-top: 20px solid #fff;
    filter: drop-shadow(0 0 12px rgba(255,255,255,0.95)); z-index: 2; }

/* ── 8. RIVETS ──────────────────────────────────────────────────────────────────────────────
   A steel plate with the rivet standing proud of it, lit and shrinking. The plate makes the target
   read as a thing to hit rather than a dot to tap. */
.gm-rivets { position: relative; width: 100%; height: 100%; min-height: 220px; border-radius: 14px;
    overflow: hidden;
    background:
        repeating-linear-gradient(90deg, rgba(255,255,255,0.025) 0 2px, transparent 2px 58px),
        linear-gradient(180deg, #272b31, #14171b);
    box-shadow: inset 0 2px 0 rgba(255,255,255,0.06), inset 0 -24px 44px rgba(0,0,0,0.7); }
.gm-rivet { position: absolute; border: 0; cursor: pointer; padding: 0; border-radius: 50%;
    width: calc(92px - 42px * var(--age)); height: calc(92px - 42px * var(--age));
    margin: calc(-46px + 21px * var(--age));
    background: radial-gradient(circle at 34% 28%, #fffaec, var(--tint) 56%, #6b3c06 92%);
    box-shadow: 0 0 calc(14px + 26px * (1 - var(--age))) color-mix(in srgb, var(--tint) 80%, transparent),
        inset 0 -5px 10px rgba(0,0,0,0.45), 0 8px 18px rgba(0,0,0,0.6);
    opacity: calc(0.3 + 0.7 * (1 - var(--age))); touch-action: manipulation; }

/* ── 9. POLISH ──────────────────────────────────────────────────────────────────────────────
   A dulled steel face that comes up bright where the cloth has been, with a sheen that travels
   across the clean parts. Nothing says "cover it all"; the unfinished corners do that themselves. */
.gm-polish { position: relative; display: grid; grid-template-columns: repeat(6, 1fr);
    grid-template-rows: repeat(4, 1fr); gap: 4px; width: 100%; height: 100%; min-height: 210px;
    padding: 8px; border-radius: 14px; touch-action: none; cursor: crosshair;
    background: linear-gradient(180deg, #1b1e22, #0d0f12);
    box-shadow: inset 0 2px 0 rgba(255,255,255,0.05), inset 0 -22px 40px rgba(0,0,0,0.7); }
.gm-polish i { border-radius: 6px; background: linear-gradient(180deg, #2a2e33, #1c2024);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
    transition: background 220ms ease, box-shadow 220ms ease, transform 220ms ease; }
.gm-polish i.is-lit { transform: scale(1.02);
    background: linear-gradient(180deg,
        color-mix(in srgb, var(--tint) 70%, white 18%), color-mix(in srgb, var(--tint) 36%, #1c2024));
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.5),
        0 0 20px color-mix(in srgb, var(--tint) 45%, transparent); }

/* ── 10. INLAY ──────────────────────────────────────────────────────────────────────────────
   A channel cut into dark metal with gold running into it behind the bead. The gold staying where
   you have been is the score, drawn. */
.gm-inlay { position: relative; width: 100%; height: 100%; min-height: 220px; touch-action: none;
    cursor: crosshair; border-radius: 14px; overflow: hidden;
    background: linear-gradient(180deg, #1a1d21, #0b0d10);
    box-shadow: inset 0 2px 0 rgba(255,255,255,0.05), inset 0 -24px 44px rgba(0,0,0,0.7); }
.gm-inlay svg { position: absolute; inset: 0; width: 100%; height: 100%; }
/* The cut groove: a dark channel with a lit lower lip, so it reads as carved rather than drawn on. */
.gm-chan { fill: none; stroke: rgba(0,0,0,0.65); stroke-width: 22; stroke-linecap: round;
    vector-effect: non-scaling-stroke; }
.gm-chan2 { fill: none; stroke: rgba(255,255,255,0.08); stroke-width: 24; stroke-linecap: round;
    vector-effect: non-scaling-stroke; transform: translateY(1.5px); }
.gm-gold { fill: none; stroke: var(--tint); stroke-width: 15; stroke-linecap: round;
    vector-effect: non-scaling-stroke;
    filter: drop-shadow(0 0 10px color-mix(in srgb, var(--tint) 85%, transparent)); }
.gm-bead { position: absolute; width: 30px; height: 30px; margin: -15px; border-radius: 50%;
    background: radial-gradient(circle at 34% 28%, #fff, var(--tint) 62%, color-mix(in srgb, var(--tint) 60%, black));
    box-shadow: 0 0 28px color-mix(in srgb, var(--tint) 90%, transparent), 0 4px 10px rgba(0,0,0,0.6);
    pointer-events: none; }

@media (prefers-reduced-motion: reduce) {
    .gm-sparks, .gm-grit, .gm-ring { display: none; }
    .gm-fire, .gm-band, .gm-wheel, .gm-draw.is-hot .gm-billet { animation: none; }
}
`;
