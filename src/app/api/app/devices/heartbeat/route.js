import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { heartbeat } from "@/lib/app-devices/devices.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Employee-app check-in. Registers/updates the device and reports whether it's been revoked, so the
// app can lock itself. Admin-key gated (the app carries the key).
export async function POST(request) {
    return withRequestLogging(request, "POST /api/app/devices/heartbeat", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) {
            return authError;
        }

        try {
            const body = await request.json().catch(() => null);
            if (!body || !body.deviceId) {
                return NextResponse.json({ error: "deviceId is required." }, { status: 400 });
            }

            const { revoked } = await heartbeat({
                deviceId: String(body.deviceId),
                channel: body.channel || "employee",
                label: body.label || null,
                appVersion: body.appVersion || null,
            });

            return NextResponse.json({ revoked }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "app.devices.heartbeat.failure" });
        }
    });
}
