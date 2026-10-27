import "server-only";

import { randomUUID } from "node:crypto";

import { restockInventoryForCancel, squareFetch } from "@/lib/consignment/square";
import { db } from "@/lib/db";
import { createServerLogger } from "@/lib/server-logger";

const logger = createServerLogger({ source: "api", subsystem: "vault-restock" });

// ── PUTTING A CARD BACK ON THE SHELF ─────────────────────────────────────────────────────────────────────────
// A member sells a vault card back to us. That is an inventory PURCHASE paid in store credit, and the physical
// card has been in our building the whole time — so the only thing that has to happen in Square is that the
// card becomes sellable again.
//
// Luke: "If an existing item in Square exists, use it and increase its quantity by one. ... In the case the
// user sells and the item doesn't exist in Square it will make an item with the proper unit cost, image, name
// and description, quantity and tax and category."
//
// ⚠️ THE +1 IS A `NONE -> IN_STOCK` RECEIVE, NOT `SOLD -> IN_STOCK`. Square rejects the latter outright
// ("Unsupported adjustment state transition"). The existing cancel path already learned this; the note is
// repeated here because the obvious reading of "undo the sale" is the one Square refuses.
//
// ⚠️ SQUARE'S NATIVE UNIT COST IS NOT WRITABLE FROM THE API AT ALL, AND THAT IS MEASURED, NOT ASSUMED.
//
// The received wisdom here was "write-at-CREATE only" — that an update returns 200 and stores nothing, but a
// create does stick. Probed again on 2026-10-27 against the live catalog, both ways, on a throwaway item:
//
//     item_variation_vendor_infos nested in an ITEM create   -> ABSENT on read-back
//     item_variation_vendor_infos on a standalone VARIATION  -> ABSENT on read-back
//
// Neither stores. So the field is not sent at all rather than left in the payload pretending to do something.
// (Costs set through Square's own dashboard are still there — this is about the API, not about the field.)
//
// What DOES persist is the `wolfden_unit_cost` custom attribute and our own `wolfden_item_cost` table, and the
// latter is the one the COGS resolver reads. That table also survives Square deleting the item, which is the
// whole reason it exists.

const UNIT_COST_ATTR = "wolfden_unit_cost";

let cachedCostKey;
/** Square namespaces a custom attribute per application, so the key is looked up rather than assumed. */
async function unitCostKey() {
    if (cachedCostKey !== undefined) return cachedCostKey;
    cachedCostKey = null;
    const payload = await squareFetch("/v2/catalog/list?types=CUSTOM_ATTRIBUTE_DEFINITION").catch(() => null);
    for (const object of payload?.objects || []) {
        const key = String(object?.custom_attribute_definition_data?.key || "").trim();
        if (key === UNIT_COST_ATTR || key.endsWith(`:${UNIT_COST_ATTR}`)) cachedCostKey = key;
    }
    return cachedCostKey;
}

/**
 * Does this variation still exist and is it usable?
 *
 * ⚠️ include_deleted_objects, ALWAYS. A card whose Square item was deleted still has history we care about,
 * and a lookup that cannot see it would happily create a DUPLICATE item — losing the cost record and
 * splitting the sales history of one card across two SKUs.
 */
async function liveVariation(variationId) {
    if (!variationId) return null;
    const payload = await squareFetch("/v2/catalog/batch-retrieve", {
        method: "POST",
        body: JSON.stringify({ object_ids: [variationId], include_deleted_objects: true }),
    }).catch(() => null);
    const object = payload?.objects?.[0];
    if (!object || object.type !== "ITEM_VARIATION") return null;
    return { object, deleted: Boolean(object.is_deleted) };
}

/** The category a bought-back single belongs in, resolved from the catalog by name. */
async function resolveCategoryId(name) {
    const found = await squareFetch("/v2/catalog/search", {
        method: "POST",
        body: JSON.stringify({
            object_types: ["CATEGORY"],
            query: { exact_query: { attribute_name: "name", attribute_value: name } },
            limit: 1,
        }),
    }).catch(() => null);
    return found?.objects?.[0]?.id || null;
}

/**
 * Create the card in Square from scratch, because the item it came from has been deleted.
 *
 * ⚠️ reporting_category IS SET ALONGSIDE category_id, AND IT IS THE ONE THAT MATTERS. Square's item/category
 * SALES REPORT keys off reporting_category; category_id alone leaves the item "Uncategorized" in every report
 * it appears in.
 */
