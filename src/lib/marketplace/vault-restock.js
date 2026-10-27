import "server-only";

import { randomUUID } from "node:crypto";

import { restockInventoryForCancel, squareFetch } from "@/lib/consignment/square";
import { db } from "@/lib/db";
import { BUYBACK_PERCENT, buyBackCents } from "@/lib/marketplace/buyback.js";
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

/**
 * ── ⚠️ WHAT CATEGORY DOES A BOUGHT-BACK CARD BELONG IN ───────────────────────────────────────────────────────
 * Luke, 2026-10-27: "I want to ensure when we sell back the items they land back whereas they should for
 * pokemon magic singles."
 *
 * He was right to ask. `restockBoughtBackCard` took `categoryName = "Pokemon Single Card"` as a DEFAULT and
 * neither caller passed one — so a Magic single whose Square item had been deleted came back as a POKÉMON
 * single. It never bit while the only pool was a bag of Pokémon cards; the moment Magic Singles exists it is
 * a card filed under the wrong game, in the wrong report, found by nobody looking for it.
 *
 * ⚠️ AND IT ONLY BITES ON THE CREATE BRANCH, WHICH IS WHY IT WOULD HAVE HIDDEN. A card sold straight back at
 * the reveal still has its variation — we only decremented it — so it takes the `+1` path and keeps
 * everything about itself. The broken path is the slow one: keep the card, the sold-out item gets deleted
 * from the catalogue, sell it back from the vault a week later, and it is re-created from scratch. That is
 * the path nobody would have tested by hand.
 *
 * Resolution order, most-authoritative first:
 *   1. what the caller said, if it said anything
 *   2. what the SHELF last knew about this variation — `inventory_feed` keeps its row and its category when
 *      a card goes to zero (1,935 out-of-stock rows carry one today, 133 of them Magic)
 *   3. the old default, so a card with no history anywhere still lands somewhere sensible
 */
async function categoryForVariation(variationId, given) {
    if (given) return given;
    if (variationId) {
        const row = await db
            .queryOne(`SELECT category_names FROM inventory_feed WHERE variation_id = $1`, [variationId])
            .catch(() => null);
        if (row?.category_names) return row.category_names;
    }
    return "Pokemon Single Card";
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
    // ⚠️ NO DEFAULT HERE ANY MORE — see categoryForVariation. A default on this parameter is what made
    //    "Pokémon" the answer for every card nobody had an opinion about, including the Magic ones.
    categoryName = null,
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
            categoryName: await categoryForVariation(squareVariationId, categoryName),
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
        // ── ⚠️ TWO DIFFERENT NUMBERS, AND THEY USED TO BE ONE ────────────────────────────────────────────
        // `valueCents` from the caller is MARKET. restockBoughtBackCard has always taken both a shelf price
        // and a cost — it was this function that collapsed them, which was invisibly correct only while
        // sell-back paid 100%. At the counter's 60% they diverge, and getting it wrong goes wrong in both
        // directions at once: the card goes back on the shelf at 60% of its worth AND the books record it
        // as having cost us full market, so every re-sale reports roughly zero margin.
        const marketCents = Math.max(0, Math.round(Number(card.valueCents) || 0));
        const paidCents = buyBackCents(marketCents);
        const result = await restockBoughtBackCard({
            squareVariationId: card.squareVariationId,
            name: card.name,
            subtitle: card.subtitle,
            imageUrl: card.imageUrl,
            valueCents: marketCents,
            paidCents,
            // Passed when the caller knows — a category pack knows its own pool's category for certain.
            // Everything else falls through to the shelf's own memory of the variation.
            categoryName: card.categoryName || null,
        });
        results.push({ card, result, marketCents, paidCents });
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
 * ⚠️ buy_rate_percent IS 60 AND market_total AND offer_total ARE DIFFERENT NUMBERS, which is how every
 * counter trade in this table already looks — the live rows read `rate 60.00 | market 409.47 offer 245.68`,
 * with each line carrying its MARKET figure and the rate applied once at the trade level. This posts the
 * same shape, so a vault buy-back and a counter trade are the same row to every report that reads them.
 *
 * ⚠️ offer_total IS THE SUM OF THE ACTUAL PAYOUTS, NOT market × 0.6. buyBackCents rounds up to a quarter and
 * floors at a dollar, so the two differ by pennies — and the ledger has to say what was handed over, not
 * what a formula would have handed over. The rate is RECORDED rather than assumed, which is the rule that
 * keeps traded-single costs honest.
 */
async function recordBuybackTrade(buyerId, results) {
    const rows = results.filter((r) => r.marketCents > 0);
    if (!rows.length) return;

    const tradeId = `vault-${randomUUID()}`;
    const market = rows.reduce((sum, r) => sum + r.marketCents, 0) / 100;
    const paid = rows.reduce((sum, r) => sum + r.paidCents, 0) / 100;

    await db.tx(async (client) => {
        await client.query(
            `INSERT INTO trade
                (id, traded_at, buy_rate_percent, market_total, offer_total, credit_total,
                 cash_total, gift_card_total, cash_in_total, net_total, notes, created_by, source)
             VALUES ($1, NOW(), $2, $3, $4, $4, 0, 0, 0, $4, $5, 'vault', 'vault_buyback')`,
            [tradeId, BUYBACK_PERCENT, market, paid, `Card Vault buy-back (member ${buyerId})`]
        );
        let sort = 0;
        for (const { card, result, marketCents } of rows) {
            const value = marketCents / 100;
            await client.query(
                `INSERT INTO trade_line
                    (trade_id, direction, item_name, quantity, unit_market, line_total, buy_rate_percent,
                     square_variation_id, set_name, card_number, condition, image_url, sort_order)
                 VALUES ($1, 'IN', $2, 1, $3, $3, $10, $4, $5, $6, $7, $8, $9)`,
                [
                    tradeId, card.name, value, result.variationId || card.squareVariationId,
                    card.setName || null, card.cardNumber || null, card.condition || null,
                    card.imageUrl || null, sort += 1, BUYBACK_PERCENT,
                ]
            );
        }
        await client.query(
            // What went the other way: the credit we handed over, which is the PAID figure, not market.
            `INSERT INTO trade_line (trade_id, direction, item_name, quantity, line_total, sort_order)
             VALUES ($1, 'OUT', 'Store credit', 1, $2, $3)`,
            [tradeId, paid, sort + 1]
        );
    });
}
