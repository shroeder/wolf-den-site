import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { findShopItemByVariationId } from "@/lib/consignment/square";
import { getAuthenticatedShopCustomerFromCookies } from "@/lib/shop-customer-session";
import {
    clearCartItems,
    getCartItem,
    getCartSummary,
    resolveActiveCartId,
    setCartItemQuantity,
} from "@/lib/shop-carts";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

function isPaymentsEnabled() {
    return process.env.PAYMENTS_ENABLED === "true";
}

const badRequest = (message) => NextResponse.json({ error: message }, { status: 400 });

async function getCartIdFromCookies() {
    const cookieStore = await cookies();
    const customer = await getAuthenticatedShopCustomerFromCookies();

    return resolveActiveCartId({
        cookieStore,
        customerId: customer?.id || null,
    });
}

export async function GET(request) {
    return withRequestLogging(request, "GET /api/shop/cart", async ({ internalError }) => {
        if (!isPaymentsEnabled()) {
            return NextResponse.json({ error: "Payments are currently disabled." }, { status: 403 });
        }

        try {
            const cartId = await getCartIdFromCookies();
            const cart = await getCartSummary(cartId);

            return NextResponse.json(cart, {
                headers: {
                    "Cache-Control": "no-store",
                },
            });
        } catch (error) {
            return internalError(error, {
                event: "shop.cart.get.failed",
            });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/shop/cart", async ({ internalError }) => {
        if (!isPaymentsEnabled()) {
            return NextResponse.json({ error: "Payments are currently disabled." }, { status: 403 });
        }

        try {
            const body = await request.json().catch(() => null);

            if (!body || typeof body.action !== "string") {
                return badRequest("Invalid request body.");
            }

            const action = body.action.trim().toLowerCase();
            const cartId = await getCartIdFromCookies();

            if (action === "clear") {
                await clearCartItems(cartId);
                return NextResponse.json(await getCartSummary(cartId));
            }

            const catalogObjectId = String(body.catalogObjectId || "").trim();

            if (!catalogObjectId) {
                return badRequest("Missing catalog object id.");
            }

            if (action === "remove") {
                await setCartItemQuantity(cartId, catalogObjectId, 0);
                return NextResponse.json(await getCartSummary(cartId));
            }

            if (action === "update") {
                const requestedQuantity = Math.floor(Number(body.quantity || 0));

                if (!Number.isFinite(requestedQuantity)) {
                    return badRequest("Invalid quantity.");
                }

                if (requestedQuantity <= 0) {
                    await setCartItemQuantity(cartId, catalogObjectId, 0);
                    return NextResponse.json(await getCartSummary(cartId));
                }
            }

            const item = await findShopItemByVariationId(catalogObjectId);

            if (!item || !Number.isFinite(item.quantity) || item.quantity < 1) {
                return NextResponse.json({ error: "Item not found or out of stock." }, { status: 409 });
            }

            if (action === "add") {
                const quantityToAdd = Math.max(1, Math.floor(Number(body.quantity || 1)));
                const existing = await getCartItem(cartId, catalogObjectId);
                const nextQuantity = Number(existing?.quantity || 0) + quantityToAdd;

                if (nextQuantity > item.quantity) {
                    return NextResponse.json({
                        error: `Only ${item.quantity} available in stock.`,
                    }, { status: 409 });
                }

                await setCartItemQuantity(cartId, catalogObjectId, nextQuantity);
                return NextResponse.json(await getCartSummary(cartId));
            }

            if (action === "update") {
                const nextQuantity = Math.floor(Number(body.quantity || 0));

                if (!Number.isFinite(nextQuantity)) {
                    return badRequest("Invalid quantity.");
                }

                const existing = await getCartItem(cartId, catalogObjectId);
                const existingQuantity = Number(existing?.quantity || 0);

                if (nextQuantity > item.quantity && nextQuantity >= existingQuantity) {
                    return NextResponse.json({
                        error: `Only ${item.quantity} available in stock.`,
                    }, { status: 409 });
                }

                await setCartItemQuantity(cartId, catalogObjectId, Math.max(0, nextQuantity));
                return NextResponse.json(await getCartSummary(cartId));
            }

            return badRequest("Unsupported cart action.");
        } catch (error) {
            return internalError(error, {
                event: "shop.cart.mutation.failed",
            });
        }
    });
}
