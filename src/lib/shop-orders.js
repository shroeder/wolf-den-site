import "server-only";

import { db } from "@/lib/db";

function parseItemsJson(itemsJson) {
    try {
        return Array.isArray(itemsJson) ? itemsJson : JSON.parse(itemsJson || "[]");
    } catch {
        return [];
    }
}

// Camel-cased, client-safe shape for the admin order views (web page + phone app share this so
// their order data can never drift apart).
export function serializeShopOrderForAdmin(o) {
    return {
        id: o.id,
        createdAt: o.created_at ? new Date(o.created_at).toISOString() : null,
        status: o.status,
        fulfillmentStatus: o.fulfillment_status || "unfulfilled",
        fulfillmentMode: o.fulfillment_mode,
        trackingNumber: o.tracking_number || "",
        totalCents: o.total_cents,
        subtotalCents: o.subtotal_cents,
        taxCents: o.tax_cents ?? null,
        shippingCents: o.shipping_cents ?? null,
        onlineFeeCents: o.online_fee_cents,
        shippingCarrier: o.shipping_carrier || null,
        shippingService: o.shipping_service || null,
        shippingLabelUrl: o.shipping_label_url || null,
        hasShipment: Boolean(o.easypost_shipment_id && o.easypost_rate_id),
        customerName: o.customer_name || o.shipping_name || null,
        customerEmail: o.customer_email || o.shipping_email || null,
        squareCustomerId: o.square_customer_id || null,
        cancellationReason: o.cancellation_reason || null,
        refundAmountCents: o.refund_amount_cents ?? null,
        items: parseItemsJson(o.items_json),
        shipping: {
            name: o.shipping_name,
            email: o.shipping_email,
            phone: o.shipping_phone,
            addressLine1: o.shipping_address_line1,
            addressLine2: o.shipping_address_line2,
            city: o.shipping_city,
            state: o.shipping_state,
            postalCode: o.shipping_postal_code,
        },
        receiptUrl: o.receipt_url,
    };
}

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
    taxCents = 0,
    shippingCents = 0,
    totalCents,
    idempotencyKey,
    cartId,
    items,
    fulfillmentMode,
    shipping,
    shippingValidationStatus,
    easyPostShipmentId = null,
    easyPostRateId = null,
    shippingCarrier = null,
    shippingService = null,
    customerId = null,
    customerEmail = null,
    customerName = null,
    squareCustomerId = null,
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
            tax_cents,
            shipping_cents,
            easypost_shipment_id,
            easypost_rate_id,
            shipping_carrier,
            shipping_service,
            customer_id,
            customer_email,
            customer_name,
            square_customer_id,
            status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, 'pending')
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
            Math.max(0, Math.round(Number(taxCents) || 0)),
            Math.max(0, Math.round(Number(shippingCents) || 0)),
            toNullableText(easyPostShipmentId),
            toNullableText(easyPostRateId),
            toNullableText(shippingCarrier),
            toNullableText(shippingService),
            toNullableText(customerId),
            toNullableText(customerEmail),
            toNullableText(customerName),
            toNullableText(squareCustomerId),
        ]
    );
}

// Store the bought EasyPost label + tracking on the order and mark it shipped.
export async function setShopOrderShippingLabel(orderId, { labelUrl, trackingNumber, carrier, service }) {
    return db.queryOne(
        `UPDATE shop_orders
         SET shipping_label_url = COALESCE($2, shipping_label_url),
             tracking_number = COALESCE($3, tracking_number),
             shipping_carrier = COALESCE($4, shipping_carrier),
             shipping_service = COALESCE($5, shipping_service),
             fulfillment_status = 'shipped',
             fulfilled_at = COALESCE(fulfilled_at, NOW()),
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
            orderId,
            toNullableText(labelUrl),
            toNullableText(trackingNumber),
            toNullableText(carrier),
            toNullableText(service),
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

// Admin: record a cancellation + refund on an order. Sets fulfillment_status=cancelled and stores
// the reason (shown to the customer) + Square refund details.
export async function setShopOrderCancelled(orderId, { reason, refundId = null, refundAmountCents = null }) {
    return db.queryOne(
        `UPDATE shop_orders
         SET fulfillment_status = 'cancelled',
             cancellation_reason = $2,
             refund_id = COALESCE($3, refund_id),
             refund_amount_cents = COALESCE($4, refund_amount_cents),
             refunded_at = CASE WHEN $3 IS NOT NULL THEN NOW() ELSE refunded_at END,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
            orderId,
            toNullableText(reason),
            toNullableText(refundId),
            refundAmountCents == null ? null : Math.max(0, Math.round(Number(refundAmountCents) || 0)),
        ]
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
