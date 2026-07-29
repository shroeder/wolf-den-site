/* The Wolf Den — Web Push service worker.
   Receives push messages from the browser's push service and shows a notification even when no tab is
   open. On click, focuses an existing Wolf Den tab (navigating it to the target) or opens a new one. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
    let payload = {};
    try {
        payload = event.data ? event.data.json() : {};
    } catch (e) {
        payload = { title: "The Wolf Den", body: event.data ? event.data.text() : "" };
    }

    const title = payload.title || "The Wolf Den";
    const targetUrl = payload.url || "/";
    const options = {
        body: payload.body || "",
        icon: "/logo/logo.png",
        badge: "/logo/logo.png",
        tag: payload.tag || undefined,
        renotify: Boolean(payload.tag),
        data: { url: targetUrl, ...(payload.data || {}) },
    };

    event.waitUntil(
        (async () => {
            // Don't buzz for a DM you're already reading — if a VISIBLE tab is on that exact conversation, skip it.
            if (payload.data && payload.data.type === "dm") {
                try {
                    const targetPath = new URL(targetUrl, self.location.origin).pathname;
                    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
                    const alreadyReading = wins.some((c) => {
                        try { return c.visibilityState === "visible" && new URL(c.url).pathname === targetPath; } catch (e) { return false; }
                    });
                    if (alreadyReading) return; // suppress the notification
                } catch (e) { /* fall through and notify */ }
            }
            await self.registration.showNotification(title, options);
        })()
    );
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const target = (event.notification.data && event.notification.data.url) || "/";

    event.waitUntil(
        (async () => {
            const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
            for (const client of windows) {
                // Reuse a tab already on our origin.
                if (client.url && new URL(client.url).origin === self.location.origin) {
                    await client.focus();
                    if ("navigate" in client && target) {
                        client.navigate(target).catch(() => {});
                    }
                    return;
                }
            }
            if (self.clients.openWindow) await self.clients.openWindow(target);
        })()
    );
});
