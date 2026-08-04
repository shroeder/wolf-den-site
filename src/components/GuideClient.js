"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { enableWebPush, isWebPushSupported } from "@/lib/web-push-client";

// ── THE PATHFINDER ───────────────────────────────────────────────────────────────────────────────────────────
// The screen leads with ONE step. Everything else is a folded chapter you can open if you want to, and most
// people never will — which is the point. A new member should be able to look at this and see a single sentence
// telling them what to do next and a button that takes them there.
//
// Chapters open below in order, showing how far in you are. A finished chapter has a purse to collect: it is
// the only thing in here you have to tap, because a reward you collect is a reward you notice.

const money = (n) => Number(n || 0).toLocaleString();

function iosNeedsInstall() {
    if (typeof navigator === "undefined" || typeof window === "undefined") return false;
    const ua = navigator.userAgent || "";
    const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = window.navigator.standalone === true || window.matchMedia?.("(display-mode: standalone)")?.matches;
    return isIos && !standalone;
}

export default function GuideClient() {
    const [g, setG] = useState(null);
    const [open, setOpen] = useState(null);   // which chapter is expanded
    const [busy, setBusy] = useState(null);
    const [flash, setFlash] = useState(null);
    const [note, setNote] = useState(null);

    const load = useCallback(async () => {
        const d = await fetch("/api/marketplace/guide", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (d) setG(d);
        // A step that completed itself since you were last here pays on the read, so say so.
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
        if (r?.ok) { setFlash(`+${money(r.gold)} gold${r.chest ? ` and a ${r.chest} chest` : ""}`); setTimeout(() => setFlash(null), 3000); }
    }, [post]);

    // The one step the server can't watch: the browser has to actually grant permission first.
    const enableNotifications = useCallback(async (key) => {
        setBusy(key); setNote(null);
        try {
            if (!isWebPushSupported()) {
                setNote(iosNeedsInstall()
                    ? "On iPhone, add the Den to your Home Screen first — Safari only allows notifications from an installed app."
                    : "This browser can't do notifications. Try Chrome, or the Den on your phone.");
                setBusy(null); return;
            }
            const ok = await enableWebPush().catch(() => false);
            if (!ok) { setNote("The browser said no. You can turn it back on in site settings and try again."); setBusy(null); return; }
            const r = await post({ step: key });
            if (r?.ok) { setFlash(`+${money(r.gold)} gold`); setTimeout(() => setFlash(null), 2400); }
        } finally { setBusy(null); }
    }, [post]);

    if (!g) return <div className="gd-load">Finding your place…</div>;
    if (!g.signedIn) {
        return (
            <div className="card gd-signin">
                <h2>The Pathfinder</h2>
                <p>Sign in and it&rsquo;ll walk you through the Den one thing at a time.</p>
                <Link className="btn" href="/marketplace/login?returnTo=/marketplace/guide">Sign in</Link>
            </div>
        );
    }

    const { current, chapters, totals, nextLocked, allOpenDone } = g;
    const pct = totals.steps ? Math.round((totals.doneSteps / totals.steps) * 100) : 0;

    return (
        <section className="card gd">
            <div className="gd-head">
                <div>
                    <h2 className="gd-title">The Pathfinder</h2>
                    <p className="gd-sub">One thing at a time. Nothing here is a quiz — you just play, and it ticks.</p>
                </div>
                <div className="gd-count">
                    <b>{totals.doneSteps}</b><span>/ {totals.steps}</span>
                </div>
            </div>
            <div className="gd-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>

            {/* ── WHAT TO DO NEXT ── the whole screen in one card ── */}
            {current && current.step ? (
                <div className="gd-now" style={{ "--tint": current.tint }}>
                    <span className="gd-now-kicker">{current.name}</span>
                    <b className="gd-now-label">{current.step.label}</b>
                    <p className="gd-now-why">{current.step.why}</p>
                    <div className="gd-now-foot">
                        {current.step.manual ? (
                            <button type="button" className="btn gd-now-go" disabled={busy === current.step.key}
                                onClick={() => enableNotifications(current.step.key)}>
                                {busy === current.step.key ? "Asking…" : current.step.cta}
                            </button>
                        ) : (
                            <Link className="btn gd-now-go" href={current.step.href}>{current.step.cta}</Link>
                        )}
                        <span className="gd-now-pay">+{money(current.step.gold)} gold</span>
                    </div>
                    {note ? <p className="gd-note">{note}</p> : null}
                </div>
            ) : allOpenDone ? (
                <div className="gd-done">
                    <b>You know the place.</b>
                    <p>
                        Everything open to you is done.{" "}
                        {nextLocked
                            ? <>The next chapter, <b>{nextLocked.name}</b>, opens at level {nextLocked.minLevel}.</>
                            : <>There is nothing left in the book — go and win something.</>}
                    </p>
                    <div className="gd-done-links">
                        <Link className="btn-ghost" href="/marketplace/play">Today&rsquo;s quests</Link>
                        <Link className="btn-ghost" href="/marketplace/town">The town</Link>
                        <Link className="btn-ghost" href="/marketplace/spin">Your daily spin</Link>
                    </div>
                </div>
            ) : null}

            {/* ── the book ── */}
            <div className="gd-chapters">
                {chapters.map((c) => {
                    const isOpen = open === c.id || (open === null && current?.chapter === c.id);
                    return (
                        <div key={c.id} className={`gd-ch${c.complete ? " is-done" : ""}${c.locked ? " is-locked" : ""}`} style={{ "--tint": c.tint }}>
                            <button type="button" className="gd-ch-head" onClick={() => setOpen(isOpen ? "" : c.id)}>
                                <span className="gd-ch-name">{c.name}</span>
                                <span className="gd-ch-meta">
                                    {c.locked ? `Level ${c.minLevel}` : c.complete ? "Done" : `${c.doneCount}/${c.steps.length}`}
                                </span>
                            </button>
                            {isOpen ? (
                                <div className="gd-ch-body">
                                    <p className="gd-ch-blurb">{c.blurb}</p>
                                    {c.locked ? (
                                        <p className="gd-ch-gate">Opens at level {c.minLevel}. It&rsquo;ll be waiting.</p>
                                    ) : (
                                        <ul className="gd-steps">
                                            {c.steps.map((s) => (
                                                <li key={s.key} className={`gd-step${s.done ? " is-done" : ""}`}>
                                                    <span className="gd-tick" aria-hidden="true" />
                                                    <div className="gd-step-body">
                                                        <b>{s.label}</b>
                                                        {!s.done ? <p>{s.why}</p> : null}
                                                    </div>
                                                    {s.done
                                                        ? <span className="gd-step-pay is-got">+{money(s.gold)}</span>
                                                        : <Link className="gd-step-go" href={s.href}>Go</Link>}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    {c.complete && !c.rewardClaimed ? (
                                        <button type="button" className="btn gd-collect" disabled={busy === c.id} onClick={() => collect(c.id)}>
                                            Collect {money(c.reward.gold)} gold{c.reward.chest ? ` + a ${c.reward.chest} chest` : ""}
                                        </button>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    );
                })}
            </div>

            {flash ? <div className="gd-flash">{flash}</div> : null}

            <style jsx>{`
                .gd-load { padding: 30px; text-align: center; color: #9aa2ab; }
                .gd-signin { text-align: center; padding: 26px; }
                .gd-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
                .gd-title { margin: 0; font-size: 1.35rem; font-weight: 900; color: #ffe28a; }
                .gd-sub { margin: 3px 0 0; font-size: 12.5px; line-height: 1.5; color: #9aa2ab; max-width: 46ch; }
                .gd-count { flex: 0 0 auto; text-align: right; font-variant-numeric: tabular-nums; }
                .gd-count b { font-size: 1.5rem; font-weight: 900; color: #fff; }
                .gd-count span { font-size: 12px; color: #7f8790; margin-left: 3px; }
                .gd-bar { height: 7px; margin: 11px 0 16px; border-radius: 999px; overflow: hidden; background: rgba(255,255,255,0.08); }
                .gd-bar > span { display: block; height: 100%; border-radius: 999px; transition: width .5s ease;
                    background: linear-gradient(90deg, #ffb020, #ffe28a); }

                /* THE ONE CARD THAT MATTERS. Deliberately the biggest thing on the screen. */
                .gd-now { padding: 16px 17px; border-radius: 16px; position: relative; overflow: hidden;
                    background: linear-gradient(155deg, color-mix(in srgb, var(--tint) 20%, transparent), rgba(255,255,255,0.03));
                    border: 1px solid color-mix(in srgb, var(--tint) 45%, transparent); }
                .gd-now-kicker { font-size: 10px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase;
                    color: color-mix(in srgb, var(--tint) 75%, white); }
                .gd-now-label { display: block; margin: 4px 0 6px; font-size: 1.15rem; font-weight: 900; color: #fff; }
                .gd-now-why { margin: 0 0 14px; font-size: 13px; line-height: 1.6; color: #c9d1da; max-width: 54ch; }
                .gd-now-foot { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
                .gd-now-go { text-decoration: none; }
                .gd-now-pay { font-size: 12.5px; font-weight: 900; color: #ffd75e; }
                .gd-note { margin: 10px 0 0; font-size: 12px; line-height: 1.5; color: #ffd0a0; }

                .gd-done { padding: 18px; border-radius: 16px; background: rgba(255,215,94,0.08); border: 1px solid rgba(255,215,94,0.35); }
                .gd-done b { color: #ffe28a; font-size: 1.05rem; }
                .gd-done p { margin: 6px 0 12px; font-size: 13px; line-height: 1.6; color: #c9d1da; }
                .gd-done-links { display: flex; flex-wrap: wrap; gap: 8px; }

                .gd-chapters { display: grid; gap: 7px; margin-top: 18px; }
                .gd-ch { border-radius: 13px; overflow: hidden; background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.08); }
                .gd-ch.is-done { border-color: color-mix(in srgb, var(--tint) 40%, transparent); }
                .gd-ch.is-locked { opacity: 0.55; }
                .gd-ch-head { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 10px;
                    padding: 12px 14px; background: none; border: none; cursor: pointer; text-align: left; }
                .gd-ch-name { font-size: 0.95rem; font-weight: 900; color: color-mix(in srgb, var(--tint) 65%, white); }
                .gd-ch-meta { font-size: 11.5px; font-weight: 800; color: #9aa2ab; font-variant-numeric: tabular-nums; }
                .gd-ch.is-done .gd-ch-meta { color: color-mix(in srgb, var(--tint) 70%, white); }
                .gd-ch-body { padding: 0 14px 14px; }
                .gd-ch-blurb { margin: 0 0 10px; font-size: 12px; line-height: 1.5; color: #9aa2ab; }
                .gd-ch-gate { margin: 0; font-size: 12px; color: #7f8790; }

                .gd-steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
                .gd-step { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; align-items: start; gap: 10px;
                    padding: 10px 11px; border-radius: 11px; background: rgba(0,0,0,0.22); }
                .gd-tick { width: 16px; height: 16px; margin-top: 2px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.22); }
                .gd-step.is-done .gd-tick { border-color: color-mix(in srgb, var(--tint) 80%, white);
                    background: color-mix(in srgb, var(--tint) 80%, white); box-shadow: 0 0 10px -2px var(--tint); }
                .gd-step-body b { font-size: 13px; color: #e6ecf2; }
                .gd-step.is-done .gd-step-body b { color: #9aa2ab; }
                .gd-step-body p { margin: 3px 0 0; font-size: 11.5px; line-height: 1.5; color: #8f98a3; }
                .gd-step-go { flex: 0 0 auto; padding: 6px 13px; border-radius: 9px; font-size: 12px; font-weight: 900;
                    text-decoration: none; color: #201206; background: linear-gradient(180deg, #ffe08a, #ffb020); }
                .gd-step-pay { font-size: 11.5px; font-weight: 900; color: #6f7883; white-space: nowrap; }
                .gd-collect { width: 100%; margin-top: 11px; }

                .gd-flash { position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%); z-index: 200;
                    padding: 11px 20px; border-radius: 999px; font-weight: 900; color: #201206;
                    background: linear-gradient(180deg, #ffe08a, #ffb020); box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                    animation: gdFlash .3s cubic-bezier(.2,1.4,.35,1) both; }
                @keyframes gdFlash { from { opacity: 0; transform: translate(-50%, 12px) scale(.9); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } }
            `}</style>
        </section>
    );
}
