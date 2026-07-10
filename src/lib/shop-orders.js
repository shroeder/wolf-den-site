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
    cartId,
    items,
    fulfillmentMode,
    shipping,
    shippingValidationStatus,
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
            cart_id,
            items_json,
            fulfillment_mode,
            shipping_name,
            shipping_email,
            shipping_phone,
            shipping_address_line1,
            shipping_address_line2,
            shipping_city,
            shipping_state,
            shipping_postal_code,
            shipping_country,
            shipping_validation_status,
            status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, 'pending')
        RETURNING *`,
        [
            catalogObjectId,
            itemName,
            quantity,
            subtotalCents,
            onlineFeeCents,
            totalCents,
            idempotencyKey,
            toNullableText(cartId),
            JSON.stringify(items || []),
            toNullableText(fulfillmentMode) || "shipping",
            toNullableText(shipping?.name),
            toNullableText(shipping?.email),
            toNullableText(shipping?.phone),
            toNullableText(shipping?.addressLine1),
            toNullableText(shipping?.addressLine2),
            toNullableText(shipping?.city),
            toNullableText(shipping?.state),
            toNullableText(shipping?.postalCode),
            toNullableText(shipping?.country),
            toNullableText(shippingValidationStatus) || "pending",
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

// Admin: recent orders for the order-management view. Defaults to paid orders (the actionable ones).
export async function listShopOrders({ limit = 100, paymentStatus = "completed", fulfillmentStatus = null } = {}) {
    const params = [];
    const filters = [];
    if (paymentStatus && paymentStatus !== "all") {
        params.push(paymentStatus);
        filters.push(`status = $${params.length}`);
    }
    if (fulfillmentStatus && fulfillmentStatus !== "all") {
        params.push(fulfillmentStatus);
        filters.push(`fulfillment_status = $${params.length}`);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    params.push(Math.min(Number(limit) || 100, 500));
    return db.query(
        `SELECT * FROM shop_orders ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
        params
    );
}

// Admin: update fulfillment (mark ready/shipped/picked up/cancelled) + optional tracking number.
export async function setShopOrderFulfillment(orderId, { fulfillmentStatus, trackingNumber }) {
    return db.queryOne(
        `UPDATE shop_orders
         SET fulfillment_status = COALESCE($2, fulfillment_status),
             tracking_number = COALESCE($3, tracking_number),
             fulfilled_at = CASE WHEN $2 IN ('shipped', 'picked_up') THEN NOW() ELSE fulfilled_at END,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [orderId, toNullableText(fulfillmentStatus), toNullableText(trackingNumber)]
    );
}
