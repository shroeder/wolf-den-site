import "server-only";

import { db } from "@/lib/db";
import { getInventoryCounts, listConsignorCatalog, squareFetch } from "@/lib/consignment/square";
import { createServerLogger } from "@/lib/server-logger";

// ── PUTTING A CONSIGNOR'S ITEMS INTO SQUARE FROM THE APP ────────────────────────────────────────────────────
// Luke: "Can u make it so I can add items to consignors from the admin and employee app, ill need to set the
// price and take pictures type in name and optional description and set quantity. And see and manage
// existing items."
//
// ⚠️ A CONSIGNOR IS A SQUARE CATEGORY. There is no consignment_item table and there must not be one: every
// report, the payout maths and the consignor portal all attribute a sale by the Square category its item
// sits in (consignors.square_category_id). An item recorded anywhere else is invisible to all of them.
//
// ⚠️ AND A CONSIGNED ITEM GETS NO UNIT COST. Its cost is the consignor's payout — payout_rate x net revenue,
// resolved at sale time by category. Writing a wolfden_item_cost row here would describe a purchase that
// never happened, and the one thing worse than no cost is a confident wrong one.

const logger = createServerLogger({ source: "api", subsystem: "consignor-inventory" });

/** Square wants a name on the variation; anything but "Regular" gets appended to the item name on the shelf. */
const VARIATION_NAME = "Regular";

/**
 * ⚠️ THE CATEGORY GOES ON reporting_category AS WELL AS categories[]. Square stores `category_id` and
 * `categories[]` for display, but ONLY `reporting_category` reaches a sale line — which is exactly what the
 * consignor payout rule reads. An item categorised the pretty way and not the reporting way is a consigned
 * item that pays the shop 100% of every sale, silently.
 */
function itemBody({ name, description, categoryId, taxIds, priceCents, sku }) {
    return {
        type: "ITEM",
        id: `#${sku}`,
        present_at_all_locations: true,
        item_data: {
            name,
            ...(description ? { description } : {}),
            categories: [{ id: categoryId, ordinal: 0 }],
            reporting_category: { id: categoryId },
            tax_ids: taxIds,
            variations: [{
                type: "ITEM_VARIATION",
                id: `#${sku}-var`,
                present_at_all_locations: true,
                item_variation_data: {
                    item_id: `#${sku}`,
                    name: VARIATION_NAME,
                    sku,
                    pricing_type: "FIXED_PRICING",
                    price_money: { amount: priceCents, currency: "USD" },
                    track_inventory: true,
                },
            }],
        },
    };
}

/** Load the consignor row, or null. The category id on it is the whole addressing scheme. */
async function loadConsignor(consignorId) {
    return db.queryOne(
        `SELECT id, slug, display_name, square_category_id, payout_rate, active
           FROM consignors WHERE id = $1`,
        [String(consignorId)],
    );
}

/**
 * ⚠️ TAX OR IT RINGS UP UNTAXED. The same rule the restock push and the pre-order scripts enforce, and the
 * reason the May–July under-collection happened. A consigned item is no less taxable for being somebody
 * else's stock.
 */
async function enabledTaxIds() {
    const taxes = await squareFetch("/v2/catalog/list?types=TAX");
    return (taxes.objects || []).filter((t) => t.tax_data?.enabled).map((t) => t.id);
}

/** A stable, collision-resistant SKU. Prefixed by the consignor so a shelf scan says whose it is. */
function buildSku(slug, name) {
    const who = String(slug || "con").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 6) || "CON";
    const what = String(name || "").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 8) || "ITEM";
    // Base36 of the clock gives a short suffix that is unique per second without a round trip to check.
    const stamp = Date.now().toString(36).toUpperCase().slice(-5);
    return `C-${who}-${what}-${stamp}`;
}

/** Everything this consignor has on the shelf, with live counts. */
export async function listConsignorItems(consignorId) {
    const consignor = await loadConsignor(consignorId);
    if (!consignor) return { ok: false, error: "no_consignor" };
    if (!consignor.square_category_id) return { ok: false, error: "no_category" };

    const catalog = await listConsignorCatalog(consignor.square_category_id);
    // ⚠️ ONE BATCH READ FOR EVERY COUNT, not one per item. A consignor with eighty rows would otherwise be
    // eighty round trips on a path somebody is standing in front of.
    const counts = await getInventoryCounts(catalog.map((c) => c.id)).catch(() => new Map());

    return {
        ok: true,
        consignor: {
            id: consignor.id,
            name: consignor.display_name,
            payoutRate: Number(consignor.payout_rate || 0),
        },
        items: catalog.map((c) => ({
            variationId: c.id,
            name: c.name,
            price: c.price,
            imageUrl: c.imageUrl,
            quantity: Number(counts.get(c.id) || 0),
        })),
    };
}

