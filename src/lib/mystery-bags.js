import "server-only";

import { getMysteryBagPriceInfoFromSquare } from "@/lib/consignment/square";
import { db } from "@/lib/db";
import { createServerLogger } from "@/lib/server-logger";

const mysteryLogger = createServerLogger({ source: "api", subsystem: "mystery-bags" });
const ACTIVE_STATUSES = ["active", "reserved"];
const VALID_CARD_STATUSES = new Set(["active", "reserved", "sold", "removed"]);

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
        squareVariationId: row.square_variation_id || null,
        packToken: row.pack_token || null,
        name: row.card_name,
        set: row.set_name,
        number: row.card_number,
        marketValue: toMoneyNumber(row.market_value),
        imageUrl: row.image_url || null,
        status: row.status || "active",
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
        `SELECT id,
                card_id,
                square_variation_id,
                pack_token,
                card_name,
                set_name,
                card_number,
                market_value,
                image_url,
                status,
                created_at,
                updated_at
         FROM mystery_bag_cards
         WHERE status = ANY($1::text[])
         ORDER BY market_value DESC, created_at DESC`,
        [ACTIVE_STATUSES]
    );

    return rows.map(toMysteryBagCard);
}

export async function listMysteryBagCardsByStatuses(statuses = ACTIVE_STATUSES) {
    const safeStatuses = Array.isArray(statuses)
        ? statuses.filter((status) => VALID_CARD_STATUSES.has(status))
        : [];
    const finalStatuses = safeStatuses.length > 0 ? safeStatuses : ACTIVE_STATUSES;

    const rows = await db.query(
        `SELECT id,
                card_id,
                square_variation_id,
                pack_token,
                card_name,
                set_name,
                card_number,
                market_value,
                image_url,
                status,
                created_at,
                updated_at
         FROM mystery_bag_cards
         WHERE status = ANY($1::text[])
         ORDER BY market_value DESC, created_at DESC`
        ,
        [finalStatuses]
    );

    return rows.map(toMysteryBagCard);
}

