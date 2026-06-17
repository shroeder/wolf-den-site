import "server-only";

import { randomUUID } from "node:crypto";

import { createServerLogger } from "@/lib/server-logger";

const SQUARE_API_BASE = "https://connect.squareup.com";
const DEFAULT_SALES_LOOKBACK_DAYS = 90;
const DEFAULT_MYSTERY_PACK_ITEM_ID = "XGXASEUSGRYBX2XQDIKVU4FA";
const SHOP_NEW_ITEMS_LOOKBACK_DAYS = 4;
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
const toAmountCents = (amountDollars) => Math.round(Number(amountDollars || 0) * 100);

const chunk = (values, size) => {
    const chunks = [];

    for (let index = 0; index < values.length; index += size) {
        chunks.push(values.slice(index, index + size));
    }

    return chunks;
};

const getCatalogImageId = (item, variation) => {
    const variationImageId = variation.item_variation_data?.image_ids?.[0];

    if (variationImageId) {
        return variationImageId;
    }

    return item.item_data?.image_ids?.[0] || null;
};

async function getImageUrlLookup(imageIds) {
    const urls = new Map();

    for (const batch of chunk(imageIds, 1000)) {
        if (!batch.length) {
            continue;
        }

        const payload = await squareFetch("/v2/catalog/batch-retrieve", {
            method: "POST",
            body: JSON.stringify({
                object_ids: batch,
            }),
        });

        for (const object of payload.objects || []) {
            if (object.type !== "IMAGE") {
                continue;
            }

            if (object.id && object.image_data?.url) {
                urls.set(object.id, object.image_data.url);
            }
        }
    }

    return urls;
}

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

function getSquareLocationId() {
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

    return locationId;
}

function normalizeCustomerEmail(value) {
    const normalized = String(value || "").trim().toLowerCase();

    return normalized || null;
}

function splitFullName(fullName) {
    const normalized = String(fullName || "").trim();

    if (!normalized) {
        return {
            givenName: null,
            familyName: null,
        };
    }

    const parts = normalized.split(/\s+/).filter(Boolean);

    if (parts.length === 1) {
        return {
            givenName: parts[0],
            familyName: null,
        };
    }

    return {
        givenName: parts.slice(0, -1).join(" "),
        familyName: parts[parts.length - 1],
    };
}

export async function findSquareCustomerByEmail(email) {
    const normalizedEmail = normalizeCustomerEmail(email);

    if (!normalizedEmail) {
        return null;
    }

    const payload = await squareFetch("/v2/customers/search", {
        method: "POST",
        body: JSON.stringify({
            query: {
                filter: {
                    email_address: {
                        exact: normalizedEmail,
                    },
                },
                sort: {
                    field: "CREATED_AT",
                    order: "DESC",
                },
            },
            limit: 1,
        }),
    });

    return payload.customers?.[0] || null;
}

export async function getSquareCustomerById(customerId) {
    const normalizedCustomerId = String(customerId || "").trim();

    if (!normalizedCustomerId) {
        return null;
    }

    const payload = await squareFetch(`/v2/customers/${normalizedCustomerId}`);

    return payload.customer || null;
}

