import "server-only";

import { createServerLogger } from "@/lib/server-logger";

const log = createServerLogger({ source: "api", subsystem: "discord-channels" });

// ── Where does a Discord message actually go? ────────────────────────────────────────────────────────────────
//
// Every game broadcast resolved its channel as:
//
//     process.env.DISCORD_MARKETPLACE_WEBHOOK_URL || process.env.DISCORD_NEW_ARRIVALS_WEBHOOK_URL
//
// repeated at five call sites. DISCORD_MARKETPLACE_WEBHOOK_URL was never set in production, so every boss
// drop, every quest and every announcement quietly fell through to the NEW ARRIVALS webhook — the restocks
// feed — and looked, from the code's point of view, like it had worked. That's the bug: "not configured" and
// "configured to the restocks channel" produced identical, silent success.
//
// Game traffic no longer falls back to restocks. Restocks is a shopping feed people subscribe to for stock
// alerts; burying "@here a new boss just dropped" in it is noise for them and invisible for everyone else.
// If the den channel isn't configured we log loudly and send nothing, because a missing message you can find
// in the logs beats a message delivered to the wrong room.

/** The den / quests channel — boss drops, quests, sailing, member announcements. */
export function denWebhook() {
    const url = process.env.DISCORD_DEN_WEBHOOK_URL || process.env.DISCORD_MARKETPLACE_WEBHOOK_URL || null;
    if (!url) {
        log.warn({
            event: "discord.den_webhook.missing",
            step: "webhook_not_configured",
            detail: "Set DISCORD_DEN_WEBHOOK_URL to the #den-quests channel webhook. Game messages are NOT being sent (they are no longer falling back to the restocks feed).",
        });
    }
    return url;
}

/** The restocks / new-arrivals shopping feed. Stock alerts ONLY — never game traffic. */
export function restocksWebhook() {
    return process.env.DISCORD_NEW_ARRIVALS_WEBHOOK_URL || null;
}

/**
 * PRIVATE ops channel — marketplace leads and sell offers.
 *
 * These are not game messages and they are not shopping messages: they carry a real customer's NAME, EMAIL
 * ADDRESS and what they said. They were going to the new-arrivals webhook, which is a public feed members
 * subscribe to, and sending them to the den channel instead would only trade one public room for another.
 *
 * There is deliberately NO fallback to a public webhook. If this isn't configured the message is dropped and
 * logged, because silently posting a customer's email address to 74 people is worse than not posting at all.
 */
export function opsWebhook() {
    const url = process.env.DISCORD_OPS_WEBHOOK_URL || null;
    if (!url) {
        log.warn({
            event: "discord.ops_webhook.missing",
            step: "webhook_not_configured",
            detail: "Set DISCORD_OPS_WEBHOOK_URL to a PRIVATE admin channel. Lead/offer notifications contain customer email addresses and are being dropped rather than posted publicly.",
        });
    }
    return url;
}
