import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { replaceAllFromImport } from "@/lib/cash/cash-ledger.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-time cutover: replace the cash_ledger table with a verbatim copy of the current sheet rows.
// The app reads its Cash On Hand sheet and posts the rows here; this is a copy, not a rebuild.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/cash-ledger/import", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => null);
            const rows = body?.rows;
            if (!Array.isArray(rows)) {
                return NextResponse.json({ error: "rows[] required." }, { status: 400 });
            }
            const inserted = await replaceAllFromImport(rows);
            logger.info("admin.cash.import.success", { inserted });
            return NextResponse.json({ ok: true, inserted });
        } catch (error) {
            return internalError(error, { event: "admin.cash.import.failure" });
        }
    });
}
