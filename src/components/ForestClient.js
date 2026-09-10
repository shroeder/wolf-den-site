"use client";

// ── THE FOREST ───────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "you tap the trees to cut them down and you see a chopping ax going WAP WAP WAP and you just tap as
// fast as you can to chop fast."
//
// Two screens. The GROVE is six patches in the dark and you pick one. The CHOP is one tree, one axe, and your
// thumb — every tap is a swing, and swings landing inside the rhythm window stack a multiplier that makes the
// axe hit visibly and audibly harder.
//
// ⚠️ THE SWING LOOP NEVER TOUCHES THE SERVER. Ten taps a second would be ten requests a second per player,
// which is the most expensive shape this codebase has (round trips ARE the bill — see CLAUDE.md). The browser
// runs the same pure rules from forest.js and posts ONCE, when the tree comes down, saying which patch and how
// many swings it took. The server re-derives whether that was possible; see fellTree.

import { useCallback, useEffect, useRef, useState } from "react";
import { GiWoodAxe, GiLogging, GiChoppedSkull } from "react-icons/gi";
import { playMusic, sfx, stopMusic, wake } from "@/lib/marketplace/cards-sound.js";
import {
    AXE_TRACKS, AXE_TRACK_IDS, STREAK_CAP, STREAK_STEP,
    axeForm, axeTotal, swing, trackCost, trackReadout, treeById,
} from "@/lib/marketplace/forest.js";

// ⚠️ WEBP, AND IT IS NOT A DETAIL. As PNGs this one screen was 8.3MB of art — a 2.9MB grove backdrop and eight
// half-megabyte trunks — which is most of a phone's patience spent before the first swing. Painted art with
// large soft gradients is close to the worst case for PNG and close to the best case for WebP: the same
// pictures at quality 82 are 0.77MB, a 91% cut, with no visible difference at the sizes they are drawn.
const TREE_ART = (id) => `/images/forest/trees/${id}.webp`;
const AXE_ART = (id) => `/images/forest/axes/${id}.webp`;
const GROVE = "/images/forest/grove.webp";
const STUMP = "/images/forest/stump.webp";

