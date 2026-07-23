import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { broadcastSailingLaunch } from "@/lib/marketplace/sailing-broadcast.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// POST — fire the one-time Sailing launch announcement. Body: { channels?: { discord, push, email } }.
// Owner triggers this from the admin app when ready ("send it"). No body = all channels.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/announce-sailing", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            const result = await broadcastSailingLaunch({ channels: body?.channels });
            return noStore({ ok: true, ...result });
        } catch (error) {
            return internalError(error, { event: "admin.announce.sailing.failure" });
        }
    });
}
