import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Square OAuth helpers for connecting a store's own Square account.
 *
 * Vendor-level config (one OAuth app, registered by us):
 *   SQUARE_OAUTH_CLIENT_ID, SQUARE_OAUTH_CLIENT_SECRET, SQUARE_OAUTH_REDIRECT_URL
 *
 * The `state` is a short-lived HMAC-signed token carrying the initiating store id,
 * so the (un-authenticated) callback can trust which store it's connecting and
 * resist CSRF. Signed with the OAuth client secret (always present when configured).
 */

const SQUARE_BASE = "https://connect.squareup.com";
const STATE_TTL_MS = 10 * 60 * 1000;

// Match the proxy allowlist (catalog, inventory, orders, payments, gift cards, locations).
const SCOPES = [
    "MERCHANT_PROFILE_READ",
    "ITEMS_READ",
    "ITEMS_WRITE",
    "INVENTORY_READ",
    "INVENTORY_WRITE",
    "ORDERS_READ",
    "PAYMENTS_READ",
    "GIFTCARDS_READ",
];

const b64url = (value) => Buffer.from(value, "utf8").toString("base64url");
const fromB64url = (value) => Buffer.from(value, "base64url").toString("utf8");

export function isSquareOAuthConfigured() {
    return Boolean(process.env.SQUARE_OAUTH_CLIENT_ID && process.env.SQUARE_OAUTH_CLIENT_SECRET);
}

function stateSecret() {
    return process.env.SQUARE_OAUTH_CLIENT_SECRET || "";
}

function sign(payload) {
    return createHmac("sha256", stateSecret()).update(payload).digest("base64url");
}

function safeEqual(a, b) {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function createSquareOAuthState(storeId) {
    const payload = b64url(JSON.stringify({
        storeId,
        nonce: randomBytes(8).toString("hex"),
        exp: Date.now() + STATE_TTL_MS,
    }));

    return `${payload}.${sign(payload)}`;
}

export function verifySquareOAuthState(state) {
    if (!state || typeof state !== "string" || !stateSecret()) {
        return null;
    }

    const [payload, signature] = state.split(".");

    if (!payload || !signature || !safeEqual(signature, sign(payload))) {
        return null;
    }

    try {
        const data = JSON.parse(fromB64url(payload));

        if (!data.storeId || !data.exp || data.exp < Date.now()) {
            return null;
        }

        return data;
    } catch {
        return null;
    }
}

export function buildSquareAuthorizeUrl(state) {
    const params = new URLSearchParams({
        client_id: process.env.SQUARE_OAUTH_CLIENT_ID || "",
        scope: SCOPES.join(" "),
        session: "false",
        state,
    });

    if (process.env.SQUARE_OAUTH_REDIRECT_URL) {
        params.set("redirect_uri", process.env.SQUARE_OAUTH_REDIRECT_URL);
    }

    return `${SQUARE_BASE}/oauth2/authorize?${params.toString()}`;
}

/** Exchange an authorization code for tokens. Returns the Square token payload or throws. */
export async function exchangeSquareCode(code) {
    const response = await fetch(`${SQUARE_BASE}/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
            client_id: process.env.SQUARE_OAUTH_CLIENT_ID,
            client_secret: process.env.SQUARE_OAUTH_CLIENT_SECRET,
            code,
            grant_type: "authorization_code",
            ...(process.env.SQUARE_OAUTH_REDIRECT_URL ? { redirect_uri: process.env.SQUARE_OAUTH_REDIRECT_URL } : {}),
        }),
    });

    const data = await response.json();

    if (!response.ok || !data.access_token) {
        const code2 = data?.errors?.[0]?.code || "exchange_failed";
        throw new Error(`square_oauth_exchange_failed:${code2}`);
    }

    return data; // { access_token, refresh_token, expires_at, merchant_id, ... }
}

/** Pick the merchant's primary (first ACTIVE) location id, or null. */
export async function fetchSquarePrimaryLocation(accessToken) {
    try {
        const response = await fetch(`${SQUARE_BASE}/v2/locations`, {
            headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        });
        const data = await response.json();

        if (!response.ok || !Array.isArray(data.locations)) {
            return null;
        }

        const active = data.locations.find((loc) => loc.status === "ACTIVE") || data.locations[0];

        return active?.id || null;
    } catch {
        return null;
    }
}
