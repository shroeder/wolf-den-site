import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { getConsignorBySlug } from "@/lib/consignment/config";

export const CONSIGNMENT_SESSION_COOKIE = "wolfden-consignment-session";

const SESSION_TTL_SECONDS = 60 * 60 * 12;

const encodePayload = (value) => Buffer.from(value, "utf8").toString("base64url");
const decodePayload = (value) => Buffer.from(value, "base64url").toString("utf8");

const getSessionSecret = () => process.env.CONSIGNMENT_SESSION_SECRET || "";

const signValue = (payload) => createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");

const safeEqual = (left, right) => {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    if (leftBuffer.length !== rightBuffer.length) {
        return false;
    }

    return timingSafeEqual(leftBuffer, rightBuffer);
};

export function assertSessionSecret() {
    if (!getSessionSecret()) {
        throw new Error("Missing consignment session secret.");
    }
}

export function createSessionToken(slug) {
    assertSessionSecret();

    const payload = JSON.stringify({
        slug,
        exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    });
    const encodedPayload = encodePayload(payload);
    const signature = signValue(encodedPayload);

    return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token) {
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

        if (!payload.slug || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
            return null;
        }

        return payload;
    } catch {
        return null;
    }
}

export function getConsignmentCookieOptions() {
    return {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: SESSION_TTL_SECONDS,
    };
}

export async function getAuthenticatedConsignorFromToken(token) {
    const payload = verifySessionToken(token);

    if (!payload) {
        return null;
    }

    return getConsignorBySlug(payload.slug);
}