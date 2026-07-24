import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { sendVendorListingNudgeEmail } from "@/lib/marketplace/email.js";
import { listVendorListings } from "@/lib/marketplace/listings.js";
import { getVendorById } from "@/lib/marketplace/vendors.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin action: email a vendor a friendly "list your items" nudge. Body { note } is an optional custom line.
export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/admin/marketplace/vendors/[id]/nudge", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const { id } = await params;
            const vendor = await getVendorById(id);
            if (!vendor) return NextResponse.json({ error: "not_found" }, { status: 404 });
            if (!vendor.email) return NextResponse.json({ error: "no_email" }, { status: 400 });
            const body = await request.json().catch(() => ({}));
            const listings = await listVendorListings(id).catch(() => []);
            const sent = await sendVendorListingNudgeEmail(vendor.email, {
                name: vendor.displayName || vendor.display_name || "",
                listingCount: Array.isArray(listings) ? listings.length : 0,
                note: String(body?.note || "").slice(0, 400),
            });
            if (!sent) return NextResponse.json({ error: "email_unavailable" }, { status: 503 });
            logger.info?.("marketplace.vendor.nudge_sent", { vendorId: id });
            return NextResponse.json({ ok: true, to: vendor.email });
        } catch (error) {
            return internalError(error, { event: "marketplace.vendor.nudge.failure" });
        }
    });
}
