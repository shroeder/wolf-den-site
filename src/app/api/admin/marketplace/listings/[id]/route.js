import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { adminRemoveListing } from "@/lib/marketplace/admin.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Owner removal of any listing (soft delete), regardless of which vendor owns it.
export async function DELETE(request, { params }) {
    return withRequestLogging(request, "DELETE /api/admin/marketplace/listings/[id]", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const { id } = await params;
            const removed = await adminRemoveListing(id);
            if (!removed) return NextResponse.json({ error: "not_found_or_already_removed" }, { status: 404 });
            logger.info("admin.marketplace.listing.removed", { listingId: id });
            return NextResponse.json({ ok: true });
        } catch (error) {
            return internalError(error, { event: "admin.marketplace.listing.remove.failure" });
        }
    });
}
