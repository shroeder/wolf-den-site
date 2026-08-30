import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getNotifyPrefs, isNotifyMode, notifyModeOf, notifyPrefCatalog, setNotifyMode, setNotifyPrefs } from "@/lib/marketplace/notify-prefs.js";
import { updateNotifyPrefs } from "@/lib/marketplace/profile.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Every reply is the same shape — the switch matrix, the recap flag, and the mode those switches ADD UP TO.
// Built in one place because the three exits below used to each assemble it, and the mode is the kind of
// derived field that only stays honest if exactly one line computes it.
const reply = (prefs) => ({
    groups: notifyPrefCatalog(prefs),
    digest: prefs["email:digest"] !== false,
    mode: notifyModeOf(prefs),
});

// The full switch matrix for the settings UI.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/notify-prefs", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const prefs = await getNotifyPrefs(buyer.id);
            return noStore(reply(prefs));
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

            // ── ALL / SOME / NONE ────────────────────────────────────────────────────────────────────
            // One field, and it writes the whole matrix. The mode comes BACK derived from what was stored
            // rather than echoed from the request, so a partial write can never leave the screen claiming a
            // mode the switches underneath it do not add up to.
            if (body?.mode !== undefined) {
                if (!isNotifyMode(body.mode)) return noStore({ error: "bad_mode" }, { status: 400 });
                return noStore(reply(await setNotifyMode(buyer.id, body.mode)));
            }

            if (body?.prefs && typeof body.prefs === "object") {
                return noStore(reply(await setNotifyPrefs(buyer.id, body.prefs)));
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
