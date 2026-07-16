"use client";

import { useEffect, useState } from "react";

import { disableWebPush, enableWebPush, hasLocalSubscription, isWebPushSupported, pushPermission } from "@/lib/web-push-client";

// An explicit on/off control for browser notifications, for the account hub. Reflects the real browser
// permission + subscription state and lets a member turn it on or off on this device.
export default function WebPushToggle() {
    const [state, setState] = useState("loading"); // loading | unsupported | on | off | blocked
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let alive = true;
        (async () => {
            if (!isWebPushSupported()) {
                if (alive) setState("unsupported");
                return;
            }
            const perm = pushPermission();
            if (perm === "denied") {
                if (alive) setState("blocked");
                return;
            }
            const on = await hasLocalSubscription();
            if (alive) setState(on ? "on" : "off");
        })();
        return () => {
            alive = false;
        };
    }, []);

    async function turnOn() {
        setBusy(true);
        const res = await enableWebPush();
        setBusy(false);
        setState(res.ok ? "on" : res.reason === "denied" ? "blocked" : "off");
    }

    async function turnOff() {
        setBusy(true);
        await disableWebPush();
        setBusy(false);
        setState("off");
    }

    if (state === "loading") return null;

    return (
        <div className="webpush-toggle">
            <div>
                <strong>🔔 Browser notifications</strong>
                <span className="secondary">
                    {state === "unsupported" && "This browser can't show push notifications."}
                    {state === "blocked" && "Blocked in your browser settings — re-allow notifications for this site to turn on."}
                    {state === "on" && "On for this device — messages, drop alerts & rewards."}
                    {state === "off" && "Get pinged on this device about messages, drop alerts & rewards."}
                </span>
            </div>
            {state === "on" ? (
                <button type="button" className="btn-ghost" onClick={turnOff} disabled={busy}>
                    {busy ? "…" : "Turn off"}
                </button>
            ) : state === "off" ? (
                <button type="button" className="btn-gold" onClick={turnOn} disabled={busy}>
                    {busy ? "Enabling…" : "Turn on"}
                </button>
            ) : null}
        </div>
    );
}
