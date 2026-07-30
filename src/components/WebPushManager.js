"use client";

import { useEffect, useState } from "react";

import { enableWebPush, isWebPushSupported, registerPushServiceWorker } from "@/lib/web-push-client";

const SNOOZE_KEY = "wolfden-webpush-dismissed";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000; // don't re-ask for a week after "Not now"

// iOS Safari cannot do web push from a TAB — only from a Home-Screen install. Bailing out silently (what this
// used to do) means iPhone members are never asked and never told why, so they conclude it's broken.
function iosNeedsInstall() {
    if (typeof navigator === "undefined" || typeof window === "undefined") return false;
    const ua = navigator.userAgent || "";
    const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = window.navigator.standalone === true || window.matchMedia?.("(display-mode: standalone)")?.matches;
    return isIos && !standalone;
}

// Site-wide Web Push bootstrapper: registers the service worker, re-syncs an existing subscription, and
// (for signed-in members who haven't decided) shows a gentle one-time prompt to turn on notifications.
// Renders nothing until it decides to prompt.
export default function WebPushManager() {
    const [show, setShow] = useState(false);
    const [ios, setIos] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let alive = true;
        let timer = null;

        (async () => {
            const needsInstall = iosNeedsInstall();
            if (!needsInstall && !isWebPushSupported()) return;
            if (!needsInstall) await registerPushServiceWorker();

            // Only members can be targeted by a push, so only prompt when signed in.
            const r = await fetch("/api/marketplace/auth/me", { cache: "no-store" }).catch(() => null);
            const d = r && r.ok ? await r.json().catch(() => null) : null;
            if (!alive || !d?.buyer) return;

            const snoozed = Date.now() - Number(localStorage.getItem(SNOOZE_KEY) || 0) < SNOOZE_MS;

            // iPhone in a tab: there's no permission to request, so point them at the page that explains the
            // Home-Screen step instead of asking for something the browser can't grant.
            if (needsInstall) {
                if (snoozed) return;
                setIos(true);
                timer = setTimeout(() => alive && setShow(true), 4000);
                return;
            }

            const permission = Notification.permission;
            if (permission === "granted") {
                // Already allowed — make sure the server has a current subscription for this browser.
                enableWebPush().catch(() => {});
                return;
            }
            if (permission === "denied") return;
            if (snoozed) return;

            timer = setTimeout(() => alive && setShow(true), 4000); // let the page settle first
        })();

        return () => {
            alive = false;
            if (timer) clearTimeout(timer);
        };
    }, []);

    async function onEnable() {
        setBusy(true);
        const res = await enableWebPush();
        setBusy(false);
        setShow(false);
        // If they blocked it (or it failed), snooze so we don't nag on the next page.
        if (!res.ok) localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    }

    function onDismiss() {
        localStorage.setItem(SNOOZE_KEY, String(Date.now()));
        setShow(false);
    }

    if (!show) return null;

    return (
        <div className="webpush-prompt" role="dialog" aria-label="Turn on notifications">
            <div className="webpush-prompt-icon" aria-hidden="true">🔔</div>
            <div className="webpush-prompt-body">
                <strong>{ios ? "Get Den alerts on your iPhone" : "Turn on notifications"}</strong>
                <span>
                    {ios
                        ? "Add the Wolf Den to your Home Screen and iOS can ping you about trades, raids and rewards."
                        : "Get pinged about trade offers, messages, drop alerts, and rewards — right on this device."}
                </span>
            </div>
            <div className="webpush-prompt-actions">
                {ios ? (
                    <a href="/marketplace/notifications" className="btn-gold" onClick={onDismiss}>Show me how</a>
                ) : (
                    <button type="button" className="btn-gold" onClick={onEnable} disabled={busy}>
                        {busy ? "Enabling…" : "Enable"}
                    </button>
                )}
                <button type="button" className="btn-ghost" onClick={onDismiss} disabled={busy}>
                    Not now
                </button>
            </div>
        </div>
    );
}
