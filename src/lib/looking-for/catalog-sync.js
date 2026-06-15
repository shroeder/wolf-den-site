import "server-only";

import { db } from "@/lib/db";
import { createServerLogger } from "@/lib/server-logger";

const TCGCSV_BASE = "https://tcgcsv.com";
const USER_AGENT = "WolfDenSite/1.0 (+https://www.wolfdengamingmn.com)";

// Categories whose tcgplayer display name matches one of these keywords are ingested. Scope is
// intentionally Magic + Pokemon for launch (see plan); add keywords here to widen coverage.
const GAME_BY_KEYWORD = [
    { keyword: "pokemon", game: "pokemon" },
    { keyword: "magic", game: "magic" },
];

// The cron runs once a day and aims to refresh the whole catalog in a single run. Groups are
// ingested in small concurrent batches (each group = two tcgcsv fetches + batched upserts), and
// progress is persisted after every batch. If the run approaches the serverless time limit it
// stops cleanly and the next day's run resumes from the saved cursor — so work is never lost and
// a large initial seed simply spans a couple of daily runs.
const GROUP_CONCURRENCY = 8;
const DEFAULT_SOFT_TIME_LIMIT_MS = 250_000;
const CARD_UPSERT_BATCH = 100;

// Preference order for choosing a single representative market price per card from the
// per-subtype price rows tcgcsv returns.
const SUBTYPE_PRIORITY = [
    "Normal",
    "Holofoil",
    "Reverse Holofoil",
    "1st Edition Holofoil",
    "1st Edition",
    "Unlimited",
    "Foil",
];

const syncLogger = createServerLogger({ source: "job", subsystem: "tcg-catalog-sync" });

async function fetchJson(url) {
    const response = await fetch(url, {
        headers: {
            "User-Agent": USER_AGENT,
            Accept: "application/json, text/plain, */*",
        },
        cache: "no-store",
    });

    if (!response.ok) {
        throw new Error(`tcgcsv fetch failed (${response.status}) for ${url}`);
    }

    return response.json();
}

async function fetchText(url) {
    const response = await fetch(url, {
        headers: {
            "User-Agent": USER_AGENT,
            Accept: "text/plain, */*",
        },
        cache: "no-store",
    });

    if (!response.ok) {
        throw new Error(`tcgcsv fetch failed (${response.status}) for ${url}`);
    }

    return (await response.text()).trim();
}

function gameForCategoryName(name) {
    const normalized = String(name || "").toLowerCase();

    for (const { keyword, game } of GAME_BY_KEYWORD) {
        if (normalized.includes(keyword)) {
            return game;
        }
    }

    return null;
}

function getExtendedValue(extendedData, fieldName) {
    if (!Array.isArray(extendedData)) {
        return null;
    }

    const match = extendedData.find((entry) => entry?.name === fieldName);
    const value = match?.value;

    return value === undefined || value === null ? null : String(value).trim() || null;
}

function pickMarketPrice(priceRows) {
    const priced = priceRows.filter((row) => row?.marketPrice !== null && row?.marketPrice !== undefined);

    if (!priced.length) {
        return { marketPrice: null, subType: null };
    }

    for (const subType of SUBTYPE_PRIORITY) {
        const match = priced.find((row) => row.subTypeName === subType);

        if (match) {
            return { marketPrice: Number(match.marketPrice), subType: match.subTypeName };
        }
    }

    const highest = priced.reduce((best, row) =>
        Number(row.marketPrice) > Number(best.marketPrice) ? row : best
    );

    return { marketPrice: Number(highest.marketPrice), subType: highest.subTypeName || null };
}

async function readState() {
    return db.queryOne(
        `SELECT source_last_updated, phase, queue, queue_cursor AS cursor, sets_count, cards_count
         FROM tcg_ingest_state
         WHERE id = TRUE`
    );
}

async function getRemoteLastUpdated() {
    return fetchText(`${TCGCSV_BASE}/last-updated.txt`);
}

