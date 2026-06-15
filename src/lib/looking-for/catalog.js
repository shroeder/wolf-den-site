import "server-only";

import { db } from "@/lib/db";

export const SUPPORTED_GAMES = ["magic", "pokemon"];

const SEARCH_LIMIT = 60;

const CARD_SELECT = `
    c.id,
    c.game,
    c.name,
    c.number,
    c.rarity,
    c.image_url,
    c.market_price,
    s.id AS set_id,
    s.name AS set_name,
    s.abbreviation AS set_abbreviation
`;

function mapCardRow(row) {
    return {
        id: Number(row.id),
        game: row.game,
        name: row.name,
        number: row.number,
        rarity: row.rarity,
        imageUrl: row.image_url,
        marketPrice: row.market_price === null ? null : Number(row.market_price),
        setId: Number(row.set_id),
        setName: row.set_name,
        setAbbreviation: row.set_abbreviation,
    };
}

export function normalizeGame(value) {
    const normalized = String(value || "").trim().toLowerCase();

    return SUPPORTED_GAMES.includes(normalized) ? normalized : null;
}

/**
 * Trigram-ranked card search scoped to one game, with an optional set filter.
 */
export async function searchCards({ game, query, setId }) {
    const normalizedGame = normalizeGame(game);

    if (!normalizedGame) {
        return [];
    }

    const trimmedQuery = String(query || "").trim();

    if (trimmedQuery.length < 2) {
        return [];
    }

    const params = [normalizedGame, trimmedQuery, `%${trimmedQuery}%`];
    let setFilter = "";

    if (setId) {
        params.push(setId);
        setFilter = `AND c.set_id = $${params.length}`;
    }

    const rows = await db.query(
        `SELECT ${CARD_SELECT}
         FROM tcg_cards c
         JOIN tcg_sets s ON s.id = c.set_id
         WHERE c.game = $1
           AND c.name ILIKE $3
           ${setFilter}
         ORDER BY
            (lower(c.name) = lower($2)) DESC,
            similarity(lower(c.name), lower($2)) DESC,
            c.name ASC,
            c.market_price DESC NULLS LAST
         LIMIT ${SEARCH_LIMIT}`,
        params
    );

    return rows.map(mapCardRow);
}

/**
 * Hydrate a set of wishlist card ids back into full display rows, preserving caller order.
 */
export async function getCardsByIds(ids) {
    const numericIds = (Array.isArray(ids) ? ids : [])
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0);

    if (!numericIds.length) {
        return [];
    }

    const rows = await db.query(
        `SELECT ${CARD_SELECT}
         FROM tcg_cards c
         JOIN tcg_sets s ON s.id = c.set_id
         WHERE c.id = ANY($1::bigint[])`,
        [numericIds]
    );

    const byId = new Map(rows.map((row) => [Number(row.id), mapCardRow(row)]));

    return numericIds.map((id) => byId.get(id)).filter(Boolean);
}
