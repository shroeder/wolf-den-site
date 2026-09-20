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

// ── WHICH NOISE THE PHONE MAKES ──────────────────────────────────────────────────────────────────────────────
// Luke: a different sound per event and per size — trades and sales split four ways by value, plus a unique one
// for online orders.
//
// ⚠️ THE BANDS LIVE HERE AND NOWHERE ELSE. Each caller knows what happened and how much it was; none of them
// should know where $50 sits, or the day a threshold moves it will move in the trade route and not the sale
// one. Callers pass {kind, amountCents} and this decides.
//
// Edges stated so they cannot be misread: under $50 / $50 to under $100 / $100 to under $350 / $350 and over.
const SOUND_TIERS = [5000, 10000, 35000];

export function soundChannel(sound) {
    const kind = String(sound?.kind || "");
    if (kind === "order") return "wolfden_order_v1";
    if (kind !== "trade" && kind !== "sale") return "wolfden_admin_v3";
    const cents = Math.max(0, Math.trunc(Number(sound?.amountCents) || 0));
    // findIndex returns -1 when the amount is past every threshold, which IS the top tier.
    const i = SOUND_TIERS.findIndex((t) => cents < t);
    return `wolfden_${kind}_${i === -1 ? 4 : i + 1}_v1`;
}

/**
 * Send a push to the owner's admin devices. Best-effort: never throws — callers fire and forget.
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {string} [opts.route]  in-app route to deep-link to on tap (e.g. "shopOrders")
 * @param {Record<string,string|number>} [opts.data] extra data payload (stringified)
 * @param {string[]} [opts.channels] device channels to target (default ["full"]; e.g. ["full","employee"])
 * @param {{kind: "trade"|"sale"|"order", amountCents?: number}} [opts.sound] which alert sound to ring
 */
