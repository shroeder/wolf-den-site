import "server-only";

import { randomUUID } from "node:crypto";

export const SHOP_CART_COOKIE = "wolfden-shop-cart";

const CART_TTL_SECONDS = 60 * 60 * 24 * 30;

function isLikelyUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

export function getShopCartCookieOptions() {
    return {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: CART_TTL_SECONDS,
    };
}

export function getExistingCartId(cookieStore) {
    const value = cookieStore.get(SHOP_CART_COOKIE)?.value || "";

    if (!isLikelyUuid(value)) {
        return null;
    }

    return value;
}

export function getOrCreateCartId(cookieStore) {
    const existing = getExistingCartId(cookieStore);

    if (existing) {
        return existing;
    }

    const nextId = randomUUID();
    cookieStore.set(SHOP_CART_COOKIE, nextId, getShopCartCookieOptions());

    return nextId;
}

export function setShopCartId(cookieStore, cartId) {
    if (!isLikelyUuid(cartId)) {
        return;
    }

    cookieStore.set(SHOP_CART_COOKIE, cartId, getShopCartCookieOptions());
}
