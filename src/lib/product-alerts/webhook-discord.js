import "server-only";

import { db } from "@/lib/db";
import { createServerLogger } from "@/lib/server-logger";
import { getShopVariationDetails, listShopInventory } from "@/lib/consignment/square";
import { SITE_URL } from "@/lib/site";

const logger = createServerLogger({ source: "webhook", subsystem: "product-alerts-discord" });

// Wolf Den gold, as a Discord embed color integer (0xD4AF37).
const EMBED_COLOR = 0xd4af37;
// Singles (scanned cards, TCG-<id> SKU) only post to Discord at/above this dollar value, so the
// channel isn't flooded with cheap commons. Sealed product, supplies, etc. always post. This is the
// ONLY content filter on the webhook -> Discord path. Configurable via env; defaults to $50.
const DEFAULT_SINGLE_MIN_PRICE = 50;
// Scanned singles carry a TCG-<tcgplayerProductId> SKU (accounting_app
// SquareTransactionsService.buildSquareVariationSku). Everything else (sealed/supplies) always posts.
const TCG_SINGLE_SKU_PATTERN = /^TCG-\d+$/i;
// Discord allows at most 10 embeds per webhook message; the backfill batches up to this many.
const MAX_EMBEDS_PER_MESSAGE = 10;
// Synthetic pseudo-category appended by listShopInventory (duplicates of real categories).
const SYNTHETIC_CATEGORY_ID = "new-just-in";
// Default reconciliation window: the last 7 days of arrivals.
const DEFAULT_BACKFILL_LOOKBACK_HOURS = 168;

function singleMinPrice() {
    const parsed = Number(process.env.DISCORD_SINGLE_MIN_PRICE);

    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_SINGLE_MIN_PRICE;
}

function isSingleSku(sku) {
    return TCG_SINGLE_SKU_PATTERN.test(String(sku || "").trim());
}

function baseUrl() {
    return process.env.NEXT_PUBLIC_BASE_URL || SITE_URL;
}

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pull the in-stock on-hand counts for our location out of an inventory.count.updated payload,
 * collapsed to the latest count per variation. Square reports counts per (variation, state,
 * location); we only care about IN_STOCK at our own location. A single event can carry several
 * counts for the same variation (different states or recalculations) — keep the freshest by
 * calculated_at. Returns Map<variationId, quantity>.
 */
function extractInStockCounts(payload, locationId) {
    const counts = payload?.data?.object?.inventory_counts || [];
    const latest = new Map(); // variationId -> { quantity, calculatedAt }

    for (const count of counts) {
        if (count?.state !== "IN_STOCK") {
            continue;
        }

        if (locationId && count.location_id && count.location_id !== locationId) {
            continue;
        }

        const variationId = count.catalog_object_id;
        const quantity = Number(count.quantity);

        if (!variationId || !Number.isFinite(quantity)) {
            continue;
        }

        const calculatedAt = count.calculated_at || "";
        const prev = latest.get(variationId);

        if (!prev || calculatedAt >= prev.calculatedAt) {
            latest.set(variationId, { quantity, calculatedAt });
        }
    }

    return new Map(Array.from(latest, ([id, { quantity }]) => [id, quantity]));
}

function buildEmbed(details, isNew) {
    const verb = isNew ? "New arrival" : "Restocked";
    const priceLine = typeof details.price === "number" ? `\n${currency.format(details.price)}` : "";
    const embed = {
        title: details.name,
        url: new URL("/shop", baseUrl()).toString(),
        description: `${verb} at The Wolf Den${priceLine}`,
        color: EMBED_COLOR,
    };

    if (details.imageUrl) {
        embed.thumbnail = { url: details.imageUrl };
    }

    return embed;
}

