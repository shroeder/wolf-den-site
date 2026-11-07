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
            squareVariationId: l.resolved_variation_id || l.square_variation_id || null,
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

// ── WHERE A LINE'S SQUARE VARIATION ID COMES FROM ─────────────────────────────────────────────────
// Only 223 of 2,003 IN lines ever recorded carry a square_variation_id of their own. The app sends
// one when it creates a trade, but at that moment the card has usually not been pushed to Square yet
// -- the intake writes the Square item AFTERWARDS -- so the column is null for ~89% of history.
// Anything built on that column alone (reprinting a shelf tag, say) works for one trade in nine and
// looks broken for the rest. That is exactly how it was reported: "I dont see any print buttons".
//
// The id is not lost, it is elsewhere: trade intake writes wolfden_item_cost with the variation id,
// the item name and the capture time. Resolving on READ rather than in the client means every reader
// gets it and no app release is needed.
//
// ⚠️ A WRONG MATCH PRINTS A WRONG PRICE ON A SHELF TAG, so the match is pinned on the COLLECTOR
// NUMBER, not the name. Names collide across completely different cards: a line named "Pikachu"
// (27/111) prefix-matched the cost row for "Pikachu 94/123", and one "Pikachu" line was a RC7/RC25
// worth $33 tagged from a $4 common. Eleven lines in history were matched to the wrong card that
// way. The number is in both -- trade_line.card_number and the intake-written item name -- so when
// any candidate carries the line's number, only those candidates are eligible.
//
// ⚠️ DUPLICATES ARE THE NORMAL CASE AND MUST NOT BE REFUSED. Intake creates a SEPARATE Square item
// per copy, so four Lapras 131/128 in one trade are four cost rows with four variation ids. The
// first version of this demanded exactly ONE candidate and therefore matched none of them: trade
// #18fea911 printed 42 of 65 tags and reported the other 23 as "no Square item yet" when every one
// of them was in Square. Copies are instead PAIRED one-to-one -- the nth line of a name takes the
// nth candidate -- which also stops three copies all printing the same variation's barcode.
//
// ⚠️ CONDITION IS A TIE-BREAKER, NOT A GATE, AND THAT IS ON EVIDENCE. Requiring it looked obviously
// right and silently dropped real matches: trade #d7f1b37e records an Eevee 114/103 as LP while the
// Square item intake created for it is named "... Illustration Rare NM". The condition written into
// Square item names is not reliable, so insisting on it throws away the only candidate there is.
// Preferring it when several exist still keeps NM and LP copies of the same card apart.
//
// Lines with no collector number anywhere (sheet-imported history) keep the old strict rule: the
// candidate set must match the copy count exactly, so a singleton still needs a unique candidate.
async function resolveTradeLines(tradeIds) {
    return db.query(
        `WITH tl AS (
             SELECT l.*, t.traded_at,
                    CASE l.condition
                        WHEN 'NEAR_MINT' THEN 'NM' WHEN 'LIGHTLY_PLAYED' THEN 'LP'
                        WHEN 'MODERATELY_PLAYED' THEN 'MP' WHEN 'HEAVILY_PLAYED' THEN 'HP'
                        WHEN 'DAMAGED' THEN 'DMG' ELSE l.condition END AS cond_abbr,
                    lower(l.item_name) AS name_key,
                    COALESCE(l.condition, '') AS cond_key,
                    COALESCE(NULLIF(trim(l.card_number), ''), '') AS num_key
             FROM trade_line l
             JOIN trade t ON t.id = l.trade_id
             WHERE l.trade_id = ANY($1)
         ),
         copies AS (
             SELECT tl.*,
                    ROW_NUMBER() OVER (PARTITION BY trade_id, name_key, cond_key, num_key
                                       ORDER BY sort_order, id) AS copy_no,
                    COUNT(*) OVER (PARTITION BY trade_id, name_key, cond_key, num_key) AS copy_count
             FROM tl
             WHERE tl.direction = 'IN' AND tl.square_variation_id IS NULL
         ),
         grp AS (
             SELECT DISTINCT trade_id, traded_at, item_name, cond_abbr,
                    name_key, cond_key, num_key, copy_count
             FROM copies
         ),
         cand AS (
             SELECT g.trade_id, g.name_key, g.cond_key, g.num_key,
                    c.variation_id, d.gap,
                    (c.item_name ILIKE '%' || g.cond_abbr) AS cond_hit,
                    (g.num_key <> '' AND c.item_name ILIKE '%' || g.num_key || '%') AS num_hit
             FROM grp g
             JOIN wolfden_item_cost c
               ON c.item_name ILIKE g.item_name || '%'
              AND c.captured_at BETWEEN g.traded_at - INTERVAL '1 day'
                                    AND g.traded_at + INTERVAL '1 day'
             CROSS JOIN LATERAL (
                 SELECT ABS(EXTRACT(EPOCH FROM (c.captured_at - g.traded_at))) AS gap
             ) d
         ),
         tiered AS (
             SELECT cand.*,
                    BOOL_OR(num_hit) OVER (PARTITION BY trade_id, name_key, cond_key, num_key)
                        AS has_num_tier
             FROM cand
         ),
         picked AS (
             SELECT trade_id, name_key, cond_key, num_key, variation_id, has_num_tier,
                    COUNT(*) OVER (PARTITION BY trade_id, name_key, cond_key, num_key) AS cand_count,
                    ROW_NUMBER() OVER (PARTITION BY trade_id, name_key, cond_key, num_key
                                       ORDER BY cond_hit DESC, gap ASC, variation_id ASC) AS pick_no
             FROM tiered
             WHERE (NOT has_num_tier) OR num_hit
         )
         SELECT l.*, COALESCE(l.square_variation_id, p.variation_id) AS resolved_variation_id
         FROM tl l
         LEFT JOIN copies c ON c.id = l.id
         LEFT JOIN picked p
           ON p.trade_id = c.trade_id AND p.name_key = c.name_key
          AND p.cond_key = c.cond_key AND p.num_key = c.num_key
          AND p.pick_no = c.copy_no
          AND (p.has_num_tier OR p.cand_count = c.copy_count)
         ORDER BY l.sort_order ASC`,
        [tradeIds]
    );
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
    const lines = await resolveTradeLines(ids);

    const linesByTrade = new Map();
    for (const line of lines) {
        if (!linesByTrade.has(line.trade_id)) {
            linesByTrade.set(line.trade_id, []);
        }
        linesByTrade.get(line.trade_id).push(line);
    }

    return trades.map((trade) => mapTrade(trade, linesByTrade.get(trade.id) || []));
}
