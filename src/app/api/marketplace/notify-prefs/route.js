import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getNotifyPrefs, notifyPrefCatalog, setNotifyPrefs } from "@/lib/marketplace/notify-prefs.js";
import { updateNotifyPrefs } from "@/lib/marketplace/profile.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// The full switch matrix for the settings UI.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/notify-prefs", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const prefs = await getNotifyPrefs(buyer.id);
            return noStore({ groups: notifyPrefCatalog(prefs), digest: prefs["email:digest"] !== false });
        } catch (error) {
            return internalError(error, { event: "marketplace.notify.prefs.get.failure" });
        }
    });
}

// Body is either the granular form { prefs: { "push:dm": false, … } } or the legacy { dm, friend } booleans the
// old two-toggle component sent. Unknown keys are dropped in setNotifyPrefs.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/notify-prefs", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));

            if (body?.prefs && typeof body.prefs === "object") {
                const prefs = await setNotifyPrefs(buyer.id, body.prefs);
                return noStore({ groups: notifyPrefCatalog(prefs), digest: prefs["email:digest"] !== false });
            }

            // Legacy shape — keep working so an older cached client can't start failing.
            const profile = await updateNotifyPrefs(buyer.id, { dm: body?.dm, friend: body?.friend });
            await setNotifyPrefs(buyer.id, {
                ...(body?.dm !== undefined ? { "email:dm": Boolean(body.dm) } : {}),
                ...(body?.friend !== undefined ? { "email:friend": Boolean(body.friend) } : {}),
            });
            return noStore({ profile });
        } catch (error) {
            return internalError(error, { event: "marketplace.notify.prefs.failure" });
        }
    });
}
