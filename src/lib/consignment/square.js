import "server-only";

const SQUARE_API_BASE = "https://connect.squareup.com";
const DEFAULT_SALES_LOOKBACK_DAYS = 90;

const normalizeLookbackDays = (value) => {
    const nextValue = Number(value);

    if (!Number.isFinite(nextValue) || nextValue <= 0) {
        return DEFAULT_SALES_LOOKBACK_DAYS;
    }

    return Math.floor(nextValue);
};

const toDisplayName = (itemName, variationName) => {
    if (!variationName || variationName === "Regular") {
        return itemName;
    }

    return `${itemName} - ${variationName}`;
};

const normalizeMoney = (amount) => Number(amount || 0) / 100;

const chunk = (values, size) => {
    const chunks = [];

    for (let index = 0; index < values.length; index += size) {
        chunks.push(values.slice(index, index + size));
    }

    return chunks;
};

function getSquareHeaders() {
    const accessToken = process.env.SQUARE_ACCESS_TOKEN;

    if (!accessToken) {
        throw new Error("Missing Square access token.");
    }

    const headers = {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
    };

    if (process.env.SQUARE_API_VERSION) {
        headers["Square-Version"] = process.env.SQUARE_API_VERSION;
    }

    return headers;
}

async function squareFetch(path, init = {}) {
    const response = await fetch(`${SQUARE_API_BASE}${path}`, {
        ...init,
        headers: {
            ...getSquareHeaders(),
            ...(init.headers || {}),
        },
        cache: "no-store",
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error(`Square request failed for ${path} with status ${response.status}.`);
    }

    return payload;
}

export async function listConsignorCatalog(categoryId) {
    const variations = [];
    let cursor = null;

    do {
        const params = new URLSearchParams({ types: "ITEM" });

        if (cursor) {
            params.set("cursor", cursor);
        }

        const payload = await squareFetch(`/v2/catalog/list?${params.toString()}`);

        for (const item of payload.objects || []) {
            if (item.type !== "ITEM" || item.item_data?.category_id !== categoryId) {
                continue;
            }

            for (const variation of item.item_data?.variations || []) {
                variations.push({
                    id: variation.id,
                    name: toDisplayName(item.item_data?.name || "Unnamed Item", variation.item_variation_data?.name),
                    price: normalizeMoney(variation.item_variation_data?.price_money?.amount),
                });
            }
        }

        cursor = payload.cursor || null;
    } while (cursor);

    return variations;
}

export async function getInventoryCounts(variationIds) {
    const locationId = process.env.SQUARE_LOCATION_ID;

    if (!locationId) {
        throw new Error("Missing Square location ID.");
    }

    const totals = new Map();

    for (const batch of chunk(variationIds, 1000)) {
        if (!batch.length) {
            continue;
        }

        const payload = await squareFetch("/v2/inventory/counts/batch-retrieve", {
            method: "POST",
            body: JSON.stringify({
                catalog_object_ids: batch,
                location_ids: [locationId],
                states: ["IN_STOCK"],
            }),
        });

        for (const count of payload.counts || []) {
            if (count.state !== "IN_STOCK") {
                continue;
            }

            const current = totals.get(count.catalog_object_id) || 0;
            const nextValue = current + Number(count.quantity || 0);

            totals.set(count.catalog_object_id, nextValue);
        }
    }

    return totals;
}

export async function searchSalesForVariations(variationLookup, options = {}) {
    const locationId = process.env.SQUARE_LOCATION_ID;

    if (!locationId) {
        throw new Error("Missing Square location ID.");
    }

    const lookbackDays = normalizeLookbackDays(options.lookbackDays);
    const startDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
    const endDate = new Date().toISOString();
    const aggregates = new Map();
    let cursor = null;

    do {
        const payload = await squareFetch("/v2/orders/search", {
            method: "POST",
            body: JSON.stringify({
                location_ids: [locationId],
                cursor,
                query: {
                    filter: {
                        state_filter: {
                            states: ["COMPLETED"],
                        },
                        date_time_filter: {
                            closed_at: {
                                start_at: startDate,
                                end_at: endDate,
                            },
                        },
                    },
                    sort: {
                        sort_field: "CLOSED_AT",
                        sort_order: "DESC",
                    },
                },
            }),
        });

        for (const order of payload.orders || []) {
            for (const lineItem of order.line_items || []) {
                const variationId = lineItem.catalog_object_id;
                const variation = variationLookup.get(variationId);

                if (!variation) {
                    continue;
                }

                const current = aggregates.get(variationId) || {
                    name: variation.name,
                    quantitySold: 0,
                    revenue: 0,
                    lastSoldAt: null,
                };
                const quantitySold = Number(lineItem.quantity || 0);
                const revenue = normalizeMoney(lineItem.gross_sales_money?.amount ?? lineItem.total_money?.amount);
                const soldAt = order.closed_at || order.updated_at || null;

                current.quantitySold += quantitySold;
                current.revenue += revenue;

                if (soldAt && (!current.lastSoldAt || soldAt > current.lastSoldAt)) {
                    current.lastSoldAt = soldAt;
                }

                aggregates.set(variationId, current);
            }
        }

        cursor = payload.cursor || null;
    } while (cursor);

    return Array.from(aggregates.values()).sort((left, right) => right.revenue - left.revenue || left.name.localeCompare(right.name));
}