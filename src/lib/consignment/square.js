import "server-only";

import { createServerLogger } from "@/lib/server-logger";

const SQUARE_API_BASE = "https://connect.squareup.com";
const DEFAULT_SALES_LOOKBACK_DAYS = 90;
const squareLogger = createServerLogger({ source: "api", subsystem: "square" });

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
    squareLogger.info("square.env.validation.started", {
        step: "env_validation_started",
    });

    const accessToken = process.env.SQUARE_ACCESS_TOKEN;

    if (!accessToken) {
        squareLogger.error("square.env.validation.failed", {
            step: "env_validation_failed",
            reason: "missing_square_access_token",
        });

        throw new Error("Missing Square access token.");
    }

    squareLogger.info("square.env.validation.passed", {
        step: "env_validation_passed",
    });

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
    const endpoint = path.split("?")[0];

    squareLogger.info("square.api_call.started", {
        step: "square_api_call_started",
        endpoint,
        method: init.method || "GET",
    });

    try {
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
            const squareCode = payload?.errors?.[0]?.code;

            squareLogger.error("square.api_call.failed", {
                step: "square_api_call_failed",
                endpoint,
                status: response.status,
                squareCode,
            });

            const error = new Error(`Square request failed for ${path} with status ${response.status}.`);

            error.squareStatus = response.status;
            error.squareCode = squareCode;

            throw error;
        }

        squareLogger.info("square.api_call.succeeded", {
            step: "square_api_call_succeeded",
            endpoint,
            status: response.status,
        });

        return payload;
    } catch (error) {
        if (error instanceof Error && !error.message.startsWith("Square request failed for")) {
            squareLogger.error("square.api_call.failed", error, {
                step: "square_api_call_failed",
                endpoint,
            });
        }

        throw error;
    }
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
            if (item.type !== "ITEM") {
                continue;
            }

            // Square returns category as item_data.category_id (legacy) or
            // item_data.categories[].id (current API). Check both.
            const legacyCategoryId = item.item_data?.category_id;
            const categoriesArray = item.item_data?.categories || [];
            const matchesCategory =
                legacyCategoryId === categoryId ||
                categoriesArray.some((c) => c.id === categoryId);

            if (!matchesCategory) {
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

    squareLogger.info("square.catalog.list.completed", {
        categoryId,
        variationCount: variations.length,
    });

    return variations;
}

export async function getInventoryCounts(variationIds) {
    const locationId = process.env.SQUARE_LOCATION_ID;

    squareLogger.info("square.location.env.validation.started", {
        step: "env_validation_started",
    });

    if (!locationId) {
        squareLogger.error("square.location.env.validation.failed", {
            step: "env_validation_failed",
            reason: "missing_square_location_id",
        });

        throw new Error("Missing Square location ID.");
    }

    squareLogger.info("square.location.env.validation.passed", {
        step: "env_validation_passed",
    });

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

    squareLogger.info("square.location.env.validation.started", {
        step: "env_validation_started",
    });

    if (!locationId) {
        squareLogger.error("square.location.env.validation.failed", {
            step: "env_validation_failed",
            reason: "missing_square_location_id",
        });

        throw new Error("Missing Square location ID.");
    }

    squareLogger.info("square.location.env.validation.passed", {
        step: "env_validation_passed",
    });

    const lookbackDays = normalizeLookbackDays(options.lookbackDays);
    const startDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
    const endDate = new Date().toISOString();
    const aggregates = new Map();
    let cursor = null;
    let totalOrdersFound = 0;
    let totalMatchingLineItems = 0;
    let totalReturnLineItems = 0;

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

        const orders = payload.orders || [];

        totalOrdersFound += orders.length;

        for (const order of orders) {
            // --- Aggregate gross sales from completed line items ---
            for (const lineItem of order.line_items || []) {
                const variationId = lineItem.catalog_object_id;
                const variation = variationLookup.get(variationId);

                if (!variation) {
                    continue;
                }

                totalMatchingLineItems++;

                const current = aggregates.get(variationId) || {
                    name: variation.name,
                    quantitySold: 0,
                    quantityReturned: 0,
                    grossRevenue: 0,
                    refundedRevenue: 0,
                    revenue: 0,
                    lastSoldAt: null,
                };
                const quantitySold = Number(lineItem.quantity || 0);
                const grossRevenue = normalizeMoney(lineItem.gross_sales_money?.amount ?? lineItem.total_money?.amount);
                const soldAt = order.closed_at || order.updated_at || null;

                current.quantitySold += quantitySold;
                current.grossRevenue += grossRevenue;

                if (soldAt && (!current.lastSoldAt || soldAt > current.lastSoldAt)) {
                    current.lastSoldAt = soldAt;
                }

                aggregates.set(variationId, current);
            }

            // --- Deduct return/refund amounts from order.returns[].return_line_items ---
            // Square attaches return_line_items directly to the original completed order,
            // providing per-variation refund attribution without a separate Refunds API call.
            for (const orderReturn of order.returns || []) {
                for (const returnLineItem of orderReturn.return_line_items || []) {
                    const variationId = returnLineItem.catalog_object_id;

                    if (!variationLookup.has(variationId)) {
                        continue;
                    }

                    totalReturnLineItems++;

                    const current = aggregates.get(variationId) || {
                        name: variationLookup.get(variationId).name,
                        quantitySold: 0,
                        quantityReturned: 0,
                        grossRevenue: 0,
                        refundedRevenue: 0,
                        revenue: 0,
                        lastSoldAt: null,
                    };

                    current.quantityReturned += Number(returnLineItem.quantity || 0);
                    current.refundedRevenue += normalizeMoney(
                        returnLineItem.gross_return_money?.amount ?? returnLineItem.total_money?.amount
                    );

                    aggregates.set(variationId, current);
                }
            }
        }

        cursor = payload.cursor || null;
    } while (cursor);

    // Compute net revenue for each variation (floor at 0 to avoid negative display values)
    let totalGross = 0;
    let totalRefunded = 0;

    for (const entry of aggregates.values()) {
        totalGross += entry.grossRevenue;
        totalRefunded += entry.refundedRevenue;
        entry.revenue = Math.max(0, entry.grossRevenue - entry.refundedRevenue);
    }

    squareLogger.info("consignment.square.sales_summary", {
        ordersFound: totalOrdersFound,
        matchingLineItems: totalMatchingLineItems,
        returnLineItems: totalReturnLineItems,
        grossRevenue: Number(totalGross.toFixed(2)),
        refundedRevenue: Number(totalRefunded.toFixed(2)),
        netRevenue: Number((totalGross - totalRefunded).toFixed(2)),
        variationCount: aggregates.size,
    });

    return Array.from(aggregates.values()).sort((left, right) => right.revenue - left.revenue || left.name.localeCompare(right.name));
}