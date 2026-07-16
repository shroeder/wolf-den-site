import { VAPID_PUBLIC_KEY } from "@/lib/push/vapid.js";

// Client-side Web Push helpers: feature detection, subscribing the browser (permission prompt +
// PushManager), and syncing the subscription to the server. Safe to import in client components only.

export function isWebPushSupported() {
    return (
        typeof window !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window
    );
}

// The permission the browser currently holds: "default" (undecided), "granted", "denied", or
// "unsupported" when the APIs are missing.
export function pushPermission() {
    if (!isWebPushSupported()) return "unsupported";
    return Notification.permission;
}

// VAPID public key (base64url) → the Uint8Array applicationServerKey the browser expects.
function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i);
    return arr;
}

// Register the push service worker (idempotent — the browser dedupes by URL).
export async function registerPushServiceWorker() {
    if (!isWebPushSupported()) return null;
    return navigator.serviceWorker.register("/push-sw.js").catch(() => null);
}

// Is this browser currently subscribed (locally)? Doesn't hit the server.
export async function hasLocalSubscription() {
    if (!isWebPushSupported() || Notification.permission !== "granted") return false;
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription().catch(() => null);
    return Boolean(sub);
}

// Ask permission (if needed), subscribe, and POST the subscription to the server. If permission is
// already granted this re-syncs silently (no prompt). Returns { ok, reason? }.
export async function enableWebPush() {
    if (!isWebPushSupported()) return { ok: false, reason: "unsupported" };

    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, reason: permission };

    await registerPushServiceWorker();
    const reg = await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
        sub = await reg.pushManager
            .subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) })
            .catch(() => null);
    }
    if (!sub) return { ok: false, reason: "subscribe_failed" };

    const res = await fetch("/api/marketplace/push/web/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), userAgent: navigator.userAgent }),
    }).catch(() => null);

    if (!res || !res.ok) return { ok: false, reason: "server" };
    return { ok: true };
}

// Unsubscribe this browser and tell the server to forget it.
export async function disableWebPush() {
    if (!isWebPushSupported()) return { ok: true };
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
    if (sub) {
        await fetch("/api/marketplace/push/web/unsubscribe", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
    }
    return { ok: true };
}
