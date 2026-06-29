import { NextResponse } from "next/server";

import { getMarketplaceAdmin } from "@/lib/admin-app/web-session";
import { rejectApplication } from "@/lib/marketplace/applications.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/marketplace/admin/applications/reject", async ({ logger, internalError }) => {
        try {
            const admin = await getMarketplaceAdmin();

            if (!admin) {
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            const { id } = await params;
            await rejectApplication(id);

            logger.info("marketplace.admin.reject.success", { applicationId: id });

            return NextResponse.json({ ok: true });
        } catch (error) {
            if (error.message === "Application not found.") {
                return NextResponse.json({ error: error.message }, { status: 404 });
            }

            return internalError(error, { event: "marketplace.admin.reject.failure" });
        }
    });
}