export async function getMysteryBagMetrics() {
    const row = await db.queryOne(
        `SELECT COUNT(*)::int AS item_count,
                COALESCE(SUM(market_value), 0)::numeric(12, 2) AS market_total,
                COALESCE(AVG(market_value), 0)::numeric(12, 2) AS market_average
         FROM mystery_bag_cards
         WHERE status = 'active'`
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
        listMysteryBagCardsByStatuses(["active"]),
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
    const variationId = payload.squareVariationId || payload.variationId || null;
    const packToken = payload.packToken || null;

    const row = await db.queryOne(
        `INSERT INTO mystery_bag_cards (
            card_id,
            square_variation_id,
            pack_token,
            card_name,
            set_name,
            card_number,
            market_value,
            image_url,
            status,
            reservation_key,
            reserved_at,
            sold_at,
            removed_at,
            updated_at
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', NULL, NULL, NULL, NULL, NOW())
         ON CONFLICT (card_id)
         DO UPDATE
         SET square_variation_id = EXCLUDED.square_variation_id,
             pack_token = EXCLUDED.pack_token,
             card_name = EXCLUDED.card_name,
             set_name = EXCLUDED.set_name,
             card_number = EXCLUDED.card_number,
             market_value = EXCLUDED.market_value,
             image_url = EXCLUDED.image_url,
             status = 'active',
             reservation_key = NULL,
             reserved_at = NULL,
             sold_at = NULL,
             removed_at = NULL,
             updated_at = NOW()
         RETURNING id,
                   card_id,
                   square_variation_id,
                   pack_token,
                   card_name,
                   set_name,
                   card_number,
                   market_value,
                   image_url,
                   status,
                   created_at,
                   updated_at`,
        [
            payload.cardId,
            variationId,
            packToken,
            payload.name,
            payload.set,
            payload.number,
            payload.marketValue,
            payload.imageUrl,
        ]
    );

    await appendMysteryAuditLog(row.id, "updated", {
        cardId: row.card_id,
        squareVariationId: variationId,
        packToken,
        marketValue: toMoneyNumber(row.market_value),
    });

    return toMysteryBagCard(row);
}

export async function deleteMysteryBagCardByIdOrCardId(idOrCardId) {
    const row = await db.queryOne(
        `UPDATE mystery_bag_cards
         SET status = 'removed',
             removed_at = NOW(),
             updated_at = NOW()
         WHERE (id::text = $1 OR card_id = $1)
           AND status <> 'removed'
         RETURNING id,
                   card_id,
                   square_variation_id,
                   pack_token,
                   card_name,
                   set_name,
                   card_number,
                   market_value,
                   image_url,
                   status,
                   created_at,
                   updated_at`,
        [idOrCardId]
    );

    if (!row) {
        return null;
    }

    await appendMysteryAuditLog(row.id, "removed", {
        idOrCardId,
    });

    return toMysteryBagCard(row);
}

function toSoldAssignment(row) {
    return {
        id: row.assignment_id,
        soldEventId: row.sold_event_id,
        assignedAt: toIso(row.assigned_at),
        card: {
            id: row.card_id,
            cardId: row.card_card_id,
            squareVariationId: row.square_variation_id || null,
            packToken: row.pack_token || null,
            name: row.card_name,
            set: row.set_name,
            number: row.card_number,
            marketValue: toMoneyNumber(row.market_value),
            imageUrl: row.image_url || null,
            status: row.status || "sold",
            createdAt: toIso(row.created_at),
            updatedAt: toIso(row.updated_at),
        },
    };
}

async function appendMysteryAuditLog(mysteryCardId, action, payload = {}) {
    if (!mysteryCardId || !action) {
        return null;
    }

    return db.queryOne(
        `INSERT INTO mystery_audit_log (mystery_card_id, action, payload_json)
         VALUES ($1, $2, $3::jsonb)
         RETURNING id`,
        [mysteryCardId, action, JSON.stringify(payload || {})]
    ).catch(() => null);
}

async function assignCardsToSoldEvent({ soldEventId, quantity, reservationKeys = [] }) {
    const keys = reservationKeys.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim());
    const assignedIds = [];

    if (keys.length > 0) {
        const reservedMatches = await db.query(
            `SELECT id
             FROM mystery_bag_cards
             WHERE status = 'reserved'
               AND reservation_key = ANY($1::text[])
             ORDER BY reserved_at ASC NULLS LAST, created_at ASC
             LIMIT $2`,
            [keys, quantity]
        );

        for (const row of reservedMatches) {
            assignedIds.push(row.id);
        }
    }

    if (assignedIds.length < quantity) {
        const activePacked = await db.query(
            `SELECT id
             FROM mystery_bag_cards
             WHERE status = 'active'
               AND pack_token IS NOT NULL
             ORDER BY created_at ASC
             LIMIT $1`,
            [quantity - assignedIds.length]
        );

        for (const row of activePacked) {
            if (!assignedIds.includes(row.id)) {
                assignedIds.push(row.id);
            }
        }
    }

    if (assignedIds.length === 0) {
        return {
            assignments: [],
            remainingUnassignedUnits: quantity,
        };
    }

    const soldCards = await db.query(
        `UPDATE mystery_bag_cards
         SET status = 'sold',
             sold_at = NOW(),
             updated_at = NOW(),
             reservation_key = NULL,
             reserved_at = NULL
         WHERE id = ANY($1::uuid[])
           AND status IN ('active', 'reserved')
         RETURNING id`,
        [assignedIds]
    );

    const soldIds = soldCards.map((row) => row.id);

    if (soldIds.length === 0) {
        return {
            assignments: [],
            remainingUnassignedUnits: quantity,
        };
    }

    const assignmentRows = await db.query(
        `INSERT INTO mystery_sold_assignments (sold_event_id, mystery_card_id)
         SELECT $1, x.card_id
         FROM UNNEST($2::uuid[]) AS x(card_id)
         ON CONFLICT (mystery_card_id) DO NOTHING
         RETURNING id, sold_event_id, mystery_card_id, assigned_at`,
        [soldEventId, soldIds]
    );

    const assignmentIds = assignmentRows.map((row) => row.id);
    const assignments = assignmentIds.length === 0
        ? []
        : await db.query(
            `SELECT msa.id AS assignment_id,
                    msa.sold_event_id,
                    msa.assigned_at,
                    mbc.id AS card_id,
                    mbc.card_id AS card_card_id,
                    mbc.square_variation_id,
                    mbc.pack_token,
                    mbc.card_name,
                    mbc.set_name,
                    mbc.card_number,
                    mbc.market_value,
                    mbc.image_url,
                    mbc.status,
                    mbc.created_at,
                    mbc.updated_at
             FROM mystery_sold_assignments msa
             INNER JOIN mystery_bag_cards mbc ON mbc.id = msa.mystery_card_id
             WHERE msa.id = ANY($1::uuid[])
             ORDER BY msa.assigned_at ASC`,
            [assignmentIds]
        );

    await Promise.all(assignments.map((assignment) => appendMysteryAuditLog(assignment.card_id, "sold", {
        soldEventId,
        assignmentId: assignment.assignment_id,
    })));

    return {
        assignments: assignments.map(toSoldAssignment),
        remainingUnassignedUnits: Math.max(0, quantity - assignments.length),
    };
}

