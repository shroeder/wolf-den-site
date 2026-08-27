import "server-only";

import { calculateOnlineFeeCents, getShopSalesTaxRate, listShopInventory, toPriceCents } from "@/lib/consignment/square";
import { db } from "@/lib/db";
import { shopShippingCents, shopTaxCents } from "@/lib/shop-pricing";
import { computeShopPricing } from "@/lib/single-discount";
import {
    getExistingCartId,
    setShopCartId,
} from "@/lib/shop-cart-session";
import { loadActiveConsignorsByCategory } from "@/lib/consignment/trade-sales";

function normalizeQuantity(value, fallback = 1) {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }

    return Math.floor(parsed);
}

function toInventoryMap(categories) {
    const inventory = new Map();

    for (const category of categories || []) {
        for (const item of category.items || []) {
            const prev = inventory.get(item.id);
            inventory.set(item.id, {
                ...item,
                categoryName: category.name,
                // Every Square category this variation is filed under. The consignment check needs IDs, not
                // names — consignors are keyed on square_category_id — and an item can sit in several
                // categories, so they accumulate rather than the last one winning.
                categoryIds: [...(prev?.categoryIds || []), category.id].filter(Boolean),
            });
        }
    }

    return inventory;
}

export async function ensureCart(cartId) {
    await db.query(
        `INSERT INTO shop_carts (id)
         VALUES ($1)
         ON CONFLICT (id) DO UPDATE SET updated_at = NOW()`,
        [cartId]
    );
}

async function createCartRecord(customerId = null) {
    const created = await db.queryOne(
        `INSERT INTO shop_carts (customer_id)
         VALUES ($1)
         RETURNING id, customer_id`,
        [customerId || null]
    );

    return created;
}

async function getCartRecord(cartId) {
    if (!cartId) {
        return null;
    }

    return db.queryOne(
        `SELECT id, customer_id
         FROM shop_carts
         WHERE id = $1`,
        [cartId]
    );
}

async function getCartByCustomerId(customerId) {
    if (!customerId) {
        return null;
    }

    return db.queryOne(
        `SELECT id, customer_id
         FROM shop_carts
         WHERE customer_id = $1
         ORDER BY updated_at DESC
         LIMIT 1`,
        [customerId]
    );
}

async function assignCartToCustomer(cartId, customerId) {
    return db.queryOne(
        `UPDATE shop_carts
         SET customer_id = $2,
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, customer_id`,
        [cartId, customerId]
    );
}

async function mergeCartItems(sourceCartId, targetCartId) {
    if (!sourceCartId || !targetCartId || sourceCartId === targetCartId) {
        return;
    }

    const sourceItems = await db.query(
        `SELECT catalog_object_id, quantity
         FROM shop_cart_items
         WHERE cart_id = $1`,
        [sourceCartId]
    );

    for (const sourceItem of sourceItems) {
        const existing = await getCartItem(targetCartId, sourceItem.catalog_object_id);
        const mergedQuantity = Number(existing?.quantity || 0) + Number(sourceItem.quantity || 0);

        await setCartItemQuantity(targetCartId, sourceItem.catalog_object_id, mergedQuantity);
    }

    await clearCartItems(sourceCartId);
}

export async function resolveActiveCartId({ cookieStore, customerId = null }) {
    if (customerId) {
        const customerCart = await getCartByCustomerId(customerId);
        const cookieCartId = getExistingCartId(cookieStore);

        if (customerCart) {
            if (cookieCartId && cookieCartId !== customerCart.id) {
                const cookieCart = await getCartRecord(cookieCartId);

                if (cookieCart && !cookieCart.customer_id) {
                    await mergeCartItems(cookieCart.id, customerCart.id);
                }
            }

            setShopCartId(cookieStore, customerCart.id);

            return customerCart.id;
        }

        if (cookieCartId) {
            const cookieCart = await getCartRecord(cookieCartId);

            if (cookieCart && !cookieCart.customer_id) {
                await assignCartToCustomer(cookieCart.id, customerId);
                setShopCartId(cookieStore, cookieCart.id);

                return cookieCart.id;
            }
        }

        const created = await createCartRecord(customerId);
        setShopCartId(cookieStore, created.id);

        return created.id;
    }

    const cookieCartId = getExistingCartId(cookieStore);

    if (cookieCartId) {
        const cookieCart = await getCartRecord(cookieCartId);

        if (cookieCart && !cookieCart.customer_id) {
            return cookieCart.id;
        }
    }

    const created = await createCartRecord(null);
    setShopCartId(cookieStore, created.id);

    return created.id;
}

