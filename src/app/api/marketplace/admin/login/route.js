import { NextResponse } from "next/server";

import { createAdminAppSession } from "@/lib/admin-app/session";
import {
    clearFailedAdminAppAuthAttempts,
    isAdminAppAuthTemporarilyBlocked,
    recordFailedAdminAppAuthAttempt,
} from "@/lib/admin-app/throttle";
import { authenticateAdminAppUser, touchAdminAppUserLogin } from "@/lib/admin-app/users";
import { setAdminWebSessionCookie } from "@/lib/admin-app/web-session";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

function getClientIp(request) {
    const forwarded = request.headers.get("x-forwarded-for") || "";

    if (forwarded) {
        return forwarded.split(",")[0].trim();
    }

    return request.headers.get("x-real-ip") || "unknown";
}

// Web admin login. Reuses the same admin_app credentials + session + throttle as the phone app,
// but stores the session token in an httpOnly cookie. Access to marketplace surfaces is gated by
// the marketplace.manage permission at the page/route level, not here.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/admin/login", async ({ logger, internalError }) => {
        let body;

        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: "invalid_json" }, { status: 400 });
        }

        const email = typeof body?.email === "string" ? body.email.trim() : "";
        const password = typeof body?.password === "string" ? body.password : "";
        const clientIp = getClientIp(request);

        if (!email || !password) {
            return NextResponse.json({ error: "missing_credentials" }, { status: 400 });
        }

        if (await isAdminAppAuthTemporarilyBlocked({ ip: clientIp, email })) {
            return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
        }

        try {
            const userRow = await authenticateAdminAppUser(email, password);

            if (!userRow) {
                await recordFailedAdminAppAuthAttempt({ ip: clientIp, email });
                logger.warn("marketplace.admin.login.failed", { step: "auth_check_failed" });

                return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
            }

            await clearFailedAdminAppAuthAttempts({ ip: clientIp, email });

            const { token } = await createAdminAppSession(userRow.id, userRow.store_id, { deviceLabel: "web-admin" });
            await touchAdminAppUserLogin(userRow.id);
            await setAdminWebSessionCookie(token);

            logger.info("marketplace.admin.login.success", { userId: userRow.id, role: userRow.role });

            return NextResponse.json({
                ok: true,
                user: { id: userRow.id, displayName: userRow.display_name, role: userRow.role },
            });
        } catch (error) {
            return internalError(error, { event: "marketplace.admin.login.failure" });
        }
    });
}
