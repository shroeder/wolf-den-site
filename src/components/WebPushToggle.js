"use client";

import { useEffect, useState } from "react";

import { disableWebPush, enableWebPush, hasLocalSubscription, isWebPushSupported, pushPermission } from "@/lib/web-push-client";

// An explicit on/off control for browser notifications, for the account hub. Reflects the real browser
// permission + subscription state and lets a member turn it on or off on this device.
export default function WebPushToggle() {
    const [state, setState] = useState("loading"); // loading | unsupported | on | off | blocked
    const [busy, setBusy] = useState(false);
    const [testMsg, setTestMsg] = useState("");

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

    async function sendTest() {
        setBusy(true);
        setTestMsg("Sending…");
        // Make sure THIS browser's subscription is current on the server first (heals a rotated key), then fire.
        await enableWebPush().catch(() => {});
        const r = await fetch("/api/marketplace/push/web/test", { method: "POST" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        setBusy(false);
        if (!d) setTestMsg("Couldn't reach the server — try again.");
        else if (d.reason === "not_configured") setTestMsg("Server push isn't switched on yet (VAPID key missing).");
        else if (d.skipped === "no_subs") setTestMsg("This device isn't subscribed — toggle off then on.");
        else if ((d.sent || 0) > 0) setTestMsg(`Sent ✓ — a notification should appear${d.pruned ? ` (cleaned ${d.pruned} dead)` : ""}.`);
        else setTestMsg("Sent to 0 devices — the subscription may be stale; toggle off then on.");
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
                <div className="webpush-toggle-actions">
                    <button type="button" className="btn-ghost" onClick={sendTest} disabled={busy}>
                        {busy ? "…" : "Send test"}
                    </button>
                    <button type="button" className="btn-ghost" onClick={turnOff} disabled={busy}>
                        Turn off
                    </button>
                </div>
            ) : state === "off" ? (
                <button type="button" className="btn-gold" onClick={turnOn} disabled={busy}>
                    {busy ? "Enabling…" : "Turn on"}
                </button>
            ) : null}
            {testMsg ? <span className="webpush-test-msg secondary">{testMsg}</span> : null}
        </div>
    );
}
