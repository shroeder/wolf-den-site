import { NextResponse } from "next/server";

import {
    authenticateAdminAppUser,
    touchAdminAppUserLogin,
} from "@/lib/admin-app/users";
import { createAdminAppSession } from "@/lib/admin-app/session";
import { resolveEffectivePermissions } from "@/lib/admin-app/permissions";
import {
    clearFailedAdminAppAuthAttempts,
    isAdminAppAuthTemporarilyBlocked,
    recordFailedAdminAppAuthAttempt,
} from "@/lib/admin-app/throttle";
import { db } from "@/lib/db";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

function getClientIp(request) {
    const forwarded = request.headers.get("x-forwarded-for") || "";

    if (forwarded) {
        return forwarded.split(",")[0].trim();
    }

    return request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin-app/auth/login", async ({ logger, internalError }) => {
        let body;

        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: "invalid_json" }, { status: 400 });
        }

        const email = typeof body?.email === "string" ? body.email.trim() : "";
        const password = typeof body?.password === "string" ? body.password : "";
        const deviceLabel = typeof body?.deviceLabel === "string" ? body.deviceLabel.trim().slice(0, 120) : null;
        const clientIp = getClientIp(request);

        if (!email || !password) {
            return NextResponse.json({ error: "missing_credentials" }, { status: 400 });
        }

        if (await isAdminAppAuthTemporarilyBlocked({ ip: clientIp, email })) {
            logger.warn("admin_app.auth.login.throttled", { step: "auth_check_failed" });

            return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
        }

        try {
            const userRow = await authenticateAdminAppUser(email, password);

            if (!userRow) {
                await recordFailedAdminAppAuthAttempt({ ip: clientIp, email });

                logger.warn("admin_app.auth.login.failed", { step: "auth_check_failed" });

                return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
            }

            await clearFailedAdminAppAuthAttempts({ ip: clientIp, email });

            const { token, expiresAt } = await createAdminAppSession(userRow.id, userRow.store_id, { deviceLabel });

            await touchAdminAppUserLogin(userRow.id);

            const overrides = await db.query(
                "SELECT permission_key, granted FROM admin_app_user_permissions WHERE user_id = $1",
                [userRow.id]
            );
            const effectivePermissions = resolveEffectivePermissions(userRow.role, overrides);

            logger.info("admin_app.auth.login.success", { userId: userRow.id, role: userRow.role });

            return NextResponse.json(
                {
                    token,
                    expiresAt,
                    user: {
                        id: userRow.id,
                        email: userRow.email,
                        displayName: userRow.display_name,
                        role: userRow.role,
                        mustChangePassword: Boolean(userRow.must_change_password),
                    },
                    permissions: effectivePermissions,
                },
                { headers: { "Cache-Control": "no-store" } }
            );
        } catch (error) {
            return internalError(error, { event: "admin_app.auth.login.failure" });
        }
    });
}
