import { NextResponse } from "next/server";

import { getAuthenticatedConsignorFromCookies } from "@/lib/consignment/session";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function GET(request) {
    return withRequestLogging(request, "GET /api/consignment/me", async ({ logger, internalError }) => {
        try {
            const consignor = await getAuthenticatedConsignorFromCookies(logger);

            if (!consignor) {
                logger.warn("consignment.me.unauthorized");

                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }

            logger.info("consignment.me.success", {
                consignorId: consignor.id,
            });

            return NextResponse.json(
                {
                    consignor: {
                        id: consignor.id,
                        slug: consignor.slug,
                        displayName: consignor.display_name,
                        email: consignor.email,
                        payoutRate: Number(consignor.payout_rate || 0),
                        nightlyReportsEnabled: Boolean(consignor.nightly_reports_enabled),
                        active: Boolean(consignor.active),
                        mustChangePassword: Boolean(consignor.must_change_password),
                    },
                },
                {
                    headers: {
                        "Cache-Control": "no-store",
                    },
                }
            );
        } catch (error) {
            return internalError(error, {
                event: "consignment.me.failure",
            });
        }
    });
}
