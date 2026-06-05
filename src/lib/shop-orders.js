import "server-only";

import { db } from "@/lib/db";

function toNullableText(value) {
    if (value === null || value === undefined) {
        return null;
    }

    const normalized = String(value).trim();

    return normalized || null;
}

export async function createPendingShopOrder({
    catalogObjectId,
    itemName,
    quantity,
    subtotalCents,
    onlineFeeCents,
    totalCents,
    idempotencyKey,
}) {
    return db.queryOne(
        `INSERT INTO shop_orders (
            catalog_object_id,
            item_name,
            quantity,
            subtotal_cents,
            online_fee_cents,
            total_cents,
            idempotency_key,
            status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
        RETURNING *`,
        [
            catalogObjectId,
            itemName,
            quantity,
            subtotalCents,
            onlineFeeCents,
            totalCents,
            idempotencyKey,
        ]
    );
}

export async function updateShopOrderPaymentResult(orderId, {
    status,
    squarePaymentId,
    squareStatus,
    receiptUrl,
    paymentErrorCode,
    paymentErrorMessage,
}) {
    return db.queryOne(
        `UPDATE shop_orders
         SET status = $2,
             square_payment_id = COALESCE($3, square_payment_id),
             square_status = COALESCE($4, square_status),
             receipt_url = COALESCE($5, receipt_url),
             payment_error_code = $6,
             payment_error_message = $7,
             updated_at = NOW(),
             completed_at = CASE WHEN $2 = 'completed' THEN NOW() ELSE completed_at END
         WHERE id = $1
         RETURNING *`,
        [
            orderId,
            status,
            toNullableText(squarePaymentId),
            toNullableText(squareStatus),
            toNullableText(receiptUrl),
            toNullableText(paymentErrorCode),
            toNullableText(paymentErrorMessage),
        ]
    );
}

export async function getShopOrderById(orderId) {
    return db.queryOne(
        `SELECT *
         FROM shop_orders
         WHERE id = $1`,
        [orderId]
    );
}
