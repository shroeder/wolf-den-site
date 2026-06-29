import { NextResponse } from "next/server";

import { getMarketplaceAdmin } from "@/lib/admin-app/web-session";
import { approveApplication } from "@/lib/marketplace/applications.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/marketplace/admin/applications/approve", async ({ logger, internalError }) => {
        try {
            const admin = await getMarketplaceAdmin();

            if (!admin) {
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            const { id } = await params;
            const result = await approveApplication(id);

            logger.info("marketplace.admin.approve.success", { applicationId: id, vendorId: result.vendorId });

            return NextResponse.json({
                ok: true,
                vendorId: result.vendorId,
                // Surfaced so Luke can copy/share the invite link directly, in addition to the email.
                inviteUrl: `/marketplace/onboard?token=${result.inviteToken}`,
            });
        } catch (error) {
            if (error.message === "Application not found.") {
                return NextResponse.json({ error: error.message }, { status: 404 });
            }

            return internalError(error, { event: "marketplace.admin.approve.failure" });
        }
    });
}
