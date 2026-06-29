import { NextResponse } from "next/server";

import { buildImportPreview } from "@/lib/marketplace/csv-import.js";
import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

const MAX_CSV_BYTES = 2 * 1024 * 1024; // 2MB

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/vendor/import/preview", async ({ logger, internalError }) => {
        try {
            const vendor = await getAuthenticatedVendor();

            if (!vendor) {
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            const body = await request.json().catch(() => null);
            const csv = typeof body?.csv === "string" ? body.csv : "";

            if (!csv.trim()) {
                return NextResponse.json({ error: "Paste or upload a CSV first." }, { status: 400 });
            }

            if (csv.length > MAX_CSV_BYTES) {
                return NextResponse.json({ error: "That file is too large." }, { status: 413 });
            }

            const preview = await buildImportPreview(csv);

            logger.info("marketplace.vendor.import_preview", { vendorId: vendor.id, ...preview.summary });

            return NextResponse.json(preview, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.vendor.import_preview.failure" });
        }
    });
}