export async function upsertSquareCustomerProfile({
    preferredCustomerId,
    allowEmailLookup = true,
    email,
    name,
    phone,
    addressLine1,
    addressLine2,
    city,
    state,
    postalCode,
    country,
}) {
    const normalizedEmail = normalizeCustomerEmail(email);

    if (!normalizedEmail) {
        throw new Error("Missing customer email.");
    }

    const { givenName, familyName } = splitFullName(name);
    const preferredId = String(preferredCustomerId || "").trim();
    const existingCustomer = preferredId
        ? await getSquareCustomerById(preferredId).catch(() => null)
        : (allowEmailLookup ? await findSquareCustomerByEmail(normalizedEmail) : null);
    const address = {
        address_line_1: String(addressLine1 || "").trim() || undefined,
        address_line_2: String(addressLine2 || "").trim() || undefined,
        locality: String(city || "").trim() || undefined,
        administrative_district_level_1: String(state || "").trim().toUpperCase() || undefined,
        postal_code: String(postalCode || "").trim() || undefined,
        country: String(country || "US").trim().toUpperCase() || "US",
    };

    const payload = {
        email_address: normalizedEmail,
        phone_number: String(phone || "").trim() || undefined,
        given_name: givenName || undefined,
        family_name: familyName || undefined,
        address,
    };

    if (existingCustomer?.id) {
        const updated = await squareFetch(`/v2/customers/${existingCustomer.id}`, {
            method: "PUT",
            body: JSON.stringify(payload),
        });

        return updated.customer || null;
    }

    const created = await squareFetch("/v2/customers", {
        method: "POST",
        body: JSON.stringify({
            ...payload,
            idempotency_key: randomUUID(),
        }),
    });

    return created.customer || null;
}

export function toCheckoutProfileFromSquareCustomer(customer) {
    if (!customer) {
        return null;
    }

    const fullName = [customer.given_name, customer.family_name].filter(Boolean).join(" ").trim();

    return {
        name: fullName || null,
        email: customer.email_address || null,
        phone: customer.phone_number || null,
        addressLine1: customer.address?.address_line_1 || null,
        addressLine2: customer.address?.address_line_2 || null,
        city: customer.address?.locality || null,
        state: customer.address?.administrative_district_level_1 || null,
        postalCode: customer.address?.postal_code || null,
        country: customer.address?.country || null,
    };
}

export async function listConsignorCatalog(categoryId) {
    const variations = [];
    const imageIds = new Set();
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
                const imageId = getCatalogImageId(item, variation);

                if (imageId) {
                    imageIds.add(imageId);
                }

                variations.push({
                    id: variation.id,
                    name: toDisplayName(item.item_data?.name || "Unnamed Item", variation.item_variation_data?.name),
                    price: normalizeMoney(variation.item_variation_data?.price_money?.amount),
                    imageId,
                });
            }
        }

        cursor = payload.cursor || null;
    } while (cursor);

    const imageUrlLookup = await getImageUrlLookup(Array.from(imageIds));

    squareLogger.info("square.catalog.list.completed", {
        categoryId,
        variationCount: variations.length,
    });

    return variations.map((variation) => ({
        id: variation.id,
        name: variation.name,
        price: variation.price,
        imageUrl: variation.imageId ? imageUrlLookup.get(variation.imageId) || null : null,
    }));
}

export async function getInventoryCounts(variationIds) {
    const locationId = getSquareLocationId();

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
    const locationId = getSquareLocationId();

    const lookbackDays = normalizeLookbackDays(options.lookbackDays);
    const parsedStart = options.startAt ? new Date(options.startAt) : null;
    const parsedEnd = options.endAt ? new Date(options.endAt) : null;
    const hasCustomWindow = parsedStart instanceof Date && !Number.isNaN(parsedStart.getTime()) && parsedEnd instanceof Date && !Number.isNaN(parsedEnd.getTime());
    const startDate = hasCustomWindow
        ? parsedStart.toISOString()
        : new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
    const endDate = hasCustomWindow ? parsedEnd.toISOString() : new Date().toISOString();
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
                    imageUrl: variation.imageUrl || null,
                    quantitySold: 0,
                    quantityReturned: 0,
                    grossRevenue: 0,
                    refundedRevenue: 0,
                    revenue: 0,
                    lastSoldAt: null,
                };
                const quantitySold = Number(lineItem.quantity || 0);
                // Use base_price_money × quantity (listed item price) so consignor
                // revenue reflects what the item was priced at, not the post-tax
                // amount Square reports in gross_sales_money when tax is inclusive.
                const unitPrice = normalizeMoney(lineItem.base_price_money?.amount ?? lineItem.gross_sales_money?.amount ?? lineItem.total_money?.amount);
                const grossRevenue = unitPrice * quantitySold;
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
                        imageUrl: variationLookup.get(variationId).imageUrl || null,
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

