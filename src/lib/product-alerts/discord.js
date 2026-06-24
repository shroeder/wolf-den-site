import "server-only";

import { db } from "@/lib/db";
import { createServerLogger } from "@/lib/server-logger";
import { SITE_URL } from "@/lib/site";

const discordLogger = createServerLogger({ source: "job", subsystem: "product-alerts-discord" });

// Wolf Den gold, as a Discord embed color integer (0xD4AF37).
const EMBED_COLOR = 0xd4af37;
// Discord allows at most 10 embeds per webhook message.
const MAX_EMBEDS_PER_MESSAGE = 10;
// Only broadcast recent arrivals. Anything older that's still unposted is suppressed rather than
// flooded — this bounds the blast radius if the webhook is configured days after arrivals began
// accumulating (or after an outage).
const LOOKBACK_HOURS = 48;

function baseUrl() {
    return process.env.NEXT_PUBLIC_BASE_URL || SITE_URL;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * POST one webhook message, honoring a single 429 rate-limit retry. Throws on non-2xx so the
 * caller can stop and leave the arrivals unmarked for the next run.
 */
async function postMessage(webhookUrl, message) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await fetch(webhookUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(message),
        });

        if (response.status === 429) {
            const payload = await response.json().catch(() => null);
            const retryAfterMs = Math.min(Math.ceil((Number(payload?.retry_after) || 1) * 1000), 5000);

            await sleep(retryAfterMs);
            continue;
        }

        if (!response.ok) {
            const text = await response.text().catch(() => "");

            throw new Error(`Discord webhook returned ${response.status}: ${text.slice(0, 200)}`);
        }

        return;
    }

    throw new Error("Discord webhook rate-limited after retry.");
}

function buildEmbed(arrival) {
    const isRestock = arrival.kind === "restock";
    const verb = isRestock ? "Back in stock" : "New";
    const embed = {
        title: arrival.item_name,
        url: new URL("/shop", baseUrl()).toString(),
        description: `${verb} in **${arrival.categoryNames.join(", ")}**`,
        color: EMBED_COLOR,
    };

    if (arrival.image_url) {
        embed.thumbnail = { url: arrival.image_url };
    }

    return embed;
}

/**
 * Broadcast recent un-posted arrivals to the Discord #new-arrivals channel as rich embeds, one per
 * product (deduped across categories). No-op when the webhook URL isn't configured. Idempotent:
 * each arrival is marked posted once sent, so re-running sends nothing new.
 */
export async function postNewArrivalsToDiscord() {
    const webhookUrl = process.env.DISCORD_NEW_ARRIVALS_WEBHOOK_URL;

    if (!webhookUrl) {
        discordLogger.info("product_alerts.discord.skipped", { reason: "not_configured" });

        return { posted: 0, suppressed: 0, skipped: true };
    }

    const rows = await db.query(
        `SELECT a.id, a.variation_id, a.item_name, a.kind, a.image_url, a.created_at, cat.name AS category_name
         FROM product_alert_arrivals a
         JOIN product_alert_categories cat ON cat.square_category_id = a.square_category_id
         WHERE a.discord_posted_at IS NULL
           AND a.created_at > NOW() - ($1 || ' hours')::interval
         ORDER BY a.created_at ASC, a.item_name ASC`,
        [String(LOOKBACK_HOURS)]
    );

    // Suppress (mark posted without sending) anything older than the lookback so it never floods later.
    const suppressed = await db.query(
        `UPDATE product_alert_arrivals
         SET discord_posted_at = NOW()
         WHERE discord_posted_at IS NULL
           AND created_at <= NOW() - ($1 || ' hours')::interval
         RETURNING id`,
        [String(LOOKBACK_HOURS)]
    );

    if (!rows.length) {
        discordLogger.info("product_alerts.discord.nothing_to_post", { suppressed: suppressed.length });

        return { posted: 0, suppressed: suppressed.length, skipped: false };
    }

    // Dedup to one embed per product; a product in multiple categories lists them together and
    // counts as "new" if any of its arrivals were new.
    const byVariation = new Map();

    for (const row of rows) {
        let entry = byVariation.get(row.variation_id);

        if (!entry) {
            entry = {
                item_name: row.item_name,
                image_url: row.image_url,
                kind: row.kind,
                categoryNames: new Set(),
                arrivalIds: [],
            };
            byVariation.set(row.variation_id, entry);
        }

        entry.categoryNames.add(row.category_name);
        entry.arrivalIds.push(row.id);

        if (row.kind === "new") {
            entry.kind = "new";
        }
    }

    const products = Array.from(byVariation.values()).map((entry) => ({
        ...entry,
        categoryNames: Array.from(entry.categoryNames),
    }));

    let postedProducts = 0;
    const postedArrivalIds = [];

    // Send in chunks of up to 10 embeds. Stop on the first failure and leave the rest for next run.
    for (let i = 0; i < products.length; i += MAX_EMBEDS_PER_MESSAGE) {
        const chunk = products.slice(i, i + MAX_EMBEDS_PER_MESSAGE);
        const message = {
            embeds: chunk.map(buildEmbed),
        };

        if (i === 0) {
            message.content = "✨ Fresh arrivals just landed at The Wolf Den:";
        }

        try {
            await postMessage(webhookUrl, message);
        } catch (error) {
            discordLogger.warn("product_alerts.discord.post_failed", {
                reason: error instanceof Error ? error.message : "unknown_error",
                postedSoFar: postedProducts,
            });

            break;
        }

        postedProducts += chunk.length;
        chunk.forEach((product) => postedArrivalIds.push(...product.arrivalIds));

        // Gentle spacing between messages to stay clear of webhook rate limits.
        if (i + MAX_EMBEDS_PER_MESSAGE < products.length) {
            await sleep(500);
        }
    }

    if (postedArrivalIds.length) {
        await db.query(
            `UPDATE product_alert_arrivals SET discord_posted_at = NOW() WHERE id = ANY($1::uuid[])`,
            [postedArrivalIds]
        );
    }

    discordLogger.info("product_alerts.discord.completed", {
        postedProducts,
        suppressed: suppressed.length,
    });

    return { posted: postedProducts, suppressed: suppressed.length, skipped: false };
}
