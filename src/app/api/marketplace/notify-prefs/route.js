import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { updateNotifyPrefs } from "@/lib/marketplace/profile.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Toggle email notification prefs. Body: { dm?: boolean, friend?: boolean }.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/notify-prefs", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const profile = await updateNotifyPrefs(buyer.id, { dm: body?.dm, friend: body?.friend });
            return noStore({ profile });
        } catch (error) {
            return internalError(error, { event: "marketplace.notify.prefs.failure" });
        }
    });
}
