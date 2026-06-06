import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

import { NextResponse } from "next/server";

import {
    createSquareCardPayment,
    upsertSquareCustomerProfile,
} from "@/lib/consignment/square";
import { getAuthenticatedShopCustomerFromCookies } from "@/lib/shop-customer-session";
import { updateShopCustomerSquareId } from "@/lib/shop-customers";
import { isTrustedWriteRequest } from "@/lib/request-security";
import { getExistingCartId } from "@/lib/shop-cart-session";
import { clearCartItems, getCartSummary } from "@/lib/shop-carts";
import {
    createPendingShopOrder,
    updateShopOrderPaymentResult,
} from "@/lib/shop-orders";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

function jsonNoStore(body, init = {}) {
    return NextResponse.json(body, {
        ...init,
        headers: {
            "Cache-Control": "no-store",
            ...(init.headers || {}),
        },
    });
}

const badRequest = (message) => jsonNoStore({ error: message }, { status: 400 });

const US_STATES = new Set([
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
]);

function normalizeText(value) {
    const normalized = String(value || "").trim();

    return normalized || null;
}

function normalizeEmail(value) {
    const normalized = normalizeText(value);

    return normalized ? normalized.toLowerCase() : null;
}

function normalizeShippingPayload(value) {
    const payload = value && typeof value === "object" ? value : {};

    return {
        name: normalizeText(payload.name),
        email: normalizeEmail(payload.email),
        phone: normalizeText(payload.phone),
        addressLine1: normalizeText(payload.addressLine1),
        addressLine2: normalizeText(payload.addressLine2),
        city: normalizeText(payload.city),
        state: normalizeText(payload.state)?.toUpperCase() || null,
        postalCode: normalizeText(payload.postalCode),
        country: normalizeText(payload.country)?.toUpperCase() || "US",
    };
}

function validateFulfillment(body) {
    const mode = String(body?.fulfillmentMode || "shipping").trim().toLowerCase();

    if (mode !== "shipping" && mode !== "pickup") {
        return {
            error: "Fulfillment mode must be shipping or pickup.",
            fieldErrors: {
                fulfillmentMode: "Choose shipping or pickup.",
            },
        };
    }

    if (mode === "pickup") {
        return {
            fulfillmentMode: mode,
            shipping: null,
            shippingValidationStatus: "not_required",
            fieldErrors: null,
        };
    }

    const shipping = normalizeShippingPayload(body?.shipping);
    const fieldErrors = {};

    if (!shipping.name) {
        fieldErrors.shippingName = "Full name is required.";
    }

    if (!shipping.email || !/^\S+@\S+\.\S+$/.test(shipping.email)) {
        fieldErrors.shippingEmail = "Enter a valid email address.";
    }

    if (!shipping.phone || shipping.phone.replace(/\D/g, "").length < 10) {
        fieldErrors.shippingPhone = "Enter a valid phone number.";
    }

    if (!shipping.addressLine1) {
        fieldErrors.shippingAddressLine1 = "Address line 1 is required.";
    }

    if (!shipping.city) {
        fieldErrors.shippingCity = "City is required.";
    }

    if (!shipping.state || !US_STATES.has(shipping.state)) {
        fieldErrors.shippingState = "Use a valid 2-letter US state.";
    }

    if (!shipping.postalCode || !/^\d{5}(?:-\d{4})?$/.test(shipping.postalCode)) {
        fieldErrors.shippingPostalCode = "Use ZIP format 12345 or 12345-6789.";
    }

    if (shipping.country !== "US") {
        fieldErrors.shippingCountry = "Only US domestic shipping is supported right now.";
    }

    if (Object.keys(fieldErrors).length > 0) {
        return {
            error: "Shipping details are incomplete or invalid.",
            fieldErrors,
        };
    }

    return {
        fulfillmentMode: mode,
        shipping,
        shippingValidationStatus: "valid",
        fieldErrors: null,
    };
}

function isPaymentsEnabled() {
    return process.env.PAYMENTS_ENABLED === "true";
}

function mapSquareStatusToOrderStatus(squareStatus) {
    if (squareStatus === "COMPLETED") {
        return "completed";
    }

    if (squareStatus === "CANCELED" || squareStatus === "FAILED") {
        return "failed";
    }

    return "pending";
}

