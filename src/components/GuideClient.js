"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { enableWebPush, isWebPushSupported } from "@/lib/web-push-client";

// ── THE PATHFINDER ───────────────────────────────────────────────────────────────────────────────────────────
// A ROAD, drawn top to bottom. One rail runs the length of the page with a node on it for every chapter, and
// you can see at a glance where you have been, where you are standing and what is still ahead of you. Above the
// road sits the one thing you are being asked to do right now, big enough that it is the only thing you can
// really look at.
//
// ── A CSS TRAP THAT ATE THIS SCREEN ONCE ─────────────────────────────────────────────────────────────────────
// styled-jsx appends its `jsx-<hash>` scope class to DOM ELEMENTS ONLY. It does NOT add it to a custom
// component, and next/link's <Link> is a custom component. So `.gs { display: grid; padding; border; … }` on a
// <Link> compiled to `.gs.jsx-abc` and matched nothing: the card lost its box, its padding and its background
// while its <span> children stayed perfectly styled, and it rendered as a line of naked text.
//
// Every rule that lands on a <Link> therefore lives in the <style jsx global> block at the bottom of this
// file. They are all `gd-`-prefixed and unique to it, so leaving the component's scope costs nothing.
// `npm run check:styled-jsx` fails the build if a scoped rule is ever aimed at a custom component again.

const money = (n) => Number(n || 0).toLocaleString();

function iosNeedsInstall() {
    if (typeof navigator === "undefined" || typeof window === "undefined") return false;
    const ua = navigator.userAgent || "";
    const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = window.navigator.standalone === true || window.matchMedia?.("(display-mode: standalone)")?.matches;
    return isIos && !standalone;
}

// Steps done, drawn as a ring. A bar says "some"; a ring says "this much of a whole thing".
function Ring({ done, total }) {
    const R = 34, C = 2 * Math.PI * R;
    const frac = total ? done / total : 0;
    return (
        <div className="gd-ring">
            <svg viewBox="0 0 80 80" aria-hidden="true">
                <circle cx="40" cy="40" r={R} className="gd-ring-track" />
                <circle cx="40" cy="40" r={R} className="gd-ring-fill" strokeDasharray={`${C * frac} ${C}`} />
            </svg>
            <div className="gd-ring-num"><b>{done}</b><span>/{total}</span></div>
        </div>
    );
}

