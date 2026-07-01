import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { listDevices } from "@/lib/app-devices/devices.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Owner view: registered employee-app devices (to revoke/allow/rename). Admin-key gated.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/app-devices", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) {
            return authError;
        }

        try {
            const { searchParams } = new URL(request.url);
            const channel = searchParams.get("channel") || null;
            const devices = await listDevices(channel);

            return NextResponse.json({ devices }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.app_devices.list.failure" });
        }
    });
}
