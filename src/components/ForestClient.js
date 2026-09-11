"use client";

// ── THE FOREST ───────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "it should feel really immersive like it's actually our player walking around in a forest and you come
// across these different trees and then you tap them to chop them down without having to go into that chop-down
// modal ... I want my phone to shake and I want it to be a bam bam bam and I hit it and I want the logs to come
// flying out and branches flying around."
//
// So there is ONE place, not two. No grid of tree cards, no modal on top of it. The stand is a strip of forest
// you walk along; the tree in front of you is the tree you hit; the tap that hits it is the first tap, with
// nothing to open first. Everything that used to be a screen transition is now a camera move.
//
// ⚠️ THE OLD SHAPE WAS A CONTACT SHEET AND A DIALOG. Six trunks in a 3x2 grid is a PICKER — it reads as
// choosing a level, and it showed six trees at once at a size that made none of them big. Tapping one then
// opened a full-screen dialog with its own close button, which is the screen announcing "you have gone
// somewhere" about a thing that should feel like taking one step and raising your arms.
//
// ⚠️ THE SWING LOOP STILL NEVER TOUCHES THE SERVER. Ten taps a second would be ten requests a second per
// player, which is the most expensive shape this codebase has (round trips ARE the bill — see CLAUDE.md). The
// browser runs the same pure rules from forest.js and posts ONCE, when a tree comes down, saying which patch
// and how many swings it took. The server re-derives whether that was possible; see fellTree.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GiWoodAxe, GiLogging } from "react-icons/gi";
import { playMusic, sfx, stopMusic, wake } from "@/lib/marketplace/cards-sound.js";
import {
    AXE_TRACKS, AXE_TRACK_IDS, STREAK_CAP, STREAK_STEP,
    axeForm, swing, trackCost, trackReadout, treeById,
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

// ── HOW LONG THE TRUNK TAKES TO GO OVER ──────────────────────────────────────────────────────────────────────
// The fall is a real beat with a real landing and everything else hangs off it. FALL_MS is the topple; IMPACT_MS
// is the frame the trunk reaches the floor, which is where the crash, the hardest shake in the feature and the
// debris burst all fire together. They have to be ONE moment — a shake that lands before the wood does reads as
// a bug, and a burst that lands after it reads as lag.
const FALL_MS = 820;
const IMPACT_MS = 660;
const FALL_PCT = Math.round((IMPACT_MS / FALL_MS) * 100);

const errorText = (e) => ({
    too_fast: "That tree did not come down that fast.",
    nothing_there: "There is nothing standing there.",
    not_enough_wood: "Not enough wood for that yet.",
    maxed: "That is as far as it sharpens.",
    no_forest: "The forest has not grown for you yet.",
}[e] || "That did not go through.");

export default function ForestClient() {
    const [state, setState] = useState(null);
    const [at, setAt] = useState(0);               // which patch the player is standing in front of
    const [hpBy, setHpBy] = useState({});          // ⚠️ partial chopping, kept client-side — see below
    const [streak, setStreak] = useState(0);
    const [swings, setSwings] = useState(0);
    const [fx, setFx] = useState([]);              // chips, logs, branches, dust, damage numbers
    const [shake, setShake] = useState(0);
    const [falling, setFalling] = useState(null);  // { i, tree } while the trunk is going over
    const [gain, setGain] = useState(null);        // the "+N wood" that floats off a felled tree
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [shop, setShop] = useState(false);
    const armed = useRef(false);
    const last = useRef(0);
    const fxId = useRef(0);
    const timers = useRef([]);

    // Every setTimeout this component starts is parked here and cleared on unmount. One fell schedules four of
    // them and a member can walk off the page mid-fall; a setState after that is a React warning, and for the
    // debris it is a pile of timers nobody is waiting for.
    const later = useCallback((fn, ms) => {
        const t = setTimeout(fn, ms);
        timers.current.push(t);
        return t;
    }, []);
    useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current = []; stopMusic(); }, []);

    const load = useCallback(async () => {
        const r = await fetch("/api/marketplace/forest", { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        if (d && !d.error) setState(d);
    }, []);
    useEffect(() => { load(); }, [load]);

    const arm = useCallback(() => {
        if (armed.current) return;
        armed.current = true;
        wake();
        playMusic("forest");
    }, []);

    // ── THE TICK THAT ENDS A RHYTHM ──────────────────────────────────────────────────────────────────
    // The streak has to fall on its own when you stop, not merely on the next tap — otherwise pausing for five
    // seconds and tapping once still reads as "in rhythm" for that one swing, and the meter sits full on screen
    // the whole time you are doing nothing.
    useEffect(() => {
        if (!state) return undefined;
        const t = setInterval(() => {
            if (last.current && Date.now() - last.current > state.window) setStreak((v) => (v ? 0 : v));
        }, 120);
        return () => clearInterval(t);
    }, [state]);

    const stand = state?.stand || [];
    const here = stand[at] || null;

    // ⚠️ PARTIAL CHOPPING LIVES IN THE BROWSER, DELIBERATELY. The server stores a patch as standing or felled
    // and nothing in between — writing each swing back is the request-per-tap shape this whole feature exists
    // to avoid. But now that walking away is one tap rather than closing a dialog, losing half a Heartwood
    // because you stepped sideways to look at something would be brutal. So the half-cut trunk is remembered
    // here for as long as the page is open, and the server still only ever hears "it came down in N swings".
    const hp = here ? (hpBy[at] ?? here.hp) : 0;
    const maxHp = here ? here.max : 1;

    const burst = useCallback((kinds) => {
        const made = kinds.map((k) => ({ ...k, id: fxId.current++ }));
        setFx((f) => [...f.slice(-64), ...made]);
        const ids = new Set(made.map((m) => m.id));
        later(() => setFx((f) => f.filter((x) => !ids.has(x.id))), 1700);
    }, [later]);

    // ── ONE SWING ────────────────────────────────────────────────────────────────────────────────────
    const chop = useCallback(() => {
        if (!state || !here || here.felled || hp <= 0 || busy || falling) return;
        arm();
        const now = Date.now();
        const res = swing({ hp, tree: here.tree, felled: false }, state.axe, { now, last: last.current, streak });
        last.current = now;
        setStreak(res.streak);
        setSwings((n) => n + 1);
        setHpBy((m) => ({ ...m, [at]: res.patch.hp }));

        sfx(res.mult >= 1.4 ? "forestBite" : "forestChop");
        // ⚠️ THE SHAKE GROWS WITH THE RHYTHM, WHICH IS THE WHOLE REASON TO KEEP ONE. A fixed rumble on every tap
        // is wallpaper within ten swings; one that climbs with the streak means the screen is reporting the
        // multiplier without printing a number, and the hardest hits genuinely feel like the hardest hits.
        setShake(Math.min(9, 3 + res.streak * 0.3 + (res.doubled ? 3 : 0)));
        later(() => setShake(0), 110);

        // Chips off the cut, plus the number. Few per swing on purpose: at ten taps a second, five particles a
        // tap is fifty elements a second, and a phone dropping frames stops feeling powerful.
        const n = res.doubled ? 5 : 3;
        burst([
            ...Array.from({ length: n }, () => ({
                kind: "chip",
                dx: (Math.random() < 0.5 ? -1 : 1) * (38 + Math.random() * 90),
                dy: 40 + Math.random() * 70, lift: 60 + Math.random() * 60,
                rot: (Math.random() - 0.5) * 720, life: 700 + Math.random() * 260,
                sz: 5 + Math.random() * 6,
            })),
            { kind: "num", text: res.doubled ? `${res.hit}!` : `${res.hit}`, hot: res.mult >= 1.5, dbl: res.doubled,
                dx: (Math.random() - 0.5) * 60, dy: -70, life: 620 },
        ]);

        if (!res.felled) return;

        // ── IT GOES OVER ─────────────────────────────────────────────────────────────────────────────
        sfx("forestTimber");
        setFalling({ i: at, tree: here.tree });
        const fellSwings = swings + 1;

        // The impact: the crash, the hardest shake in the feature, and the trunk bursting into logs, branches
        // and splinters that fly out on an arc and land.
        later(() => {
            sfx("forestCrash");
            setShake(18);
            later(() => setShake(0), 340);
            burst([
                ...Array.from({ length: 7 }, (_, k) => ({
                    kind: "log",
                    dx: (k % 2 ? 1 : -1) * (70 + Math.random() * 180),
                    dy: 30 + Math.random() * 90, lift: 110 + Math.random() * 130,
                    rot: (Math.random() - 0.5) * 900, life: 1150 + Math.random() * 300,
                    sz: 15 + Math.random() * 16,
                })),
                ...Array.from({ length: 8 }, () => ({
                    kind: "branch",
                    dx: (Math.random() < 0.5 ? -1 : 1) * (90 + Math.random() * 220),
                    dy: 10 + Math.random() * 110, lift: 140 + Math.random() * 150,
                    rot: (Math.random() - 0.5) * 1100, life: 1050 + Math.random() * 350,
                    sz: 20 + Math.random() * 22,
                })),
                ...Array.from({ length: 16 }, () => ({
                    kind: "chip",
                    dx: (Math.random() < 0.5 ? -1 : 1) * (60 + Math.random() * 260),
                    dy: 20 + Math.random() * 130, lift: 120 + Math.random() * 170,
                    rot: (Math.random() - 0.5) * 900, life: 900 + Math.random() * 420,
                    sz: 4 + Math.random() * 8,
                })),
                { kind: "dust", life: 900 },
            ]);
        }, IMPACT_MS);

        // The server hears about it straight away rather than after the animation — the fall is a picture of
        // something that has already happened, and a member who backgrounds the tab mid-topple must still be
        // paid. The reply only drives the wood counter and the floating number.
        setBusy(true);
        (async () => {
            const r = await fetch("/api/marketplace/forest", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "fell", patch: at, swings: fellSwings, streak: res.streak }),
            }).catch(() => null);
            const d = r ? await r.json().catch(() => null) : null;
            setBusy(false);
            if (!d?.ok) { setErr(errorText(d?.error)); setFalling(null); return; }
            const def = treeById(d.tree);
            const rare = ["rare", "epic", "legendary"].includes(def.rarity);
            later(() => {
                sfx(rare ? "forestRare" : "forestWood");
                setState(d.forest);
                setHpBy((m) => { const c = { ...m }; delete c[at]; return c; });
                setSwings(0);
                setStreak(0);
                setFalling(null);
                setGain({ i: at, wood: d.wood, name: d.name, rare, rarity: def.rarity, swings: fellSwings });
                later(() => setGain(null), 2600);
            }, IMPACT_MS + 140);
        })();
    }, [state, here, hp, busy, falling, streak, swings, at, arm, burst, later]);

    // ── WALKING ──────────────────────────────────────────────────────────────────────────────────────
    const walk = useCallback((dir) => {
        setAt((i) => {
            const next = Math.max(0, Math.min(stand.length - 1, i + dir));
            if (next !== i) { arm(); sfx("forestStep"); setStreak(0); setSwings(0); last.current = 0; }
            return next;
        });
    }, [stand.length, arm]);

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

    const form = useMemo(() => axeForm(state?.total || 0), [state?.total]);
    if (!state) return <p className="fr-wait">Walking out to the tree line...</p>;

    const pct = here && !here.felled ? Math.max(0, Math.round((hp / maxHp) * 100)) : 0;
    const streakPct = Math.min(100, Math.round((streak * STREAK_STEP) / (STREAK_CAP - 1) * 100));
    const mult = 1 + Math.min(STREAK_CAP - 1, streak * STREAK_STEP);

    return (
        <section className="fr" onPointerDown={arm}>
            <header className="fr-top">
                <GiLogging aria-hidden="true" />
                <b>The Forest</b>
                <span className="fr-wood">{state.wood.toLocaleString()}<i>wood</i></span>
            </header>

            {err ? <p className="fr-err" role="alert">{err}</p> : null}

            {/* ── THE WOOD ── one strip of forest, and you are standing in it. */}
            <div className="fr-world">
                {/* Parallax. Two copies of the same backdrop moving at different rates is what turns a sideways
                    slide into walking — the far trees lag, the near ones sweep past. */}
                <span className="fr-far" aria-hidden="true"
                    style={{ backgroundImage: `url(${GROVE})`, transform: `translate3d(${at * -6}%, 0, 0)` }} />
                <span className="fr-near" aria-hidden="true"
                    style={{ backgroundImage: `url(${GROVE})`, transform: `translate3d(${at * -17}%, 0, 0)` }} />
                <span className="fr-shafts" aria-hidden="true" />

                {/* ⚠️ THE SHAKE IS ON THE CAMERA, NOT THE TREE. Shaking the trunk alone reads as the picture
                    wobbling; shaking everything the player can see — trunk, floor, backdrop, debris — reads as
                    the impact being big enough to move where they are standing. */}
                <div className="fr-cam" style={{
                    "--camx": `${-at * 100}%`,
                    transform: shake
                        ? `translate3d(calc(var(--camx) + ${(Math.random() - 0.5) * shake * 2}px), ${(Math.random() - 0.5) * shake}px, 0) rotate(${(Math.random() - 0.5) * shake * 0.1}deg)`
                        : undefined,
                }}>
                    {stand.map((p) => {
                        const d = treeById(p.tree);
                        const isHere = p.i === at;
                        const down = falling?.i === p.i;
                        const won = gain?.i === p.i;
                        return (
                            <div key={p.i} className={`fr-slot${isHere ? " is-here" : ""}`} style={{ left: `${p.i * 100}%` }}>
                                {/* THE TREE IS THE BUTTON AND THE BUTTON IS THE WHOLE COLUMN. On a phone the
                                    thing being mashed must not be a target you can miss — a trunk-shaped hit box
                                    asks for accuracy in a game whose entire ask is speed. */}
                                <button type="button" className="fr-hit"
                                    onPointerDown={isHere ? chop : undefined}
                                    onClick={isHere ? undefined : () => { arm(); sfx("forestStep"); setAt(p.i); }}
                                    disabled={isHere && p.felled}
                                    aria-label={p.felled ? `Cut stump, back in ${backIn(p.backIn)}` : `${d.name} — swing`}>
                                    {/* The stump is always there and the trunk stands in front of it until it
                                        does not. Two elements, because swapping one element's src made the STUMP
                                        play the falling animation and fade out with it. */}
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={STUMP} alt="" className="fr-stump" draggable="false" />
                                    {!p.felled || down ? (
                                        /* eslint-disable-next-line @next/next/no-img-element */
                                        <img src={TREE_ART(down ? falling.tree : p.tree)} alt=""
                                            key={down ? `f${p.tree}` : p.tree} draggable="false"
                                            className={`fr-trunk${down ? " is-down" : ""}${isHere && shake && !down ? " is-struck" : ""}`} />
                                    ) : null}
                                    {isHere && !p.felled && !down ? (
                                        /* eslint-disable-next-line @next/next/no-img-element */
                                        <img src={AXE_ART(form.id)} alt="" draggable="false"
                                            className={`fr-axe${shake ? " is-swing" : ""}${streak >= 8 ? " is-hot" : ""}`} />
                                    ) : null}

                                    <span className="fr-fx" aria-hidden="true">
                                        {isHere ? fx.map((f) => (
                                            <i key={f.id} className={`fr-p is-${f.kind}${f.hot ? " is-hot" : ""}${f.dbl ? " is-dbl" : ""}`}
                                                style={{
                                                    "--dx": `${f.dx || 0}px`, "--dy": `${f.dy || 0}px`,
                                                    "--lift": `${f.lift || 0}px`, "--rot": `${f.rot || 0}deg`,
                                                    "--sz": `${f.sz || 8}px`,
                                                    animationDuration: `${f.life || 800}ms`,
                                                }}>{f.kind === "num" ? f.text : null}</i>
                                        )) : null}
                                    </span>
                                </button>

                                {/* What is standing here, floating over it. Never a dialog. */}
                                {p.felled && !down ? (
                                    <span className="fr-regrow">{backIn(p.backIn)}</span>
                                ) : (
                                    <span className={`fr-plate${isHere ? " is-here" : ""}`} style={{ "--r": RARITY[d.rarity] || "#b9b2a4" }}>
                                        <b>{d.name}</b>
                                        {isHere && !down ? <i className="fr-hp"><u style={{ width: `${pct}%` }} /></i> : null}
                                    </span>
                                )}

                                {won ? (
                                    <span className={`fr-gain${gain.rare ? " is-rare" : ""}`} style={{ "--r": RARITY[gain.rarity] || "#b9b2a4" }}>
                                        {gain.rare ? <em>{gain.rarity} find</em> : null}
                                        <b>+{gain.wood} wood</b>
                                        <i>{gain.name} · {gain.swings} swings</i>
                                    </span>
                                ) : null}
                            </div>
                        );
                    })}
                </div>

                {/* ── THE WALK ── two steps, and the world slides. */}
                <button type="button" className="fr-walk is-l" onClick={() => walk(-1)} disabled={at === 0}
                    aria-label="Walk back">&lsaquo;</button>
                <button type="button" className="fr-walk is-r" onClick={() => walk(1)} disabled={at >= stand.length - 1}
                    aria-label="Walk on">&rsaquo;</button>

                {/* The rhythm meter rides at the bottom of the world, clear of the trunk. */}
                <span className={`fr-streak${streak > 0 ? "" : " is-cold"}`} aria-hidden="true">
                    <i style={{ width: `${streakPct}%` }} />
                    <em>{streak > 0 ? `×${mult.toFixed(2)}` : "tap the tree — as fast as you can"}</em>
                </span>

                <span className="fr-dots" aria-hidden="true">
                    {stand.map((p) => <i key={p.i} className={`${p.i === at ? "is-on" : ""}${p.felled ? " is-bare" : ""}`} />)}
                </span>
            </div>

            <button type="button" className="fr-btn fr-wide" onClick={() => { arm(); sfx("open"); setShop(true); }}>
                <GiWoodAxe aria-hidden="true" /> {form.name} <em>· tune the axe</em>
            </button>

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
                .fr-top { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
                .fr-top :global(svg) { width: 22px; height: 22px; color: #8fbf5f; }
                .fr-top b { font-size: 17px; font-weight: 800; color: #e8f0e4; }
                .fr-wood { margin-left: auto; font-size: 17px; font-weight: 800; color: #ffcf87; }
                .fr-wood i { margin-left: 5px; font-style: normal; font-size: 10.5px; letter-spacing: .1em;
                    text-transform: uppercase; color: #8a9384; }
                .fr-err { margin: 0 0 8px; padding: 8px 11px; border-radius: 9px; font-size: 13px;
                    color: #ffb9a8; background: rgba(120,40,30,.28); border: 1px solid rgba(220,110,90,.3); }

                /* ── THE WORLD ─────────────────────────────────────────────────────────────────────
                   A window onto a strip of forest six screens wide. Tall on purpose: a redwood you can see the
                   top of is not a redwood, and the whole art direction is trunks running out of frame. */
                .fr-world { position: relative; width: 100%; height: min(66vh, 560px); overflow: hidden;
                    border-radius: 14px; background: #070d10; touch-action: manipulation;
                    box-shadow: inset 0 0 90px rgba(0,0,0,.85); }
                .fr-far, .fr-near { position: absolute; inset: -4% -30% -4% -30%; background-size: cover;
                    background-position: center bottom; will-change: transform;
                    transition: transform 620ms cubic-bezier(.22,.61,.36,1); }
                .fr-far { filter: brightness(.4) blur(3px) saturate(.7); }
                .fr-near { filter: brightness(.62) blur(1px); opacity: .75;
                    -webkit-mask-image: linear-gradient(180deg, #000 0, #000 62%, transparent 96%);
                    mask-image: linear-gradient(180deg, #000 0, #000 62%, transparent 96%); }
                /* Light coming down through a canopy you never see. Slow, so it reads as air rather than an
                   animation — and it is the one thing on screen that moves while the player does nothing. */
                .fr-shafts { position: absolute; inset: 0; pointer-events: none;
                    background: linear-gradient(102deg, transparent 12%, rgba(168,214,236,.10) 17%, transparent 23%),
                                linear-gradient(96deg, transparent 42%, rgba(168,214,236,.07) 47%, transparent 53%),
                                linear-gradient(108deg, transparent 68%, rgba(168,214,236,.09) 74%, transparent 80%),
                                radial-gradient(120% 70% at 50% 0%, rgba(150,200,230,.12), transparent 62%),
                                linear-gradient(180deg, transparent 46%, rgba(3,7,9,.72));
                    animation: frShafts 13s ease-in-out infinite; }
                @keyframes frShafts { 0%,100% { opacity: .8; } 50% { opacity: 1; } }

                .fr-cam { position: absolute; inset: 0; width: 100%; height: 100%;
                    transform: translate3d(var(--camx), 0, 0); will-change: transform;
                    transition: transform 620ms cubic-bezier(.22,.61,.36,1); }
                .fr-slot { position: absolute; top: 0; bottom: 0; width: 100%; }
                .fr-hit { position: absolute; inset: 0; width: 100%; padding: 0; border: 0; background: none;
                    cursor: pointer; -webkit-tap-highlight-color: transparent; }

                /* The trunk stands on the floor line and leaves through the top of the frame. */
                .fr-trunk { position: absolute; left: 50%; bottom: 5%; width: 78%; max-width: 340px;
                    transform: translateX(-50%); transform-origin: 50% 100%;
                    filter: drop-shadow(0 10px 22px rgba(0,0,0,.8)); pointer-events: none; }
                .fr-stump { position: absolute; left: 50%; bottom: 3.5%; width: 34%; max-width: 150px;
                    transform: translateX(-50%); filter: drop-shadow(0 6px 14px rgba(0,0,0,.75));
                    pointer-events: none; }
                .fr-slot:not(.is-here) .fr-trunk { filter: drop-shadow(0 10px 22px rgba(0,0,0,.8)) brightness(.6); }

                /* ⚠️ EVERY TRANSFORM HERE RESTATES translateX(-50%). A keyframe that animates the transform
                   property and forgets the centring snaps the trunk half a frame sideways the moment it plays,
                   which is exactly what happened to the captain in the Brig. */
                .fr-trunk.is-struck { animation: frStruck 110ms ease-out; }
                @keyframes frStruck {
                    0% { transform: translateX(-50%) rotate(0deg); }
                    40% { transform: translateX(calc(-50% - 5px)) rotate(-1.1deg) scaleY(.985); }
                    100% { transform: translateX(-50%) rotate(0deg); }
                }
                /* THE FALL. Slow to give, then all at once — a trunk that topples linearly looks like a door
                   swinging shut. It overshoots a couple of degrees past the landing and settles back, which is
                   the visual half of the crash the speakers are doing on the same frame. */
                .fr-trunk.is-down { animation: frFall ${FALL_MS}ms cubic-bezier(.55,.02,.72,.35) forwards; }
                @keyframes frFall {
                    0% { transform: translateX(-50%) rotate(0deg); }
                    14% { transform: translateX(-50%) rotate(-3deg); }
                    ${FALL_PCT}% { transform: translateX(-50%) rotate(86deg); opacity: 1; }
                    ${FALL_PCT + 6}% { transform: translateX(-50%) rotate(82deg); }
                    100% { transform: translateX(-50%) rotate(84deg); opacity: 0; }
                }

                .fr-axe { position: absolute; left: 60%; bottom: 20%; width: 27%; max-width: 118px;
                    transform-origin: 50% 90%; pointer-events: none; z-index: 3;
                    filter: drop-shadow(0 4px 10px rgba(0,0,0,.8)); }
                .fr-axe.is-swing { animation: frSwing 120ms ease-in; }
                @keyframes frSwing {
                    0% { transform: rotate(-54deg) translate(10px, -18px); }
                    70% { transform: rotate(16deg) translate(-4px, 4px); }
                    100% { transform: rotate(0deg) translate(0, 0); }
                }
                .fr-axe.is-hot { filter: drop-shadow(0 4px 10px rgba(0,0,0,.8)) drop-shadow(0 0 14px rgba(255,176,86,.75)); }

                /* ── DEBRIS ────────────────────────────────────────────────────────────────────────
                   Every particle is the same element with different custom properties, so ONE keyframe throws
                   chips, logs and branches. The arc is three stops — out and up, over the top, then down past
                   the floor — because a straight line from A to B reads as a slide, and this has to read as
                   something thrown by an impact. */
                .fr-fx { position: absolute; left: 50%; bottom: 16%; width: 0; height: 0; pointer-events: none; z-index: 4; }
                .fr-p { position: absolute; left: 0; top: 0; display: block; will-change: transform, opacity;
                    animation-name: frFly; animation-timing-function: cubic-bezier(.25,.6,.4,1);
                    animation-fill-mode: forwards; }
                @keyframes frFly {
                    0% { transform: translate3d(0,0,0) rotate(0deg); opacity: 1; }
                    45% { transform: translate3d(calc(var(--dx) * .58), calc(var(--dy) * .2 - var(--lift)), 0) rotate(calc(var(--rot) * .5)); opacity: 1; }
                    100% { transform: translate3d(var(--dx), var(--dy), 0) rotate(var(--rot)); opacity: 0; }
                }
                .fr-p.is-chip { width: var(--sz); height: calc(var(--sz) * .55); border-radius: 2px;
                    background: linear-gradient(160deg, #e0c489, #9a6b38); box-shadow: 0 1px 3px rgba(0,0,0,.6); }
                .fr-p.is-log { width: calc(var(--sz) * 2.1); height: var(--sz); border-radius: 3px;
                    background: linear-gradient(180deg, #b98a4e, #6d4722 62%, #4a2f16);
                    box-shadow: inset 0 0 0 1px rgba(60,36,14,.7), 0 3px 8px rgba(0,0,0,.7); }
                /* The end grain — a log tumbling end over end has to show a cut face or it is a brown box. */
                .fr-p.is-log::after { content: ""; position: absolute; right: 0; top: 0; bottom: 0;
                    width: calc(var(--sz) * .34); border-radius: 50%;
                    background: radial-gradient(circle, #e8d0a2 18%, #c39a5e 45%, #8a6234 100%); }
                .fr-p.is-branch { width: calc(var(--sz) * 2.6); height: calc(var(--sz) * .22); border-radius: 999px;
                    background: linear-gradient(90deg, #6c4c28, #3f2a14); box-shadow: 0 2px 5px rgba(0,0,0,.6); }
                .fr-p.is-branch::after { content: ""; position: absolute; left: 42%; top: -160%;
                    width: 46%; height: 320%; border-left: 2px solid #5a3d20; border-radius: 0 0 0 60%;
                    transform: rotate(24deg); }
                .fr-p.is-dust { left: -70px; top: -20px; width: 140px; height: 46px; border-radius: 50%;
                    background: radial-gradient(ellipse, rgba(150,124,88,.5), transparent 70%);
                    animation-name: frDust; }
                @keyframes frDust {
                    0% { transform: scale(.25); opacity: .95; }
                    100% { transform: scale(2.4); opacity: 0; }
                }
                .fr-p.is-num { left: -30px; width: 60px; text-align: center; font-style: normal;
                    font-size: 17px; font-weight: 900; color: #dfe9d6; text-shadow: 0 2px 7px rgba(0,0,0,.95);
                    animation-name: frNum; }
                .fr-p.is-num.is-hot { color: #ffcf87; font-size: 19px; }
                .fr-p.is-num.is-dbl { color: #9ede7a; font-size: 23px; }
                @keyframes frNum {
                    0% { transform: translate3d(0,0,0) scale(.7); opacity: 0; }
                    22% { transform: translate3d(calc(var(--dx) * .3), -22px, 0) scale(1.15); opacity: 1; }
                    100% { transform: translate3d(var(--dx), var(--dy), 0) scale(1); opacity: 0; }
                }

                /* ── WHAT IS STANDING HERE ──────────────────────────────────────────────────────── */
                .fr-plate { position: absolute; left: 50%; bottom: 10.5%; transform: translateX(-50%);
                    display: flex; flex-direction: column; align-items: center; gap: 5px; width: 62%; max-width: 250px;
                    pointer-events: none; z-index: 5; opacity: .4; transition: opacity 260ms ease; }
                .fr-plate.is-here { opacity: 1; }
                .fr-plate b { font-size: 14px; font-weight: 800; color: var(--r);
                    text-shadow: 0 2px 8px rgba(0,0,0,.95); letter-spacing: .02em; }
                .fr-hp { display: block; width: 100%; height: 8px; border-radius: 999px; overflow: hidden;
                    background: rgba(4,8,10,.82); box-shadow: inset 0 0 0 1px rgba(180,200,170,.22); }
                .fr-hp u { display: block; height: 100%; border-radius: 999px; text-decoration: none;
                    background: linear-gradient(90deg, #6f9440, #b6d06a); transition: width 70ms linear; }
                .fr-regrow { position: absolute; left: 50%; bottom: 11%; transform: translateX(-50%);
                    padding: 4px 11px; border-radius: 999px; font-size: 12px; font-weight: 800; color: #8a9384;
                    background: rgba(4,8,10,.7); border: 1px solid rgba(140,160,130,.18); z-index: 5; }

                /* The payout, floating off the stump. Not a dialog with a button — you just keep walking. */
                .fr-gain { position: absolute; left: 50%; bottom: 30%; transform: translateX(-50%);
                    display: flex; flex-direction: column; align-items: center; gap: 2px; z-index: 6;
                    pointer-events: none; animation: frGain 2.6s ease-out forwards; }
                .fr-gain b { font-size: 27px; font-weight: 900; color: #ffcf87; text-shadow: 0 3px 14px rgba(0,0,0,.95); }
                .fr-gain i { font-style: normal; font-size: 12px; color: #b9c2ad; text-shadow: 0 2px 6px rgba(0,0,0,.9); }
                .fr-gain em { font-style: normal; padding: 3px 11px; border-radius: 999px; font-size: 10.5px;
                    font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: var(--r);
                    border: 1px solid color-mix(in srgb, var(--r) 45%, transparent);
                    background: color-mix(in srgb, var(--r) 14%, transparent); margin-bottom: 3px; }
                .fr-gain.is-rare b { color: var(--r); text-shadow: 0 0 22px color-mix(in srgb, var(--r) 60%, transparent); }
                @keyframes frGain {
                    0% { transform: translate(-50%, 22px) scale(.6); opacity: 0; }
                    14% { transform: translate(-50%, 0) scale(1.12); opacity: 1; }
                    24% { transform: translate(-50%, 0) scale(1); opacity: 1; }
                    78% { opacity: 1; }
                    100% { transform: translate(-50%, -46px) scale(1); opacity: 0; }
                }

                /* ── THE WALK ───────────────────────────────────────────────────────────────────── */
                .fr-walk { position: absolute; top: 50%; width: 46px; height: 76px; margin-top: -38px;
                    display: grid; place-items: center; padding: 0; z-index: 8; cursor: pointer;
                    font-size: 30px; font-weight: 800; line-height: 1; color: #d7e3cd;
                    border: 1px solid rgba(180,200,170,.18); background: rgba(6,11,13,.55);
                    backdrop-filter: blur(3px); border-radius: 12px; transition: opacity 200ms ease; }
                .fr-walk.is-l { left: 8px; }
                .fr-walk.is-r { right: 8px; }
                .fr-walk:disabled { opacity: .16; cursor: default; }

                .fr-streak { position: absolute; left: 12px; right: 12px; bottom: 26px; height: 18px; z-index: 7;
                    display: block; border-radius: 999px; background: rgba(6,10,12,.74);
                    box-shadow: inset 0 0 0 1px rgba(255,180,90,.18); pointer-events: none; }
                .fr-streak i { display: block; height: 100%; border-radius: 999px;
                    background: linear-gradient(90deg, #c8873f, #ffcf87); transition: width 90ms linear; }
                /* ⚠️ TWO COLOURS, BECAUSE THE BAR BEHIND THE LABEL IS NOT ALWAYS THERE. The multiplier is dark
                   ink so it reads against the filled orange; before a streak exists the bar is empty and that
                   ink is black on black — which made the one line teaching the minigame invisible. */
                .fr-streak em { position: absolute; inset: 0; display: grid; place-items: center;
                    font-style: normal; font-size: 11px; font-weight: 800; letter-spacing: .06em;
                    color: #1a140c; text-shadow: 0 1px 0 rgba(255,255,255,.25); }
                .fr-streak.is-cold em { color: #ffe3b4; text-shadow: 0 1px 4px rgba(0,0,0,.95), 0 0 10px rgba(0,0,0,.7);
                    animation: frCold 1.7s ease-in-out infinite; }
                @keyframes frCold { 0%,100% { opacity: .82; } 50% { opacity: 1; } }
                .fr-streak.is-cold { box-shadow: inset 0 0 0 1px rgba(255,180,90,.32); }

                .fr-dots { position: absolute; left: 0; right: 0; bottom: 10px; display: flex; justify-content: center;
                    gap: 6px; z-index: 7; pointer-events: none; }
                .fr-dots i { width: 6px; height: 6px; border-radius: 999px; background: rgba(220,235,210,.26); }
                .fr-dots i.is-on { background: #b6d06a; box-shadow: 0 0 8px rgba(182,208,106,.7); }
                .fr-dots i.is-bare { background: rgba(220,235,210,.1); }

                /* ── BUTTONS + THE AXE SHOP ─────────────────────────────────────────────────────── */
                .fr-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px;
                    padding: 12px 15px; border-radius: 11px; font-size: 14.5px; font-weight: 800;
                    color: #dfe9d6; background: #18221a; border: 1px solid #34402f; cursor: pointer; }
                .fr-btn :global(svg) { width: 19px; height: 19px; color: #b6d06a; }
                .fr-btn em { font-style: normal; font-weight: 700; color: #ffcf87; }
                .fr-btn.is-go { background: linear-gradient(180deg, #26351f, #1b2617); border-color: #4c6b3c; }
                .fr-btn:disabled { opacity: .45; cursor: default; }
                .fr-wide { width: 100%; margin-top: 10px; }

                .fr-x { position: absolute; top: 10px; right: 12px; z-index: 9; width: 34px; height: 34px;
                    border-radius: 999px; font-size: 16px; color: #cfd8c8; background: rgba(6,11,13,.66);
                    border: 1px solid rgba(180,200,170,.2); cursor: pointer; }
                .fr-shop-over { position: fixed; inset: 0; z-index: 4500; display: flex;
                    align-items: flex-end; justify-content: center; background: rgba(3,6,8,.72); backdrop-filter: blur(3px); }
                .fr-shop { position: relative; width: min(520px, 100%); max-height: 92vh; overflow-y: auto;
                    padding: 18px 14px 20px; border-radius: 16px 16px 0 0; background: #10160f;
                    border-top: 1px solid #34402f; }
                .fr-shop-axe { display: block; width: 84px; margin: 0 auto 6px; }
                .fr-shop-name { margin: 0; text-align: center; font-size: 19px; font-weight: 800; color: #e8f0e4; }
                .fr-shop-sub { margin: 2px 0 14px; text-align: center; font-size: 12.5px; color: #8a9384; }
                .fr-track { padding: 11px 12px; margin-bottom: 8px; border-radius: 11px;
                    background: #141c12; border: 1px solid #2a3626; }
                .fr-track-top { display: flex; align-items: baseline; gap: 8px; }
                .fr-track-top b { font-size: 15px; font-weight: 800; color: #e8f0e4; }
                .fr-track-top em { margin-left: auto; font-style: normal; font-size: 12px; color: #8a9384; }
                .fr-pips { display: flex; gap: 3px; margin: 7px 0 0; }
                .fr-pips i { flex: 1; height: 4px; border-radius: 999px; background: #2a3626; }
                .fr-pips i.is-on { background: linear-gradient(90deg, #6f9440, #b6d06a); }
                .fr-track-num { display: flex; align-items: baseline; gap: 6px; margin: 7px 0 5px; }
                .fr-track-num b { font-size: 17px; font-weight: 800; color: #cfd8c8; font-variant-numeric: tabular-nums; }
                .fr-track-num s { text-decoration: none; color: #6f7a68; font-size: 13px; }
                .fr-track-num u { text-decoration: none; font-size: 17px; font-weight: 800; color: #9ede7a;
                    font-variant-numeric: tabular-nums; }
                .fr-track-num i { margin-left: 4px; font-style: normal; font-size: 11.5px; color: #7d876f; }
                .fr-track.is-short .fr-track-num u { color: #6f7a68; }
                .fr-track-blurb { display: block; margin-bottom: 9px; font-style: normal;
                    font-size: 12.5px; line-height: 1.45; color: #8a9384; }
                .fr-track .fr-btn { width: 100%; }

                @media (min-width: 700px) {
                    .fr-world { height: min(72vh, 640px); max-width: 720px; margin: 0 auto; }
                    .fr-btn.fr-wide { max-width: 720px; margin-left: auto; margin-right: auto; display: flex; }
                    .fr-shop { align-self: center; border-radius: 16px; border: 1px solid #34402f; }
                    .fr-shop-over { align-items: center; }
                }
            `}</style>
        </section>
    );
}
