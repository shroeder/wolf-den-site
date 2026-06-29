import { NextResponse } from "next/server";

import { getMarketplaceAdmin } from "@/lib/admin-app/web-session";
import { setVendorStatus } from "@/lib/marketplace/vendors.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

const ALLOWED = new Set(["active", "suspended", "removed"]);

export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/marketplace/admin/vendors/status", async ({ logger, internalError }) => {
        try {
            const admin = await getMarketplaceAdmin();

            if (!admin) {
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            const body = await request.json().catch(() => null);
            const status = body?.status;

            if (!ALLOWED.has(status)) {
                return NextResponse.json({ error: "Invalid status." }, { status: 400 });
            }

            const { id } = await params;
            const vendor = await setVendorStatus(id, status);

            if (!vendor) {
                return NextResponse.json({ error: "Vendor not found." }, { status: 404 });
            }

            logger.info("marketplace.admin.vendor_status.success", { vendorId: id, status });

            return NextResponse.json({ ok: true, status: vendor.status });
        } catch (error) {
            return internalError(error, { event: "marketplace.admin.vendor_status.failure" });
        }
    });
}