export async function listShopInventory() {
    // 1. Fetch all categories
    const categories = new Map();
    {
        let cursor = null;

        do {
            const params = new URLSearchParams({ types: "CATEGORY" });

            if (cursor) {
                params.set("cursor", cursor);
            }

            const payload = await squareFetch(`/v2/catalog/list?${params.toString()}`);

            for (const obj of payload.objects || []) {
                if (obj.type === "CATEGORY" && obj.id && obj.category_data?.name) {
                    categories.set(obj.id, obj.category_data.name);
                }
            }

            cursor = payload.cursor || null;
        } while (cursor);
    }

    // 2. Fetch all items and group variations by category
    const itemsByCategory = new Map();
    const allVariationIds = [];
    const imageIds = new Set();

    {
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

                if (isMysteryCatalogItem(item)) {
                    continue;
                }

                // Collect all category IDs from both legacy and current API fields
                const legacyCategoryId = item.item_data?.category_id;
                const categoriesArray = item.item_data?.categories || [];
                const categoryIds = new Set([
                    ...(legacyCategoryId ? [legacyCategoryId] : []),
                    ...categoriesArray.map((c) => c.id),
                ]);

                for (const categoryId of categoryIds) {
                    if (!categories.has(categoryId)) {
                        continue;
                    }

                    if (!itemsByCategory.has(categoryId)) {
                        itemsByCategory.set(categoryId, []);
                    }

                    for (const variation of item.item_data?.variations || []) {
                        const imageId = getCatalogImageId(item, variation);

                        if (imageId) {
                            imageIds.add(imageId);
                        }

                        allVariationIds.push(variation.id);
                        itemsByCategory.get(categoryId).push({
                            id: variation.id,
                            name: toDisplayName(item.item_data?.name || "Unnamed Item", variation.item_variation_data?.name),
                            price: normalizeMoney(variation.item_variation_data?.price_money?.amount),
                            imageId,
                            createdAt: variation.created_at || item.created_at || null,
                        });
                    }
                }
            }

            cursor = payload.cursor || null;
        } while (cursor);
    }

    // 3. Get inventory counts for all variations
    const counts = await getInventoryCounts(allVariationIds);
    const imageUrlLookup = await getImageUrlLookup(Array.from(imageIds));

    // 4. Build result — only categories/items that have in-stock quantity
    const result = [];
    const nowMs = Date.now();
    const newItemCutoffMs = nowMs - SHOP_NEW_ITEMS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
    const newItemsById = new Map();

    for (const [categoryId, categoryName] of categories) {
        const variations = itemsByCategory.get(categoryId) || [];
        const inStock = variations
            .map((v) => ({
                ...v,
                quantity: counts.get(v.id) || 0,
                imageUrl: v.imageId ? imageUrlLookup.get(v.imageId) || null : null,
            }))
            .filter((v) => v.quantity > 0)
            .sort((a, b) => a.name.localeCompare(b.name));

        for (const item of inStock) {
            const createdTime = Date.parse(item.createdAt || "");

            if (Number.isNaN(createdTime) || createdTime < newItemCutoffMs) {
                continue;
            }

            if (!newItemsById.has(item.id)) {
                newItemsById.set(item.id, item);
            }
        }

        if (inStock.length > 0) {
            result.push({ id: categoryId, name: categoryName, items: inStock });
        }
    }

    const newItems = Array.from(newItemsById.values()).sort((a, b) => a.name.localeCompare(b.name));

    if (newItems.length > 0) {
        result.push({
            id: "new-last-4-days",
            name: "New (Last 4 Days)",
            items: newItems,
        });
    }

    result.sort((a, b) => a.name.localeCompare(b.name));

    squareLogger.info("square.shop_inventory.list.completed", {
        categoryCount: result.length,
        totalItems: result.reduce((sum, c) => sum + c.items.length, 0),
    });

    return result;
}