async function discoverGroups() {
    const categoriesPayload = await fetchJson(`${TCGCSV_BASE}/tcgplayer/categories`);
    const categories = Array.isArray(categoriesPayload?.results) ? categoriesPayload.results : [];

    const selected = [];

    for (const category of categories) {
        const name = category?.displayName || category?.name || "";
        const game = gameForCategoryName(name);

        if (game && category?.categoryId) {
            selected.push({ categoryId: category.categoryId, game });
        }
    }

    const queue = [];

    for (const { categoryId, game } of selected) {
        const groupsPayload = await fetchJson(`${TCGCSV_BASE}/tcgplayer/${categoryId}/groups`);
        const groups = Array.isArray(groupsPayload?.results) ? groupsPayload.results : [];

        for (const group of groups) {
            if (!group?.groupId) {
                continue;
            }

            queue.push({
                categoryId,
                game,
                groupId: group.groupId,
                name: group.name || `Group ${group.groupId}`,
                abbreviation: group.abbreviation || null,
                publishedOn: group.publishedOn || null,
            });
        }
    }

    return queue;
}

async function upsertSet(group) {
    await db.query(
        `INSERT INTO tcg_sets (id, category_id, game, name, abbreviation, published_on, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (id) DO UPDATE SET
            category_id = EXCLUDED.category_id,
            game = EXCLUDED.game,
            name = EXCLUDED.name,
            abbreviation = EXCLUDED.abbreviation,
            published_on = EXCLUDED.published_on,
            updated_at = NOW()`,
        [
            group.groupId,
            group.categoryId,
            group.game,
            group.name,
            group.abbreviation,
            group.publishedOn ? new Date(group.publishedOn) : null,
        ]
    );
}

async function upsertCardBatch(cards) {
    if (!cards.length) {
        return;
    }

    const columns = 11;
    const values = [];
    const placeholders = cards.map((card, index) => {
        const base = index * columns;
        values.push(
            card.id,
            card.setId,
            card.game,
            card.name,
            card.cleanName,
            card.number,
            card.rarity,
            card.imageUrl,
            card.url,
            card.marketPrice,
            card.marketSubType
        );

        const tokens = Array.from({ length: columns }, (_unused, columnIndex) => `$${base + columnIndex + 1}`);

        return `(${tokens.join(", ")})`;
    });

    await db.query(
        `INSERT INTO tcg_cards (
            id, set_id, game, name, clean_name, number, rarity, image_url, url, market_price, market_price_subtype
         ) VALUES ${placeholders.join(", ")}
         ON CONFLICT (id) DO UPDATE SET
            set_id = EXCLUDED.set_id,
            game = EXCLUDED.game,
            name = EXCLUDED.name,
            clean_name = EXCLUDED.clean_name,
            number = EXCLUDED.number,
            rarity = EXCLUDED.rarity,
            image_url = EXCLUDED.image_url,
            url = EXCLUDED.url,
            market_price = EXCLUDED.market_price,
            market_price_subtype = EXCLUDED.market_price_subtype,
            price_updated_at = NOW(),
            updated_at = NOW()`,
        values
    );
}

async function ingestGroup(group) {
    await upsertSet(group);

    const [productsPayload, pricesPayload] = await Promise.all([
        fetchJson(`${TCGCSV_BASE}/tcgplayer/${group.categoryId}/${group.groupId}/products`),
        fetchJson(`${TCGCSV_BASE}/tcgplayer/${group.categoryId}/${group.groupId}/prices`),
    ]);

    const products = Array.isArray(productsPayload?.results) ? productsPayload.results : [];
    const priceRows = Array.isArray(pricesPayload?.results) ? pricesPayload.results : [];

    const pricesByProduct = new Map();

    for (const row of priceRows) {
        if (!row?.productId) {
            continue;
        }

        if (!pricesByProduct.has(row.productId)) {
            pricesByProduct.set(row.productId, []);
        }

        pricesByProduct.get(row.productId).push(row);
    }

    const cards = products
        .filter((product) => product?.productId)
        .map((product) => {
            const { marketPrice, subType } = pickMarketPrice(pricesByProduct.get(product.productId) || []);

            return {
                id: product.productId,
                setId: group.groupId,
                game: group.game,
                name: product.name || product.cleanName || `Product ${product.productId}`,
                cleanName: product.cleanName || null,
                number: getExtendedValue(product.extendedData, "Number"),
                rarity: getExtendedValue(product.extendedData, "Rarity"),
                imageUrl: product.imageUrl || null,
                url: product.url || null,
                marketPrice,
                marketSubType: subType,
            };
        });

    for (let index = 0; index < cards.length; index += CARD_UPSERT_BATCH) {
        await upsertCardBatch(cards.slice(index, index + CARD_UPSERT_BATCH));
    }

    return cards.length;
}