const RARITY = { common: "#b9b2a4", uncommon: "#7fc98a", rare: "#7fb0ff", epic: "#d98ae8", legendary: "#ffc861" };
const backIn = (ms) => {
    const m = Math.ceil(ms / 60000);
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

export default function ForestClient() {
    const [state, setState] = useState(null);
    const [openIdx, setOpenIdx] = useState(null);
    const [live, setLive] = useState(null);      // { hp, max, tree, swings, streak }
    const [chips, setChips] = useState([]);      // flying splinters + damage numbers
    const [shake, setShake] = useState(0);
    const [fell, setFell] = useState(null);      // the tree that just came down
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [shop, setShop] = useState(false);
    const armed = useRef(false);
    const last = useRef(0);
    const chipId = useRef(0);

    const load = useCallback(async () => {
        const r = await fetch("/api/marketplace/forest", { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        if (d && !d.error) setState(d);
    }, []);
    useEffect(() => { load(); }, [load]);
    useEffect(() => () => stopMusic(), []);

    const arm = useCallback(() => {
        if (armed.current) return;
        armed.current = true;
        wake();
        playMusic("forest");
    }, []);

    // ── THE TICK THAT ENDS A RHYTHM ──────────────────────────────────────────────────────────────────
    // The streak has to fall on its own when you stop, not merely on the next tap — otherwise pausing for
    // five seconds and tapping once still reads as "in rhythm" for that one swing, and the meter sits full
    // on screen the whole time you are doing nothing.
    useEffect(() => {
        if (!live || !state) return undefined;
        const t = setInterval(() => {
            if (last.current && Date.now() - last.current > state.window) {
                setLive((v) => (v && v.streak ? { ...v, streak: 0 } : v));
            }
        }, 120);
        return () => clearInterval(t);
    }, [live, state]);

    const openPatch = useCallback((p) => {
        if (p.felled) return;
        arm();
        sfx("tap");
        last.current = 0;
        setFell(null);
        setChips([]);
        setOpenIdx(p.i);
        setLive({ hp: p.hp, max: p.max, tree: p.tree, swings: 0, streak: 0 });
    }, [arm]);

    const chop = useCallback(() => {
        if (!live || !state || live.hp <= 0 || busy) return;
        const now = Date.now();
        const res = swing({ hp: live.hp, tree: live.tree, felled: false }, state.axe,
            { now, last: last.current, streak: live.streak });
        last.current = now;

        sfx(res.mult >= 1.4 ? "forestBite" : "forestChop");
        const id = chipId.current++;
        setChips((c) => [
            ...c.slice(-14),
            // AT THE CUT, NOT OVER THE CROWN. The numbers were scattering across the canopy, which is the
            // one part of the tree the axe is nowhere near — they belong where the blade goes in.
            { id, hit: res.hit, mult: res.mult, doubled: res.doubled, x: 38 + Math.random() * 24, y: 74 + Math.random() * 12 },
        ]);
        setTimeout(() => setChips((c) => c.filter((x) => x.id !== id)), 620);
        setShake(Math.min(6, 2 + res.streak * 0.22));
        setTimeout(() => setShake(0), 110);

        const next = { ...live, hp: res.patch.hp, swings: live.swings + 1, streak: res.streak };
        setLive(next);

        if (res.felled) {
            sfx("forestTimber");
            setBusy(true);
            (async () => {
                const r = await fetch("/api/marketplace/forest", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "fell", patch: openIdx, swings: next.swings, streak: next.streak }),
                }).catch(() => null);
                const d = r ? await r.json().catch(() => null) : null;
                setBusy(false);
                if (!d?.ok) { setErr(errorText(d?.error)); return; }
                setState(d.forest);
                const rare = ["rare", "epic", "legendary"].includes(treeById(d.tree).rarity);
                sfx(rare ? "forestRare" : "forestWood");
                setFell({ tree: d.tree, name: d.name, wood: d.wood, swings: next.swings, rare });
            })();
        }
    }, [live, state, busy, openIdx]);

    const buy = useCallback(async (track) => {
        setBusy(true); setErr("");
        const r = await fetch("/api/marketplace/forest", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "axe", track }),
        }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        setBusy(false);
        if (!d?.ok) { setErr(errorText(d?.error)); sfx("denied"); return; }
        setState(d.forest);
        sfx("forestAxe");
    }, []);

    if (!state) return <p className="fr-wait">Walking out to the tree line…</p>;

    const form = axeForm(state.total);
    const tree = live ? treeById(live.tree) : null;
    const pct = live ? Math.max(0, Math.round((live.hp / live.max) * 100)) : 0;
    const streakPct = live ? Math.min(100, Math.round((live.streak * STREAK_STEP) / (STREAK_CAP - 1) * 100)) : 0;

    return (
        <section className="fr" onPointerDown={arm}>
            <header className="fr-top">
                <GiLogging aria-hidden="true" />
                <b>The Forest</b>
                <span className="fr-wood">{state.wood.toLocaleString()}<i>wood</i></span>
            </header>

            {err ? <p className="fr-err" role="alert">{err}</p> : null}

            {/* ── THE GROVE ── six patches, and what is standing in each. */}
            <div className="fr-grove" style={{ backgroundImage: `url(${GROVE})` }}>
                <span className="fr-mist" aria-hidden="true" />
                <div className="fr-stand">
                    {state.stand.map((p) => {
                        const def = treeById(p.tree);
                        return (
                            <button key={p.i} type="button" className={`fr-patch${p.felled ? " is-bare" : ""}`}
                                disabled={p.felled} onClick={() => openPatch(p)}
                                aria-label={p.felled ? `Cut stump, back in ${backIn(p.backIn)}` : `${def.name}, ${def.rarity}`}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={p.felled ? STUMP : TREE_ART(p.tree)} alt="" draggable="false" />
                                <span className="fr-label" style={{ "--r": RARITY[def.rarity] || "#b9b2a4" }}>
                                    {p.felled ? <i>{backIn(p.backIn)}</i> : <b>{def.name}</b>}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <button type="button" className="fr-btn fr-wide" onClick={() => { arm(); sfx("open"); setShop(true); }}>
                <GiWoodAxe aria-hidden="true" /> {form.name} <em>·  tune the axe</em>
            </button>

            {/* ── THE CHOP ── one tree, one thumb. */}
            {live ? (
                <div className="fr-chop" role="dialog" aria-label={`Chopping a ${tree.name}`}>
                    <div className="fr-scene" style={{ backgroundImage: `url(${GROVE})`, transform: shake ? `translate3d(${(Math.random() - 0.5) * shake * 2}px, ${(Math.random() - 0.5) * shake}px, 0)` : undefined }}>
                        <span className="fr-mist" aria-hidden="true" />
                        <button type="button" className="fr-x" onClick={() => { sfx("close"); setLive(null); setOpenIdx(null); load(); }} aria-label="Leave it">✕</button>

                        {/* ⚠️ THE WHOLE SCENE IS THE BUTTON. On a phone the thing you are mashing must not be a
                            target you can miss — a 90px trunk asks for accuracy in a game whose entire ask is
                            speed. Everything under the header takes the tap. */}
                        <button type="button" className="fr-hit" onPointerDown={chop} aria-label="Swing">
                            {/* ⚠️ THE TREE AND THE STUMP ARE TWO ELEMENTS, AND THEY HAVE TO BE. Swapping one
                                element's src to the stump on the way down meant the STUMP played the falling
                                animation and faded to nothing — so a felled tree left an empty clearing with
                                an axe lying in it. What is supposed to remain is the thing that remains. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={TREE_ART(live.tree)} alt="" key={live.tree} draggable="false"
                                className={`fr-tree${fell ? " is-down" : ""}${shake ? " is-struck" : ""}`} />
                            {fell ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={STUMP} alt="" className="fr-stump" draggable="false" />
                            ) : null}
                            {/* The axe goes with the tree. A hatchet hanging in mid-air over a stump is a
                                swing waiting for a trunk that is not there any more. */}
                            {!fell ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={AXE_ART(form.id)} alt="" draggable="false"
                                    className={`fr-axe${shake ? " is-swing" : ""}${live.streak >= 8 ? " is-hot" : ""}`} />
                            ) : null}

                            <span className="fr-chips" aria-hidden="true">
                                {chips.map((c) => (
                                    <em key={c.id} className={`fr-chip${c.doubled ? " is-double" : ""}${c.mult >= 1.5 ? " is-hot" : ""}`}
                                        style={{ left: `${c.x}%`, top: `${c.y}%` }}>
                                        {c.doubled ? `${c.hit}!` : c.hit}
                                    </em>
                                ))}
                            </span>
                        </button>

                        <div className={`fr-hud${fell ? " is-gone" : ""}`}>
                            <span className="fr-name" style={{ "--r": RARITY[tree.rarity] || "#b9b2a4" }}>{tree.name}</span>
                            <span className="fr-hp"><i style={{ width: `${pct}%` }} /></span>
                            <span className="fr-streak">
                                <i style={{ width: `${streakPct}%` }} />
                                {/* ⚠️ CLAMPED THE SAME WAY THE ENGINE CLAMPS IT. This read the raw streak and printed ×2.04
                                    while swing() was paying ×2.00 — a meter promising more than the axe delivers is the
                                    shop-price bug in a different costume. */}
                                <em>{live.streak > 0
                                    ? `×${(1 + Math.min(STREAK_CAP - 1, live.streak * STREAK_STEP)).toFixed(2)}`
                                    : "swing faster"}</em>
                            </span>
                        </div>
                    </div>

                    {fell ? (
                        /* ⚠️ THE BANNER USED TO BE RARITY-BLIND. A Moonash — a tree that turns up roughly once in
                           a hundred regrowths and takes seven hundred bites — printed the same grey line as a
                           birch with a bigger number in it. The one moment this game exists to sell was the one
                           moment it said nothing about. */
                        <div className={`fr-took${fell.rare ? " is-rare" : ""}`} role="status"
                            style={{ "--r": RARITY[treeById(fell.tree).rarity] || "#b9b2a4" }}>
                            {fell.rare ? <span className="fr-rarity">{treeById(fell.tree).rarity} find</span> : null}
                            <GiChoppedSkull aria-hidden="true" />
                            <b>{fell.name} down</b>
                            <span>+{fell.wood} wood · {fell.swings} swings</span>
                            <button type="button" className="fr-btn fr-wide is-go"
                                onClick={() => { sfx("tap"); setLive(null); setOpenIdx(null); }}>Back to the trees</button>
                        </div>
                    ) : (
                        <p className="fr-tap">Tap anywhere — as fast as you can</p>
                    )}
                </div>
            ) : null}

            {/* ── THE AXE ── */}
            {shop ? (
                <div className="fr-shop-over" role="presentation" onClick={() => setShop(false)}>
                    <div className="fr-shop" role="dialog" aria-label="The axe" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="fr-x" onClick={() => setShop(false)} aria-label="Close">✕</button>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={AXE_ART(form.id)} alt="" className="fr-shop-axe" draggable="false" />
                        <p className="fr-shop-name">{form.name}</p>
                        <p className="fr-shop-sub">{state.wood.toLocaleString()} wood in the pile</p>
                        {AXE_TRACK_IDS.map((id) => {
                            const t = AXE_TRACKS[id];
                            const lvl = state.axe[id] || 0;
                            const cost = trackCost(id, lvl);
                            const read = trackReadout(id, lvl);
                            const short = cost != null && state.wood < cost;
                            return (
                                <div key={id} className={`fr-track${short ? " is-short" : ""}`}>
                                    <span className="fr-track-top">
                                        <b>{t.name}</b>
                                        <em>{lvl} / {t.max}</em>
                                    </span>
                                    <span className="fr-pips" aria-hidden="true">
                                        {Array.from({ length: t.max }, (_, k) => <i key={k} className={k < lvl ? "is-on" : ""} />)}
                                    </span>
                                    {/* The two numbers that make the price mean something. */}
                                    <span className="fr-track-num">
                                        <b>{read.now}</b>
                                        {read.next ? <><s aria-hidden="true">→</s><u>{read.next}</u></> : null}
                                        <i>{read.unit}</i>
                                    </span>
                                    <i className="fr-track-blurb">{t.blurb}</i>
                                    <button type="button" className="fr-btn is-go" disabled={busy || cost == null || short}
                                        onClick={() => buy(id)}>
                                        {cost == null ? "Maxed" : <>{t.verb} <em>{cost.toLocaleString()} wood</em></>}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : null}

            <style jsx>{`
                .fr { display: block; }
                .fr-wait { padding: 26px; text-align: center; color: #8a9384; }
                .fr-top { display: flex; align-items: center; gap: 8px; margin-bottom: 10px;
                    font-size: 17px; font-weight: 800; color: #e8f0e4; }
                .fr-top :global(svg) { width: 22px; height: 22px; color: #8fbf7a; }
                .fr-wood { margin-left: auto; display: inline-flex; align-items: baseline; gap: 4px;
                    font-size: 16px; font-weight: 800; color: #ffcf87; }
                .fr-wood i { font-style: normal; font-size: 11px; font-weight: 700;
                    letter-spacing: .08em; text-transform: uppercase; color: #8a9384; }
                .fr-err { margin: 0 0 10px; padding: 8px 10px; border-radius: 8px;
                    background: #3a1c20; color: #ffc9cf; font-size: 13px; }

                .fr-grove { position: relative; width: 100%; border-radius: 12px; overflow: hidden;
                    background: #0a1014 center / cover no-repeat; padding: 10px 8px 12px; }
                .fr-mist { position: absolute; inset: 0; pointer-events: none;
                    background: radial-gradient(120% 80% at 30% 0%, rgba(150,200,230,.12), transparent 60%),
                                linear-gradient(180deg, transparent 52%, rgba(4,8,10,.55)); }
                .fr-stand { position: relative; z-index: 1;
                    display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
                .fr-patch { display: flex; flex-direction: column; align-items: center; gap: 2px;
                    padding: 0; border: 0; background: none; cursor: pointer;
                    animation: frSway 7s ease-in-out infinite; }
                .fr-patch:nth-child(2n) { animation-delay: -2.3s; }
                .fr-patch:nth-child(3n) { animation-delay: -4.6s; }
                @keyframes frSway { 0%,100% { transform: rotate(-.6deg); } 50% { transform: rotate(.6deg); } }
                /* ⚠️ CROPPED AT THE TOP, ON PURPOSE. The trunks are drawn as redwoods that run out of the
                   top of their own picture, so object-fit contain would letterbox one into a thin sliver and undo
                   the entire point of them. Cover, anchored to the BOTTOM, keeps the roots on the floor
                   and lets the trunk leave the frame, which is what makes it read as enormous. */
                /* ⚠️ AND FADED AT THE EDGES, BECAUSE EACH TRUNK CARRIES ITS OWN BACKDROP. The trees are not
                   die-cut — a trunk with roots floating on nothing looks pasted on — so every picture brings a
                   slice of dark forest with it. Six of those butted together tiled into visible hard seams: at
                   desktop width you could count the cells by the places an orange trunk stopped mid-stripe.
                   Masking the outer eighth of each side, and the top of the crop, lets the shared grove.webp
                   behind the grid do the joining, so the stand reads as one wood rather than six photographs. */
                .fr-patch img { display: block; width: 100%; aspect-ratio: 3 / 4; object-fit: cover;
                    object-position: 50% 100%;
                    filter: drop-shadow(0 6px 10px rgba(0,0,0,.7));
                    -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 13%, #000 87%, transparent 100%),
                                        linear-gradient(180deg, transparent 0, #000 20%);
                    mask-image: linear-gradient(90deg, transparent 0, #000 13%, #000 87%, transparent 100%),
                                linear-gradient(180deg, transparent 0, #000 20%);
                    -webkit-mask-composite: source-in;
                    mask-composite: intersect; }
                /* The stump is die-cut and sits in the middle of its cell — masking it just eats the bark. */
                .fr-patch.is-bare img { -webkit-mask-image: none; mask-image: none; }
                /* ⚠️ EVERY PATCH ALTERNATES, BECAUSE THERE ARE SIX PATCHES AND EIGHT KINDS OF TREE. Two birches
                   next to each other were the same picture twice, down to the knot holes, and a stand with a
                   visible copy-paste in it stops being a wood. Mirroring every even cell means any two NEIGHBOURS
                   — and the two diagonals a six-cell grid can pair up — are never the same image, whatever grew
                   there. Mirrored rather than nudged because the light shafts in these run close to vertical, so
                   flipping one costs nothing the eye can catch, while a few pixels of crop shift would not have
                   been enough to break the twin. The brightness jitter is the second layer of the same trick. */
                .fr-patch:nth-child(even) img { transform: scaleX(-1); }
                .fr-patch:nth-child(3n) img { filter: drop-shadow(0 6px 10px rgba(0,0,0,.7)) brightness(.93) saturate(1.06); }
                .fr-patch:nth-child(4n) img { filter: drop-shadow(0 6px 10px rgba(0,0,0,.7)) brightness(1.06); }
                .fr-patch.is-bare { cursor: default; animation: none; }
                .fr-patch.is-bare img { opacity: .6; object-fit: contain; aspect-ratio: 3 / 4; }
                .fr-patch:not(.is-bare):hover img { filter: drop-shadow(0 6px 14px rgba(0,0,0,.8)) brightness(1.12); }
                .fr-label { font-size: 10.5px; font-weight: 800; color: var(--r);
                    text-shadow: 0 1px 3px #000, 0 0 8px rgba(0,0,0,.9); }
                .fr-label i { font-style: normal; color: #8a9384; font-weight: 700; }

                .fr-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px;
                    padding: 10px 14px; border-radius: 9px; cursor: pointer; font: inherit;
                    font-size: 13.5px; font-weight: 800;
                    border: 1px solid #3f4a3a; background: #1a211a; color: #dfe8da; }
                .fr-btn.is-go { border-color: #5f7a45; background: linear-gradient(180deg, #26331d, #182210); color: #d8f0be; }
                .fr-btn:disabled { opacity: .45; cursor: default; }
                .fr-btn em { font-style: normal; color: #ffcf87; }
                .fr-btn :global(svg) { width: 18px; height: 18px; }
                .fr-wide { width: 100%; margin-top: 10px; }

                /* ── THE CHOP ─────────────────────────────────────────────────────────────────────── */
                .fr-chop { position: fixed; inset: 0; z-index: 4400; display: flex; flex-direction: column;
                    background: #060a0c; animation: frIn .2s ease both; }
                @keyframes frIn { from { opacity: 0; } to { opacity: 1; } }
                .fr-scene { position: relative; flex: 1 1 auto; min-height: 0;
                    background: #0a1014 center / cover no-repeat; overflow: hidden; }
                .fr-x { position: absolute; top: 10px; right: 12px; z-index: 6; width: 38px; height: 38px;
                    border: 0; border-radius: 50%; background: rgba(6,10,12,.72);
                    font-size: 17px; color: #c3cebb; cursor: pointer; }

                .fr-hit { position: absolute; inset: 0; z-index: 2; width: 100%; height: 100%;
                    border: 0; background: none; padding: 0; cursor: pointer;
                    -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
                /* The tree you are actually swinging at: rooted at the bottom of the scene and running
                   straight out of the top of it. Deliberately wider than a phone — .fr-scene clips it, and
                   a trunk that fills the whole width is the difference between a tree and a redwood. */
                .fr-tree { position: absolute; left: 50%; bottom: 0; height: 112%; width: auto;
                    transform: translateX(-50%);
                    filter: drop-shadow(0 12px 18px rgba(0,0,0,.8)); }
                .fr-tree.is-struck { animation: frStruck .1s ease; }
                @keyframes frStruck {
                    0%,100% { transform: translateX(-50%); }
                    50% { transform: translateX(-50%) translateX(3px) skewX(-1.2deg); }
                }
                .fr-tree.is-down { animation: frTimber .9s cubic-bezier(.5,0,.9,.6) both; }
                /* A redwood does not tip over inside a phone screen — at this size a rotation is just the
                   picture leaving sideways. It shudders, drops, and goes. */
                @keyframes frTimber {
                    0% { transform: translateX(-50%) translateY(0) rotate(0); opacity: 1; }
                    18% { transform: translateX(-50%) translateY(-6px) rotate(-1.5deg); opacity: 1; }
                    100% { transform: translateX(-50%) translateY(64px) rotate(-7deg); opacity: 0; }
                }

                /* The axe rides in from the right on every swing. It is drawn upright, so the swing is a
                   rotation about its own head — see the note on orientation in gen-forest.mjs. */
                /* ⚠️ IT HAS TO REACH THE TRUNK. At right:6% the axe sat off in the undergrowth swinging at
                   nothing while the tree shook on its own — the two halves of one action, happening in
                   different places. Brought in over the cut, and the swing arcs into it. */
                .fr-axe { position: absolute; left: 54%; bottom: 6%; width: 30%; max-width: 165px;
                    transform-origin: 50% 15%; transform: rotate(46deg);
                    filter: drop-shadow(0 6px 12px rgba(0,0,0,.75)); pointer-events: none; }
                .fr-axe.is-swing { animation: frSwing .11s ease-out; }
                @keyframes frSwing {
                    0% { transform: rotate(46deg) translate(0, 0); }
                    55% { transform: rotate(-26deg) translate(-26%, 4%); }
                    100% { transform: rotate(46deg) translate(0, 0); }
                }
                .fr-axe.is-hot { filter: drop-shadow(0 6px 12px rgba(0,0,0,.75)) drop-shadow(0 0 14px rgba(255,170,60,.85)); }

                .fr-chips { position: absolute; inset: 0; pointer-events: none; }
                .fr-chip { position: absolute; font-style: normal; font-size: 19px; font-weight: 800;
                    color: #e8f0e4; text-shadow: 0 2px 6px #000;
                    animation: frChip .6s ease-out both; }
                .fr-chip.is-hot { color: #ffcf87; font-size: 22px; }
                .fr-chip.is-double { color: #ff9f5c; font-size: 26px; }
                @keyframes frChip {
                    0% { opacity: 0; transform: translate(0,0) scale(.7); }
                    18% { opacity: 1; transform: translate(6px,-6px) scale(1.12); }
                    100% { opacity: 0; transform: translate(26px,-46px) scale(.9); }
                }

                .fr-hud.is-gone { opacity: 0; transition: opacity .35s ease; }
                /* What is left standing. Comes up out of the ground as the trunk goes over. */
                .fr-stump { position: absolute; left: 50%; bottom: 0; width: 56%; max-width: 300px;
                    transform: translateX(-50%); z-index: 1;
                    filter: drop-shadow(0 8px 14px rgba(0,0,0,.8));
                    animation: frStump .5s ease .35s both; }
                @keyframes frStump {
                    from { opacity: 0; transform: translateX(-50%) translateY(14px) scale(.94); }
                    to { opacity: 1; transform: translateX(-50%); }
                }
                .fr-hud { position: absolute; left: 0; right: 0; top: 0; z-index: 5;
                    display: flex; flex-direction: column; gap: 5px; padding: 12px 58px 12px 14px;
                    background: linear-gradient(180deg, rgba(4,8,10,.85), transparent); pointer-events: none; }
                .fr-name { font-size: 15px; font-weight: 800; color: var(--r); text-shadow: 0 1px 4px #000; }
                .fr-hp { display: block; height: 9px; border-radius: 999px; overflow: hidden;
                    background: rgba(6,10,12,.75); box-shadow: inset 0 0 0 1px rgba(180,200,170,.2); }
                .fr-hp i { display: block; height: 100%; border-radius: 999px;
                    background: linear-gradient(90deg, #6f9440, #b6d06a); transition: width 70ms linear; }
                .fr-streak { position: relative; display: block; height: 16px; border-radius: 999px;
                    background: rgba(6,10,12,.7); box-shadow: inset 0 0 0 1px rgba(255,180,90,.18); }
                .fr-streak i { display: block; height: 100%; border-radius: 999px;
                    background: linear-gradient(90deg, #c8873f, #ffcf87); transition: width 90ms linear; }
                .fr-streak em { position: absolute; inset: 0; display: grid; place-items: center;
                    font-style: normal; font-size: 11px; font-weight: 800; letter-spacing: .06em;
                    color: #1a140c; text-shadow: 0 1px 0 rgba(255,255,255,.25); }

                .fr-tap { flex: 0 0 auto; margin: 0; padding: 13px; text-align: center;
                    font-size: 13px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
                    color: #8a9384; background: #0a0f11; }
                .fr-took { flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: 4px;
                    padding: 16px 16px 20px; background: #0a0f11; animation: frTook .3s ease both; }
                @keyframes frTook { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
                .fr-took :global(svg) { width: 26px; height: 26px; color: #b6d06a; }
                .fr-took b { font-size: 19px; font-weight: 800; color: #e8f0e4; }
                .fr-took.is-rare :global(svg) { color: var(--r); }
                .fr-took.is-rare b { color: var(--r); text-shadow: 0 0 18px color-mix(in srgb, var(--r) 55%, transparent); }
                .fr-rarity { display: block; margin-bottom: 2px !important; padding: 2px 10px; border-radius: 999px;
                    font-size: 10.5px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase;
                    color: var(--r) !important; border: 1px solid color-mix(in srgb, var(--r) 45%, transparent);
                    background: color-mix(in srgb, var(--r) 12%, transparent);
                    animation: frRare 2.4s ease-in-out infinite; }
                @keyframes frRare {
                    0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--r) 40%, transparent); }
                    50% { box-shadow: 0 0 16px 3px color-mix(in srgb, var(--r) 26%, transparent); }
                }
                .fr-took span { font-size: 13px; color: #ffcf87; margin-bottom: 8px; }

                /* ── THE AXE ──────────────────────────────────────────────────────────────────────── */
                .fr-shop-over { position: fixed; inset: 0; z-index: 4500; display: flex;
                    align-items: flex-end; justify-content: center; background: rgba(4,7,8,.76); }
                .fr-shop { position: relative; width: min(520px, 100%); max-height: 92vh; overflow-y: auto;
                    padding: 18px 16px 22px; border-radius: 16px 16px 0 0;
                    border-top: 1px solid #34402f; background: #0e1310; }
                .fr-shop-axe { display: block; width: 84px; margin: 0 auto 6px; }
                .fr-shop-name { margin: 0; text-align: center; font-size: 19px; font-weight: 800; color: #e8f0e4; }
                .fr-shop-sub { margin: 2px 0 14px; text-align: center; font-size: 12.5px; color: #8a9384; }
                .fr-track { padding: 11px 12px; margin-bottom: 8px; border-radius: 11px;
                    border: 1px solid #2c352a; background: #141a14; }
                .fr-track-top { display: flex; align-items: baseline; gap: 8px; }
                .fr-track-top b { font-size: 15px; font-weight: 800; color: #e8f0e4; }
                .fr-track-top em { margin-left: auto; font-style: normal; font-size: 12px; color: #8a9384; }
                .fr-pips { display: flex; gap: 3px; margin: 6px 0 5px; }
                .fr-pips i { flex: 1 1 0; height: 5px; border-radius: 999px; background: #2c352a; }
                .fr-pips i.is-on { background: linear-gradient(90deg, #8fbf7a, #d8f0be); }
                .fr-track-num { display: flex; align-items: baseline; gap: 6px; margin: 7px 0 5px; }
                .fr-track-num b { font-size: 17px; font-weight: 800; color: #cfd8c8; font-variant-numeric: tabular-nums; }
                .fr-track-num s { text-decoration: none; color: #6f7a68; font-size: 13px; }
                .fr-track-num u { text-decoration: none; font-size: 17px; font-weight: 800; color: #9ede7a;
                    font-variant-numeric: tabular-nums; }
                .fr-track-num i { margin-left: 4px; font-style: normal; font-size: 11.5px; color: #7d876f; }
                .fr-track.is-short .fr-track-num u { color: #6f7a68; }
                .fr-track-blurb { display: block; margin-bottom: 9px; font-style: normal;
                    font-size: 12px; line-height: 1.4; color: #8a9384; }
                .fr-track .fr-btn { width: 100%; }

                @media (min-width: 700px) {
                    /* ⚠️ THIS WAS SIX ACROSS AND IT UNDID THE ART. Luke asked for redwoods you only see the
                       bottom half of; six cells across a desktop window makes each one short and wide, which is
                       the one shape a redwood is not. Three columns in a capped-width stand keeps every trunk
                       taller than it is wide at any window size, and the second row fills the dead black band
                       that used to sit under the grove. */
                    .fr-stand { grid-template-columns: repeat(3, 1fr); gap: 6px; }
                    .fr-grove { max-width: 920px; margin: 0 auto; }
                    .fr-patch img { max-height: 150px; }
                    .fr-shop { align-self: center; border-radius: 16px; border: 1px solid #34402f; }
                    .fr-shop-over { align-items: center; }
                }
            `}</style>
        </section>
    );
}

function errorText(code) {
    switch (code) {
        case "nothing_there": return "That patch is bare — something will grow back.";
        case "too_fast": return "That did not add up. Nothing lost — try that tree again.";
        case "not_enough_wood": return "Not enough wood for that yet.";
        case "maxed": return "That is as far as it sharpens.";
        default: return "That did not go through.";
    }
}
