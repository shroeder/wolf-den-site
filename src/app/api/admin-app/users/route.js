import { NextResponse } from "next/server";

import { requireAdminAppPermission } from "@/lib/admin-app/auth";
import { createAdminAppUser, listAdminAppUsers } from "@/lib/admin-app/users";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin-app/users", async ({ logger, internalError }) => {
        const gate = await requireAdminAppPermission(request, "staff.manage", logger);

        if (gate.response) {
            return gate.response;
        }

        try {
            const users = await listAdminAppUsers();

            return NextResponse.json({ users }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin_app.users.list.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin-app/users", async ({ logger, internalError }) => {
        const gate = await requireAdminAppPermission(request, "staff.manage", logger);

        if (gate.response) {
            return gate.response;
        }

        let body;

        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: "invalid_json" }, { status: 400 });
        }

        try {
            const result = await createAdminAppUser({
                email: body?.email,
                displayName: body?.displayName,
                role: body?.role,
                password: body?.password,
                mustChangePassword: body?.mustChangePassword !== false,
            });

            if (result.error) {
                logger.warn("admin_app.users.create.failed", { reason: result.error });

                return NextResponse.json({ error: result.error }, { status: result.status || 400 });
            }

            logger.info("admin_app.users.create.success", { userId: result.user.id });

            return NextResponse.json({ success: true, user: result.user }, { status: 201 });
        } catch (error) {
            return internalError(error, { event: "admin_app.users.create.failure" });
        }
    });
}
