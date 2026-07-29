"use client";

import { useCallback, useEffect, useState } from "react";

import { enableWebPush, isWebPushSupported, pushPermission } from "@/lib/web-push-client";

// First-visit "Getting started" card: enable notifications + location, each granting gold once. Hides itself
// once every task is claimed (or when dismissed). Clicking a task triggers the real browser permission prompt,
// and only on a genuine grant does it claim the reward.
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
                if (iosNeedsInstall()) {
                    msg = "On iPhone: tap the Share button → “Add to Home Screen,” open the Wolf Den from that icon, then tap Enable again.";
                } else if (isWebPushSupported()) {
                    const res = await enableWebPush();
                    ok = Boolean(res?.ok) || pushPermission() === "granted";
                    if (!ok) msg = pushPermission() === "denied" ? "Notifications are blocked — turn them back on for this site in your browser settings." : "Couldn't turn on notifications on this device.";
                } else if (typeof Notification !== "undefined") {
                    ok = (await Notification.requestPermission()) === "granted";
                    if (!ok) msg = "You'll need to allow notifications when your browser asks.";
                } else {
                    msg = "This browser doesn't support notifications. Try Chrome, or add the site to your Home Screen on iPhone.";
                }
            } else if (key === "location") {
                if (typeof navigator === "undefined" || !navigator.geolocation) {
                    msg = "This browser can't share your location.";
                } else {
                    ok = await new Promise((resolve) => {
                        navigator.geolocation.getCurrentPosition(() => resolve(true), () => resolve(false), { timeout: 15000, maximumAge: 600000 });
                    });
                    if (!ok) msg = "Location wasn't shared — allow it when prompted (or turn it on for this site) and tap Enable again.";
                }
            }
            if (ok) await claim(key);
            else if (msg) setNote(msg);
        } finally { setBusy(null); }
    }, [claim]);

    if (!tasks || hidden) return null;
    if (tasks.every((t) => t.claimed)) return null; // all done → gone
    const bonusLeft = tasks.reduce((s, t) => s + (t.claimed ? 0 : t.gold), 0);

    return (
        <section className="card getting-started">
            <div className="gs-head">
                <b>✨ Getting started</b>
                {flash ? <span className="gs-flash">{flash}</span> : null}
                <button type="button" onClick={() => setHidden(true)} aria-label="Dismiss" className="gs-x">×</button>
            </div>
            <p className="gs-sub">Two quick taps — grab <b>{bonusLeft.toLocaleString()} 🪙</b> in setup bonuses.</p>
            {tasks.map((t) => (
                <div key={t.key} className={`gs-row${t.claimed ? " is-done" : ""}`}>
                    <span className="gs-ico" aria-hidden="true">{t.icon}</span>
                    <div className="gs-body">
                        <b>{t.label}</b>
                        <span>{t.desc}</span>
                    </div>
                    {t.claimed
                        ? <span className="gs-claimed">✓ +{t.gold}</span>
                        : <button type="button" className="gs-btn" disabled={busy === t.key} onClick={() => doTask(t.key)}>{busy === t.key ? "…" : `Enable · +${t.gold}`}</button>}
                </div>
            ))}
            {note ? <p className="gs-note">💡 {note}</p> : null}
            <style>{`
                .getting-started { border-color: rgba(255,215,94,0.35); background: linear-gradient(180deg, rgba(255,215,94,0.08), rgba(255,255,255,0.015) 55%); }
                .gs-head { display: flex; align-items: center; gap: 8px; }
                .gs-head > b { font-size: 14px; color: #ffe08a; letter-spacing: 0.02em; }
                .gs-flash { font-size: 12px; font-weight: 900; color: #ffd75e; animation: fdPop .4s cubic-bezier(.2,1.3,.3,1) both; }
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
