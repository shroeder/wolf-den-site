import "server-only";
import { cartPreorderDate, getItemRules, preorderSentence } from "@/lib/shop-item-rules.js";

import {
    calculateOnlineFeeCents,
    getCartInventory,
    getShopSalesTaxRate,
    toPriceCents,
} from "@/lib/consignment/square";
import { db } from "@/lib/db";
import { shopInsuranceQuote, shopShippingCents, shopTaxCents } from "@/lib/shop-pricing";
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

// ── EVERY READ IS LIVE NOW, AND `cached` NO LONGER SELECTS ANYTHING ─────────────────────────────────────────
// This used to be a genuine trade. The summary is BOTH the cart view and the thing checkout charges from
// (checkout/route.js bills `subtotalCents` off it and refuses the sale on `hasUnavailableItems`), and the
// only way to price it was listShopInventory() — 24 sequential Square calls, seven to eleven seconds. So the
// money path read live and the view path was allowed a per-lambda memo up to a minute old, with checkout's
// 409 as the net if the catalogue moved in between.
//
// Pricing only the lines in the basket costs about a second, so there is nothing left to trade: the view and
// the money path both read live, and the staleness window is gone rather than merely small.
//
// ⚠️ `cached` IS STILL ACCEPTED AND IS NOW IGNORED. Four call sites pass it. Removing the parameter would
// break them for no gain, and honouring it would mean keeping a slow path alive to be slower — so it stays
// in the signature, does nothing, and says so here. It comes out when the last caller does.
export async function getCartSummary(cartId, { fulfillmentMode = null, cached = false } = {}) {
    await ensureCart(cartId);

    const rows = await db.query(
        `SELECT catalog_object_id, quantity
         FROM shop_cart_items
         WHERE cart_id = $1
         ORDER BY created_at ASC`,
        [cartId]
    );

    // ── ⚠️ ONLY THE LINES IN THE CART, NOT THE WHOLE CATALOGUE ──────────────────────────────────────
    // Luke: "The add to cart features takes a really long time" / "Loading my cart takes fucking way long
    // too." Measured on production first: 9.4s cold, 0.24s warm.
    //
    // This read listShopInventory() -- every category, then every item in every category, cursor by
    // cursor, then counts and image URLs for all seventeen hundred variations -- and then used the three
    // ids that were actually in the basket. The shared() cache in front of it is per-lambda, so a cold
    // instance paid the entire bill and most requests hit a cold instance.
    //
    // getCartInventory asks Square for exactly these ids: same API, same fields, same source of truth for
    // the price the customer is charged. Measured against the old path across 40 real variations --
    // name, price, quantity, sku and imageUrl identical on every one -- which is the check CLAUDE.md asks
    // for on a family-A narrowing. 11.0s to 1.0s.
    //
    // ⚠️ THE `cached` FLAG IS GONE RATHER THAN KEPT. It selected a per-lambda memo of the whole catalogue,
    // and there is no whole catalogue here any more; leaving the parameter in place would be a knob that
    // silently does nothing, which is worse than one that is missing.
    const inventoryMap = await getCartInventory(rows.map((r) => r.catalog_object_id));
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

        // ── THE CATALOG PRICE, AND ONLY THE CATALOG PRICE ────────────────────────────────────────────────
        // There was a "10% off singles over $100" promo applied here. The Wolf Den does not discount, and no
        // one asked for it — the commit that added it on 2026-07-14 cites no request, unlike every other
        // change in this repo. It ran for six weeks, and because it keyed on nothing but price and a
        // condition token in the name it spent most of itself on CONSIGNED cards: of the six items that
        // qualified, five belonged to consignors on 87-95% payouts, where 10% is more than the whole margin.
        //
        // If a discount is ever wanted again it belongs in Square, where the POS and the online shop read the
        // same number, not in a helper the shop applies on its way to checkout.
        const priceCents = toPriceCents(inventoryItem.price);
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
            // Kept on the line, both equal to the catalog price, so cart views that read them still render.
            // There is no promo; nothing here is ever discounted.
            originalPriceCents: priceCents,
            isDiscounted: false,
        });
    }

    // ── SELLING RULES, CARRIED ON THE CART ──────────────────────────────────────────────────────────
    // ⚠️ THE CART HAS TO KNOW, NOT JUST THE CHECKOUT. Checkout refuses a shipping order containing a
    // pickup-only item, and a refusal is the right backstop — but a customer who filled in an address, picked
    // a shipping rate and typed a card before being told the item cannot ship has been wasted, and will
    // reasonably assume the shop is broken. One query, on a summary that already runs several.
    const itemRules = await getItemRules(items.map((i) => i.catalogObjectId));
    let pickupOnly = false;
    for (const item of items) {
        const rule = itemRules[item.catalogObjectId];
        if (!rule) continue;
        item.pickupOnly = rule.pickupOnly;
        item.limitPerCustomer = rule.limitPerCustomer;
        // Per line, so the cart can badge the one that is holding the order up rather than only saying
        // the order is held. With two pre-orders in a basket the customer should be able to see which.
        item.preorderArrivesOn = rule.preorderArrivesOn || null;
        if (rule.pickupOnly) pickupOnly = true;
        // A limit also caps the line: offering a quantity stepper that goes to 5 on a one-per-customer item
        // is an invitation to a refusal at the till.
        if (rule.limitPerCustomer != null) {
            item.maxQuantity = Math.min(item.maxQuantity, rule.limitPerCustomer);
            if (item.quantity > rule.limitPerCustomer) item.unavailable = true;
        }
    }
    if (pickupOnly) hasUnavailableItems = hasUnavailableItems || items.some((i) => i.unavailable);

    const onlineFeeCents = calculateOnlineFeeCents(subtotalCents / 100);
    const taxRate = await getShopSalesTaxRate();
    // ⚠️ ORDER MATTERS NOW. Shipping is part of the taxable base, so it has to be known before the tax is
    // worked out — these two lines were the other way round and tax was quoted on merchandise alone.
    // ⚠️ A PICKUP-ONLY CART IS QUOTED AS PICKUP WHATEVER THE CALLER ASKED FOR. Otherwise the cart page
    // shows a shipping charge and a tax figure computed on top of it for an order that can only ever be
    // collected, and the totals move the moment they reach checkout.
    const effectiveMode = pickupOnly ? "pickup" : fulfillmentMode;
    // ── THE WHOLE ORDER WAITS ────────────────────────────────────────────────────────────────────────
    // Luke's call on a mixed basket: one order, one shipment, held until the pre-order lands. So the cart
    // carries ONE date — the latest in it — and says so once, rather than making the customer work out
    // which of three lines decides when their parcel moves.
    //
    // ⚠️ IT DOES NOT MAKE ANYTHING UNAVAILABLE. A pre-order is a perfectly good sale; it is the one rule
    // here that changes WHEN rather than WHETHER, which is why it touches neither maxQuantity nor
    // hasUnavailableItems the way the limit above does.
    const preorderArrivesOn = cartPreorderDate(items, itemRules);
    const preorderNote = preorderSentence(preorderArrivesOn, effectiveMode);
    // ⚠️ ITEMS, NOT JUST THE SUBTOTAL — postage is priced on weight. See shopShippingCents.
    const shippingCents = shopShippingCents(subtotalCents, effectiveMode, items);
    const taxCents = shopTaxCents(subtotalCents, taxRate, shippingCents);
    // ⚠️ THE CART QUOTES COVER BUT DOES NOT ADD IT TO THE TOTAL. Whether to insure is the buyer's answer
    // below the required line, so the cart cannot know it — it publishes the offer and its price, the screen
    // adds it once the box is ticked, and checkout recomputes the whole thing server-side. Baking it into
    // totalCents here would charge everybody for cover nobody had agreed to.
    const insurance = shopInsuranceQuote(subtotalCents, effectiveMode);

    return {
        preorderArrivesOn,
        preorderNote,
        cartId,
        items,
        itemCount,
        subtotalCents,
        onlineFeeCents,
        taxCents,
        // The RATE as well as the amount: checkout hands it to Square so the order carries a real tax
        // line rather than a number we asserted, and Square's own sales-tax report sees it.
        taxRate,
        shippingCents,
        // `insuranceCents` is what cover WOULD cost, not what is being charged. When it is required the
        // screen and the checkout both add it, which is why `insuranceRequired` travels with it.
        insuranceCents: insurance.cents,
        insuranceOffered: insurance.offered,
        insuranceRequired: insurance.required,
        totalCents: subtotalCents + onlineFeeCents + taxCents + shippingCents
            + (insurance.required ? insurance.cents : 0),
        hasUnavailableItems,
        // True when ANY line is pickup-only, because fulfilment is per ORDER: one pickup-only item makes the
        // whole order a pickup rather than splitting it into two shipments.
        pickupOnly,
        // Named so the cart page can say WHICH item is forcing it.
        pickupOnlyItems: items.filter((i) => i.pickupOnly).map((i) => i.name),
        limitedItems: items.filter((i) => i.limitPerCustomer != null)
            .map((i) => ({ name: i.name, limit: i.limitPerCustomer })),
    };
}
