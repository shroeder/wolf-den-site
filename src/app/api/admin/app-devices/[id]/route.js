import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { updateDevice } from "@/lib/app-devices/devices.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Owner action: revoke/allow or rename one device. Admin-key gated.
export async function PATCH(request, { params }) {
    return withRequestLogging(request, "PATCH /api/admin/app-devices/[id]", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) {
            return authError;
        }

        try {
            const { id } = await params;
            const body = await request.json().catch(() => ({}));

            const patch = {};
            if (body.revoked !== undefined) patch.revoked = Boolean(body.revoked);
            if (body.label !== undefined) patch.label = body.label;

            const device = await updateDevice(id, patch);
            if (!device) {
                return NextResponse.json({ error: "Device not found." }, { status: 404 });
            }

            logger.info("admin.app_devices.updated", { deviceId: id, revoked: device.revoked });
            return NextResponse.json({ ok: true, device });
        } catch (error) {
            return internalError(error, { event: "admin.app_devices.update.failure" });
        }
    });
}