function normalizeSoldAt(value) {
    if (!value) {
        return new Date().toISOString();
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date.toISOString();
}

export async function createMysterySoldEvent(payload) {
    const soldAtIso = normalizeSoldAt(payload.soldAt);

    if (!soldAtIso) {
        return {
            error: "invalid_sold_at",
            status: 400,
        };
    }

    const quantity = Number(payload.quantity || 0);

    if (!Number.isInteger(quantity) || quantity < 1) {
        return {
            error: "invalid_quantity",
            status: 400,
        };
    }

    const idempotencyKey = typeof payload.idempotencyKey === "string" ? payload.idempotencyKey.trim() : "";

    if (!idempotencyKey) {
        return {
            error: "missing_idempotency_key",
            status: 400,
        };
    }

    let soldEvent;

    try {
        soldEvent = await db.queryOne(
            `INSERT INTO mystery_sold_events (
                idempotency_key,
                source,
                sold_at,
                square_order_id,
                square_line_item_uid,
                square_payment_id,
                sold_pack_variation_id,
                sold_pack_item_name,
                quantity
            )
            VALUES ($1, $2, $3::timestamptz, $4, $5, $6, $7, $8, $9)
            RETURNING id, idempotency_key, quantity`,
            [
                idempotencyKey,
                payload.source || "manual",
                soldAtIso,
                payload.squareOrderId || null,
                payload.squareLineItemUid || null,
                payload.squarePaymentId || null,
                payload.soldPackVariationId || null,
                payload.soldPackItemName || null,
                quantity,
            ]
        );
    } catch (error) {
        if (error?.dbCode === "23505") {
            return {
                error: "duplicate_idempotency_key",
                status: 409,
            };
        }

        throw error;
    }

    const reservationKeys = [payload.squareOrderId, payload.squarePaymentId, payload.squareLineItemUid];
    const assignmentResult = await assignCardsToSoldEvent({
        soldEventId: soldEvent.id,
        quantity,
        reservationKeys,
    });

    return {
        soldEventId: soldEvent.id,
        assigned: assignmentResult.assignments,
        remainingUnassignedUnits: assignmentResult.remainingUnassignedUnits,
    };
}

export async function getMysterySoldEventByIdempotencyKey(idempotencyKey) {
    if (!idempotencyKey) {
        return null;
    }

    const event = await db.queryOne(
        `SELECT id,
                idempotency_key,
                source,
                sold_at,
                square_order_id,
                square_line_item_uid,
                square_payment_id,
                sold_pack_variation_id,
                sold_pack_item_name,
                quantity,
                created_at
         FROM mystery_sold_events
         WHERE idempotency_key = $1`,
        [idempotencyKey]
    );

    if (!event) {
        return null;
    }

    const assignments = await db.query(
        `SELECT msa.id AS assignment_id,
                msa.sold_event_id,
                msa.assigned_at,
                mbc.id AS card_id,
                mbc.card_id AS card_card_id,
                mbc.square_variation_id,
                mbc.pack_token,
                mbc.card_name,
                mbc.set_name,
                mbc.card_number,
                mbc.market_value,
                mbc.image_url,
                mbc.status,
                mbc.created_at,
                mbc.updated_at
         FROM mystery_sold_assignments msa
         INNER JOIN mystery_bag_cards mbc ON mbc.id = msa.mystery_card_id
         WHERE msa.sold_event_id = $1
         ORDER BY msa.assigned_at ASC`,
        [event.id]
    );

    return {
        id: event.id,
        idempotencyKey: event.idempotency_key,
        source: event.source,
        soldAt: toIso(event.sold_at),
        quantity: Number(event.quantity || 0),
        squareOrderId: event.square_order_id || null,
        squareLineItemUid: event.square_line_item_uid || null,
        squarePaymentId: event.square_payment_id || null,
        soldPackVariationId: event.sold_pack_variation_id || null,
        soldPackItemName: event.sold_pack_item_name || null,
        createdAt: toIso(event.created_at),
        assigned: assignments.map(toSoldAssignment),
        remainingUnassignedUnits: Math.max(0, Number(event.quantity || 0) - assignments.length),
    };
}

export async function reserveMysteryBagCards(payload = {}) {
    const quantityValue = Number(payload.quantity || 1);
    const quantity = Number.isInteger(quantityValue) ? Math.max(1, quantityValue) : 1;
    const reservationKey = typeof payload.reservationKey === "string" ? payload.reservationKey.trim() : null;
    const explicitIds = Array.isArray(payload.ids) ? payload.ids.filter((value) => typeof value === "string" && value.trim()) : [];
    const explicitCardIds = Array.isArray(payload.cardIds) ? payload.cardIds.filter((value) => typeof value === "string" && value.trim()) : [];
    const explicitPackTokens = Array.isArray(payload.packTokens) ? payload.packTokens.filter((value) => typeof value === "string" && value.trim()) : [];

    const values = [reservationKey, quantity];
    const conditions = ["status = 'active'"];
    let paramIndex = values.length;

    if (explicitIds.length > 0) {
        values.push(explicitIds);
        paramIndex += 1;
        conditions.push(`id::text = ANY($${paramIndex}::text[])`);
    }

    if (explicitCardIds.length > 0) {
        values.push(explicitCardIds);
        paramIndex += 1;
        conditions.push(`card_id = ANY($${paramIndex}::text[])`);
    }

    if (explicitPackTokens.length > 0) {
        values.push(explicitPackTokens);
        paramIndex += 1;
        conditions.push(`pack_token = ANY($${paramIndex}::text[])`);
    }

    const query = `
        WITH candidates AS (
            SELECT id
            FROM mystery_bag_cards
            WHERE ${conditions.join(" AND ")}
            ORDER BY created_at ASC
            LIMIT $2
        )
        UPDATE mystery_bag_cards AS mbc
        SET status = 'reserved',
            reservation_key = $1,
            reserved_at = NOW(),
            updated_at = NOW()
        FROM candidates
        WHERE mbc.id = candidates.id
        RETURNING mbc.id,
                  mbc.card_id,
                  mbc.square_variation_id,
                  mbc.pack_token,
                  mbc.card_name,
                  mbc.set_name,
                  mbc.card_number,
                  mbc.market_value,
                  mbc.image_url,
                  mbc.status,
                  mbc.created_at,
                  mbc.updated_at
    `;

    const rows = await db.query(query, values);
    await Promise.all(rows.map((row) => appendMysteryAuditLog(row.id, "reserved", { reservationKey })));

    return {
        reserved: rows.map(toMysteryBagCard),
        requestedQuantity: quantity,
        reservedQuantity: rows.length,
        remainingUnreservedUnits: Math.max(0, quantity - rows.length),
    };
}

export async function createMysteryWebhookEvent(payload = {}) {
    const idempotencyKey = typeof payload.idempotencyKey === "string" ? payload.idempotencyKey.trim() : null;

    const row = await db.queryOne(
        `INSERT INTO mystery_webhook_events (
            provider,
            provider_event_id,
            idempotency_key,
            event_type,
            signature_valid,
            payload_json,
            processing_status
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'queued')
        ON CONFLICT (provider, provider_event_id)
        DO UPDATE SET
            idempotency_key = COALESCE(EXCLUDED.idempotency_key, mystery_webhook_events.idempotency_key),
            event_type = COALESCE(EXCLUDED.event_type, mystery_webhook_events.event_type),
            signature_valid = EXCLUDED.signature_valid,
            payload_json = EXCLUDED.payload_json
        RETURNING id, processing_status`,
        [
            payload.provider || "square",
            payload.providerEventId || null,
            idempotencyKey,
            payload.eventType || null,
            payload.signatureValid === true,
            JSON.stringify(payload.payload || {}),
        ]
    );

    return row;
}

export async function markMysteryWebhookEventProcessed(eventId, details = {}) {
    await db.query(
        `UPDATE mystery_webhook_events
         SET processing_status = $2,
             processing_error = $3,
             processed_at = NOW()
         WHERE id = $1`,
        [eventId, details.status || "processed", details.error || null]
    );
}

function toSafeWebhookIdempotencyKey(value) {
    if (typeof value !== "string") {
        return "";
    }

    return value.trim().slice(0, 200);
}

function toPotentialLineItems(payload) {
    const buckets = [];
    const stack = [payload];

    while (stack.length > 0) {
        const current = stack.pop();

        if (!current || typeof current !== "object") {
            continue;
        }

        if (Array.isArray(current.line_items)) {
            buckets.push(...current.line_items);
        }

        if (Array.isArray(current.lineItems)) {
            buckets.push(...current.lineItems);
        }

        for (const value of Object.values(current)) {
            if (value && typeof value === "object") {
                stack.push(value);
            }
        }
    }

    return buckets;
}

function parseQuantity(value) {
    const asNumber = Number(value);

    if (!Number.isFinite(asNumber)) {
        return 0;
    }

    return Math.max(0, Math.floor(asNumber));
}

function getEnvConfiguredMysteryVariationIds() {
    const configured = process.env.MYSTERY_BAG_PACK_VARIATION_IDS || process.env.MYSTERY_BAG_PACK_VARIATION_ID || "";

    return configured
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
}

async function getConfiguredMysteryVariationIds() {
    const values = new Set(getEnvConfiguredMysteryVariationIds());

    try {
        const rows = await db.query(
            `SELECT DISTINCT square_variation_id
             FROM mystery_bag_cards
             WHERE status IN ('active', 'reserved')
               AND square_variation_id IS NOT NULL`
        );

        for (const row of rows) {
            const variationId = typeof row?.square_variation_id === "string" ? row.square_variation_id.trim() : "";

            if (variationId) {
                values.add(variationId);
            }
        }
    } catch (error) {
        mysteryLogger.warn("mystery_bags.webhook.variation_lookup_failed", {
            reason: error instanceof Error ? error.message : "unknown_error",
        });
    }

    return Array.from(values);
}

async function extractMysterySaleFromSquarePayload(payload = {}) {
    const providerEventId = payload.event_id || payload.id || payload.data?.id || null;
    const eventType = payload.type || payload.event_type || payload.data?.type || null;
    const lineItems = toPotentialLineItems(payload);
    const configuredVariationIds = await getConfiguredMysteryVariationIds();
    const mysteryItems = lineItems.filter((item) => {
        const variationId = item?.catalog_object_id || item?.variation_id || item?.catalogObjectId || null;
        const name = String(item?.name || item?.item_name || item?.itemName || "").toLowerCase();

        if (variationId && configuredVariationIds.includes(variationId)) {
            return true;
        }

        return name.includes("mystery") && name.includes("pack");
    });

    const quantity = mysteryItems.reduce((sum, item) => sum + parseQuantity(item?.quantity || 1), 0);
    const soldPackVariationId = mysteryItems[0]?.catalog_object_id || mysteryItems[0]?.variation_id || mysteryItems[0]?.catalogObjectId || null;
    const soldPackItemName = mysteryItems[0]?.name || mysteryItems[0]?.item_name || mysteryItems[0]?.itemName || null;
    const soldAt = payload.created_at || payload.data?.created_at || new Date().toISOString();
    const squareOrderId = payload.data?.object?.payment?.order_id
        || payload.data?.object?.order?.id
        || payload.data?.object?.order_updated?.order?.id
        || payload.order_id
        || null;
    const squareLineItemUid = mysteryItems[0]?.uid || null;
    const squarePaymentId = payload.data?.object?.payment?.id || payload.payment_id || null;
    const idempotencyKey = toSafeWebhookIdempotencyKey(
        providerEventId ? `square:${providerEventId}` : `square:${eventType || "unknown"}:${squareOrderId || squarePaymentId || soldAt}`
    );

    return {
        providerEventId,
        eventType,
        idempotencyKey,
        soldAt,
        quantity,
        squareOrderId,
        squareLineItemUid,
        squarePaymentId,
        soldPackVariationId,
        soldPackItemName,
    };
}

export async function processQueuedMysteryWebhookEvent(eventId) {
    const row = await db.queryOne(
        `SELECT id, payload_json
         FROM mystery_webhook_events
         WHERE id = $1`,
        [eventId]
    );

    if (!row) {
        return null;
    }

    const payload = row.payload_json || {};
    const extracted = await extractMysterySaleFromSquarePayload(payload);

    if (!extracted.idempotencyKey || extracted.quantity < 1) {
        await markMysteryWebhookEventProcessed(eventId, {
            status: "ignored",
            error: "no_mystery_sale_units_detected",
        });
        return {
            status: "ignored",
            processed: false,
        };
    }

    const result = await createMysterySoldEvent({
        idempotencyKey: extracted.idempotencyKey,
        source: "square_webhook",
        soldAt: extracted.soldAt,
        quantity: extracted.quantity,
        squareOrderId: extracted.squareOrderId,
        squareLineItemUid: extracted.squareLineItemUid,
        squarePaymentId: extracted.squarePaymentId,
        soldPackVariationId: extracted.soldPackVariationId,
        soldPackItemName: extracted.soldPackItemName,
    });

    if (result?.error === "duplicate_idempotency_key") {
        await markMysteryWebhookEventProcessed(eventId, {
            status: "duplicated",
            error: null,
        });

        return {
            status: "duplicated",
            processed: false,
        };
    }

    if (result?.error) {
        await markMysteryWebhookEventProcessed(eventId, {
            status: "failed",
            error: result.error,
        });

        return {
            status: "failed",
            processed: false,
            error: result.error,
        };
    }

    await markMysteryWebhookEventProcessed(eventId, {
        status: "processed",
        error: null,
    });

    return {
        status: "processed",
        processed: true,
        assignedCount: result.assigned.length,
        remainingUnassignedUnits: result.remainingUnassignedUnits,
    };
}

export function enqueueMysteryWebhookProcessing(eventId) {
    setImmediate(async () => {
        try {
            const result = await processQueuedMysteryWebhookEvent(eventId);

            mysteryLogger.info("mystery_bags.webhook.processed", {
                eventId,
                status: result?.status || "unknown",
                assignedCount: result?.assignedCount || 0,
                remainingUnassignedUnits: result?.remainingUnassignedUnits || 0,
            });
        } catch (error) {
            await markMysteryWebhookEventProcessed(eventId, {
                status: "failed",
                error: error instanceof Error ? error.message : "unknown_processing_error",
            }).catch(() => null);

            mysteryLogger.error("mystery_bags.webhook.processing_failed", error, {
                eventId,
            });
        }
    });
}
