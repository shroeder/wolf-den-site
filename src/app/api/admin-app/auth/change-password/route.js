import { NextResponse } from "next/server";

import { requireAdminAppAuth } from "@/lib/admin-app/auth";
import { authenticateAdminAppUser, isValidPassword, setAdminAppUserPassword } from "@/lib/admin-app/users";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin-app/auth/change-password", async ({ logger, internalError }) => {
        const auth = await requireAdminAppAuth(request, logger);

        if (auth.response) {
            return auth.response;
        }

        let body;

        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: "invalid_json" }, { status: 400 });
        }

        const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
        const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

        if (!isValidPassword(newPassword)) {
            return NextResponse.json({ error: "weak_password" }, { status: 400 });
        }

        try {
            const { user } = auth.session;

            // Re-verify the current password before allowing the change.
            const verified = await authenticateAdminAppUser(user.email, currentPassword);

            if (!verified || verified.id !== user.id) {
                logger.warn("admin_app.auth.change_password.invalid_current", { userId: user.id });

                return NextResponse.json({ error: "invalid_current_password" }, { status: 401 });
            }

            const result = await setAdminAppUserPassword(user.storeId, user.id, newPassword, { mustChangePassword: false });

            if (result.error) {
                return NextResponse.json({ error: result.error }, { status: result.status || 400 });
            }

            logger.info("admin_app.auth.change_password.success", { userId: user.id });

            // Keep the caller's current session valid; they don't get logged out.
            return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin_app.auth.change_password.failure" });
        }
    });
}