async function createCardItem({ name, description, imageUrl, priceCents, costCents, categoryName }) {
    const categoryId = await resolveCategoryId(categoryName);
    const costKey = await unitCostKey();

    const variationData = {
        item_id: "#vault-card-item",
        name: "Regular",
        pricing_type: "FIXED_PRICING",
        price_money: { amount: Math.max(0, Math.round(priceCents)), currency: "USD" },
        track_inventory: true,
    };

    const made = await squareFetch("/v2/catalog/object", {
        method: "POST",
        body: JSON.stringify({
            idempotency_key: randomUUID(),
            object: {
                type: "ITEM",
                id: "#vault-card-item",
                item_data: {
                    name,
                    description: description || undefined,
                    is_taxable: true,
                    ...(categoryId ? { category_id: categoryId, reporting_category: { id: categoryId } } : {}),
                    variations: [{
                        type: "ITEM_VARIATION",
                        id: "#vault-card-var",
                        item_variation_data: variationData,
                        ...(costKey && costCents > 0
                            ? {
                                custom_attribute_values: {
                                    [UNIT_COST_ATTR]: { key: costKey, number_value: String(costCents / 100) },
                                },
                            }
                            : {}),
                    }],
                },
            },
        }),
    });

    const variationId = made?.catalog_object?.item_data?.variations?.[0]?.id || null;
    if (variationId && imageUrl) {
        // Best-effort: an image makes the item recognisable at the counter, and its absence must never stop a
        // member being paid for their card.
        await attachImage(made.catalog_object.id, imageUrl, name).catch((error) =>
            logger.warn("vault_restock.image_failed", { variationId, message: error?.message })
        );
    }
    return variationId;
}

