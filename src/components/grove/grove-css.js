// ── THE GROVE'S LOOK ─────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ NO BACKTICKS ANYWHERE IN THESE COMMENTS. This is a template literal, and a backtick inside a CSS comment
// ends it and breaks the build. That has happened eleven times in this repo across two sessions, which is
// why npm run check:css exists — run it after touching this file.
//
// ⚠️ AND NO FILTER ON A SCENE ANCESTOR. A filter or backdrop-filter creates a containing block, and the
// scene positions everything absolutely inside it; a tint on a wrapper would silently re-anchor every body in
// the zone. See filter-creates-containing-block, which cost a whole mobile menu.
export const GROVE_CSS = `
.gv { position: relative; color: #efe7d8; }

/* ── CHROME ──────────────────────────────────────────────────────────────────────────────────── */
.gv-head { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
.gv-head > b { font-size: 1.05rem; color: #9fe08a; letter-spacing: .02em; }
/* Scrolls rather than wraps: four pills and a title wrapped onto three lines on a phone, which pushed the
   map itself below the fold on the screen whose whole job is the map. */
.gv-head nav { display: flex; gap: 6px; flex: 1; overflow-x: auto; scrollbar-width: none; }
.gv-head nav::-webkit-scrollbar { display: none; }
.gv-head nav button { flex: 0 0 auto; }
.gv-head nav button { padding: 7px 13px; border-radius: 999px; cursor: pointer; font: inherit;
    font-size: 0.82rem; font-weight: 600; color: #cfc6b6; background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.10); }
.gv-head nav button.is-on { background: rgba(159,224,138,0.16); border-color: rgba(159,224,138,0.5); color: #cdf5bd; }
.gv-note { margin: 0 0 10px; padding: 9px 13px; border-radius: 10px; font-size: 0.85rem;
    background: rgba(159,224,138,0.12); border: 1px solid rgba(159,224,138,0.35); color: #d8f5cc; }

/* ── THE MAP ─────────────────────────────────────────────────────────────────────────────────── */
.gv-map { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.gv-node { position: relative; aspect-ratio: 3/2; border-radius: 14px; overflow: hidden; cursor: pointer;
    border: 1px solid rgba(255,255,255,0.12); background-size: cover; background-position: center;
    display: flex; flex-direction: column; justify-content: flex-end; padding: 10px; text-align: left;
    font: inherit; color: #fff; }
.gv-node::after { content: ""; position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(8,10,8,0.10), rgba(8,10,8,0.86)); }
.gv-node > * { position: relative; z-index: 1; }
.gv-node.is-locked { background: rgba(255,255,255,0.03); cursor: not-allowed; color: #6f6a60; }
.gv-node.is-clear { border-color: rgba(159,224,138,0.55); }
/* ⚠️ INSIDE THE PADDING, NOT ABOVE IT. This sat at top:-2px in a box with overflow:hidden, so every zone
   number was sliced in half — the node is the positioning context and anything negative is simply cut. */
.gv-node-n { position: absolute; top: 8px; left: 10px; font-size: 0.72rem; font-weight: 800;
    letter-spacing: .14em; color: #9fe08a; text-shadow: 0 1px 3px rgba(0,0,0,0.9); }
.gv-node-name { font-weight: 700; font-size: 0.92rem; text-shadow: 0 1px 3px rgba(0,0,0,0.8); }
.gv-node-bar { display: block; margin-top: 6px; height: 5px; border-radius: 999px;
    background: rgba(255,255,255,0.18); position: relative; }
.gv-node-bar i { display: block; height: 100%; border-radius: 999px; background: #9fe08a; }
.gv-node-bar em { position: absolute; right: 0; top: 7px; font-style: normal; font-size: 0.66rem; color: #cfc6b6; }
.gv-node-lock { font-size: 0.72rem; letter-spacing: .1em; text-transform: uppercase; }

/* ── THE SCENE ───────────────────────────────────────────────────────────────────────────────── */
.gv-scene { position: relative; width: 100%; aspect-ratio: 16/10; border-radius: 14px; overflow: hidden;
    background: #0a0d0a; border: 1px solid rgba(255,255,255,0.12); touch-action: manipulation;
    user-select: none; }
.gv-plate { position: absolute; inset: 0; background-size: cover; background-position: center bottom; }
.gv-layer { position: absolute; inset: 0; pointer-events: none; }

/* Every body is anchored at the scene's GROUND LINE and moved by transform. The loop writes translate3d
   onto these; nothing here animates on its own.

   ⚠️ bottom IS 13%, NOT 0. World y=0 is the ground the hero walks on, and on every one of these plates the
   painted ground sits about an eighth of the way up the frame — anchored at 0 the whole population stood
   below the forest floor with their legs cut off by the bezel. The number is a property of how the plates
   were drawn, which is why it lives next to them rather than in the simulation. */
.gv-foe, .gv-hero, .gv-pet { position: absolute; left: 0; bottom: 13%; transform-origin: 50% 100%;
    will-change: transform; }
.gv-foe { width: 8%; aspect-ratio: 1; background: none; border: 0; padding: 0; cursor: pointer;
    margin-left: -4%; transition: opacity 380ms ease, transform 380ms ease; }
.gv-foe img { width: 100%; height: 100%; object-fit: contain; display: block;
    filter: drop-shadow(0 3px 5px rgba(0,0,0,0.5)); }
.gv-foe i { display: block; width: 60%; height: 60%; margin: 20%; border-radius: 50%;
    background: rgba(255,255,255,0.2); }
.gv-foe.is-rare img { filter: drop-shadow(0 0 14px rgba(170,140,255,0.85)) drop-shadow(0 3px 5px rgba(0,0,0,0.5)); }
/* The shared death animation. Simple on purpose. */
.gv-foe.is-dead { opacity: 0; pointer-events: none; }
.gv-hero { width: 7%; aspect-ratio: 1; margin-left: -3.5%;
    background: radial-gradient(circle at 50% 40%, #ffe28a, #c8872e 62%, transparent 70%); }
.gv-pet { width: 4.5%; aspect-ratio: 1; margin-left: -2.25%;
    background: radial-gradient(circle at 50% 40%, #9fe08a, #3f7a35 62%, transparent 70%); }

.gv-float { position: absolute; left: 50%; bottom: 40%; font-weight: 800; font-size: 0.95rem;
    pointer-events: none; animation: gvFloat 900ms ease-out forwards; text-shadow: 0 2px 4px rgba(0,0,0,0.9); }
.gv-float.is-hit { color: #ffe9a8; }
.gv-float.is-crit { color: #ff9f4a; font-size: 1.3rem; }
.gv-float.is-took { color: #ff6b6b; }
.gv-float.is-heal { color: #7cffb2; }
.gv-float.is-loot { color: #cdf5bd; font-size: 0.8rem; }
@keyframes gvFloat { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-34px); } }

.gv-boss { position: absolute; top: 34px; left: 50%; transform: translateX(-50%); width: 70%;
    text-align: center; pointer-events: none; }
.gv-boss b { display: block; font-size: 0.8rem; letter-spacing: .1em; text-transform: uppercase;
    color: #e5d2ff; text-shadow: 0 2px 4px rgba(0,0,0,0.9); margin-bottom: 4px; }
.gv-boss span { display: block; height: 11px; border-radius: 999px; background: rgba(0,0,0,0.6);
    border: 1px solid rgba(197,160,255,0.55); overflow: hidden; }
.gv-boss i { display: block; height: 100%; background: linear-gradient(90deg, #a982ff, #e0c6ff);
    transition: width 220ms ease; }

/* Above the ground line rather than across it — the HUD was drawn straight over the row of enemies
   standing on the floor, which is the one row you need to be able to see and tap. */
.gv-hud { position: absolute; left: 10px; right: 10px; top: 10px; display: flex; align-items: center;
    gap: 10px; pointer-events: none; }
.gv-hp { flex: 0 0 38%; height: 10px; border-radius: 999px; background: rgba(0,0,0,0.6);
    border: 1px solid rgba(255,255,255,0.2); overflow: hidden; }
.gv-hp i { display: block; height: 100%; background: linear-gradient(90deg, #d8402f, #ff8a6b);
    transition: width 180ms ease; }
.gv-hud b { font-size: 0.78rem; color: #efe7d8; text-shadow: 0 2px 4px rgba(0,0,0,0.9); }
.gv-leave { margin-left: auto; pointer-events: auto; padding: 6px 14px; border-radius: 999px; cursor: pointer;
    font: inherit; font-size: 0.78rem; font-weight: 700; color: #efe7d8;
    background: rgba(0,0,0,0.55); border: 1px solid rgba(255,255,255,0.22); }

.gv-unlock { position: absolute; inset: 0; z-index: 30; display: grid; place-items: center;
    background: rgba(6,10,6,0.86); cursor: pointer; }
.gv-unlock > div { text-align: center; padding: 26px 32px; border-radius: 18px;
    background: linear-gradient(180deg, rgba(30,46,26,0.96), rgba(12,18,12,0.96));
    border: 1px solid rgba(159,224,138,0.5); box-shadow: 0 0 44px rgba(159,224,138,0.28);
    animation: gvPop 420ms cubic-bezier(.2,1.5,.4,1) both; }
.gv-unlock span { display: block; font-size: 0.68rem; letter-spacing: .16em; text-transform: uppercase; color: #9db18f; }
.gv-unlock b { display: block; font-size: 1.3rem; color: #cdf5bd; margin: 6px 0 14px; }
.gv-unlock button { padding: 8px 22px; border-radius: 999px; border: none; cursor: pointer; font: inherit;
    font-weight: 800; background: linear-gradient(180deg, #b9f0a4, #6fb95c); color: #16280f; }
@keyframes gvPop { from { opacity: 0; transform: scale(0.84) translateY(10px); } to { opacity: 1; transform: none; } }

/* ── BAG, BANK, TABLET ───────────────────────────────────────────────────────────────────────── */
.gv-bag { display: flex; flex-direction: column; gap: 16px; }
.gv-bag h4 { margin: 0 0 8px; font-size: 0.86rem; letter-spacing: .06em; text-transform: uppercase; color: #9fe08a; }
.gv-bag h4 i { font-style: normal; color: #8d8577; margin-left: 6px; }
.gv-slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 8px; }
.gv-slot { display: flex; flex-direction: column; gap: 2px; padding: 10px; border-radius: 10px; cursor: pointer;
    text-align: left; font: inherit; color: #efe7d8; background: rgba(255,255,255,0.045);
    border: 1px solid rgba(255,255,255,0.10); }
.gv-slot b { font-size: 0.84rem; }
.gv-slot span { font-size: 1.05rem; font-weight: 800; color: #9fe08a; }
.gv-slot em { font-style: normal; font-size: 0.68rem; color: #8d8577; }
.gv-tablet { padding: 14px; border-radius: 12px; background: rgba(255,255,255,0.035);
    border: 1px solid rgba(255,255,255,0.10); }
.gv-tablet ul { margin: 8px 0 0; padding-left: 18px; font-size: 0.82rem; color: #cfc6b6; }

/* ── THE WORKBENCH ───────────────────────────────────────────────────────────────────────────── */
.gv-bench { display: flex; flex-direction: column; gap: 10px; }
.gv-recipe { display: flex; align-items: center; gap: 14px; padding: 14px; border-radius: 12px;
    background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.10); }
.gv-recipe.is-ready { border-color: rgba(159,224,138,0.55); background: rgba(159,224,138,0.08); }
.gv-recipe > div { flex: 1; min-width: 0; }
.gv-recipe b { font-size: 0.95rem; }
.gv-recipe p { margin: 3px 0 6px; font-size: 0.8rem; color: #9d9486; }
.gv-recipe ul { margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 4px 12px;
    font-size: 0.78rem; color: #8d8577; }
.gv-recipe li.is-have { color: #9fe08a; }
.gv-recipe li span { opacity: 0.75; }
.gv-recipe button { padding: 9px 18px; border-radius: 999px; border: none; cursor: pointer; font: inherit;
    font-weight: 700; font-size: 0.82rem; background: rgba(255,255,255,0.09); color: #cfc6b6; }
.gv-recipe.is-ready button { background: linear-gradient(180deg, #b9f0a4, #6fb95c); color: #16280f; }
.gv-recipe button:disabled { opacity: 0.55; cursor: default; }

/* ── EMBLEMS ─────────────────────────────────────────────────────────────────────────────────── */
.gv-emblems { display: flex; flex-direction: column; gap: 14px; }
.gv-eslots { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
.gv-eslot { aspect-ratio: 1; border-radius: 12px; display: grid; place-items: center; text-align: center;
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12); font-size: 0.68rem;
    color: #8d8577; padding: 6px; }
.gv-eslot.is-sealed { border-style: dashed; opacity: 0.5; }
.gv-eslot button { background: none; border: 0; cursor: pointer; font: inherit; color: #efe7d8;
    display: flex; flex-direction: column; gap: 2px; align-items: center; }
.gv-eslot button b { font-size: 0.8rem; }
.gv-eslot button span { font-size: 0.66rem; }
.gv-eslot button em { font-style: normal; font-size: 0.6rem; color: #8d8577; }
.gv-elist { display: flex; flex-direction: column; gap: 8px; }
.gv-em { display: flex; align-items: center; gap: 12px; padding: 11px 13px; border-radius: 11px;
    background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.10); }
.gv-em > b { font-size: 0.9rem; letter-spacing: .04em; min-width: 62px; }
.gv-em > div { flex: 1; min-width: 0; }
.gv-em p { margin: 2px 0; font-size: 0.8rem; color: #cfc6b6; }
.gv-em p em { font-style: normal; color: #ffcf6a; }
.gv-em small { font-size: 0.7rem; color: #8d8577; }
.gv-em button { padding: 7px 15px; border-radius: 999px; border: none; cursor: pointer; font: inherit;
    font-size: 0.76rem; font-weight: 700; background: rgba(159,224,138,0.18); color: #cdf5bd; }
.gv-em button:disabled { opacity: 0.5; cursor: default; }
`;
