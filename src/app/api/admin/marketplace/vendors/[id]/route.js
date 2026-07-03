import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { listVendorListings } from "@/lib/marketplace/listings.js";
import { getVendorById, setVendorStatus } from "@/lib/marketplace/vendors.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_STATUS = new Set(["active", "suspended", "removed"]);

// One vendor + all their listings.
export async function GET(request, { params }) {
    return withRequestLogging(request, "GET /api/admin/marketplace/vendors/[id]", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const { id } = await params;
            const vendor = await getVendorById(id);
            if (!vendor) return NextResponse.json({ error: "not_found" }, { status: 404 });
            const listings = await listVendorListings(id, { includeDeleted: false });
            return NextResponse.json({ vendor, listings }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.marketplace.vendor.detail.failure" });
        }
    });
}

// Manage a vendor: activate / suspend / remove.
export async function PATCH(request, { params }) {
    return withRequestLogging(request, "PATCH /api/admin/marketplace/vendors/[id]", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const { id } = await params;
            const body = await request.json().catch(() => ({}));
            const status = String(body.status || "").trim();
            if (!ALLOWED_STATUS.has(status)) {
                return NextResponse.json({ error: "status must be active | suspended | removed" }, { status: 400 });
            }
            const vendor = await setVendorStatus(id, status);
            if (!vendor) return NextResponse.json({ error: "not_found" }, { status: 404 });
            logger.info("admin.marketplace.vendor.status", { vendorId: id, status });
            return NextResponse.json({ ok: true, vendor });
        } catch (error) {
            return internalError(error, { event: "admin.marketplace.vendor.status.failure" });
        }
    });
}