/**
 * POST one message to the Discord incoming webhook, honoring a single 429 rate-limit retry. Throws
 * on a non-2xx so the caller can log and move on (the per-variation quantity has already been
 * recorded, so a missed post won't loop forever).
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

/**
 * Direct webhook -> Discord broadcast. For every variation in an inventory.count.updated event whose
 * IN_STOCK on-hand count went UP versus our last-known value, post a Discord embed immediately. The
 * only content filter is the single-card price gate. No-op (skipped) when the webhook URL isn't set.
 *
 * Idempotent against Square retries two ways: the event_id is recorded up front (a re-delivered
 * event is skipped wholesale), and each variation's quantity is stored on every pass so a duplicate
 * count is never "greater than" what we already have.
 */
export async function postInventoryCountIncreaseToDiscord({ payload, eventId }) {
    const webhookUrl = process.env.DISCORD_NEW_ARRIVALS_WEBHOOK_URL;

    if (!webhookUrl) {
        logger.info("product_alerts.webhook_discord.skipped", { reason: "not_configured" });

        return { skipped: true, reason: "not_configured" };
    }

    // Event-level dedupe: skip if we've already handled this Square event_id.
    if (eventId) {
        const inserted = await db.query(
            `INSERT INTO discord_alert_events (event_id) VALUES ($1)
             ON CONFLICT (event_id) DO NOTHING
             RETURNING event_id`,
            [eventId]
        );

        if (!inserted.length) {
            logger.info("product_alerts.webhook_discord.duplicate_event", { eventId });

            return { skipped: true, reason: "duplicate_event" };
        }
    }

    // Restrict to our own location when one is configured; otherwise accept counts from any.
    const locationId = process.env.SQUARE_LOCATION_ID || null;
    const counts = extractInStockCounts(payload, locationId);

    if (!counts.size) {
        return { posted: 0, gated: 0, considered: 0 };
    }

    let posted = 0;
    let gated = 0;
    let considered = 0;
    const minPrice = singleMinPrice();

    for (const [variationId, quantity] of counts) {
        considered += 1;

        const prior = await db.queryOne(
            `SELECT quantity FROM discord_alert_inventory WHERE variation_id = $1`,
            [variationId]
        );
        const priorQty = prior ? Number(prior.quantity) : 0;

        // Record the latest on-hand count regardless of direction, so a future restock from a lower
        // base is detected and a re-delivered count can't read as an increase.
        await db.query(
            `INSERT INTO discord_alert_inventory (variation_id, quantity, updated_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (variation_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW()`,
            [variationId, quantity]
        );

        // Only a count increase is an arrival. Sales (count down) and no-ops are stored but silent.
        if (!(quantity > priorQty)) {
            continue;
        }

        let details = null;

        try {
            details = await getShopVariationDetails(variationId);
        } catch (error) {
            logger.warn("product_alerts.webhook_discord.detail_failed", {
                variationId,
                reason: error instanceof Error ? error.message : "unknown_error",
            });

            continue;
        }

        if (!details) {
            continue;
        }

        // The one filter: a low-value single is suppressed (an unpriced single counts as below the
        // gate). Everything else — sealed, supplies, higher-value singles — always posts.
        if (isSingleSku(details.sku) && !(typeof details.price === "number" && details.price >= minPrice)) {
            gated += 1;
            continue;
        }

        try {
            await postMessage(webhookUrl, {
                content: "✨ Fresh arrival at The Wolf Den:",
                embeds: [buildEmbed(details, priorQty === 0)],
            });
            posted += 1;

            // Stamp the announce so the reconciliation backfill won't re-post this item.
            await db.query(
                `UPDATE discord_alert_inventory SET last_posted_at = NOW() WHERE variation_id = $1`,
                [variationId]
            );
        } catch (error) {
            logger.warn("product_alerts.webhook_discord.post_failed", {
                variationId,
                reason: error instanceof Error ? error.message : "unknown_error",
            });
        }
    }

    logger.info("product_alerts.webhook_discord.completed", { considered, posted, gated });

    return { posted, gated, considered };
}