// Scanned cards are pushed to Square with SKU "TCG-<tcgplayerProductId>"
// (accounting_app SquareTransactionsService.buildSquareVariationSku). This matches that pattern.
const TCG_SKU_PATTERN = /^TCG-(\d+)$/i;

/**
 * Scan the Square catalog for variations whose SKU encodes a tcgplayer product id and that
 * currently have stock. Returns a Map of tcgplayer productId -> in-stock quantity, used to
 * match against "Looking For" wishlists. Lean counterpart to listShopInventory (which discards
 * SKUs and only groups by category).
 */
export async function listInStockTcgSkus() {
    const skuByVariationId = new Map();
    const productIdByVariationId = new Map();

    let cursor = null;

    do {
        const params = new URLSearchParams({ types: "ITEM" });

        if (cursor) {
            params.set("cursor", cursor);
        }

        const payload = await squareFetch(`/v2/catalog/list?${params.toString()}`);

        for (const item of payload.objects || []) {
            if (item.type !== "ITEM" || isMysteryCatalogItem(item)) {
                continue;
            }

            for (const variation of item.item_data?.variations || []) {
                const sku = variation.item_variation_data?.sku || "";
                const match = TCG_SKU_PATTERN.exec(sku.trim());

                if (!match) {
                    continue;
                }

                skuByVariationId.set(variation.id, sku);
                productIdByVariationId.set(variation.id, Number(match[1]));
            }
        }

        cursor = payload.cursor || null;
    } while (cursor);

    const counts = await getInventoryCounts(Array.from(skuByVariationId.keys()));
    const quantityByProductId = new Map();

    for (const [variationId, productId] of productIdByVariationId) {
        const quantity = counts.get(variationId) || 0;

        if (quantity > 0) {
            quantityByProductId.set(productId, (quantityByProductId.get(productId) || 0) + quantity);
        }
    }

    squareLogger.info("square.tcg_skus.list.completed", {
        matchedVariations: skuByVariationId.size,
        inStockProducts: quantityByProductId.size,
    });

    return quantityByProductId;
}

function normalizeName(value) {
    return String(value || "")
        .trim()
        .toLowerCase();
}

function isLikelyMysteryLabel(value) {
    const normalized = normalizeName(value);

    if (!normalized) {
        return false;
    }

    const hasMystery = normalized.includes("mystery");
    const hasPackOrBag = normalized.includes("pack") || normalized.includes("bag");

    return hasMystery && hasPackOrBag;
}

function getConfiguredMysteryVariationIds() {
    const configured = process.env.MYSTERY_BAG_PACK_VARIATION_IDS || process.env.MYSTERY_BAG_PACK_VARIATION_ID || "";

    return new Set(
        configured
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
    );
}

function isMysteryCatalogItem(item) {
    if (!item || item.type !== "ITEM") {
        return false;
    }

    const configuredItemId = process.env.SQUARE_MYSTERY_BAG_ITEM_ID || DEFAULT_MYSTERY_PACK_ITEM_ID;

    if (configuredItemId && item.id === configuredItemId) {
        return true;
    }

    if (isLikelyMysteryLabel(item.item_data?.name)) {
        return true;
    }

    const configuredSingleVariationId = String(process.env.SQUARE_MYSTERY_BAG_VARIATION_ID || "").trim();
    const configuredVariationIds = getConfiguredMysteryVariationIds();

    for (const variation of item.item_data?.variations || []) {
        if (!variation?.id) {
            continue;
        }

        if (configuredSingleVariationId && variation.id === configuredSingleVariationId) {
            return true;
        }

        if (configuredVariationIds.has(variation.id)) {
            return true;
        }

        if (isLikelyMysteryLabel(variation.item_variation_data?.name)) {
            return true;
        }

        if (isLikelyMysteryLabel(variation.item_variation_data?.sku)) {
            return true;
        }
    }

    return false;
}

