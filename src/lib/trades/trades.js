import "server-only";

import { db } from "@/lib/db";
import { recordConsignmentTradeSalesForTrade } from "@/lib/consignment/trade-sales";
import { createServerLogger } from "@/lib/server-logger";

// Trade ledger data layer. A trade is a header (`trade`) plus directional lines (`trade_line`):
// IN = cards the customer traded in, OUT = store-credit items they took, CASH/GIFT_CARD = paid out,
// CASH_IN = collected from them. The app posts the whole trade at once; create is idempotent on the
// trade id so a retry never duplicates.

const tradesLogger = createServerLogger({ source: "api", subsystem: "trades" });

const VALID_DIRECTIONS = new Set(["IN", "OUT", "CASH", "CASH_IN", "GIFT_CARD"]);

function toNumber(value) {
    return value !== null && value !== undefined && value !== "" ? Number(value) : null;
}

function toIso(value) {
    return value ? new Date(value).toISOString() : null;
}

function mapTrade(trade, lines) {
    return {
        id: trade.id,
        tradedAt: toIso(trade.traded_at),
        buyRatePercent: toNumber(trade.buy_rate_percent),
        marketTotal: Number(trade.market_total),
        offerTotal: Number(trade.offer_total),
        creditTotal: Number(trade.credit_total),
        cashTotal: Number(trade.cash_total),
        giftCardTotal: Number(trade.gift_card_total),
        cashInTotal: Number(trade.cash_in_total),
        netTotal: Number(trade.net_total),
        notes: trade.notes || null,
        createdBy: trade.created_by || null,
        source: trade.source,
        lines: lines.map((l) => ({
            direction: l.direction,
            itemName: l.item_name,
            quantity: toNumber(l.quantity),
            unitMarket: toNumber(l.unit_market),
            lineTotal: toNumber(l.line_total),
            buyRatePercent: toNumber(l.buy_rate_percent),
            notes: l.notes || null,
            squareItemId: l.square_item_id || null,
            squareVariationId: l.square_variation_id || null,
            setName: l.set_name || null,
            cardNumber: l.card_number || null,
            condition: l.condition || null,
            imageUrl: l.image_url || null,
        })),
    };
}

// Insert a trade + its lines in one transaction. Idempotent: if the id already exists, the existing
// trade is returned untouched (so an app retry after a flaky network is safe). Returns { trade, created }.
export async function createTrade(input) {
    const id = String(input?.id || "").trim();
    if (!id) {
        throw new Error("A trade id is required.");
    }

    const lines = Array.isArray(input.lines) ? input.lines : [];
    for (const line of lines) {
        if (!VALID_DIRECTIONS.has(line.direction)) {
            throw new Error(`Invalid trade line direction: ${line.direction}`);
        }
    }

    const result = await db.tx(async (client) => {
        const existing = await client.query(`SELECT id FROM trade WHERE id = $1`, [id]);
        if (existing.rows.length > 0) {
            tradesLogger.info("trade.create.duplicate_ignored", { step: "duplicate_ignored", tradeId: id });
            return { trade: await loadTrade(client, id), created: false };
        }

        await client.query(
            `INSERT INTO trade
                (id, traded_at, buy_rate_percent, market_total, offer_total, credit_total,
                 cash_total, gift_card_total, cash_in_total, net_total, notes, created_by, source)
             VALUES ($1, COALESCE($2, NOW()), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
            [
                id,
                input.tradedAt || null,
                toNumber(input.buyRatePercent),
                toNumber(input.marketTotal) || 0,
                toNumber(input.offerTotal) || 0,
                toNumber(input.creditTotal) || 0,
                toNumber(input.cashTotal) || 0,
                toNumber(input.giftCardTotal) || 0,
                toNumber(input.cashInTotal) || 0,
                toNumber(input.netTotal) || 0,
                input.notes || null,
                input.createdBy || null,
                input.source === "sheets-import" ? "sheets-import" : "app",
            ]
        );

        let order = 0;
        for (const line of lines) {
            await client.query(
                `INSERT INTO trade_line
                    (trade_id, direction, item_name, quantity, unit_market, line_total,
                     buy_rate_percent, notes, square_item_id, square_variation_id, set_name,
                     card_number, condition, image_url, sort_order)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
                [
                    id,
                    line.direction,
                    String(line.itemName || "").trim() || "(item)",
                    toNumber(line.quantity) ?? 1,
                    toNumber(line.unitMarket),
                    toNumber(line.lineTotal),
                    toNumber(line.buyRatePercent),
                    line.notes || null,
                    line.squareItemId || null,
                    line.squareVariationId || null,
                    line.setName || null,
                    line.cardNumber || null,
                    line.condition || null,
                    line.imageUrl || null,
                    order++,
                ]
            );
        }

        tradesLogger.info("trade.create.success", { step: "trade_created", tradeId: id, lineCount: lines.length });
        return { trade: await loadTrade(client, id), created: true };
    });

    // Attribute any consigned store-credit items taken in this trade to their consignor. A consigned
    // item leaves the shop as a Square inventory DECREMENT (not an order), so the standard owed
    // calculation never sees it — this is the only record of the consignor's payable. Idempotent per
    // trade, so it's safe on a retry (duplicate) too. Skipped for historical sheet imports. Non-fatal:
    // the trade ledger is the priority and must never fail because consignment attribution hiccuped.
    if (input.source !== "sheets-import") {
        try {
            const outLines = lines
                .filter((line) => line.direction === "OUT" && line.squareVariationId)
                .map((line) => ({
                    squareVariationId: line.squareVariationId,
                    squareItemId: line.squareItemId || null,
                    itemName: line.itemName,
                    quantity: line.quantity,
                    unitMarket: line.unitMarket,
                    lineTotal: line.lineTotal,
                }));
            if (outLines.length > 0) {
                await recordConsignmentTradeSalesForTrade(id, outLines, { soldAt: input.tradedAt || null });
            }
        } catch (error) {
            tradesLogger.error("trade.create.consignment_sales_failed", error, { tradeId: id });
        }
    }

    return result;
}

