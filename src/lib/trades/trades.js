import "server-only";

import { db } from "@/lib/db";
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

    return db.tx(async (client) => {
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
    const lines = await db.query(
        `SELECT * FROM trade_line WHERE trade_id = ANY($1) ORDER BY sort_order ASC`,
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
