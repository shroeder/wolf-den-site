import "server-only";

import { db } from "@/lib/db";
import { productHandle } from "@/lib/inventory-feed/product-url";
import { refreshStockSnapshot } from "@/lib/looking-for/stock";
import { createServerLogger } from "@/lib/server-logger";
import { listShopInventory } from "@/lib/consignment/square";
import { SITE_URL } from "@/lib/site";

const logger = createServerLogger({ source: "job", subsystem: "inventory-feed" });

// Wolf Den gold, as a Discord embed color integer (0xD4AF37).
const EMBED_COLOR = 0xd4af37;
// Discord allows at most 10 embeds per webhook message.
const MAX_EMBEDS_PER_MESSAGE = 10;
// listShopInventory appends a synthetic "Just In" pseudo-category of duplicates; skip it.
const SYNTHETIC_CATEGORY_ID = "new-just-in";
// Bound the Discord blast radius: only post/retry changes detected within this window, so a long
// outage or a force re-post can't resurrect ancient changes.
const POST_WINDOW_HOURS = 48;
// Separator used to pack a variation's category names into one column (and split it back out).
const CATEGORY_SEPARATOR = " · ";

function baseUrl() {
    return process.env.NEXT_PUBLIC_BASE_URL || SITE_URL;
}

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function changeVerb(kind) {
    if (kind === "new") {
        return "New arrival";
    }

    if (kind === "price_drop") {
        return "Price drop";
    }

    return "Restocked";
}

function buildEmbed(row) {
    // Link straight to the item's own (indexable) product page. Each url is unique because the
    // handle ends in the variation id, which also keeps Discord from merging embeds into a gallery.
    const shopUrl = row.variation_id
        ? new URL(`/shop/${productHandle(row.name, row.variation_id)}`, baseUrl())
        : new URL("/shop", baseUrl());

    const priceLine = row.price != null ? `\n${currency.format(Number(row.price))}` : "";
    const stockLine = Number(row.quantity) > 1 ? `\n${Number(row.quantity)} in stock` : "";
    const categoryLine = row.category_names ? `\n${row.category_names}` : "";
    const embed = {
        title: row.name || "New item",
        url: shopUrl.toString(),
        description: `${changeVerb(row.last_change_kind)} at The Wolf Den${priceLine}${stockLine}${categoryLine}`,
        color: EMBED_COLOR,
    };

    if (row.image_url) {
        embed.thumbnail = { url: row.image_url };
    }

    return embed;
}

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
 * Post in-stock changes to Discord. Normally posts changes detected since the last Discord post
 * (discord_posted_at < last_change_at) — which also retries anything a previous run failed to send.
 * With force, re-posts every in-stock change inside the window regardless of discord_posted_at.
 */
async function postPendingToDiscord({ force = false } = {}) {
    const webhookUrl = process.env.DISCORD_NEW_ARRIVALS_WEBHOOK_URL;

    if (!webhookUrl) {
        return { posted: 0, discordSkipped: true };
    }

    const rows = await db.query(
        `SELECT variation_id, name, image_url, price, quantity, category_names, last_change_kind
         FROM inventory_feed
         WHERE in_stock = TRUE
           AND last_change_at IS NOT NULL
           AND last_change_at > NOW() - ($1 || ' hours')::interval
           ${force ? "" : "AND (discord_posted_at IS NULL OR discord_posted_at < last_change_at)"}
         ORDER BY last_change_at ASC`,
        [String(POST_WINDOW_HOURS)]
    );

    if (!rows.length) {
        return { posted: 0 };
    }

    let posted = 0;
    const postedIds = [];

    for (let i = 0; i < rows.length; i += MAX_EMBEDS_PER_MESSAGE) {
        const chunk = rows.slice(i, i + MAX_EMBEDS_PER_MESSAGE);
        const message = { embeds: chunk.map(buildEmbed) };

        if (i === 0) {
            message.content = "✨ New & updated at The Wolf Den:";
        }

        try {
            await postMessage(webhookUrl, message);
        } catch (error) {
            logger.warn("inventory_feed.discord.post_failed", {
                postedSoFar: posted,
                reason: error instanceof Error ? error.message : "unknown_error",
            });

            break;
        }

        posted += chunk.length;
        chunk.forEach((row) => postedIds.push(row.variation_id));

        if (i + MAX_EMBEDS_PER_MESSAGE < rows.length) {
            await sleep(500);
        }
    }

    if (postedIds.length) {
        await db.query(
            `UPDATE inventory_feed SET discord_posted_at = NOW() WHERE variation_id = ANY($1::text[])`,
            [postedIds]
        );
    }

    return { posted };
}

/**
 * The single source of truth. Pulls current Square stock, diffs each variation against the stored
 * snapshot to detect NEW items, QUANTITY increases, and PRICE decreases (no gate — everything
 * counts), records the changes, then broadcasts unposted ones to Discord. The website feed reads the
 * same rows. On the very first run (empty snapshot) it seeds silently — no posts.
 */
