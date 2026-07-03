import { NextResponse } from "next/server";

import { hydrateDeviceSecrets } from "@/lib/app-devices/devices.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Runtime secret hydration for the owner/staff apps. INTENTIONALLY not admin-key gated — this is the
// bootstrap that lets the apps carry NO baked secrets. A device posts its stable id; it registers as
// pending and gets NOTHING until the owner authorizes it. Authorized devices receive the server-held
// secrets (OpenAI / admin / Plaid) over HTTPS, held in memory / encrypted storage by the app.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin-app/device/secrets", async ({ logger, internalError }) => {
        try {
            const body = await request.json().catch(() => null);
            if (!body?.deviceId) {
                return NextResponse.json({ error: "deviceId is required." }, { status: 400 });
            }
            const result = await hydrateDeviceSecrets({
                deviceId: String(body.deviceId),
                channel: body.channel || "full",
                label: body.label || null,
                appVersion: body.appVersion || null,
            });
            if (!result.authorized) {
                logger.info("admin_app.device.secrets.pending", { deviceId: String(body.deviceId).slice(0, 40) });
                return NextResponse.json({ authorized: false }, { headers: { "Cache-Control": "no-store" } });
            }
            logger.info("admin_app.device.secrets.hydrated", { deviceId: String(body.deviceId).slice(0, 40) });
            return NextResponse.json(
                { authorized: true, secrets: result.secrets },
                { headers: { "Cache-Control": "no-store" } }
            );
        } catch (error) {
            return internalError(error, { event: "admin_app.device.secrets.failure" });
        }
    });
}
