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
    const options = {
        body: payload.body || "",
        icon: "/logo/logo.png",
        badge: "/logo/logo.png",
        tag: payload.tag || undefined,
        renotify: Boolean(payload.tag),
        data: { url: payload.url || "/", ...(payload.data || {}) },
    };

    event.waitUntil(self.registration.showNotification(title, options));
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