function toCheckoutResponse(order, payment) {
    return {
        success: order.status === "completed",
        order: {
            id: order.id,
            status: order.status,
            itemName: order.item_name,
            subtotalCents: order.subtotal_cents,
            onlineFeeCents: order.online_fee_cents,
            totalCents: order.total_cents,
            fulfillmentMode: order.fulfillment_mode,
            shipping: {
                name: order.shipping_name,
                email: order.shipping_email,
                phone: order.shipping_phone,
                addressLine1: order.shipping_address_line1,
                addressLine2: order.shipping_address_line2,
                city: order.shipping_city,
                state: order.shipping_state,
                postalCode: order.shipping_postal_code,
                country: order.shipping_country,
            },
            squarePaymentId: order.square_payment_id,
            squareStatus: order.square_status,
            receiptUrl: order.receipt_url,
            createdAt: order.created_at,
            updatedAt: order.updated_at,
        },
        payment: payment
            ? {
                id: payment.id,
                status: payment.status,
                receiptUrl: payment.receipt_url || null,
            }
            : null,
    };
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/shop/checkout", async ({ logger, internalError }) => {
        if (!isTrustedWriteRequest(request)) {
            return jsonNoStore({ error: "Invalid request origin." }, { status: 403 });
        }

        if (!isPaymentsEnabled()) {
            return jsonNoStore({ error: "Payments are currently disabled." }, { status: 403 });
        }

        try {
            const body = await request.json().catch(() => null);

            if (!body) {
                return badRequest("Invalid request body.");
            }

            const sourceId = String(body.sourceId || "").trim();

            if (!sourceId) {
                return badRequest("Missing payment source id.");
            }

            const fulfillment = validateFulfillment(body);
            const saveCustomerProfile = body?.saveCustomerProfile === true;
            const authenticatedCustomer = saveCustomerProfile ? await getAuthenticatedShopCustomerFromCookies() : null;

            if (saveCustomerProfile && !authenticatedCustomer) {
                return jsonNoStore(
                    { error: "Sign in to save checkout info for next time." },
                    { status: 401 }
                );
            }

            if (fulfillment.error) {
                return jsonNoStore(
                    {
                        error: fulfillment.error,
                        fieldErrors: fulfillment.fieldErrors,
                    },
                    { status: 400 }
                );
            }

            const cookieStore = await cookies();
            const cartId = getExistingCartId(cookieStore);

            if (!cartId) {
                return jsonNoStore({ error: "Cart is empty." }, { status: 409 });
            }

            const cart = await getCartSummary(cartId);

            if (!cart.items.length) {
                return jsonNoStore({ error: "Cart is empty." }, { status: 409 });
            }

            if (cart.hasUnavailableItems) {
                return jsonNoStore({
                    error: "Cart contains unavailable items. Please review your cart and try again.",
                    cart,
                }, { status: 409 });
            }

            const idempotencyKey = randomUUID();

            const pendingOrder = await createPendingShopOrder({
                catalogObjectId: "cart",
                itemName: `${cart.itemCount} item cart`,
                quantity: cart.itemCount,
                subtotalCents: cart.subtotalCents,
                onlineFeeCents: cart.onlineFeeCents,
                totalCents: cart.totalCents,
                idempotencyKey,
                cartId,
                items: cart.items,
                fulfillmentMode: fulfillment.fulfillmentMode,
                shipping: fulfillment.shipping,
                shippingValidationStatus: fulfillment.shippingValidationStatus,
            });

            let payment;

            try {
                payment = await createSquareCardPayment({
                    sourceId,
                    amountCents: cart.totalCents,
                    idempotencyKey,
                    note: `Shop order ${pendingOrder.id}`,
                    referenceId: pendingOrder.id,
                });
            } catch (error) {
                await updateShopOrderPaymentResult(pendingOrder.id, {
                    status: "failed",
                    paymentErrorCode: error?.squareCode || "payment_create_failed",
                    paymentErrorMessage: error instanceof Error ? error.message : "Unknown payment error.",
                });

                logger.warn("shop.checkout.payment_failed", {
                    orderId: pendingOrder.id,
                    squareCode: error?.squareCode,
                    squareStatus: error?.squareStatus,
                });

                return jsonNoStore(
                    {
                        error: "Payment could not be processed.",
                        code: error?.squareCode || "payment_create_failed",
                    },
                    { status: error?.squareStatus === 400 ? 402 : 502 }
                );
            }

            const orderStatus = mapSquareStatusToOrderStatus(payment?.status);
            const updatedOrder = await updateShopOrderPaymentResult(pendingOrder.id, {
                status: orderStatus,
                squarePaymentId: payment?.id,
                squareStatus: payment?.status,
                receiptUrl: payment?.receipt_url,
                paymentErrorCode: null,
                paymentErrorMessage: null,
            });

            if (updatedOrder.status === "completed") {
                await clearCartItems(cartId);

                if (saveCustomerProfile && fulfillment.fulfillmentMode === "shipping" && fulfillment.shipping) {
                    await upsertSquareCustomerProfile({
                        preferredCustomerId: authenticatedCustomer?.squareCustomerId,
                        allowEmailLookup: false,
                        email: fulfillment.shipping.email,
                        name: fulfillment.shipping.name,
                        phone: fulfillment.shipping.phone,
                        addressLine1: fulfillment.shipping.addressLine1,
                        addressLine2: fulfillment.shipping.addressLine2,
                        city: fulfillment.shipping.city,
                        state: fulfillment.shipping.state,
                        postalCode: fulfillment.shipping.postalCode,
                        country: fulfillment.shipping.country,
                    }).then((squareCustomer) => {
                        if (authenticatedCustomer?.id && squareCustomer?.id) {
                            return updateShopCustomerSquareId(authenticatedCustomer.id, squareCustomer.id);
                        }

                        return null;
                    }).catch((profileError) => {
                        logger.warn("shop.checkout.customer_profile.save_failed", {
                            orderId: updatedOrder.id,
                            errorMessage: profileError instanceof Error ? profileError.message : "unknown_error",
                        });
                    });
                }
            }

            return jsonNoStore(toCheckoutResponse(updatedOrder, payment), {
                status: updatedOrder.status === "completed" ? 200 : 202,
            });
        } catch (error) {
            return internalError(error, {
                event: "shop.checkout.failed",
            });
        }
    });
}
