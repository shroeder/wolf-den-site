import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { runPushWinback } from "@/lib/marketplace/push-winback.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // a few hundred individually-composed emails

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET  → dry run: exactly who would be mailed, how many are owed gold, and the total gold exposure.
// POST → actually send. Deliberately NOT a cron: it's a one-off bulk mail, and push_winback_sent_at makes it
//        idempotent, so a second call reaches nobody who already got it.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/push-winback", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const limit = Number(new URL(request.url).searchParams.get("limit")) || undefined;
            return noStore({ success: true, ...(await runPushWinback({ limit, dryRun: true })) });
        } catch (error) {
            return internalError(error, { event: "push_winback.dryrun.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/push-winback", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            // Explicit confirmation so a stray POST can't mail the whole membership.
            if (body?.confirm !== "SEND") {
                return noStore({ ok: false, error: "confirm_required", hint: 'POST { "confirm": "SEND" } to actually send. GET for a dry run.' }, { status: 400 });
            }
            const result = await runPushWinback({ limit: Number(body?.limit) || undefined, dryRun: false });
            return noStore({ success: true, ...result });
        } catch (error) {
            return internalError(error, { event: "push_winback.send.failure" });
        }
    });
}