async function loadTrade(client, id) {
    const tradeRes = await client.query(`SELECT * FROM trade WHERE id = $1`, [id]);
    const linesRes = await client.query(
        `SELECT * FROM trade_line WHERE trade_id = $1 ORDER BY sort_order ASC`,
        [id]
    );
    return mapTrade(tradeRes.rows[0], linesRes.rows);
}

// Trade history, newest first, each with its lines. One round trip + an in-memory group by trade id.
export async function listTrades({ limit = 200, offset = 0 } = {}) {
    const cappedLimit = Math.min(Number(limit) || 200, 1000);
    const trades = await db.query(
        `SELECT * FROM trade ORDER BY traded_at DESC LIMIT $1 OFFSET $2`,
        [cappedLimit, Math.max(Number(offset) || 0, 0)]
    );

    if (trades.length === 0) {
        return [];
    }

    const ids = trades.map((t) => t.id);
    // ── WHY square_variation_id IS RESOLVED HERE AND NOT JUST READ ────────────────────────────────
    // Only 223 of 2,003 IN lines ever recorded carry a square_variation_id. The app sends one when it
    // creates a trade, but at that moment the card has usually not been pushed to Square yet — the
    // intake writes the Square item AFTERWARDS — so the column is null for ~89% of history. Anything
    // built on that column alone (reprinting a shelf tag, say) works for one trade in nine and looks
    // broken for the rest. That is exactly how it was reported: "I dont see any print buttons".
    //
    // The id is not lost, it is elsewhere: trade intake writes wolfden_item_cost with the variation
    // id, the item name and the capture time. Resolving on READ rather than in the client means every
    // reader gets it and no app release is needed.
    //
    // ⚠️ A WRONG MATCH PRINTS A WRONG PRICE ON A SHELF TAG, so this refuses rather than guesses: the
    // cost row's name must START WITH the line's item name (intake appends rarity and condition), the
    // capture must be within a day of the trade (the same card is traded in again months later under
    // a different variation), and the answer must be UNAMBIGUOUS.
    //
    // ⚠️ CONDITION IS A TIE-BREAKER, NOT A GATE, AND THAT IS ON EVIDENCE. Requiring it looked
    // obviously right and silently dropped real matches: trade #d7f1b37e records an Eevee 114/103 as
    // LP while the Square item intake created for it is named "... Illustration Rare NM". The
    // condition written into Square item names is not reliable, so insisting on it throws away the
    // only candidate there is. Preferring it when several exist still keeps NM and LP copies of the
    // same card apart, which is the case that would actually mis-price a tag.
    const lines = await db.query(
        `SELECT l.*,
                COALESCE(l.square_variation_id, (
                    SELECT c.variation_id
                    FROM wolfden_item_cost c
                    WHERE c.item_name ILIKE l.item_name || '%'
                      AND c.captured_at BETWEEN t.traded_at - INTERVAL '1 day'
                                            AND t.traded_at + INTERVAL '1 day'
                      AND (
                        (SELECT COUNT(*) FROM wolfden_item_cost a
                          WHERE a.item_name ILIKE l.item_name || '%'
                            AND a.captured_at BETWEEN t.traded_at - INTERVAL '1 day'
                                                  AND t.traded_at + INTERVAL '1 day') = 1
                        OR
                        (SELECT COUNT(*) FROM wolfden_item_cost b
                          WHERE b.item_name ILIKE l.item_name || '%'
                            AND b.item_name ILIKE '%' || cond.abbr
                            AND b.captured_at BETWEEN t.traded_at - INTERVAL '1 day'
                                                  AND t.traded_at + INTERVAL '1 day') = 1
                      )
                    ORDER BY (c.item_name ILIKE '%' || cond.abbr) DESC,
                             ABS(EXTRACT(EPOCH FROM (c.captured_at - t.traded_at))) ASC
                    LIMIT 1
                )) AS square_variation_id
         FROM trade_line l
         JOIN trade t ON t.id = l.trade_id
         -- ⚠️ trade_line stores the condition ENUM ("NEAR_MINT"); intake writes the ABBREVIATION
         -- into the item name ("... Illustration Rare NM"). Comparing them directly matches nothing,
         -- which is why the first attempt at this resolved zero rows.
         LEFT JOIN LATERAL (SELECT CASE l.condition
                 WHEN 'NEAR_MINT' THEN 'NM' WHEN 'LIGHTLY_PLAYED' THEN 'LP'
                 WHEN 'MODERATELY_PLAYED' THEN 'MP' WHEN 'HEAVILY_PLAYED' THEN 'HP'
                 WHEN 'DAMAGED' THEN 'DMG' ELSE l.condition END AS abbr) cond ON TRUE
         WHERE l.trade_id = ANY($1)
         ORDER BY l.sort_order ASC`,
        [ids]
    );

    const linesByTrade = new Map();
    for (const line of lines) {
        if (!linesByTrade.has(line.trade_id)) {
            linesByTrade.set(line.trade_id, []);
        }
        linesByTrade.get(line.trade_id).push(line);
    }

    return trades.map((trade) => mapTrade(trade, linesByTrade.get(trade.id) || []));
}
