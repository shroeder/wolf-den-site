import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export const WATCHER_COOKIE = "wolfden-watcher";

// Long-lived: a wishlist should survive across visits without an account.
const WATCHER_TTL_SECONDS = 60 * 60 * 24 * 365;

const encodePayload = (value) => Buffer.from(value, "utf8").toString("base64url");
const decodePayload = (value) => Buffer.from(value, "base64url").toString("utf8");

function getSecret() {
    // Dedicated secret if set; otherwise fall back to another server session secret that is
    // already configured in production so the watcher cookie can actually be signed AND verified
    // with the same key. (If this resolves to an empty string, verifyWatcherToken rejects every
    // cookie and each request would mint a new watcher — so a real secret must be present.)
    return (
        process.env.WATCHER_SESSION_SECRET ||
        process.env.SHOP_CUSTOMER_SESSION_SECRET ||
        process.env.CONSIGNMENT_SESSION_SECRET ||
        ""
    );
}

function signValue(payload) {
    return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

function safeEqual(left, right) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    if (leftBuffer.length !== rightBuffer.length) {
        return false;
    }

    return timingSafeEqual(leftBuffer, rightBuffer);
}

export function hasWatcherSecret() {
    return Boolean(getSecret());
}

export function createWatcherToken(watcherId) {
    const payload = JSON.stringify({
        wid: watcherId,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + WATCHER_TTL_SECONDS,
    });
    const encodedPayload = encodePayload(payload);

    return `${encodedPayload}.${signValue(encodedPayload)}`;
}

export function verifyWatcherToken(token) {
    if (!token || !getSecret()) {
        return null;
    }

    const [encodedPayload, signature] = token.split(".");

    if (!encodedPayload || !signature) {
        return null;
    }

    if (!safeEqual(signature, signValue(encodedPayload))) {
        return null;
    }

    try {
        const payload = JSON.parse(decodePayload(encodedPayload));

        if (!payload.wid || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
            return null;
        }

        return payload;
    } catch {
        return null;
    }
}

export function getWatcherCookieOptions() {
    return {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: WATCHER_TTL_SECONDS,
    };
}
