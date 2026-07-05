import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { replaceAllFromImport } from "@/lib/cogs/cogs-ledger.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-time cutover: replace cogs_ledger with a verbatim copy of the current sheet intake rows.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/cogs-ledger/import", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => null);
            const rows = body?.rows;
            if (!Array.isArray(rows)) return NextResponse.json({ error: "rows[] required." }, { status: 400 });
            const inserted = await replaceAllFromImport(rows);
            logger.info("admin.cogs.import.success", { inserted });
            return NextResponse.json({ ok: true, inserted });
        } catch (error) {
            return internalError(error, { event: "admin.cogs.import.failure" });
        }
    });
}