/**
 * One-time reconciliation: announce recent arrivals that the broken cron/category path silently
 * dropped. Scans current Square inventory and posts in-stock variations created within the lookback
 * window, applying the same single-card price gate. Idempotent — a variation already announced (by
 * the live webhook or a prior backfill run, i.e. last_posted_at IS NOT NULL) is skipped, and each
 * post stamps last_posted_at so re-running is safe. Embeds are batched 10 per message.
 */
export async function backfillRecentArrivalsToDiscord({ lookbackHours = DEFAULT_BACKFILL_LOOKBACK_HOURS } = {}) {
    const webhookUrl = process.env.DISCORD_NEW_ARRIVALS_WEBHOOK_URL;

    if (!webhookUrl) {
        logger.info("product_alerts.backfill.skipped", { reason: "not_configured" });

        return { skipped: true, reason: "not_configured" };
    }

    const hours = Number.isFinite(lookbackHours) && lookbackHours > 0 ? lookbackHours : DEFAULT_BACKFILL_LOOKBACK_HOURS;
    const inventory = await listShopInventory();
    const cutoffMs = Date.now() - hours * 60 * 60 * 1000;
    const minPrice = singleMinPrice();

    // Collapse to one entry per variation (a variation can appear under several categories).
    const byVariation = new Map();

    for (const category of inventory) {
        if (category.id === SYNTHETIC_CATEGORY_ID) {
            continue;
        }

        for (const item of category.items || []) {
            if (!(item.quantity > 0) || byVariation.has(item.id)) {
                continue;
            }

            const createdMs = Date.parse(item.createdAt || "");

            if (Number.isNaN(createdMs) || createdMs < cutoffMs) {
                continue;
            }

            byVariation.set(item.id, item);
        }
    }

    // Filter out already-announced and gated items, building the list of products to post.
    const toPost = [];
    let gated = 0;
    let alreadyPosted = 0;

    for (const [variationId, item] of byVariation) {
        const prior = await db.queryOne(
            `SELECT last_posted_at FROM discord_alert_inventory WHERE variation_id = $1`,
            [variationId]
        );

        if (prior && prior.last_posted_at) {
            alreadyPosted += 1;
            continue;
        }

        const price = typeof item.price === "number" && item.price > 0 ? item.price : null;

        if (isSingleSku(item.sku) && !(price !== null && price >= minPrice)) {
            gated += 1;
            continue;
        }

        toPost.push({
            variationId,
            quantity: Number(item.quantity) || 0,
            details: { id: variationId, name: item.name, price, imageUrl: item.imageUrl || null },
        });
    }

    let posted = 0;

    for (let i = 0; i < toPost.length; i += MAX_EMBEDS_PER_MESSAGE) {
        const chunk = toPost.slice(i, i + MAX_EMBEDS_PER_MESSAGE);
        const message = { embeds: chunk.map((entry) => buildEmbed(entry.details, true)) };

        if (i === 0) {
            message.content = "✨ Catching up on recent arrivals at The Wolf Den:";
        }

        try {
            await postMessage(webhookUrl, message);
        } catch (error) {
            logger.warn("product_alerts.backfill.post_failed", {
                postedSoFar: posted,
                reason: error instanceof Error ? error.message : "unknown_error",
            });

            break;
        }

        // Stamp each announced variation (and ensure a qty row exists) so future increases are
        // measured from here and a re-run won't repost.
        for (const entry of chunk) {
            await db.query(
                `INSERT INTO discord_alert_inventory (variation_id, quantity, last_posted_at, updated_at)
                 VALUES ($1, $2, NOW(), NOW())
                 ON CONFLICT (variation_id) DO UPDATE SET last_posted_at = NOW(), updated_at = NOW()`,
                [entry.variationId, entry.quantity]
            );
        }

        posted += chunk.length;

        if (i + MAX_EMBEDS_PER_MESSAGE < toPost.length) {
            await sleep(500);
        }
    }

    logger.info("product_alerts.backfill.completed", {
        considered: byVariation.size,
        posted,
        gated,
        alreadyPosted,
        lookbackHours: hours,
    });

    return { posted, gated, alreadyPosted, considered: byVariation.size, lookbackHours: hours };
}
