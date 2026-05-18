import "server-only";

import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

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
