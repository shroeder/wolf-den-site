import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { getShopCustomerBySessionSubject } from "@/lib/shop-customers";

export const SHOP_CUSTOMER_SESSION_COOKIE = "wolfden-shop-customer-session";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const SESSION_RENEWAL_WINDOW_SECONDS = 60 * 60 * 24;

const encodePayload = (value) => Buffer.from(value, "utf8").toString("base64url");
const decodePayload = (value) => Buffer.from(value, "base64url").toString("utf8");

function getSessionSecret() {
    return process.env.SHOP_CUSTOMER_SESSION_SECRET || "";
}

function signValue(payload) {
    return createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

function safeEqual(left, right) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    if (leftBuffer.length !== rightBuffer.length) {
        return false;
    }

    return timingSafeEqual(leftBuffer, rightBuffer);
}

export function assertShopCustomerSessionSecret() {
    if (!getSessionSecret()) {
        throw new Error("Missing shop customer session secret.");
    }
}

export function createShopCustomerSessionToken(customerId) {
    assertShopCustomerSessionSecret();

    const payload = JSON.stringify({
        customerId,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
        sid: randomUUID(),
    });
    const encodedPayload = encodePayload(payload);
    const signature = signValue(encodedPayload);

    return `${encodedPayload}.${signature}`;
}

export function verifyShopCustomerSessionToken(token) {
    if (!token || !getSessionSecret()) {
        return null;
    }

    const [encodedPayload, signature] = token.split(".");

    if (!encodedPayload || !signature) {
        return null;
    }

    const expectedSignature = signValue(encodedPayload);

    if (!safeEqual(signature, expectedSignature)) {
        return null;
    }

    try {
        const payload = JSON.parse(decodePayload(encodedPayload));

        if (!payload.customerId || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
            return null;
        }

        return payload;
    } catch {
        return null;
    }
}

export function getShopCustomerCookieOptions() {
    return {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: SESSION_TTL_SECONDS,
    };
}

export function shouldRotateShopCustomerSession(payload) {
    if (!payload?.exp) {
        return false;
    }

    return (Number(payload.exp) - Math.floor(Date.now() / 1000)) <= SESSION_RENEWAL_WINDOW_SECONDS;
}

export function setShopCustomerSession(cookieStore, customerId) {
    const token = createShopCustomerSessionToken(customerId);

    cookieStore.set(SHOP_CUSTOMER_SESSION_COOKIE, token, getShopCustomerCookieOptions());

    return token;
}

export async function getAuthenticatedShopCustomerFromToken(token) {
    const payload = verifyShopCustomerSessionToken(token);

    if (!payload) {
        return null;
    }

    return getShopCustomerBySessionSubject(payload.customerId);
}

export async function getAuthenticatedShopCustomerFromCookies() {
    const session = await getAuthenticatedShopCustomerSessionFromCookies();

    return session?.customer || null;
}

export async function getAuthenticatedShopCustomerSessionFromCookies() {
    const cookieStore = await cookies();
    const token = cookieStore.get(SHOP_CUSTOMER_SESSION_COOKIE)?.value;

    if (!token) {
        return null;
    }

    const payload = verifyShopCustomerSessionToken(token);

    if (!payload) {
        return null;
    }

    const customer = await getShopCustomerBySessionSubject(payload.customerId);

    if (!customer) {
        return null;
    }

    return {
        token,
        payload,
        customer,
    };
}