async function ingestBatch(groups) {
    const outcomes = await Promise.all(
        groups.map((group) =>
            ingestGroup(group)
                .then((cardCount) => ({ ok: true, cardCount }))
                .catch((error) => {
                    syncLogger.warn("tcg.catalog.sync.group.failed", {
                        groupId: group?.groupId,
                        categoryId: group?.categoryId,
                        reason: error instanceof Error ? error.message : "unknown_error",
                    });

                    return { ok: false, cardCount: 0 };
                })
        )
    );

    return outcomes.reduce(
        (totals, outcome) => ({
            processed: totals.processed + (outcome.ok ? 1 : 0),
            cards: totals.cards + outcome.cardCount,
        }),
        { processed: 0, cards: 0 }
    );
}

/**
 * Refresh the tcgcsv catalog. Designed to run once a day and cover the whole catalog in a single
 * invocation: it no-ops when already current, (re)builds the work queue when tcgcsv publishes a
 * new snapshot, then ingests groups in concurrent batches, persisting the cursor after each batch.
 * If it nears the serverless time limit it returns cleanly with `done: false` and the next run
 * resumes from the saved cursor. Returns a progress summary.
 */
export async function runCatalogSyncStep({
    softTimeLimitMs = DEFAULT_SOFT_TIME_LIMIT_MS,
    maxGroups = Infinity,
} = {}) {
    const startedAt = Date.now();
    const state = await readState();
    const remoteLastUpdated = await getRemoteLastUpdated();

    let queue = Array.isArray(state?.queue) ? state.queue : [];
    let cursor = Number(state?.cursor || 0);

    const queueExhausted = cursor >= queue.length;
    const sourceUnchanged = state?.source_last_updated === remoteLastUpdated;

    if (queueExhausted && sourceUnchanged && state?.phase === "done") {
        syncLogger.info("tcg.catalog.sync.skipped", { reason: "fresh", remoteLastUpdated });

        return { skipped: true, reason: "fresh", remoteLastUpdated, processed: 0, remaining: 0, done: true };
    }

    // Start a fresh ingest pass when there is no pending work for the current remote snapshot.
    if (queueExhausted) {
        syncLogger.info("tcg.catalog.sync.discover.started", { remoteLastUpdated });
        queue = await discoverGroups();
        cursor = 0;

        await db.query(
            `UPDATE tcg_ingest_state SET
                source_last_updated = $1,
                phase = 'ingesting',
                queue = $2::jsonb,
                queue_cursor = 0,
                sets_count = 0,
                cards_count = 0,
                started_at = NOW(),
                finished_at = NULL,
                updated_at = NOW()
             WHERE id = TRUE`,
            [remoteLastUpdated, JSON.stringify(queue)]
        );

        syncLogger.info("tcg.catalog.sync.discover.completed", { groups: queue.length, remoteLastUpdated });
    }

    let index = cursor;
    let processed = 0;
    let cardsIngested = 0;
    const stopAt = Math.min(queue.length, cursor + maxGroups);

    while (index < stopAt && Date.now() - startedAt < softTimeLimitMs) {
        const batch = queue.slice(index, index + GROUP_CONCURRENCY);
        const { processed: batchProcessed, cards: batchCards } = await ingestBatch(batch);

        index += batch.length;
        processed += batchProcessed;
        cardsIngested += batchCards;

        // Persist progress after every batch so a timeout/kill never loses completed work.
        await db.query(
            `UPDATE tcg_ingest_state SET
                queue_cursor = $1,
                sets_count = sets_count + $2,
                cards_count = cards_count + $3,
                updated_at = NOW()
             WHERE id = TRUE`,
            [index, batchProcessed, batchCards]
        );
    }

    const done = index >= queue.length;

    if (done) {
        await db.query(
            `UPDATE tcg_ingest_state SET
                phase = 'done',
                queue = '[]'::jsonb,
                queue_cursor = 0,
                finished_at = NOW(),
                updated_at = NOW()
             WHERE id = TRUE`
        );
    }

    syncLogger.info("tcg.catalog.sync.step.completed", {
        processed,
        cardsIngested,
        remaining: Math.max(queue.length - index, 0),
        done,
        remoteLastUpdated,
    });

    return {
        skipped: false,
        remoteLastUpdated,
        processed,
        cardsIngested,
        remaining: Math.max(queue.length - index, 0),
        done,
    };
}
