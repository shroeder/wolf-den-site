import "server-only";

import { db } from "@/lib/db";

export const SUPPORTED_GAMES = ["magic", "pokemon"];

const SEARCH_LIMIT = 60;
const SET_BROWSE_LIMIT = 600;
const MAX_MATCHED_SETS = 6;

// Singles only: sealed product has neither a collector number nor a rarity, and digital code
// cards carry the "Code Card" rarity. Keep everything else (including vintage singles such as
// Beta-era cards that have a rarity but no printed number).
const SINGLES_FILTER = `(c.number IS NOT NULL OR c.rarity IS NOT NULL) AND COALESCE(c.rarity, '') <> 'Code Card'`;

// Natural collector-number ordering: sort by the leading integer ("24", "028/088" -> 28) and
// push blank/non-numeric numbers to the end.
const NUMBER_ORDER = `NULLIF(substring(c.number FROM '^[0-9]+'), '')::int ASC NULLS LAST, c.number ASC`;

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
 * Return all single cards from the given sets, ordered by set then collector number.
 */
async function browseSets(game, setIds) {
    const rows = await db.query(
        `SELECT ${CARD_SELECT}
         FROM tcg_cards c
         JOIN tcg_sets s ON s.id = c.set_id
         WHERE c.game = $1
           AND c.set_id = ANY($2::bigint[])
           AND ${SINGLES_FILTER}
         ORDER BY s.name ASC, ${NUMBER_ORDER}
         LIMIT ${SET_BROWSE_LIMIT}`,
        [game, setIds]
    );

    return rows.map(mapCardRow);
}

/**
 * Card search scoped to one game. Single cards only (no sealed/code-card products). If the query
 * matches a set name, the whole set is returned in collector-number order; otherwise it is a
 * trigram-ranked card-name search. An explicit setId (from the UI) always browses that set.
 */
export async function searchCards({ game, query, setId }) {
    const normalizedGame = normalizeGame(game);

    if (!normalizedGame) {
        return [];
    }

    if (setId) {
        return browseSets(normalizedGame, [setId]);
    }

    const trimmedQuery = String(query || "").trim();

    if (trimmedQuery.length < 2) {
        return [];
    }

    // Set-name match -> browse the matching set(s) by collector number.
    if (trimmedQuery.length >= 3) {
        const matchedSets = await db.query(
            `SELECT id
             FROM tcg_sets
             WHERE game = $1 AND name ILIKE $2
             ORDER BY
                (lower(name) = lower($3)) DESC,
                (name ILIKE $4) DESC,
                similarity(name, $3) DESC
             LIMIT ${MAX_MATCHED_SETS}`,
            [normalizedGame, `%${trimmedQuery}%`, trimmedQuery, `${trimmedQuery}%`]
        );

        if (matchedSets.length) {
            return browseSets(normalizedGame, matchedSets.map((row) => Number(row.id)));
        }
    }

    // Otherwise: card-name search, ranked by relevance.
    const rows = await db.query(
        `SELECT ${CARD_SELECT}
         FROM tcg_cards c
         JOIN tcg_sets s ON s.id = c.set_id
         WHERE c.game = $1
           AND c.name ILIKE $3
           AND ${SINGLES_FILTER}
         ORDER BY
            (lower(c.name) = lower($2)) DESC,
            similarity(lower(c.name), lower($2)) DESC,
            c.name ASC,
            c.market_price DESC NULLS LAST
         LIMIT ${SEARCH_LIMIT}`,
        [normalizedGame, trimmedQuery, `%${trimmedQuery}%`]
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
