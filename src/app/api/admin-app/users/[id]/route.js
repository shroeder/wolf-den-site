import { NextResponse } from "next/server";

import { requireAdminAppPermission } from "@/lib/admin-app/auth";
import {
    getAdminAppUserById,
    setAdminAppUserPassword,
    setAdminAppUserPermissionOverrides,
    updateAdminAppUser,
} from "@/lib/admin-app/users";
import { revokeAllAdminAppSessionsForUser } from "@/lib/admin-app/session";
import { db } from "@/lib/db";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

async function countActiveOwners() {
    const row = await db.queryOne(
        "SELECT COUNT(*)::int AS count FROM admin_app_users WHERE role = 'owner' AND active = TRUE"
    );

    return row?.count || 0;
}

export async function GET(request, { params }) {
    return withRequestLogging(request, "GET /api/admin-app/users/[id]", async ({ logger, internalError }) => {
        const gate = await requireAdminAppPermission(request, "staff.manage", logger);

        if (gate.response) {
            return gate.response;
        }

        const { id } = await params;

        try {
            const user = await getAdminAppUserById(id);

            if (!user) {
                return NextResponse.json({ error: "user_not_found" }, { status: 404 });
            }

            return NextResponse.json({ user }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin_app.users.detail.failure", userId: id });
        }
    });
}

export async function PATCH(request, { params }) {
    return withRequestLogging(request, "PATCH /api/admin-app/users/[id]", async ({ logger, internalError }) => {
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

        const { id } = await params;
        const callerId = gate.session.user.id;

        try {
            const target = await getAdminAppUserById(id);

            if (!target) {
                return NextResponse.json({ error: "user_not_found" }, { status: 404 });
            }

            const deactivating = body?.active === false;
            const demotingFromOwner = body?.role !== undefined && body.role !== "owner" && target.role === "owner";

            // Don't let an owner lock themselves out, or remove the last active owner.
            if ((deactivating || demotingFromOwner) && id === callerId) {
                return NextResponse.json({ error: "cannot_modify_self" }, { status: 400 });
            }

            if ((deactivating || demotingFromOwner) && target.role === "owner" && target.active) {
                if ((await countActiveOwners()) <= 1) {
                    return NextResponse.json({ error: "last_owner" }, { status: 400 });
                }
            }

            const fieldUpdates = {};

            if (body?.displayName !== undefined) fieldUpdates.displayName = body.displayName;
            if (body?.role !== undefined) fieldUpdates.role = body.role;
            if (body?.active !== undefined) fieldUpdates.active = body.active;

            let roleChanged = false;

            if (Object.keys(fieldUpdates).length) {
                const result = await updateAdminAppUser(id, fieldUpdates);

                if (result.error) {
                    return NextResponse.json({ error: result.error }, { status: result.status || 400 });
                }

                roleChanged = fieldUpdates.role !== undefined && fieldUpdates.role !== target.role;
            }

            if (body?.permissionOverrides !== undefined) {
                const result = await setAdminAppUserPermissionOverrides(id, body.permissionOverrides);

                if (result.error) {
                    return NextResponse.json({ error: result.error }, { status: result.status || 400 });
                }
            }

            let passwordChanged = false;

            if (body?.password !== undefined) {
                const result = await setAdminAppUserPassword(id, body.password, { mustChangePassword: true });

                if (result.error) {
                    return NextResponse.json({ error: result.error }, { status: result.status || 400 });
                }

                passwordChanged = true;
            }

            // Force re-auth when access materially changes.
            if (deactivating || roleChanged || passwordChanged) {
                await revokeAllAdminAppSessionsForUser(id);
            }

            logger.info("admin_app.users.update.success", { userId: id });

            const updated = await getAdminAppUserById(id);

            return NextResponse.json({ success: true, user: updated }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin_app.users.update.failure", userId: id });
        }
    });
}

export async function DELETE(request, { params }) {
    return withRequestLogging(request, "DELETE /api/admin-app/users/[id]", async ({ logger, internalError }) => {
        const gate = await requireAdminAppPermission(request, "staff.manage", logger);

        if (gate.response) {
            return gate.response;
        }

        const { id } = await params;
        const callerId = gate.session.user.id;

        try {
            const target = await getAdminAppUserById(id);

            if (!target) {
                return NextResponse.json({ error: "user_not_found" }, { status: 404 });
            }

            if (id === callerId) {
                return NextResponse.json({ error: "cannot_modify_self" }, { status: 400 });
            }

            if (target.role === "owner" && target.active && (await countActiveOwners()) <= 1) {
                return NextResponse.json({ error: "last_owner" }, { status: 400 });
            }

            // Soft delete: deactivate + kill sessions (preserve the row for audit).
            await updateAdminAppUser(id, { active: false });
            await revokeAllAdminAppSessionsForUser(id);

            logger.info("admin_app.users.delete.success", { userId: id });

            return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin_app.users.delete.failure", userId: id });
        }
    });
}