/** Pull the card's art down and hand it to Square as the item's image. */
async function attachImage(itemId, imageUrl, name) {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`image fetch ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const form = new FormData();
    form.append(
        "request",
        JSON.stringify({
            idempotency_key: randomUUID(),
            object_id: itemId,
            image: { type: "IMAGE", id: "#img", image_data: { caption: name } },
        })
    );
    form.append("file", new Blob([buffer], { type: res.headers.get("content-type") || "image/jpeg" }), "card.jpg");

    const upload = await fetch("https://connect.squareup.com/v2/catalog/images", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
            "Square-Version": process.env.SQUARE_API_VERSION || "2025-01-23",
        },
        body: form,
    });
    if (!upload.ok) throw new Error(`image upload ${upload.status}`);
}

/**
 * Make one bought-back card sellable again, and record what we paid for it.
 *
 * Returns `{ variationId, created }`. Never throws: a Square hiccup must not stop a member being credited —
 * their money is the part that has to be right. A failure leaves a warning and a card that needs a human.
 */
export async function restockBoughtBackCard({
    squareVariationId,
    name,
    subtitle,
    imageUrl,
    valueCents,
    paidCents,
    categoryName = "Pokemon Single Card",
}) {
    // ⚠️ THE COST GOES DOWN FIRST, BEFORE ANY SQUARE CALL CAN FAIL.
    //
    // It was written after the restock, and the first live test lost it: Square refused the inventory
    // adjustment (no location id configured), the catch swallowed it, and `wolfden_item_cost` ended up with
    // no row at all — for a card we had just paid real credit for. That table is OUR copy and the only thing
    // that survives Square deleting the item; losing it is how a past sale came to report $0.00 cost and
    // ~100% profit. A failed restock leaves a card to re-shelve by hand. A lost cost leaves a lie in a report.
    if (squareVariationId) await recordOurCost(squareVariationId, paidCents, name);

    try {
        const existing = await liveVariation(squareVariationId);

        if (existing && !existing.deleted) {
            await restockInventoryForCancel([{ catalogObjectId: squareVariationId, quantity: 1 }], {
                idempotencyKey: `vault-buyback-${squareVariationId}-${Date.now()}`,
            });
            return { variationId: squareVariationId, created: false };
        }

        // ⚠️ The item is gone from the catalog (intake DELETES sold-out items on purpose — archiving leaves
        //    the POS search cluttered). So the card is re-created rather than resurrected; Square will not
        //    un-delete an object under any circumstances.
        const variationId = await createCardItem({
            name,
            description: subtitle,
            imageUrl,
            priceCents: valueCents,
            costCents: paidCents,
            categoryName,
        });
        if (!variationId) throw new Error("Square did not return a variation id");

        // The new item's own id — the cost above was keyed to an id that no longer exists (or to none at
        // all), so it is recorded again against the thing that will actually be sold.
        await recordOurCost(variationId, paidCents, name);
        await restockInventoryForCancel([{ catalogObjectId: variationId, quantity: 1 }], {
            idempotencyKey: `vault-buyback-new-${variationId}`,
        });
        logger.info("vault_restock.created", { variationId, name, paidCents });
        return { variationId, created: true };
    } catch (error) {
        logger.error("vault_restock.failed", error, { squareVariationId, name });
        return { variationId: null, created: false, error: error?.message || "unknown" };
    }
}

/**
 * Our own copy of what we paid, which is the number COGS actually reads.
 *
 * ⚠️ THIS IS THE ONE THAT MUST NOT FAIL SILENTLY. A catalog is not a ledger: deleting a Square item once
 * destroyed the cost of every past sale of it, back through three months. `wolfden_item_cost` is ours and
 * survives that, so it is written before any Square call that could fail.
 *
 * ⚠️ AND IT GAP-FILLS ONLY — `DO NOTHING`, never `DO UPDATE`. Two reasons, and the first one bit during
 * testing:
 *
 *   1. IT IS NOT OUR COST TO OVERWRITE. The first version used DO UPDATE and clobbered a real cost captured
 *      on 2026-09-13 with a buy-back figure. `wolfden_item_cost` holds what we RECORDED PAYING, and the house
 *      precedence rule is explicit that those entries are kept rather than replaced by a weaker reading.
 *
 *   2. A BUY-BACK PRICES ONE UNIT, NOT THE VARIATION. We pay 100% of market to buy a card back, which is far
 *      above what the shelf stock of that same card cost. Writing it variation-wide would reprice every other
 *      copy we hold — buy one Marill back at $53 and two more bought at $12 each suddenly claim to have cost
 *      $53. The per-transaction truth belongs in the TRADE LEDGER, which records it with its own rate and is
 *      exactly where `capture-trade-costs.mjs` already looks.
 */
async function recordOurCost(variationId, paidCents, name) {
    if (!variationId || !(paidCents > 0)) return;
    await db
        .query(
            `INSERT INTO wolfden_item_cost (variation_id, unit_cost_cents, source, item_name, updated_at)
             VALUES ($1, $2, 'vault_buyback', $3, NOW())
             ON CONFLICT (variation_id) DO NOTHING`,
            [variationId, Math.round(paidCents), name || null]
        )
        .catch((error) => logger.error("vault_restock.cost_write_failed", error, { variationId }));
}

/**
 * ── EVERYTHING THAT HAPPENS WHEN WE BUY A CARD BACK ──────────────────────────────────────────────────────────
 * ONE function, called by BOTH the sell-at-the-reveal path and the sell-from-the-vault path.
 *
 * ⚠️ IT IS ONE FUNCTION ON PURPOSE. Two paths for one payout always drift, and these two had already drifted
 * before this existed: selling from the vault restocked Square, recorded the cost and posted a trade, while
 * selling at the reveal did none of the three. Same event, same money, two different sets of consequences.
 *
 * Returns the per-card results so the caller can re-point any stored variation id.
 */
export async function completeBuyBack({ buyerId, cards }) {
    const results = [];
    for (const card of cards) {
        const paidCents = Math.max(0, Math.round(Number(card.valueCents) || 0));
        const result = await restockBoughtBackCard({
            squareVariationId: card.squareVariationId,
            name: card.name,
            subtitle: card.subtitle,
            imageUrl: card.imageUrl,
            valueCents: paidCents,
            paidCents,
        });
        results.push({ card, result });
    }
    await recordBuybackTrade(buyerId, results).catch((error) =>
        logger.error("vault_restock.trade_ledger_failed", error, { buyerId })
    );
    return results;
}

/**
 * Put the buy-back through the SAME pipe as a counter trade.
 *
 * ⚠️ NOT A NEW LEDGER. `trade` + `trade_line` already model "we bought cards from a person and paid them in
 * credit", and trade reporting, cost capture and the consignment hooks all read it. A vault buy-back that
 * invented its own table would be invisible to every one of them.
 *
 * buy_rate_percent is 100 because that is literally what was paid. The rate is RECORDED rather than assumed,
 * which is the rule that keeps traded-single costs honest.
 */
async function recordBuybackTrade(buyerId, results) {
    const rows = results.filter((r) => Math.round(Number(r.card.valueCents) || 0) > 0);
    if (!rows.length) return;

    const tradeId = `vault-${randomUUID()}`;
    const total = rows.reduce((sum, r) => sum + Math.round(Number(r.card.valueCents) || 0), 0) / 100;

    await db.tx(async (client) => {
        await client.query(
            `INSERT INTO trade
                (id, traded_at, buy_rate_percent, market_total, offer_total, credit_total,
                 cash_total, gift_card_total, cash_in_total, net_total, notes, created_by, source)
             VALUES ($1, NOW(), 100, $2, $2, $2, 0, 0, 0, $2, $3, 'vault', 'vault_buyback')`,
            [tradeId, total, `Card Vault buy-back (member ${buyerId})`]
        );
        let sort = 0;
        for (const { card, result } of rows) {
            const value = Math.round(Number(card.valueCents) || 0) / 100;
            await client.query(
                `INSERT INTO trade_line
                    (trade_id, direction, item_name, quantity, unit_market, line_total, buy_rate_percent,
                     square_variation_id, set_name, card_number, condition, image_url, sort_order)
                 VALUES ($1, 'IN', $2, 1, $3, $3, 100, $4, $5, $6, $7, $8, $9)`,
                [
                    tradeId, card.name, value, result.variationId || card.squareVariationId,
                    card.setName || null, card.cardNumber || null, card.condition || null,
                    card.imageUrl || null, sort += 1,
                ]
            );
        }
        await client.query(
            `INSERT INTO trade_line (trade_id, direction, item_name, quantity, line_total, sort_order)
             VALUES ($1, 'OUT', 'Store credit', 1, $2, $3)`,
            [tradeId, total, sort + 1]
        );
    });
}