function selectVariationForItem(item) {
    const variations = item?.item_data?.variations || [];

    if (!variations.length) {
        return null;
    }

    const preferredVariationName = normalizeName(process.env.SQUARE_MYSTERY_BAG_VARIATION_NAME || "regular");
    const exactMatch = variations.find(
        (variation) => normalizeName(variation?.item_variation_data?.name) === preferredVariationName
    );

    if (exactMatch) {
        return exactMatch;
    }

    const pricedVariation = variations.find(
        (variation) => Number(variation?.item_variation_data?.price_money?.amount || 0) > 0
    );

    return pricedVariation || variations[0];
}

function toMysteryBagPrice(variation) {
    const amount = variation?.item_variation_data?.price_money?.amount;

    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
        return null;
    }

    return normalizeMoney(amount);
}

function getNameMatchScore(itemName, query) {
    if (!itemName || !query) {
        return 0;
    }

    if (itemName === query) {
        return 3;
    }

    if (itemName.startsWith(query)) {
        return 2;
    }

    if (itemName.includes(query)) {
        return 1;
    }

    return 0;
}

async function findMysteryBagVariationByName(nameQuery) {
    const normalizedNameQuery = normalizeName(nameQuery);

    if (!normalizedNameQuery) {
        return null;
    }

    let cursor = null;
    let bestCandidate = null;

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

            if (item.is_deleted) {
                continue;
            }

            const itemName = normalizeName(item.item_data?.name);
            const matchScore = getNameMatchScore(itemName, normalizedNameQuery);

            if (matchScore === 0) {
                continue;
            }

            const variation = selectVariationForItem(item);
            const price = toMysteryBagPrice(variation);

            if (!variation || price === null) {
                continue;
            }

            const updatedAt = item.updated_at || variation.updated_at || null;

            if (!bestCandidate) {
                bestCandidate = {
                    variation,
                    itemName: item.item_data?.name || null,
                    matchScore,
                    updatedAt,
                };
                continue;
            }

            if (matchScore > bestCandidate.matchScore) {
                bestCandidate = {
                    variation,
                    itemName: item.item_data?.name || null,
                    matchScore,
                    updatedAt,
                };
                continue;
            }

            if (matchScore === bestCandidate.matchScore) {
                const currentTime = Date.parse(updatedAt || "");
                const bestTime = Date.parse(bestCandidate.updatedAt || "");

                if (!Number.isNaN(currentTime) && (Number.isNaN(bestTime) || currentTime > bestTime)) {
                    bestCandidate = {
                        variation,
                        itemName: item.item_data?.name || null,
                        matchScore,
                        updatedAt,
                    };
                }
            }
        }

        cursor = payload.cursor || null;
    } while (cursor);

    return bestCandidate;
}

export async function getMysteryBagPriceFromSquare() {
    const priceInfo = await getMysteryBagPriceInfoFromSquare();

    return priceInfo.price;
}

export async function getMysteryBagPriceInfoFromSquare() {
    const variationId = process.env.SQUARE_MYSTERY_BAG_VARIATION_ID;
    const itemId = process.env.SQUARE_MYSTERY_BAG_ITEM_ID || DEFAULT_MYSTERY_PACK_ITEM_ID;
    const nameQuery = process.env.SQUARE_MYSTERY_BAG_NAME || "mystery pack";

    if (variationId) {
        const payload = await squareFetch(`/v2/catalog/object/${variationId}`);
        const variation = payload?.object;
        const price = toMysteryBagPrice(variation);

        if (price !== null) {
            return {
                price,
                source: "square_variation_id",
                variationId: variation?.id || variationId,
            };
        }
    }

    if (itemId) {
        const payload = await squareFetch(`/v2/catalog/object/${itemId}`);
        const variation = selectVariationForItem(payload?.object);
        const price = toMysteryBagPrice(variation);

        if (price !== null) {
            return {
                price,
                source: "square_item_id",
                variationId: variation?.id || null,
            };
        }
    }

    const matchedCandidate = await findMysteryBagVariationByName(nameQuery);
    const price = toMysteryBagPrice(matchedCandidate?.variation);

    if (price !== null) {
        return {
            price,
            source: "square_name_match",
            matchedItemName: matchedCandidate?.itemName || null,
            variationId: matchedCandidate?.variation?.id || null,
        };
    }

    return {
        price: null,
        source: "square_not_found",
        variationId: null,
    };
}

