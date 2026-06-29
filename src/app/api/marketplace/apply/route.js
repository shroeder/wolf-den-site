import { NextResponse } from "next/server";

import { createApplication } from "@/lib/marketplace/applications.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/apply", async ({ logger, internalError }) => {
        try {
            const body = await request.json().catch(() => null);

            if (!body) {
                return NextResponse.json({ error: "Invalid request." }, { status: 400 });
            }

            try {
                const application = await createApplication(body);

                logger.info("marketplace.apply.success", { applicationId: application.id });

                return NextResponse.json({ ok: true, id: application.id });
            } catch (validationError) {
                logger.warn("marketplace.apply.rejected", { reason: validationError.message });

                return NextResponse.json({ error: validationError.message }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "marketplace.apply.failure" });
        }
    });
}
