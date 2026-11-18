import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { breakEnd, breakStart, clockIn, clockOut, clockStatus, setTeamMember } from "@/lib/admin-app/timeclock.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET — am I clocked in, how long today, and where are we in the store's day.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/timeclock", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "timeclock.use", logger);
        if (authError) return authError;
        try {
            return noStore(await clockStatus());
        } catch (error) {
            return internalError(error, { event: "timeclock.status.failure" });
        }
    });
}

// POST { action: "in" | "out" | "break" | "back" | "set_member" }
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/timeclock", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "timeclock.use", logger);
        if (authError) return authError;
        try {
            const b = await request.json().catch(() => ({}));
            let res;
            if (b?.action === "in") res = await clockIn();
            else if (b?.action === "out") res = await clockOut();
            // ⚠️ A BREAK IS NOT A CLOCK-OUT. It rides on the open shift as a Square break, so the shift
            // stays whole and the unpaid minutes come off the paid hours the Today screen prices.
            else if (b?.action === "break") res = await breakStart();
            else if (b?.action === "back") res = await breakEnd();
            else if (b?.action === "set_member") res = await setTeamMember(b?.teamMemberId);
            else res = { ok: false, error: "unknown_action" };
            // Always hand back fresh status so the screen can't show a stale button.
            const status = await clockStatus().catch(() => null);
            return noStore({ ...res, status }, { status: res?.ok ? 200 : 400 });
        } catch (error) {
            return internalError(error, { event: "timeclock.action.failure" });
        }
    });
}
