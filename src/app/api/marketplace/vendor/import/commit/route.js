import { NextResponse } from "next/server";

import { commitImport } from "@/lib/marketplace/csv-import.js";
import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

const MAX_ROWS = 5000;

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/vendor/import/commit", async ({ logger, internalError }) => {
        try {
            const vendor = await getAuthenticatedVendor();

            if (!vendor) {
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            const body = await request.json().catch(() => null);
            const rows = Array.isArray(body?.rows) ? body.rows : null;

            if (!rows || rows.length === 0) {
                return NextResponse.json({ error: "Nothing to import." }, { status: 400 });
            }

            if (rows.length > MAX_ROWS) {
                return NextResponse.json({ error: "Too many rows in one import." }, { status: 413 });
            }

            const result = await commitImport(vendor.id, rows);

            logger.info("marketplace.vendor.import_commit", { vendorId: vendor.id, ...result });

            return NextResponse.json({ ok: true, ...result });
        } catch (error) {
            return internalError(error, { event: "marketplace.vendor.import_commit.failure" });
        }
    });
}