export async function getCartItem(cartId, catalogObjectId) {
    return db.queryOne(
        `SELECT cart_id, catalog_object_id, quantity
         FROM shop_cart_items
         WHERE cart_id = $1 AND catalog_object_id = $2`,
        [cartId, catalogObjectId]
    );
}

export async function setCartItemQuantity(cartId, catalogObjectId, quantity) {
    const normalizedQuantity = normalizeQuantity(quantity, 0);

    if (normalizedQuantity <= 0) {
        await db.query(
            `DELETE FROM shop_cart_items
             WHERE cart_id = $1 AND catalog_object_id = $2`,
            [cartId, catalogObjectId]
        );

        return;
    }

    await ensureCart(cartId);

    await db.query(
        `INSERT INTO shop_cart_items (cart_id, catalog_object_id, quantity)
         VALUES ($1, $2, $3)
         ON CONFLICT (cart_id, catalog_object_id)
         DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW()`,
        [cartId, catalogObjectId, normalizedQuantity]
    );
}

export async function clearCartItems(cartId) {
    await db.query(
        `DELETE FROM shop_cart_items
         WHERE cart_id = $1`,
        [cartId]
    );
}

export async function getCartSummary(cartId, { fulfillmentMode = null } = {}) {
    await ensureCart(cartId);

    const [rows, categories] = await Promise.all([
        db.query(
            `SELECT catalog_object_id, quantity
             FROM shop_cart_items
             WHERE cart_id = $1
             ORDER BY created_at ASC`,
            [cartId]
        ),
        listShopInventory(),
    ]);

    const inventoryMap = toInventoryMap(categories);
    // Which Square categories belong to an active consignor. The same map the reconciler and cost-sync use.
    const consignorCategories = await loadActiveConsignorsByCategory().catch(() => new Map());
    const items = [];
    let subtotalCents = 0;
    let itemCount = 0;
    let hasUnavailableItems = false;

    for (const row of rows) {
        const inventoryItem = inventoryMap.get(row.catalog_object_id);
        const quantity = normalizeQuantity(row.quantity);

        if (!inventoryItem) {
            hasUnavailableItems = true;
            items.push({
                catalogObjectId: row.catalog_object_id,
                name: "Item no longer available",
                categoryName: null,
                imageUrl: null,
                quantity,
                maxQuantity: 0,
                unavailable: true,
                lineTotalCents: 0,
                priceCents: 0,
            });
            continue;
        }

        const fullPriceCents = toPriceCents(inventoryItem.price);
        // Online-only promo: 10% off singles over $100. Applied here so the charged amount, tax, and
        // order record all use the discounted price automatically (checkout derives its total from this).
        const pricing = computeShopPricing(inventoryItem.name, fullPriceCents);
        const priceCents = pricing.priceCents;
        const maxQuantity = Math.max(0, Number(inventoryItem.quantity || 0));

        if (maxQuantity < quantity || maxQuantity < 1) {
            hasUnavailableItems = true;
        }

        const lineTotalCents = priceCents * quantity;

        subtotalCents += lineTotalCents;
        itemCount += quantity;

        items.push({
            catalogObjectId: row.catalog_object_id,
            name: inventoryItem.name,
            categoryName: inventoryItem.categoryName,
            imageUrl: inventoryItem.imageUrl || null,
            quantity,
            maxQuantity,
            unavailable: maxQuantity < quantity || maxQuantity < 1,
            lineTotalCents,
            priceCents,
            originalPriceCents: pricing.originalCents,
            isDiscounted: pricing.isDiscounted,
        });
    }

    const onlineFeeCents = calculateOnlineFeeCents(subtotalCents / 100);
    const taxRate = await getShopSalesTaxRate();
    const taxCents = shopTaxCents(subtotalCents, taxRate);
    const shippingCents = shopShippingCents(subtotalCents, fulfillmentMode);

    return {
        cartId,
        items,
        itemCount,
        subtotalCents,
        onlineFeeCents,
        taxCents,
        shippingCents,
        totalCents: subtotalCents + onlineFeeCents + taxCents + shippingCents,
        hasUnavailableItems,
    };
}