export async function sendAdminPush({ title, body, route = null, data = {}, channels = ["full"], sound = null }) {
    try {
        const messaging = await getMessaging();
        if (!messaging) {
            return { sent: 0, skipped: "not_configured" };
        }

        const rows = await db.query(
            `SELECT DISTINCT fcm_token, app_version
             FROM app_device
             WHERE channel = ANY($1)
               AND revoked = FALSE
               AND fcm_token IS NOT NULL
               AND fcm_token <> ''`,
            [channels]
        );

        const tokens = rows.map((r) => r.fcm_token).filter(Boolean);
        if (!tokens.length) {
            return { sent: 0, skipped: "no_devices" };
        }

        const stringData = { route: route ? String(route) : "" };
        for (const [key, value] of Object.entries(data || {})) {
            stringData[key] = value == null ? "" : String(value);
        }

        // ── ⚠️ THE CHANNEL IS CHOSEN PER DEVICE, AND IT HAS TO BE ────────────────────────────────────────
        // The custom alert chime lives on a NEW notification channel, because Android freezes a channel's
        // sound when it is first created and will never change it afterwards (see PushManager.kt). That
        // leaves a hazard: a push addressed to a channel a phone does not have is DROPPED by Android —
        // silently, with no error, no tray entry and nothing in any log we can see. So sending the new
        // channel id to a phone still on the old build does not merely lose the chime, it loses the alert.
        //
        // Flipping this constant by hand would have meant a window where exactly that was true, and a
        // handset that never updates (Eric's is four hundred builds behind) would have stayed broken for
        // good. Grouping by the version each device last reported removes the ordering problem entirely:
        // old phones keep the old channel, new phones get the chime, and each one moves over by itself the
        // moment it updates. Nothing to remember, nothing to sequence.
        // ⚠️ TWO GATES, BECAUSE TWO BUILDS ADDED CHANNELS. 652 brought the single chime, 655 the ten tiered
        // ones AND a quieter re-render of the chime — which, because a channel's sound is frozen at creation,
        // had to become _v3 rather than reuse _v2. A phone reports the build it is on; it gets the newest set
        // of channels that build actually has, and nothing newer.
        const CHIME_FROM_CODE = 652;              // wolfden_admin_v2
        const TIERS_FROM_CODE = 655;              // wolfden_admin_v3 + the nine tiered channels
        const versionCodeOf = (v) => {
            // "1.0.652" / "1.0.652-emp" -> 652. Anything unreadable counts as OLD, which is the safe way to
            // be wrong: the worst case is a missing chime, never a missing notification.
            const n = Number(String(v || "").split("-")[0].split(".").pop());
            return Number.isFinite(n) ? n : 0;
        };
        const byChannel = new Map();
        for (const r of rows) {
            if (!r.fcm_token) continue;
            const code = versionCodeOf(r.app_version);
            const id = code >= TIERS_FROM_CODE
                ? (sound ? soundChannel(sound) : "wolfden_admin_v3")
                : (code >= CHIME_FROM_CODE ? "wolfden_admin_v2" : "wolfden_admin");
            if (!byChannel.has(id)) byChannel.set(id, []);
            byChannel.get(id).push(r.fcm_token);
        }

        const batches = [];
        for (const [channelId, batchTokens] of byChannel) {
            batches.push(await messaging.sendEachForMulticast({
                tokens: batchTokens,
                notification: { title, body },
                data: stringData,
                android: {
                    priority: "high",
                    notification: { channelId },
                },
            }));
        }
        // Folded back into one result so everything downstream — the success count and the dead-token prune —
        // keeps working exactly as it did when this was a single send.
        const response = {
            successCount: batches.reduce((n, b) => n + b.successCount, 0),
            failureCount: batches.reduce((n, b) => n + b.failureCount, 0),
            responses: batches.flatMap((b) => b.responses),
        };
        const orderedTokens = [...byChannel.values()].flat();

        // Prune tokens FCM says are dead so we don't keep trying them.
        //
        // ⚠️ INDEXED AGAINST `orderedTokens`, NOT `tokens`. The responses are now the batches concatenated in
        // channel order, which is NOT the order `tokens` was built in — so indexing the old array would line
        // each verdict up against the wrong device and null out LIVE tokens while leaving the dead ones in
        // place. A phone silently stops receiving anything and nothing says why.
        if (response.failureCount > 0) {
            const dead = [];
            response.responses.forEach((r, i) => {
                const code = r.success ? "" : r.error?.code || "";
                if (
                    code.includes("registration-token-not-registered") ||
                    code.includes("invalid-registration-token") ||
                    code.includes("invalid-argument")
                ) {
                    dead.push(orderedTokens[i]);
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

/**
 * Send a push to a marketplace member's devices (all tokens in mkt_push_token for that buyer).
 * Best-effort: never throws. Shares the same FCM app + FIREBASE_SERVICE_ACCOUNT_JSON as admin push.
 * @param {string} buyerId  mkt_buyer id
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {string} [opts.route]  in-app route to deep-link on tap (e.g. "dm/<threadId>" or "friends")
 * @param {Record<string,string|number>} [opts.data]
 */
export async function sendBuyerPush(buyerId, { title, body, route = null, data = {} }) {
    try {
        if (!buyerId) return { sent: 0, skipped: "no_buyer" };
        const messaging = await getMessaging();
        if (!messaging) return { sent: 0, skipped: "not_configured" };

        const rows = await db.query(
            `SELECT token FROM mkt_push_token WHERE buyer_id = $1 AND token IS NOT NULL AND token <> ''`,
            [buyerId]
        );
        const tokens = rows.map((r) => r.token).filter(Boolean);
        if (!tokens.length) return { sent: 0, skipped: "no_devices" };

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
                notification: { channelId: "wolfden_market" },
            },
        });

        // Delete tokens FCM reports as permanently dead.
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
                await db.query(`DELETE FROM mkt_push_token WHERE token = ANY($1)`, [dead]);
            }
        }

        return { sent: response.successCount, failed: response.failureCount };
    } catch (error) {
        pushLogger.warn("push.buyer_send_failed", {
            errorMessage: error instanceof Error ? error.message : "unknown_error",
        });
        return { sent: 0, error: true };
    }
}

// Broadcast an FCM push to EVERY marketplace device (e.g. a boss release). Best-effort; prunes dead tokens.
export async function broadcastBuyerPushAll({ title, body, route = null, data = {} }) {
    try {
        const messaging = await getMessaging();
        if (!messaging) return { sent: 0, skipped: "not_configured" };
        const rows = await db.query(`SELECT DISTINCT token FROM mkt_push_token WHERE token IS NOT NULL AND token <> ''`);
        const tokens = rows.map((r) => r.token).filter(Boolean);
        if (!tokens.length) return { sent: 0, skipped: "no_devices" };
        const stringData = { route: route ? String(route) : "" };
        for (const [k, v] of Object.entries(data || {})) stringData[k] = v == null ? "" : String(v);
        let sent = 0;
        for (let i = 0; i < tokens.length; i += 500) {
            const batch = tokens.slice(i, i + 500);
            const resp = await messaging.sendEachForMulticast({
                tokens: batch,
                notification: { title, body },
                data: stringData,
                android: { priority: "high", notification: { channelId: "wolfden_market" } },
            });
            sent += resp.successCount;
            if (resp.failureCount > 0) {
                const dead = [];
                resp.responses.forEach((r, idx) => {
                    const code = r.success ? "" : r.error?.code || "";
                    if (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token") || code.includes("invalid-argument")) dead.push(batch[idx]);
                });
                if (dead.length) await db.query(`DELETE FROM mkt_push_token WHERE token = ANY($1)`, [dead]).catch(() => {});
            }
        }
        return { sent };
    } catch (error) {
        pushLogger.warn("push.broadcast_failed", { errorMessage: error instanceof Error ? error.message : "unknown_error" });
        return { sent: 0, error: true };
    }
}
