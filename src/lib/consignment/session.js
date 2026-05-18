import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { getActiveConsignorBySlug } from "@/lib/consignment/config";
import { createServerLogger } from "@/lib/server-logger";

export const CONSIGNMENT_SESSION_COOKIE = "wolfden-consignment-session";

const SESSION_TTL_SECONDS = 60 * 60 * 12;
const sessionLogger = createServerLogger({ source: "api", subsystem: "consignment-session" });

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

export function assertSessionSecret(logger = sessionLogger) {
    logger.info("consignment.session.env.validation.started", {
        step: "env_validation_started",
    });

    if (!getSessionSecret()) {
        logger.error("consignment.session.env.validation.failed", {
            step: "env_validation_failed",
            reason: "missing_consignment_session_secret",
        });

        throw new Error("Missing consignment session secret.");
    }

    logger.info("consignment.session.env.validation.passed", {
        step: "env_validation_passed",
    });
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

    return getActiveConsignorBySlug(payload.slug);
}

export async function getAuthenticatedConsignorFromCookies(logger = sessionLogger) {
    logger.info("consignment.session.auth.check.started", {
        step: "auth_check_started",
        authType: "consignor_session_cookie",
    });

    const cookieStore = await cookies();
    const token = cookieStore.get(CONSIGNMENT_SESSION_COOKIE)?.value;

    if (!token) {
        logger.warn("consignment.session.auth.check.failed", {
            step: "auth_check_failed",
            authType: "consignor_session_cookie",
            reason: "missing_session_cookie",
        });

        return null;
    }

    const consignor = await getAuthenticatedConsignorFromToken(token);

    if (!consignor) {
        logger.warn("consignment.session.auth.check.failed", {
            step: "auth_check_failed",
            authType: "consignor_session_cookie",
            reason: "invalid_or_expired_session",
        });

        return null;
    }

    logger.info("consignment.session.auth.check.passed", {
        step: "auth_check_passed",
        authType: "consignor_session_cookie",
        consignorId: consignor.id,
    });

    return consignor;
}