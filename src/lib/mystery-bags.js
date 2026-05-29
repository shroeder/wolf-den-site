import "server-only";

import { getMysteryBagPriceInfoFromSquare } from "@/lib/consignment/square";
import { db } from "@/lib/db";

function toIso(value) {
    return value ? new Date(value).toISOString() : null;
}

function toMoneyNumber(value) {
    if (value === null || value === undefined) {
        return 0;
    }

    return Number.parseFloat(value);
}

function toMysteryBagCard(row) {
    return {
        id: row.id,
        cardId: row.card_id,
        name: row.card_name,
        set: row.set_name,
        number: row.card_number,
        marketValue: toMoneyNumber(row.market_value),
        imageUrl: row.image_url || null,
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
    };
}

export async function listMysteryBagCards() {
    const rows = await db.query(
        `SELECT id, card_id, card_name, set_name, card_number, market_value, image_url, created_at, updated_at
         FROM mystery_bag_cards
         ORDER BY market_value DESC, created_at DESC`
    );

    return rows.map(toMysteryBagCard);
}

export async function getMysteryBagMetrics() {
    const row = await db.queryOne(
        `SELECT COUNT(*)::int AS item_count,
                COALESCE(SUM(market_value), 0)::numeric(12, 2) AS market_total,
                COALESCE(AVG(market_value), 0)::numeric(12, 2) AS market_average
         FROM mystery_bag_cards`
    );

    return {
        itemCount: Number(row?.item_count || 0),
        marketTotal: toMoneyNumber(row?.market_total),
        marketAverage: toMoneyNumber(row?.market_average),
    };
}

export async function getMysteryBagDashboardData() {
    const cards = await listMysteryBagCards();
    const metrics = await getMysteryBagMetrics();
    const bagPriceInfo = await getMysteryBagPriceInfoFromSquare().catch(() => ({
        price: null,
        source: "square_error",
    }));

    return {
        metrics,
        bagPrice: bagPriceInfo.price,
        bagPriceSource: bagPriceInfo.source,
        bagPriceMatchedItemName: bagPriceInfo.matchedItemName || null,
        topCards: cards.slice(0, 3),
        cards,
    };
}

export async function upsertMysteryBagCard(payload) {
    const row = await db.queryOne(
        `INSERT INTO mystery_bag_cards (card_id, card_name, set_name, card_number, market_value, image_url, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (card_id)
         DO UPDATE
         SET card_name = EXCLUDED.card_name,
             set_name = EXCLUDED.set_name,
             card_number = EXCLUDED.card_number,
             market_value = EXCLUDED.market_value,
             image_url = EXCLUDED.image_url,
             updated_at = NOW()
         RETURNING id, card_id, card_name, set_name, card_number, market_value, image_url, created_at, updated_at`,
        [
            payload.cardId,
            payload.name,
            payload.set,
            payload.number,
            payload.marketValue,
            payload.imageUrl,
        ]
    );

    return toMysteryBagCard(row);
}

export async function deleteMysteryBagCardByIdOrCardId(idOrCardId) {
    const row = await db.queryOne(
        `DELETE FROM mystery_bag_cards
         WHERE id::text = $1
            OR card_id = $1
         RETURNING id, card_id, card_name, set_name, card_number, market_value, image_url, created_at, updated_at`,
        [idOrCardId]
    );

    if (!row) {
        return null;
    }

    return toMysteryBagCard(row);
}
