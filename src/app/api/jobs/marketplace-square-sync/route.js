import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { listTcgListingRows } from "@/lib/consignment/square.js";
import { syncListingsFromSquare } from "@/lib/marketplace/square-sync.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(request) {
    const expected = process.env.CRON_SECRET;
    if (!expected) return false;
    return (request.headers.get("authorization") || "") === `Bearer ${expected}`;
}

// Hourly: mirror the shop's in-stock Square TCG inventory into the house vendor's marketplace
// listings (Square is the source of truth — same logic as Marketplace Intake's manual sync).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/marketplace-square-sync", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) {
                logger.warn("marketplace.square_sync.unauthorized");
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            const vendorId =
                process.env.MARKETPLACE_SYNC_VENDOR_ID ||
                (await db.query(
                    `SELECT id FROM mkt_vendor WHERE display_name ILIKE '%wolf den%' AND status = 'active' ORDER BY created_at LIMIT 1`,
                ))[0]?.id;

            if (!vendorId) {
                logger.warn("marketplace.square_sync.no_vendor");
                return NextResponse.json({ error: "no sync vendor configured" }, { status: 400 });
            }

            const rows = await listTcgListingRows();
            const result = await syncListingsFromSquare(vendorId, rows);

            logger.info("marketplace.square_sync.done", { vendorId, rowCount: rows.length, ...result });
            return NextResponse.json({ success: true, rowCount: rows.length, ...result });
        } catch (error) {
            return internalError(error, { event: "marketplace.square_sync.failure" });
        }
    });
}
