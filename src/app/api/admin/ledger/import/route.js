import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { replaceAllFromImport } from "@/lib/ledger/ledger.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-time cutover: replace ledger_entry with a verbatim copy of the current sheet entries.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/ledger/import", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => null);
            const entries = body?.entries;
            if (!Array.isArray(entries)) {
                return NextResponse.json({ error: "entries[] required." }, { status: 400 });
            }
            const inserted = await replaceAllFromImport(entries);
            logger.info("admin.ledger.import.success", { inserted });
            return NextResponse.json({ ok: true, inserted });
        } catch (error) {
            return internalError(error, { event: "admin.ledger.import.failure" });
        }
    });
}
