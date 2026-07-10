import "server-only";

import { db } from "@/lib/db";
import { createServerLogger } from "@/lib/server-logger";

// Push notifications to the owner's admin app via Firebase Cloud Messaging.
//
// Inert until FIREBASE_SERVICE_ACCOUNT_JSON is set (the server credential). With it absent, every
// call is a no-op so nothing breaks. firebase-admin is loaded lazily so the dependency + env only
// matter when push is actually configured.
//
// Targets FULL-channel (owner) devices that are not revoked and have registered an FCM token.

const pushLogger = createServerLogger({ source: "api", subsystem: "push" });

let messagingPromise = null;

export function isPushEnabled() {
    return Boolean(String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim());
}

// Parse the service-account JSON tolerantly. Pasting it into a dashboard env var can (a) add stray
// surrounding whitespace and (b) flatten the private_key's escaped "\n" into real newlines, which
// makes the JSON invalid. Repair both so a copy/paste hiccup doesn't silently kill push.
function parseServiceAccount(raw) {
    const trimmed = String(raw || "").trim();
    try {
        return JSON.parse(trimmed);
    } catch {
        // Re-escape any literal newlines that fell inside the private_key string, then retry.
        const repaired = trimmed.replace(
            /"private_key"\s*:\s*"([\s\S]*?)"\s*(,|\})/,
            (_m, key, tail) => `"private_key":"${key.replace(/\r?\n/g, "\\n")}"${tail}`
        );
        const creds = JSON.parse(repaired);
        return creds;
    }
}

async function getMessaging() {
    if (!isPushEnabled()) {
        return null;
    }

    if (!messagingPromise) {
        messagingPromise = (async () => {
            const { initializeApp, getApps, cert } = await import("firebase-admin/app");
            const { getMessaging } = await import("firebase-admin/messaging");

            const creds = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
            const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(creds) });

            return getMessaging(app);
        })().catch((error) => {
            // Reset so a later call can retry (e.g. bad env fixed without a redeploy of this module).
            messagingPromise = null;
            pushLogger.warn("push.init_failed", {
                errorMessage: error instanceof Error ? error.message : "unknown_error",
            });
            return null;
        });
    }

    return messagingPromise;
}

/**
 * Send a push to the owner's admin devices. Best-effort: never throws — callers fire and forget.
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {string} [opts.route]  in-app route to deep-link to on tap (e.g. "shopOrders")
 * @param {Record<string,string|number>} [opts.data] extra data payload (stringified)
 */
export async function sendAdminPush({ title, body, route = null, data = {} }) {
    try {
        const messaging = await getMessaging();
        if (!messaging) {
            return { sent: 0, skipped: "not_configured" };
        }

        const rows = await db.query(
            `SELECT DISTINCT fcm_token
             FROM app_device
             WHERE channel = 'full'
               AND revoked = FALSE
               AND fcm_token IS NOT NULL
               AND fcm_token <> ''`
        );

        const tokens = rows.map((r) => r.fcm_token).filter(Boolean);
        if (!tokens.length) {
            return { sent: 0, skipped: "no_devices" };
        }

        const stringData = { route: route ? String(route) : "" };
        for (const [key, value] of Object.entries(data || {})) {
            stringData[key] = value == null ? "" : String(value);
        }

        const response = await messaging.sendEachForMulticast({
            tokens,
            notification: { title, body },
            data: stringData,
            android: {
                priority: "high",
                notification: { channelId: "wolfden_admin" },
            },
        });

        // Prune tokens FCM says are dead so we don't keep trying them.
        if (response.failureCount > 0) {
            const dead = [];
            response.responses.forEach((r, i) => {
                const code = r.success ? "" : r.error?.code || "";
                if (
                    code.includes("registration-token-not-registered") ||
                    code.includes("invalid-registration-token") ||
                    code.includes("invalid-argument")
                ) {
                    dead.push(tokens[i]);
                }
            });

            if (dead.length) {
                await db.query(`UPDATE app_device SET fcm_token = NULL WHERE fcm_token = ANY($1)`, [dead]);
            }
        }

        return { sent: response.successCount, failed: response.failureCount };
    } catch (error) {
        pushLogger.warn("push.send_failed", {
            errorMessage: error instanceof Error ? error.message : "unknown_error",
        });
        return { sent: 0, error: true };
    }
}
