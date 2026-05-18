import { NextResponse } from "next/server";

import { setConsignorNightlyReportsEnabled } from "@/lib/consignment/config";
import { getAuthenticatedConsignorFromCookies } from "@/lib/consignment/session";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function GET(request) {
    return withRequestLogging(request, "GET /api/consignment/preferences", async ({ logger, internalError }) => {
        try {
            const consignor = await getAuthenticatedConsignorFromCookies(logger);

            if (!consignor) {
                logger.warn("consignment.preferences.unauthorized");

                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            return NextResponse.json(
                {
                    nightlyReportsEnabled: Boolean(consignor.nightly_reports_enabled),
                },
                {
                    headers: {
                        "Cache-Control": "no-store",
                    },
                }
            );
        } catch (error) {
            return internalError(error, {
                event: "consignment.preferences.get.failure",
            });
        }
    });
}

export async function PATCH(request) {
    return withRequestLogging(request, "PATCH /api/consignment/preferences", async ({ logger, internalError }) => {
        try {
            const consignor = await getAuthenticatedConsignorFromCookies(logger);

            if (!consignor) {
                logger.warn("consignment.preferences.unauthorized");

                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            let body;

            try {
                body = await request.json();
            } catch {
                return NextResponse.json({ error: "invalid_json" }, { status: 400 });
            }

            if (typeof body?.nightlyReportsEnabled !== "boolean") {
                return NextResponse.json({ error: "invalid_nightly_reports_enabled" }, { status: 400 });
            }

            const updated = await setConsignorNightlyReportsEnabled(consignor.id, body.nightlyReportsEnabled);

            if (!updated) {
                return NextResponse.json({ error: "consignor_not_found" }, { status: 404 });
            }

            logger.info("consignment.preferences.updated", {
                consignorId: consignor.id,
                nightlyReportsEnabled: Boolean(updated.nightly_reports_enabled),
            });

            return NextResponse.json({
                success: true,
                nightlyReportsEnabled: Boolean(updated.nightly_reports_enabled),
            });
        } catch (error) {
            return internalError(error, {
                event: "consignment.preferences.patch.failure",
            });
        }
    });
}
