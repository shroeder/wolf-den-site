import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { approveApplication, rejectApplication } from "@/lib/marketplace/applications.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Approve (creates the vendor + emails an invite) or reject a vendor application.
export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/admin/marketplace/applications/[id]", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const { id } = await params;
            const body = await request.json().catch(() => ({}));
            const action = String(body.action || "").trim();
            if (action === "approve") {
                const result = await approveApplication(id);
                logger.info("admin.marketplace.application.approved", { applicationId: id, vendorId: result.vendorId, emailSent: result.emailSent });
                return NextResponse.json({
                    ok: true,
                    vendorId: result.vendorId,
                    emailSent: result.emailSent,
                    // Fallback so the invite can be shared manually if the email didn't go out.
                    inviteUrl: `${new URL(request.url).origin}/marketplace/onboard?token=${result.inviteToken}`,
                });
            }
            if (action === "reject") {
                await rejectApplication(id);
                logger.info("admin.marketplace.application.rejected", { applicationId: id });
                return NextResponse.json({ ok: true });
            }
            return NextResponse.json({ error: "action must be approve | reject" }, { status: 400 });
        } catch (error) {
            return internalError(error, { event: "admin.marketplace.application.action.failure" });
        }
    });
}
