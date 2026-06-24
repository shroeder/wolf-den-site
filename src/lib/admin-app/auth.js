import "server-only";

import { NextResponse } from "next/server";

import { resolveAdminAppSession } from "@/lib/admin-app/session";
import { hasPermission } from "@/lib/admin-app/permissions";
import { createServerLogger } from "@/lib/server-logger";

const authLogger = createServerLogger({ source: "api", subsystem: "admin-app-auth" });

export function getBearerToken(request) {
    const authHeader = request.headers.get("authorization") || "";

    if (!authHeader.toLowerCase().startsWith("bearer ")) {
        return "";
    }

    return authHeader.slice(7).trim();
}

/**
 * Resolve the authenticated admin-app session from the request bearer token.
 * Returns { session } on success, or { response } with a 401 to return directly.
 */
export async function requireAdminAppAuth(request, logger = authLogger) {
    const token = getBearerToken(request);
    const session = token ? await resolveAdminAppSession(token) : null;

    if (!session) {
        logger.warn("admin_app.auth.check.failed", {
            step: "auth_check_failed",
            authType: "admin_app_session",
            reason: token ? "invalid_or_expired_session" : "missing_token",
        });

        return { response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
    }

    return { session };
}

/**
 * Like requireAdminAppAuth, but also enforces a specific permission.
 * Returns { session } on success, or { response } with 401/403.
 */
export async function requireAdminAppPermission(request, permissionKey, logger = authLogger) {
    const auth = await requireAdminAppAuth(request, logger);

    if (auth.response) {
        return auth;
    }

    if (!hasPermission(auth.session.effectivePermissions, permissionKey)) {
        logger.warn("admin_app.auth.permission.denied", {
            step: "auth_check_failed",
            authType: "admin_app_session",
            userId: auth.session.user.id,
            permissionKey,
        });

        return { response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
    }

    return { session: auth.session };
}