export async function reconcileInventory({ force = false } = {}) {
    // Stamp the run time up front so webhook-triggered reconciles throttle against it.
    await db.query(`UPDATE inventory_feed_meta SET last_reconcile_at = NOW() WHERE id = TRUE`);

    // 1. Current in-stock variations, one entry per variation (collect every category it's in).
    const inventory = await listShopInventory();
    const current = new Map();

    for (const category of inventory) {
        if (category.id === SYNTHETIC_CATEGORY_ID) {
            continue;
        }

        for (const item of category.items || []) {
            if (!(item.quantity > 0)) {
                continue;
            }

            let entry = current.get(item.id);

            if (!entry) {
                entry = {
                    name: item.name,
                    quantity: Number(item.quantity) || 0,
                    price: typeof item.price === "number" ? item.price : null,
                    imageUrl: item.imageUrl || null,
                    categoryNames: new Set(),
                };
                current.set(item.id, entry);
            }

            if (category.name) {
                entry.categoryNames.add(category.name);
            }
        }
    }

    // 2. Stored snapshot.
    const snapshotRows = await db.query(`SELECT variation_id, quantity, price, in_stock FROM inventory_feed`);
    const snapshot = new Map(
        snapshotRows.map((row) => [
            row.variation_id,
            {
                quantity: row.quantity == null ? 0 : Number(row.quantity),
                price: row.price == null ? null : Number(row.price),
                inStock: row.in_stock === true,
            },
        ])
    );
    const seeding = snapshot.size === 0;

    // 3. Diff. Build bulk-upsert arrays for ALL current items, plus per-kind id lists for the ones
    //    that changed (skipped entirely while seeding).
    const ids = [];
    const names = [];
    const images = [];
    const prices = [];
    const quantities = [];
    const categories = [];
    const newIds = [];
    const restockIds = [];
    const priceDropIds = [];

    for (const [variationId, entry] of current) {
        ids.push(variationId);
        names.push(entry.name);
        images.push(entry.imageUrl);
        prices.push(entry.price);
        quantities.push(entry.quantity);
        categories.push(Array.from(entry.categoryNames).join(CATEGORY_SEPARATOR) || null);

        if (seeding) {
            continue;
        }

        const prev = snapshot.get(variationId);

        if (!prev) {
            newIds.push(variationId);
        } else if (entry.quantity > prev.quantity) {
            restockIds.push(variationId);
        } else if (entry.price != null && prev.price != null && entry.price < prev.price) {
            priceDropIds.push(variationId);
        }
    }

    // 4a. Bulk upsert current state for every in-stock variation (refreshes name/price/qty/category;
    //     does NOT touch last_change_* so unchanged items keep their history).
    if (ids.length) {
        await db.query(
            `INSERT INTO inventory_feed
                (variation_id, name, image_url, price, quantity, category_names, in_stock, updated_at)
             SELECT v, n, img, p, q, c, TRUE, NOW()
             FROM UNNEST($1::text[], $2::text[], $3::text[], $4::numeric[], $5::int[], $6::text[])
                AS t(v, n, img, p, q, c)
             ON CONFLICT (variation_id) DO UPDATE SET
                name = EXCLUDED.name,
                image_url = EXCLUDED.image_url,
                price = EXCLUDED.price,
                quantity = EXCLUDED.quantity,
                category_names = EXCLUDED.category_names,
                in_stock = TRUE,
                updated_at = NOW()`,
            [ids, names, images, prices, quantities, categories]
        );
    }

    // 4b. Stamp the change kind/time on the variations that actually changed.
    const markChanged = async (changedIds, kind) => {
        if (!changedIds.length) {
            return;
        }

        await db.query(
            `UPDATE inventory_feed
             SET last_change_kind = $2, last_change_at = NOW(), updated_at = NOW()
             WHERE variation_id = ANY($1::text[])`,
            [changedIds, kind]
        );
    };

    await markChanged(newIds, "new");
    await markChanged(restockIds, "restock");
    await markChanged(priceDropIds, "price_drop");

    // 5. Mark sold-out: anything we had in stock that's no longer present drops to 0/out-of-stock, so
    //    a future return reads as a restock again.
    await db.query(
        `UPDATE inventory_feed SET in_stock = FALSE, quantity = 0, updated_at = NOW()
         WHERE in_stock = TRUE AND NOT (variation_id = ANY($1::text[]))`,
        [ids]
    );

    // 6. Broadcast (never on the seeding run — that's just establishing the baseline).
    const discord = seeding ? { posted: 0, seeded: true } : await postPendingToDiscord({ force });

    // 7. Keep the "Looking For" in-stock snapshot (tcg_stock) as fresh as the feed, so a just-scanned
    //    card matches wishlists within a reconcile cycle instead of waiting for the daily catalog job.
    //    Best-effort: a stock-refresh failure must not fail the reconcile.
    try {
        await refreshStockSnapshot();
    } catch (stockError) {
        logger.warn("inventory_feed.stock_refresh.failed", {
            reason: stockError instanceof Error ? stockError.message : "unknown_error",
        });
    }

    const summary = {
        seeding,
        items: current.size,
        new: newIds.length,
        restock: restockIds.length,
        priceDrop: priceDropIds.length,
        posted: discord.posted || 0,
        discordSkipped: discord.discordSkipped || false,
    };

    logger.info("inventory_feed.reconcile.completed", summary);

    return summary;
}

/**
 * Webhook entry point: claim a reconcile slot atomically and only run if one hasn't run in the last
 * `throttleSeconds`, so an intake burst of webhooks can't fire a full catalog scan per event. The
 * periodic cron and the manual button call reconcileInventory directly (no throttle).
 */
export async function reconcileIfDue({ throttleSeconds = 60 } = {}) {
    const claimed = await db.query(
        `UPDATE inventory_feed_meta SET last_reconcile_at = NOW()
         WHERE id = TRUE
           AND (last_reconcile_at IS NULL OR last_reconcile_at < NOW() - ($1 || ' seconds')::interval)
         RETURNING last_reconcile_at`,
        [String(throttleSeconds)]
    );

    if (!claimed.length) {
        return { skipped: true, reason: "throttled" };
    }

    return reconcileInventory();
}
