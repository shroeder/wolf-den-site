import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { deleteReminder, listReminders, upsertReminder, runReminders } from "@/lib/admin-app/reminders.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/reminders", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "reports.view", logger);
        if (authError) return authError;
        try {
            return NextResponse.json({ reminders: await listReminders() }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.reminders.get.failure" });
        }
    });
}

// { action: "save"|"delete"|"test", ...reminder }
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/reminders", async ({ logger, internalError }) => {
        // Editing what the owner gets nagged about is an owner job, not an employee one.
        const authError = await requireAdminAccess(request, "cogs.edit", logger);
        if (authError) return authError;
        if ((request.headers.get("x-app-flavor") || "").toLowerCase() === "employee") {
            return NextResponse.json({ error: "forbidden" }, { status: 403 });
        }
        try {
            const b = await request.json().catch(() => ({}));
            if (b?.action === "delete") await deleteReminder(b.id);
            else if (b?.action === "test") return NextResponse.json({ ok: true, ...(await runReminders({ dryRun: true })) });
            else {
                const res = await upsertReminder(b);
                if (!res.ok) return NextResponse.json(res, { status: 400 });
            }
            return NextResponse.json({ ok: true, reminders: await listReminders() });
        } catch (error) {
            return internalError(error, { event: "admin.reminders.post.failure" });
        }
    });
}
