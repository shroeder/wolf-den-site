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

function toMysteryBagRecentHit(row) {
    return {
        id: row.id,
        cardId: row.card_id,
        name: row.card_name,
        set: row.set_name,
        number: row.card_number,
        marketValue: toMoneyNumber(row.market_value),
        imageUrl: row.image_url || null,
        pulledAt: toIso(row.pulled_at),
        createdAt: toIso(row.created_at),
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

export async function listRecentMysteryBagHits(limit = 10) {
    const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(Number(limit), 30)) : 10;

    const rows = await db.query(
        `SELECT id, card_id, card_name, set_name, card_number, market_value, image_url, pulled_at, created_at
         FROM mystery_bag_recent_hits
         ORDER BY pulled_at DESC, created_at DESC
         LIMIT $1`,
        [safeLimit]
    );

    return rows.map(toMysteryBagRecentHit);
}

export async function recordMysteryBagHitFromCard(card, pulledAt = null) {
    if (!card?.name || !card?.set || !card?.number) {
        return null;
    }

    const row = await db.queryOne(
        `INSERT INTO mystery_bag_recent_hits (card_id, card_name, set_name, card_number, market_value, image_url, pulled_at)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()))
         RETURNING id, card_id, card_name, set_name, card_number, market_value, image_url, pulled_at, created_at`,
        [
            card.cardId || null,
            card.name,
            card.set,
            card.number,
            toMoneyNumber(card.marketValue),
            card.imageUrl || null,
            pulledAt,
        ]
    );

    return toMysteryBagRecentHit(row);
}

export async function getMysteryBagDashboardData() {
    const [cards, metrics, recentHits, bagPriceInfo] = await Promise.all([
        listMysteryBagCards(),
        getMysteryBagMetrics(),
        listRecentMysteryBagHits(8),
        getMysteryBagPriceInfoFromSquare().catch(() => ({
        price: null,
        source: "square_error",
    })),
    ]);

    return {
        metrics,
        recentHits,
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
