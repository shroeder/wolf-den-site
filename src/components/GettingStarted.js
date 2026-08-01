"use client";

import { useCallback, useEffect, useState } from "react";

import { enableWebPush, isWebPushSupported } from "@/lib/web-push-client";

// "Getting started" — a first-week ramp, not a permissions prompt. Two kinds of row:
//
//   The two SETUP rows have a button. Clicking one triggers the real browser permission prompt and only a
//   genuine grant claims the reward.
//
//   Every other row is VERIFIED SERVER-SIDE from what the member actually did and pays out on its own, so it
//   has no button — just the gold it's worth. Play the game and the list ticks itself off.
//
// Hides itself once every task is claimed (or when dismissed).
// iOS Safari only allows web push from an app added to the Home Screen (a standalone PWA) — never a plain tab.
function iosNeedsInstall() {
    if (typeof navigator === "undefined" || typeof window === "undefined") return false;
    const ua = navigator.userAgent || "";
    const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = window.navigator.standalone === true || window.matchMedia?.("(display-mode: standalone)")?.matches;
    return isIos && !standalone;
}

export default function GettingStarted() {
    const [tasks, setTasks] = useState(null);
    const [busy, setBusy] = useState(null);
    const [hidden, setHidden] = useState(false);
    const [flash, setFlash] = useState(null);
    const [note, setNote] = useState(null); // helpful guidance when a permission can't be granted (esp. iPhone)

    useEffect(() => {
        let alive = true;
        fetch("/api/marketplace/onboarding", { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => { if (alive && d?.tasks) setTasks(d.tasks); })
            .catch(() => {});
        return () => { alive = false; };
    }, []);

    const claim = useCallback(async (key) => {
        const r = await fetch("/api/marketplace/onboarding", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key }) }).then((x) => x.json()).catch(() => null);
        if (r?.tasks) setTasks(r.tasks);
        if (r?.ok && r.gold) { setFlash(`+${r.gold} 🪙`); setTimeout(() => setFlash(null), 1800); }
        return r;
    }, []);

    const doTask = useCallback(async (key) => {
        setBusy(key);
        setNote(null);
        try {
            let ok = false;
            let msg = null;
            if (key === "notifications") {
                const hasNotif = typeof Notification !== "undefined" && typeof Notification.requestPermission === "function";
                if (hasNotif) {
                    // FORCE the native prompt right here in the click gesture (browsers block it after awaits).
                    let permission = Notification.permission;
                    if (permission === "default") permission = await Notification.requestPermission();
                    if (permission === "granted") {
                        if (isWebPushSupported()) await enableWebPush().catch(() => {}); // subscribe now that we're allowed
                        ok = true;
                    } else {
                        msg = "Notifications are blocked for this site — turn them back on in your browser's site settings, then tap Enable.";
                    }
                } else {
                    // No Notification API at all → an iOS Safari TAB (needs the Home-Screen app) or an unsupported browser.
                    msg = iosNeedsInstall()
                        ? "On iPhone, add the Wolf Den to your Home Screen (Share → “Add to Home Screen”), open it from that icon, then tap Enable."
                        : "This browser doesn't support notifications — try Chrome.";
                }
            } else if (key === "location") {
                if (typeof navigator === "undefined" || !navigator.geolocation) {
                    msg = "This browser can't share your location.";
                } else {
                    // getCurrentPosition forces the native location prompt when it's undecided.
                    ok = await new Promise((resolve) => {
                        navigator.geolocation.getCurrentPosition(() => resolve(true), () => resolve(false), { timeout: 15000, maximumAge: 600000 });
                    });
                    if (!ok) msg = "Location wasn't shared — allow it when your browser asks (or enable it for this site in settings), then tap Enable.";
                }
            }
            if (ok) await claim(key);
            else if (msg) setNote(msg);
        } finally { setBusy(null); }
    }, [claim]);

    if (!tasks || hidden) return null;
    if (tasks.every((t) => t.claimed)) return null; // all done → gone
    const bonusLeft = tasks.reduce((s, t) => s + (t.claimed ? 0 : t.gold), 0);
    const done = tasks.filter((t) => t.claimed).length;

    return (
        <section className="card getting-started">
            <div className="gs-head">
                <b>✨ Getting started</b>
                {flash ? <span className="gs-flash">{flash}</span> : null}
                <button type="button" onClick={() => setHidden(true)} aria-label="Dismiss" className="gs-x">×</button>
            </div>
            <p className="gs-sub">
                <b>{done}/{tasks.length}</b> done · <b>{bonusLeft.toLocaleString()} 🪙</b> still on the table.
            </p>
            {/* A progress bar, because this is now a first-week ramp rather than two taps — you should be able to
                see how far in you are without counting rows. */}
            <div className="gs-track" aria-hidden="true"><span style={{ width: `${tasks.length ? (done / tasks.length) * 100 : 0}%` }} /></div>
            {tasks.map((t) => (
                <div key={t.key} className={`gs-row${t.claimed ? " is-done" : ""}`}>
                    <span className="gs-ico" aria-hidden="true">{t.icon}</span>
                    <div className="gs-body">
                        <b>{t.label}</b>
                        <span>{t.desc}</span>
                    </div>
                    {/* `auto` tasks have no button on purpose: they're verified from what you actually did and
                        pay out on their own. A "claim" button on something already earned is just a chore. */}
                    {t.claimed
                        ? <span className="gs-claimed">✓ +{t.gold}</span>
                        : t.auto
                            ? <span className="gs-pending">+{t.gold} 🪙</span>
                            : <button type="button" className="gs-btn" disabled={busy === t.key} onClick={() => doTask(t.key)}>{busy === t.key ? "…" : `Enable · +${t.gold}`}</button>}
                </div>
            ))}
            {note ? <p className="gs-note">💡 {note}</p> : null}
            <style>{`
                .getting-started { border-color: rgba(255,215,94,0.35); background: linear-gradient(180deg, rgba(255,215,94,0.08), rgba(255,255,255,0.015) 55%); }
                .gs-head { display: flex; align-items: center; gap: 8px; }
                .gs-head > b { font-size: 14px; color: #ffe08a; letter-spacing: 0.02em; }
                .gs-flash { font-size: 12px; font-weight: 900; color: #ffd75e; animation: fdPop .4s cubic-bezier(.2,1.3,.3,1) both; }
                .gs-track { height: 6px; border-radius: 999px; background: rgba(255,255,255,0.08); overflow: hidden; margin: 0 0 10px; }
                .gs-track > span { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, #ffd75e, #ffb347); transition: width .45s ease; }
                .gs-pending { font-size: 12px; font-weight: 900; color: #9c8f7a; white-space: nowrap; }
                .gs-x { margin-left: auto; background: none; border: none; color: #b9a892; font-size: 20px; line-height: 1; cursor: pointer; padding: 0 2px; }
                .gs-sub { margin: 3px 0 10px; font-size: 12px; color: #cbb99a; }
                .gs-sub b { color: #ffcf7a; }
                .gs-row { display: flex; align-items: center; gap: 11px; padding: 9px 0; border-top: 1px solid rgba(255,255,255,0.06); }
                .gs-row:first-of-type { border-top: none; }
                .gs-row.is-done { opacity: 0.6; }
                .gs-ico { font-size: 20px; flex: none; width: 26px; text-align: center; }
                .gs-body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
                .gs-body > b { font-size: 13.5px; color: #f2ead9; }
                .gs-body > span { font-size: 11.5px; color: #a99d88; }
                .gs-btn { flex: none; padding: 8px 14px; border-radius: 10px; font-weight: 900; font-size: 12.5px; cursor: pointer; border: none; color: #2a1000; background: linear-gradient(180deg,#ffe488,#f3b23a); box-shadow: 0 2px 0 #b57f22; }
                .gs-btn:disabled { opacity: 0.6; cursor: default; }
                .gs-claimed { flex: none; font-size: 12px; font-weight: 800; color: #8fe3a1; }
                .gs-note { margin: 8px 2px 0; font-size: 12px; line-height: 1.4; color: #ffd9a0; background: rgba(255,180,90,0.1); border: 1px solid rgba(255,180,90,0.25); border-radius: 10px; padding: 8px 10px; }
                @keyframes fdPop { from { opacity: 0; transform: scale(.85); } to { opacity: 1; transform: scale(1); } }
            `}</style>
        </section>
    );
}