export async function getMysteryBagRemainingPacks(variationId) {
    const normalizedVariationId = String(variationId || "").trim();

    if (!normalizedVariationId) {
        return null;
    }

    const counts = await getInventoryCounts([normalizedVariationId]);
    const remaining = counts.get(normalizedVariationId);

    return Number.isFinite(Number(remaining)) ? Number(remaining) : null;
}

export async function findShopItemByVariationId(variationId) {
    const normalizedVariationId = String(variationId || "").trim();

    if (!normalizedVariationId) {
        return null;
    }

    const categories = await listShopInventory();

    for (const category of categories) {
        const item = category.items.find((entry) => entry.id === normalizedVariationId);

        if (item) {
            return {
                ...item,
                categoryName: category.name,
            };
        }
    }

    return null;
}

export async function createSquareCardPayment({
    sourceId,
    amountCents,
    idempotencyKey,
    note,
    referenceId,
}) {
    const normalizedSourceId = String(sourceId || "").trim();
    const normalizedAmountCents = Number(amountCents || 0);
    const normalizedIdempotencyKey = String(idempotencyKey || "").trim();

    if (!normalizedSourceId) {
        throw new Error("Missing payment source id.");
    }

    if (!Number.isFinite(normalizedAmountCents) || normalizedAmountCents <= 0) {
        throw new Error("Invalid payment amount.");
    }

    if (!normalizedIdempotencyKey) {
        throw new Error("Missing payment idempotency key.");
    }

    const payload = await squareFetch("/v2/payments", {
        method: "POST",
        body: JSON.stringify({
            source_id: normalizedSourceId,
            idempotency_key: normalizedIdempotencyKey,
            location_id: getSquareLocationId(),
            amount_money: {
                amount: Math.round(normalizedAmountCents),
                currency: "USD",
            },
            autocomplete: true,
            note: note || undefined,
            reference_id: referenceId || undefined,
        }),
    });

    return payload.payment || null;
}

export async function getSquarePaymentById(paymentId) {
    const normalizedPaymentId = String(paymentId || "").trim();

    if (!normalizedPaymentId) {
        return null;
    }

    const payload = await squareFetch(`/v2/payments/${normalizedPaymentId}`);

    return payload.payment || null;
}

export function calculateOnlineFeeCents(subtotalAmountDollars) {
    const subtotalCents = toAmountCents(subtotalAmountDollars);

    if (subtotalCents <= 0) {
        return 0;
    }

    return Math.round(subtotalCents * 0.035);
}

export function toPriceCents(amountDollars) {
    return toAmountCents(amountDollars);
}

export async function getSquareCatalogObjectById(objectId) {
    const normalizedId = String(objectId || "").trim();

    if (!normalizedId) {
        return null;
    }

    const payload = await squareFetch(`/v2/catalog/object/${normalizedId}`);

    return payload?.object || null;
}

export async function getSquareOrder(orderId) {
    const normalizedId = String(orderId || "").trim();

    if (!normalizedId) {
        return null;
    }

    const payload = await squareFetch(`/v2/orders/${normalizedId}`);

    return payload?.order || null;
}

export async function deleteSquareCatalogObject(objectId) {
    const normalizedId = String(objectId || "").trim();

    if (!normalizedId) {
        return null;
    }

    return squareFetch(`/v2/catalog/object/${normalizedId}`, { method: "DELETE" });
}