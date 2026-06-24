import "server-only";

import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { hasPermission } from "@/lib/admin-app/permissions";
import { resolveAdminAppSession } from "@/lib/admin-app/session";
import { createServerLogger } from "@/lib/server-logger";

const authLogger = createServerLogger({ source: "api", subsystem: "admin-auth" });

function isValidAdminKey(providedKey, configuredKey) {
    if (!providedKey || !configuredKey) {
        return false;
    }

    const provided = Buffer.from(providedKey, "utf8");
    const configured = Buffer.from(configuredKey, "utf8");

    if (provided.length !== configured.length) {
        return false;
    }

    return timingSafeEqual(provided, configured);
}

export function verifyAdminApiKey(request, logger = authLogger) {
    logger.info("admin.auth.check.started", {
        step: "auth_check_started",
        authType: "admin_api_key",
    });

    const headerKey = request.headers.get("x-admin-key") || "";
    const authHeader = request.headers.get("authorization") || "";
    const bearerKey = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    const providedKey = headerKey || bearerKey;
    const configuredKey = process.env.ADMIN_API_KEY || "";
    const hasHeader = Boolean(headerKey || bearerKey);
    const authSource = headerKey ? "x-admin-key" : bearerKey ? "authorization_bearer" : "none";
    const hasConfig = Boolean(configuredKey);

    if (!isValidAdminKey(providedKey, configuredKey)) {
        logger.warn("admin.auth.failure", {
            step: "auth_check_failed",
            authType: "admin_api_key",
            reason: hasConfig ? "invalid_key" : "missing_configuration",
            hasHeader,
            authSource,
            hasConfig,
        });

        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    logger.info("admin.auth.success", {
        step: "auth_check_passed",
        authType: "admin_api_key",
        hasHeader,
        authSource,
        hasConfig,
    });

    return null;
}

/**
 * Auth guard for admin routes that accepts EITHER a per-user admin-app staff
 * session (preferred) OR the legacy shared ADMIN_API_KEY (kept for older app
 * builds during the Phase 2 migration).
 *
 * Same contract as verifyAdminApiKey: returns a NextResponse on failure, or
 * null on success. When a staff session is used, [permissionKey] is enforced.
 */
export async function requireAdminAccess(request, permissionKey, logger = authLogger) {
    const authHeader = request.headers.get("authorization") || "";
    const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";

    if (bearer) {
        const session = await resolveAdminAppSession(bearer);

        if (session) {
            if (!hasPermission(session.effectivePermissions, permissionKey)) {
                logger.warn("admin.auth.failure", {
                    step: "auth_check_failed",
                    authType: "admin_app_session",
                    reason: "missing_permission",
                    userId: session.user.id,
                    permissionKey,
                });

                return NextResponse.json({ error: "forbidden" }, { status: 403 });
            }

            logger.info("admin.auth.success", {
                step: "auth_check_passed",
                authType: "admin_app_session",
                userId: session.user.id,
                permissionKey,
            });

            return null;
        }
    }

    // Not a valid staff session — fall back to the legacy shared key.
    return verifyAdminApiKey(request, logger);
}
