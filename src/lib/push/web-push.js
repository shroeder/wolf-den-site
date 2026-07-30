import "server-only";

import { db } from "@/lib/db";
import { memberAllows } from "@/lib/marketplace/notify-prefs.js";
import { VAPID_PUBLIC_KEY } from "@/lib/push/vapid.js";
import { createServerLogger } from "@/lib/server-logger";

// Browser Web Push (VAPID) — the website counterpart to sendBuyerPush (which targets phone-app FCM
// tokens). Sends encrypted payloads to a member's subscribed browsers via their push service. Inert
// until VAPID_PRIVATE_KEY is set, so nothing breaks before it's configured. The web-push dependency is
// imported lazily so it only loads when push is actually in use.

const logger = createServerLogger({ source: "api", subsystem: "web-push" });

let webpushPromise = null;

export function isWebPushEnabled() {
    return Boolean(String(process.env.VAPID_PRIVATE_KEY || "").trim());
}

async function getWebPush() {
    if (!isWebPushEnabled()) return null;
    if (!webpushPromise) {
        webpushPromise = (async () => {
            const mod = await import("web-push");
            const wp = mod.default || mod;
            const subject = String(process.env.VAPID_SUBJECT || "mailto:luke@wolfdengamingmn.com").trim();
            wp.setVapidDetails(subject, VAPID_PUBLIC_KEY, String(process.env.VAPID_PRIVATE_KEY).trim());
            return wp;
        })().catch((error) => {
            webpushPromise = null; // let a later call retry (e.g. a fixed env without a code redeploy)
            logger.warn("web_push.init_failed", { errorMessage: error instanceof Error ? error.message : "unknown_error" });
            return null;
        });
    }
    return webpushPromise;
}

/**
 * Send a browser push to every web subscription a member has. Best-effort: never throws — callers fire
 * and forget. Prunes subscriptions the push service reports as gone (404/410).
 * @param {string} buyerId  mkt_buyer id
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {string} [opts.url]   path to open on click (e.g. "/marketplace/messages")
 * @param {string} [opts.tag]   collapse key — a newer push with the same tag replaces the old one
 * @param {string} [opts.kind]  notification kind from NOTIFY_KINDS — when given, the member's per-kind
 *                              preference is honoured. Omit only for transactional/one-off sends.
 * @param {Record<string, unknown>} [opts.data]
 */
export async function sendWebPush(buyerId, { title, body, url = "/", tag = null, kind = null, data = {} }) {
    try {
        if (!buyerId) return { sent: 0, skipped: "no_buyer" };
        // Preference check BEFORE anything else — a muted kind should cost nothing.
        if (kind && !(await memberAllows(buyerId, "push", kind))) return { sent: 0, skipped: "opted_out" };
        const wp = await getWebPush();
        if (!wp) return { sent: 0, skipped: "not_configured" };

        const rows = await db.query(`SELECT endpoint, p256dh, auth FROM mkt_web_push WHERE buyer_id = $1`, [buyerId]).catch(() => []);
        if (!rows.length) return { sent: 0, skipped: "no_subs" };

        const payload = JSON.stringify({ title, body, url, tag: tag || undefined, data });
        const dead = [];
        const failed = [];
        let sent = 0;

        await Promise.all(
            rows.map(async (r) => {
                const subscription = { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } };
                try {
                    await wp.sendNotification(subscription, payload, { TTL: 600, urgency: "high" });
                    sent += 1;
                } catch (err) {
                    const code = err?.statusCode;
                    if (code === 404 || code === 410) dead.push(r.endpoint); // subscription is permanently gone
                    // Anything else (403 VAPID mismatch, 413 too large, 429, 5xx) used to vanish here without a
                    // trace, which is how a member with a live subscription silently received nothing for days.
                    // Not pruned — the subscription may be fine and the failure ours — but never again silent.
                    else failed.push({ code: code || "unknown", host: String(r.endpoint || "").split("/")[2] || "?" });
                }
            })
        );

        if (dead.length) await db.query(`DELETE FROM mkt_web_push WHERE endpoint = ANY($1)`, [dead]).catch(() => {});
        if (sent > 0) await db.query(`UPDATE mkt_web_push SET last_used_at = NOW() WHERE buyer_id = $1`, [buyerId]).catch(() => {});
        if (failed.length) logger.warn("web_push.delivery_failed", { buyerId, kind, attempted: rows.length, sent, failures: failed });

        return { sent, pruned: dead.length, failed: failed.length };
    } catch (error) {
        logger.warn("web_push.send_failed", { errorMessage: error instanceof Error ? error.message : "unknown_error" });
        return { sent: 0, error: true };
    }
}

// Broadcast a web push to EVERY subscribed browser (e.g. a boss release). Best-effort; prunes dead subs.
// A `kind` filters out members who muted that kind — done in SQL so a muted member is never even contacted.
export async function broadcastWebPush({ title, body, url = "/", tag = null, kind = null, data = {} }) {
    try {
        const wp = await getWebPush();
        if (!wp) return { sent: 0, skipped: "not_configured" };
        // An absent prefs key means ON, so COALESCE(...) IS NOT FALSE keeps everyone who hasn't opted out.
        const rows = kind
            ? await db.query(
                `SELECT w.endpoint, w.p256dh, w.auth FROM mkt_web_push w
                   LEFT JOIN mkt_buyer b ON b.id = w.buyer_id
                  WHERE COALESCE((b.notify_prefs ->> $1)::boolean, TRUE) IS NOT FALSE`,
                [`push:${kind}`]
            ).catch(() => [])
            : await db.query(`SELECT endpoint, p256dh, auth FROM mkt_web_push`).catch(() => []);
        if (!rows.length) return { sent: 0, skipped: "no_subs" };
        const payload = JSON.stringify({ title, body, url, tag: tag || undefined, data });
        const dead = [];
        let sent = 0;
        await Promise.all(
            rows.map(async (r) => {
                try {
                    await wp.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, payload, { TTL: 3600, urgency: "high" });
                    sent += 1;
                } catch (err) {
                    const c = err?.statusCode;
                    if (c === 404 || c === 410) dead.push(r.endpoint);
                }
            })
        );
        if (dead.length) await db.query(`DELETE FROM mkt_web_push WHERE endpoint = ANY($1)`, [dead]).catch(() => {});
        return { sent, pruned: dead.length };
    } catch (error) {
        logger.warn("web_push.broadcast_failed", { errorMessage: error instanceof Error ? error.message : "unknown_error" });
        return { sent: 0, error: true };
    }
}
