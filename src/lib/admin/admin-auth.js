import "server-only";

import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

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

export function verifyAdminApiKey(request) {
    const providedKey = request.headers.get("x-admin-key") || "";
    const configuredKey = process.env.ADMIN_API_KEY || "";

    if (!isValidAdminKey(providedKey, configuredKey)) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    return null;
}
