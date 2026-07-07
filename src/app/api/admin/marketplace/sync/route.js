import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { syncListingsFromSquare } from "@/lib/marketplace/square-sync.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 5000;

// Marketplace Intake: the admin app posts a vendor's Square inventory here to sync it into their
// marketplace listings (Square is the source of truth). Pass dryRun:true for the preview counts.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/marketplace/sync", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => null);
            const vendorId = body?.vendorId;
            const rows = Array.isArray(body?.rows) ? body.rows : null;
            const dryRun = Boolean(body?.dryRun);

            if (!vendorId) {
                return NextResponse.json({ error: "vendorId is required" }, { status: 400 });
            }
            if (!rows) {
                return NextResponse.json({ error: "rows is required" }, { status: 400 });
            }
            if (rows.length > MAX_ROWS) {
                return NextResponse.json({ error: "Too many rows in one sync." }, { status: 413 });
            }

            const result = await syncListingsFromSquare(vendorId, rows, { dryRun });
            logger.info("admin.marketplace.square_sync", { vendorId, rowCount: rows.length, ...result });

            return NextResponse.json({ ok: true, ...result });
        } catch (error) {
            return internalError(error, { event: "admin.marketplace.square_sync.failure" });
        }
    });
}
