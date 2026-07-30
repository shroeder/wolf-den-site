"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { disableWebPush, enableWebPush, hasLocalSubscription, isWebPushSupported, pushPermission, registerPushServiceWorker } from "@/lib/web-push-client";

// A single-purpose landing for turning push ON. This is where the recap email's CTA points, so it has exactly
// one job and must work on first tap: the browser only allows requestPermission() inside a real user gesture,
// so there's a big button rather than anything automatic.
//
// It also has to be honest about iOS: Safari cannot do web push from a TAB at all, only from a Home-Screen
// install. Silently doing nothing there (which the site-wide prompt does) leaves iPhone members thinking the
// feature is broken.

const IOS_HELP = "iOS only allows notifications from an app on your Home Screen — not a browser tab.";

function iosNeedsInstall() {
    if (typeof navigator === "undefined" || typeof window === "undefined") return false;
    const ua = navigator.userAgent || "";
    const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = window.navigator.standalone === true || window.matchMedia?.("(display-mode: standalone)")?.matches;
    return isIos && !standalone;
}

const PERKS = [
    { icon: "🎁", text: "Someone sends you a pet or a trade offer" },
    { icon: "⚔️", text: "A raid hits the plaza (they only last minutes)" },
    { icon: "💰", text: "Your auction listing sells" },
    { icon: "🌾", text: "Your crops are ready to harvest" },
    { icon: "🏅", text: "You earn a badge or level up" },
];

export default function EnableNotificationsClient() {
    const [state, setState] = useState("loading"); // loading | on | off | blocked | ios | unsupported
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState(null);

    const detect = useCallback(async () => {
        if (iosNeedsInstall()) { setState("ios"); return; }
        if (!isWebPushSupported()) { setState("unsupported"); return; }
        if (pushPermission() === "denied") { setState("blocked"); return; }
        await registerPushServiceWorker().catch(() => {});
        const on = await Promise.race([
            hasLocalSubscription().catch(() => false),
            new Promise((res) => setTimeout(() => res(false), 3000)),
        ]);
        setState(on ? "on" : "off");
    }, []);

    useEffect(() => { detect(); }, [detect]);

    async function turnOn() {
        setBusy(true);
        setMsg(null);
        const res = await enableWebPush();
        setBusy(false);
        if (res.ok) {
            setState("on");
            setMsg("You're all set — we'll ping this device from now on.");
            return;
        }
        if (res.reason === "denied") {
            setState("blocked");
            return;
        }
        setMsg("That didn't go through. Try again, or check your browser's site settings.");
    }

    async function turnOff() {
        setBusy(true);
        await disableWebPush();
        setBusy(false);
        setState("off");
        setMsg(null);
    }

    return (
        <div className="enotif">
            <div className="enotif-hero">
                <div className="enotif-bell" aria-hidden="true">🔔</div>
                <h1 className="enotif-title">
                    {state === "on" ? "Notifications are on" : "Get pinged the moment it happens"}
                </h1>
                <p className="enotif-sub">
                    {state === "on"
                        ? "This device is subscribed. You can fine-tune exactly what reaches you below."
                        : "Most of what happens in the Den is time-sensitive. Without notifications you find out days later — or not at all."}
                </p>
            </div>

            {state !== "on" ? (
                <ul className="enotif-perks">
                    {PERKS.map((p) => (
                        <li key={p.text}><span aria-hidden="true">{p.icon}</span> {p.text}</li>
                    ))}
                </ul>
            ) : null}

            <div className="enotif-action">
                {state === "loading" ? <p className="muted" style={{ margin: 0 }}>Checking this device…</p> : null}

                {state === "off" ? (
                    <>
                        <button type="button" className="btn-gold enotif-cta" onClick={turnOn} disabled={busy}>
                            {busy ? "Turning on…" : "🔔 Turn on notifications"}
                        </button>
                        <p className="enotif-fine">Your browser will ask you to allow it. One tap, and you can turn any of it off later.</p>
                    </>
                ) : null}

                {state === "on" ? (
                    <button type="button" className="btn-ghost" onClick={turnOff} disabled={busy}>Turn off on this device</button>
                ) : null}

                {state === "blocked" ? (
                    <div className="enotif-note">
                        <strong>Notifications are blocked for this site.</strong>
                        <p>Your browser is refusing them, so we can&apos;t ask again from here. Open the padlock (or ⋮ → Site settings) next to the address bar, set Notifications to <em>Allow</em>, then reload this page.</p>
                    </div>
                ) : null}

                {state === "ios" ? (
                    <div className="enotif-note">
                        <strong>One extra step on iPhone &amp; iPad</strong>
                        <p>{IOS_HELP} Tap <em>Share</em> → <em>Add to Home Screen</em>, open the Wolf Den from that new icon, then come back here and tap Turn on.</p>
                    </div>
                ) : null}

                {state === "unsupported" ? (
                    <div className="enotif-note">
                        <strong>This browser can&apos;t do notifications.</strong>
                        <p>Try Chrome on Android or desktop. Everything still shows up in-app when you visit.</p>
                    </div>
                ) : null}

                {msg ? <p className="enotif-msg">{msg}</p> : null}
            </div>

            <p className="enotif-links">
                <Link href="/marketplace/profile">Fine-tune which notifications you get →</Link>
            </p>
        </div>
    );
}