/** Create one item in this consignor's category. Returns the ids the phone needs to attach a photo. */
export async function createConsignorItem(consignorId, { name, description, priceCents, quantity }) {
    const consignor = await loadConsignor(consignorId);
    if (!consignor) return { ok: false, error: "no_consignor" };
    if (!consignor.square_category_id) return { ok: false, error: "no_category" };

    const cleanName = String(name || "").trim();
    if (!cleanName) return { ok: false, error: "name_required" };
    const price = Number(priceCents);
    if (!Number.isFinite(price) || price <= 0) return { ok: false, error: "price_required" };
    const qty = Math.max(0, Math.trunc(Number(quantity) || 0));

    const taxIds = await enabledTaxIds();
    if (!taxIds.length) return { ok: false, error: "no_enabled_tax" };

    const sku = buildSku(consignor.slug, cleanName);
    const created = await squareFetch("/v2/catalog/object", {
        method: "POST",
        body: JSON.stringify({
            idempotency_key: `consign-item-${sku}`,
            object: itemBody({
                name: cleanName,
                description: String(description || "").trim(),
                categoryId: consignor.square_category_id,
                taxIds,
                priceCents: Math.round(price),
                sku,
            }),
        }),
    });

    const itemId = created.catalog_object?.id;
    const variationId = created.catalog_object?.item_data?.variations?.[0]?.id;
    if (!variationId) return { ok: false, error: "square_no_variation" };

    if (qty > 0) await setItemQuantity(variationId, qty);

    logger.info("consignor.item.created", { consignorId, variationId, sku, priceCents: Math.round(price), qty });
    return { ok: true, itemId, variationId, sku, name: cleanName, price: Math.round(price) / 100, quantity: qty };
}

/** Set an absolute on-hand count. PHYSICAL_COUNT, not an adjustment — the phone knows the total, not a delta. */
export async function setItemQuantity(variationId, quantity) {
    const locs = await squareFetch("/v2/locations");
    const locationId = locs.locations?.[0]?.id;
    if (!locationId) return { ok: false, error: "no_location" };
    await squareFetch("/v2/inventory/changes/batch-create", {
        method: "POST",
        body: JSON.stringify({
            idempotency_key: `consign-qty-${variationId}-${quantity}-${Date.now()}`,
            changes: [{
                type: "PHYSICAL_COUNT",
                physical_count: {
                    catalog_object_id: variationId,
                    state: "IN_STOCK",
                    location_id: locationId,
                    quantity: String(Math.max(0, Math.trunc(quantity))),
                    occurred_at: new Date().toISOString(),
                },
            }],
        }),
    });
    return { ok: true };
}

/**
 * Edit an existing item: price, quantity, name, description — any subset.
 *
 * ⚠️ READ THE OBJECT AT ITS CURRENT VERSION AND WRITE THE ONE FIELD BACK. Square upserts with a version:
 * omitting it 409s under any concurrent edit, and sending a stale one silently clobbers whatever somebody
 * changed in the dashboard meanwhile.
 */
export async function updateConsignorItem(variationId, { priceCents, quantity, name, description }) {
    const cur = await squareFetch(`/v2/catalog/object/${encodeURIComponent(variationId)}`);
    const variation = cur.object;
    if (!variation?.item_variation_data) return { ok: false, error: "no_variation" };

    if (priceCents != null) {
        const price = Math.round(Number(priceCents));
        if (!Number.isFinite(price) || price <= 0) return { ok: false, error: "bad_price" };
        await squareFetch("/v2/catalog/object", {
            method: "POST",
            body: JSON.stringify({
                idempotency_key: `consign-price-${variationId}-${price}-${variation.version}`,
                object: {
                    ...variation,
                    item_variation_data: {
                        ...variation.item_variation_data,
                        price_money: { amount: price, currency: "USD" },
                    },
                },
            }),
        });
    }

    // ⚠️ THE NAME AND DESCRIPTION LIVE ON THE PARENT ITEM, NOT THE VARIATION — the same trap the pre-order
    // rename hit. Renaming the variation would leave the shelf and the POS showing the old name.
    if (name != null || description != null) {
        const itemId = variation.item_variation_data.item_id;
        const itemRes = await squareFetch(`/v2/catalog/object/${encodeURIComponent(itemId)}`);
        const item = itemRes.object;
        if (item?.item_data) {
            await squareFetch("/v2/catalog/object", {
                method: "POST",
                body: JSON.stringify({
                    idempotency_key: `consign-name-${itemId}-${item.version}`,
                    object: {
                        ...item,
                        item_data: {
                            ...item.item_data,
                            ...(name != null ? { name: String(name).trim() } : {}),
                            ...(description != null ? { description: String(description).trim() } : {}),
                        },
                    },
                }),
            });
        }
    }

    if (quantity != null) await setItemQuantity(variationId, quantity);

    logger.info("consignor.item.updated", { variationId, priceCents, quantity, renamed: name != null });
    return { ok: true };
}

/**
 * Take an item off consignment.
 *
 * ⚠️ IT ZEROES THE STOCK, IT DOES NOT DELETE THE SQUARE ITEM. Deleting destroys the cost and category
 * history every past sale of it is costed through — the COGS resolver reads the catalog, and a deleted
 * object only comes back with include_deleted_objects, which most callers do not pass. A consignor taking
 * their box home must not silently re-price every sale of it we already made.
 *
 * Zero on hand takes it off the shelf and out of every stock view, and the row stays costable for ever.
 */
export async function removeConsignorItem(variationId) {
    await setItemQuantity(variationId, 0);
    logger.info("consignor.item.removed", { variationId });
    return { ok: true, zeroed: true };
}