export default function GuideClient() {
    const [g, setG] = useState(null);
    const [open, setOpen] = useState(null);
    const [busy, setBusy] = useState(null);
    const [flash, setFlash] = useState(null);
    const [note, setNote] = useState(null);

    const load = useCallback(async () => {
        const d = await fetch("/api/marketplace/guide", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (d) setG(d);
        if (d?.paid) { setFlash(`+${money(d.paid)} gold`); setTimeout(() => setFlash(null), 2600); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const post = useCallback(async (body) => {
        const r = await fetch("/api/marketplace/guide", {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
        }).then((x) => x.json()).catch(() => null);
        if (r?.chapters) setG(r);
        return r;
    }, []);

    const collect = useCallback(async (id) => {
        setBusy(id);
        const r = await post({ chapter: id });
        setBusy(null);
        if (r?.ok) { setFlash(`+${money(r.gold)} gold${r.chest ? ` · ${r.chest} chest` : ""}`); setTimeout(() => setFlash(null), 3000); }
    }, [post]);

    const enableNotifications = useCallback(async (key) => {
        setBusy(key); setNote(null);
        try {
            if (!isWebPushSupported()) {
                setNote(iosNeedsInstall()
                    ? "On iPhone, add the Den to your Home Screen first — Safari only allows notifications from an installed app."
                    : "This browser can't do notifications. Try Chrome, or the Den on your phone.");
                return;
            }
            const ok = await enableWebPush().catch(() => false);
            if (!ok) { setNote("The browser said no. You can turn it back on in site settings and try again."); return; }
            const r = await post({ step: key });
            if (r?.ok) { setFlash(`+${money(r.gold)} gold`); setTimeout(() => setFlash(null), 2400); }
        } finally { setBusy(null); }
    }, [post]);

    if (!g) {
        return (
            <section className="card gd">
                <div className="gd-skel" />
                <style jsx>{`
                    .gd-skel { height: 180px; border-radius: 16px; background: linear-gradient(100deg, rgba(255,255,255,0.04), rgba(255,255,255,0.09), rgba(255,255,255,0.04));
                        background-size: 220% 100%; animation: gdShim 1.3s linear infinite; }
                    @keyframes gdShim { from { background-position: 180% 0 } to { background-position: -60% 0 } }
                `}</style>
            </section>
        );
    }

    if (!g.signedIn) {
        return (
            <section className="card gd-signin">
                <h2>The Pathfinder</h2>
                <p className="muted">Sign in and it walks you through the Den one thing at a time — and pays you for every step.</p>
                <Link className="btn" href="/marketplace/login?returnTo=/marketplace/guide">Sign in</Link>
            </section>
        );
    }

    const { current, chapters, totals, nextLocked, allOpenDone } = g;

    return (
        <>
            {/* ── the banner ── */}
            <section className="card gd-hero">
                <div className="gd-hero-text">
                    <span className="gd-eyebrow">The Pathfinder</span>
                    <h1 className="gd-h1">Your way through the Den</h1>
                    <p className="gd-lede">The Wolf Den is a real card shop in Montgomery, and this is its game. Play it however you like — the guide just makes sure you never miss anything.</p>
                    <div className="gd-stats">
                        <span><b>{totals.doneChapters}</b> of {totals.chapters} chapters</span>
                        <span>Level <b>{g.level}</b></span>
                    </div>
                </div>
                <Ring done={totals.doneSteps} total={totals.steps} />
            </section>

            {/* ── WHY ANY OF THIS EXISTS ──
                A guide that opens with "step 1: plant a crop" answers the wrong question. The first thing a new
                member needs is what the whole thing is FOR — and the answer is unusual enough to be worth
                saying plainly: the prize at the end of it is a real object on a real shelf. */}
            <section className="card gd-point">
                <h2 className="gd-point-title">What this is</h2>
                <div className="gd-beats">
                    <div className="gd-beat">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/images/guide/ch-hero.webp" alt="" draggable="false" />
                        <div>
                            <b>Play however you like</b>
                            <p>Farm, fish, sail, cook, mine, fight, decorate. There is no wrong order and nothing you can permanently miss.</p>
                        </div>
                    </div>
                    <div className="gd-beat">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/images/guide/ch-boss.webp" alt="" draggable="false" />
                        <div>
                            <b>The whole Den fights one boss</b>
                            <p>Every hit you land banks raffle tickets toward the prize, so turning up and swinging is the whole of it.</p>
                        </div>
                    </div>
                    <div className="gd-beat is-prize">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/images/guide/ch-store.webp" alt="" draggable="false" />
                        <div>
                            <b>The prize is a real thing</b>
                            <p>When the boss falls the raffle draws a winner, and they collect an actual item off the Wolf Den&rsquo;s shelves. That is what all of this is for.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── what to do right now ── */}
            {current && current.step ? (
                <section className="card gd-now" style={{ "--tint": current.tint }}>
                    <div className="gd-now-top">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="gd-now-emblem" src={current.icon} alt="" draggable="false" />
                        <div className="gd-now-head">
                            <span className="gd-now-kicker">{current.name} · step {current.stepIndex} of {current.stepCount}</span>
                            <b className="gd-now-label">{current.step.label}</b>
                        </div>
                    </div>
                    <p className="gd-now-why">{current.step.why}</p>
                    <div className="gd-now-foot">
                        {current.step.manual ? (
                            <button type="button" className="gd-cta" disabled={busy === current.step.key}
                                onClick={() => enableNotifications(current.step.key)}>
                                {busy === current.step.key ? "Asking…" : current.step.cta}
                            </button>
                        ) : (
                            <Link className="gd-cta" href={current.step.href}>{current.step.cta}</Link>
                        )}
                        <span className="gd-reward">+{money(current.step.gold)} gold</span>
                    </div>
                    {note ? <p className="gd-note">{note}</p> : null}
                </section>
            ) : allOpenDone ? (
                <section className="card gd-crest">
                    <b>You know the place.</b>
                    <p>
                        Every chapter open to you is finished.{" "}
                        {nextLocked ? <>The next one, <b>{nextLocked.name}</b>, unlocks at level {nextLocked.minLevel}.</> : <>There is nothing left in the book.</>}
                    </p>
                    <div className="gd-crest-links">
                        <Link className="gd-chip" href="/marketplace/play">Today&rsquo;s quests</Link>
                        <Link className="gd-chip" href="/marketplace/town">The town</Link>
                        <Link className="gd-chip" href="/marketplace/spin">Daily spin</Link>
                    </div>
                </section>
            ) : null}

            {/* ── the road ── */}
            <section className="card gd-road">
                <h2 className="gd-road-title">The road</h2>
                <div className="gd-rail">
                    {chapters.map((c) => {
                        const isCurrent = current?.chapter === c.id;
                        const isOpen = open === c.id || (open === null && isCurrent);
                        const state = c.locked ? "is-locked" : c.complete ? "is-done" : isCurrent ? "is-now" : "is-open";
                        return (
                            <div key={c.id} className={`gd-node ${state}${isOpen ? " is-expanded" : ""}`} style={{ "--tint": c.tint }}>
                                <button type="button" className="gd-node-head" onClick={() => setOpen(isOpen ? "" : c.id)} aria-expanded={isOpen}>
                                    <span className="gd-orb">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={c.icon} alt="" draggable="false" />
                                        {c.complete ? <span className="gd-orb-tick" aria-hidden="true" /> : null}
                                    </span>
                                    <span className="gd-node-body">
                                        <span className="gd-node-name">{c.name}</span>
                                        <span className="gd-node-sub">
                                            {c.locked ? `Unlocks at level ${c.minLevel}` : c.complete ? "Complete" : c.blurb}
                                        </span>
                                        {!c.locked ? (
                                            <span className="gd-pips" aria-hidden="true">
                                                {c.steps.map((s) => <i key={s.key} className={s.done ? "is-on" : ""} />)}
                                            </span>
                                        ) : null}
                                    </span>
                                    <span className="gd-node-meta">
                                        {c.locked ? <span className="gd-lock">{c.minLevel}</span> : `${c.doneCount}/${c.steps.length}`}
                                    </span>
                                </button>

                                {isOpen && !c.locked ? (
                                    <div className="gd-node-open">
                                        <ul className="gd-steps">
                                            {c.steps.map((s) => (
                                                <li key={s.key} className={`gd-step${s.done ? " is-done" : ""}`}>
                                                    <span className="gd-tick" aria-hidden="true" />
                                                    <span className="gd-step-body">
                                                        <b>{s.label}</b>
                                                        {!s.done ? <em>{s.why}</em> : null}
                                                    </span>
                                                    {s.done
                                                        ? <span className="gd-step-got">+{money(s.gold)}</span>
                                                        : <Link className="gd-go" href={s.href}>Go</Link>}
                                                </li>
                                            ))}
                                        </ul>
                                        {c.complete && !c.rewardClaimed ? (
                                            <button type="button" className="gd-collect" disabled={busy === c.id} onClick={() => collect(c.id)}>
                                                Collect {money(c.reward.gold)} gold{c.reward.chest ? ` + ${c.reward.chest} chest` : ""}
                                            </button>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            </section>

            {flash ? <div className="gd-flash">{flash}</div> : null}

            <style jsx>{`
                /* ── banner ── */
                .gd-hero { display: flex; align-items: center; gap: 18px; justify-content: space-between; }
                .gd-hero-text { min-width: 0; }
                .gd-eyebrow { font-size: 10px; font-weight: 900; letter-spacing: .18em; text-transform: uppercase; color: #b79a5e; }
                .gd-h1 { margin: 4px 0 0; font-size: clamp(1.25rem, 5.4vw, 1.7rem); font-weight: 900; line-height: 1.15;
                    background: linear-gradient(92deg, #ffe9b0, #ffb020); -webkit-background-clip: text; background-clip: text; color: transparent; }
                .gd-lede { margin: 7px 0 0; font-size: 12.5px; line-height: 1.55; color: #9aa2ab; max-width: 42ch; }
                .gd-stats { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 10px; font-size: 11.5px; color: #8a939d; }
                .gd-stats b { color: #ffd75e; font-variant-numeric: tabular-nums; }


                /* ── the point ── */
                .gd-point-title { margin: 0 0 12px; font-size: 0.82rem; font-weight: 900; letter-spacing: .14em;
                    text-transform: uppercase; color: #8a939d; }
                .gd-beats { display: grid; gap: 10px; }
                @media (min-width: 760px) { .gd-beats { grid-template-columns: repeat(3, 1fr); } }
                .gd-beat { display: flex; align-items: flex-start; gap: 12px; padding: 12px 13px; border-radius: 13px;
                    background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.08); }
                .gd-beat img { flex: 0 0 auto; width: 40px; height: 40px; object-fit: contain;
                    filter: drop-shadow(0 3px 8px rgba(0,0,0,0.5)); }
                .gd-beat b { display: block; font-size: 13px; color: #e9eef3; }
                .gd-beat p { margin: 4px 0 0; font-size: 11.5px; line-height: 1.55; color: #8f98a3; }
                /* The payoff beat is the one that has to land, so it gets the gold. */
                .gd-beat.is-prize { background: linear-gradient(140deg, rgba(255,176,32,0.15), rgba(255,255,255,0.02) 70%);
                    border-color: rgba(255,215,94,0.4); }
                .gd-beat.is-prize b { color: #ffe28a; }
                .gd-beat.is-prize p { color: #cdb894; }

                /* ── the one thing to do now ── */
                .gd-now { position: relative; overflow: hidden;
                    background: linear-gradient(152deg, color-mix(in srgb, var(--tint) 22%, transparent), rgba(255,255,255,0.02) 62%);
                    border: 1px solid color-mix(in srgb, var(--tint) 50%, transparent);
                    box-shadow: 0 12px 34px -18px var(--tint); }
                .gd-now::after { content: ""; position: absolute; top: -55%; right: -18%; width: 62%; aspect-ratio: 1; border-radius: 50%;
                    background: radial-gradient(circle, color-mix(in srgb, var(--tint) 30%, transparent), transparent 68%); pointer-events: none; }
                .gd-now-top { display: flex; align-items: center; gap: 13px; }
                .gd-now-emblem { flex: 0 0 auto; width: 60px; height: 60px; object-fit: contain;
                    filter: drop-shadow(0 4px 12px rgba(0,0,0,0.55)); }
                .gd-now-head { min-width: 0; }
                .gd-now-kicker { display: block; font-size: 10px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase;
                    color: color-mix(in srgb, var(--tint) 78%, white); }
                .gd-now-label { display: block; margin-top: 3px; font-size: clamp(1.05rem, 4.6vw, 1.3rem); font-weight: 900; color: #fff; line-height: 1.2; }
                .gd-now-why { margin: 12px 0 15px; font-size: 13px; line-height: 1.62; color: #cbd3dc; max-width: 56ch; }
                .gd-now-foot { display: flex; align-items: center; gap: 13px; flex-wrap: wrap; }
                .gd-reward { font-size: 12.5px; font-weight: 900; color: #ffd75e; }
                .gd-note { margin: 11px 0 0; font-size: 12px; line-height: 1.5; color: #ffd0a0; }

                /* ── finished-everything crest ── */
                .gd-crest { text-align: center; border: 1px solid rgba(255,215,94,0.4);
                    background: radial-gradient(120% 100% at 50% 0%, rgba(255,176,32,0.16), rgba(255,255,255,0.02) 70%); }
                .gd-crest b { font-size: 1.1rem; color: #ffe28a; }
                .gd-crest p { margin: 7px 0 13px; font-size: 13px; line-height: 1.6; color: #c2cad3; }
                .gd-crest-links { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }

                /* ── the road ── */
                .gd-road-title { margin: 0 0 14px; font-size: 0.82rem; font-weight: 900; letter-spacing: .14em;
                    text-transform: uppercase; color: #8a939d; }
                /* The rail itself: one continuous line behind the orbs, so the chapters read as a route rather
                   than as a list of unrelated boxes. */
                .gd-rail { position: relative; display: grid; gap: 4px; }
                .gd-rail::before { content: ""; position: absolute; left: 27px; top: 26px; bottom: 26px; width: 2px;
                    background: linear-gradient(180deg, rgba(255,215,94,0.5), rgba(255,255,255,0.09)); border-radius: 2px; }
                .gd-node { position: relative; border-radius: 14px; transition: background .18s ease; }
                .gd-node.is-expanded { background: rgba(255,255,255,0.035); }
                .gd-node-head { display: grid; grid-template-columns: 54px minmax(0, 1fr) auto; align-items: center; gap: 12px;
                    width: 100%; padding: 9px 12px 9px 0; background: none; border: none; cursor: pointer; text-align: left; }
                .gd-orb { position: relative; width: 54px; height: 54px; border-radius: 50%; display: grid; place-items: center;
                    background: radial-gradient(circle at 38% 30%, rgba(255,255,255,0.13), rgba(8,6,12,0.92));
                    border: 2px solid rgba(255,255,255,0.12); box-shadow: 0 3px 10px rgba(0,0,0,0.5); }
                .gd-orb img { width: 34px; height: 34px; object-fit: contain; }
                .gd-node.is-done .gd-orb { border-color: color-mix(in srgb, var(--tint) 85%, white); box-shadow: 0 0 16px -3px var(--tint); }
                .gd-node.is-now .gd-orb { border-color: #ffd75e; animation: gdPulse 2.1s ease-in-out infinite; }
                @keyframes gdPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(255,215,94,0.5) } 60% { box-shadow: 0 0 0 9px rgba(255,215,94,0) } }
                .gd-node.is-locked .gd-orb { filter: grayscale(1) brightness(0.62); border-color: rgba(255,255,255,0.09); }
                .gd-orb-tick { position: absolute; right: -2px; bottom: -2px; width: 19px; height: 19px; border-radius: 50%;
                    background: color-mix(in srgb, var(--tint) 85%, white); border: 2px solid #14100c; }
                .gd-orb-tick::after { content: ""; position: absolute; left: 5px; top: 2px; width: 4px; height: 8px;
                    border: solid #14100c; border-width: 0 2.2px 2.2px 0; transform: rotate(43deg); }

                .gd-node-body { min-width: 0; }
                .gd-node-name { display: block; font-size: 0.95rem; font-weight: 900; color: #e9eef3; }
                .gd-node.is-locked .gd-node-name { color: #7f8790; }
                .gd-node.is-done .gd-node-name { color: color-mix(in srgb, var(--tint) 62%, white); }
                .gd-node-sub { display: block; margin-top: 1px; font-size: 11.5px; line-height: 1.4; color: #838c96;
                    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .gd-pips { display: flex; gap: 4px; margin-top: 6px; }
                .gd-pips i { width: 15px; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.15); }
                .gd-pips i.is-on { background: color-mix(in srgb, var(--tint) 85%, white); }
                .gd-node-meta { font-size: 11.5px; font-weight: 900; color: #8a939d; font-variant-numeric: tabular-nums; padding-left: 4px; }
                .gd-lock { display: inline-grid; place-items: center; min-width: 24px; height: 24px; padding: 0 6px; border-radius: 999px;
                    font-size: 11px; color: #6f7883; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); }

                .gd-node-open { padding: 2px 12px 13px 66px; }
                .gd-steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 7px; }
                .gd-step { display: grid; grid-template-columns: 17px minmax(0, 1fr) auto; align-items: start; gap: 10px;
                    padding: 10px 12px; border-radius: 11px; background: rgba(0,0,0,0.26); border: 1px solid rgba(255,255,255,0.05); }
                .gd-tick { width: 15px; height: 15px; margin-top: 2px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.2); }
                .gd-step.is-done .gd-tick { border-color: transparent; background: color-mix(in srgb, var(--tint) 85%, white); }
                .gd-step-body b { display: block; font-size: 12.5px; color: #e6ecf2; }
                .gd-step.is-done .gd-step-body b { color: #8a939d; }
                .gd-step-body em { display: block; margin-top: 4px; font-style: normal; font-size: 11.5px; line-height: 1.55; color: #8f98a3; }
                .gd-step-got { font-size: 11px; font-weight: 900; color: #66707a; white-space: nowrap; }
                .gd-collect { width: 100%; margin-top: 10px; padding: 12px; border-radius: 12px; border: none; cursor: pointer;
                    font-size: 0.86rem; font-weight: 900; color: #241500; background: linear-gradient(180deg, #ffe08a, #ffb020);
                    box-shadow: 0 3px 0 #b47a12, 0 8px 22px -8px rgba(255,176,32,0.9); }
                .gd-collect:disabled { opacity: .6; }

                .gd-flash { position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%); z-index: 200;
                    padding: 11px 21px; border-radius: 999px; font-weight: 900; color: #241500;
                    background: linear-gradient(180deg, #ffe08a, #ffb020); box-shadow: 0 10px 30px rgba(0,0,0,0.55);
                    animation: gdFlash .32s cubic-bezier(.2,1.4,.35,1) both; }
                @keyframes gdFlash { from { opacity: 0; transform: translate(-50%, 12px) scale(.9) } to { opacity: 1; transform: translate(-50%, 0) scale(1) } }
            `}</style>

            {/* Rules that land on a <Link>. See the note at the top of the file: styled-jsx will not scope a
                custom component, so these have to be global or they match nothing at all. */}
            <style jsx global>{`
                /* THE PROGRESS RING. These live in the GLOBAL block because the markup they style is in Ring(),
                   a separate component in this file — and a scoped block only reaches JSX written inside the
                   component that owns it. They sat in the scoped block above and matched nothing, so the ring
                   rendered as a bare number with no circle around it at all. Caught by check:styled-jsx once
                   it learned to look for this, rather than only for rules aimed at capitalised tags. */
                .gd-ring { position: relative; flex: 0 0 auto; width: 92px; height: 92px; display: grid; place-items: center; }
                .gd-ring svg { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); }
                .gd-ring-track, .gd-ring-fill { fill: none; stroke-width: 8; stroke-linecap: round; }
                .gd-ring-track { stroke: rgba(255,255,255,0.09); }
                .gd-ring-fill { stroke: url(#gdgrad); stroke: #ffb020; filter: drop-shadow(0 0 6px rgba(255,176,32,0.55));
                    transition: stroke-dasharray .7s cubic-bezier(.2,.8,.3,1); }
                .gd-ring-num { position: relative; text-align: center; line-height: 1; }
                .gd-ring-num b { display: block; font-size: 1.4rem; font-weight: 900; color: #fff; }
                .gd-ring-num span { font-size: 10.5px; color: #8a939d; }
                .gd-cta { display: inline-flex; align-items: center; justify-content: center; padding: 12px 22px; border-radius: 12px;
                    border: none; cursor: pointer; text-decoration: none; font-size: 0.92rem; font-weight: 900; color: #241500;
                    background: linear-gradient(180deg, #ffe08a, #ffb020); box-shadow: 0 3px 0 #b47a12, 0 10px 26px -10px rgba(255,176,32,0.95);
                    transition: transform .12s ease; }
                .gd-cta:active { transform: translateY(2px); box-shadow: 0 1px 0 #b47a12; }
                .gd-cta:disabled { opacity: .6; }
                .gd-go { display: inline-block; padding: 7px 15px; border-radius: 9px; text-decoration: none; white-space: nowrap;
                    font-size: 11.5px; font-weight: 900; color: #241500; background: linear-gradient(180deg, #ffe08a, #ffb020); }
                .gd-chip { display: inline-block; padding: 9px 15px; border-radius: 999px; text-decoration: none;
                    font-size: 12.5px; font-weight: 800; color: #ecd6bc; background: rgba(255,255,255,0.06);
                    border: 1px solid rgba(255,255,255,0.14); }
            `}</style>
        </>
    );
}
