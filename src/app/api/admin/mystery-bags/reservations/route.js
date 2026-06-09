import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { reserveMysteryBagCards } from "@/lib/mystery-bags";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/mystery-bags/reservations", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);

        if (authError) {
            return authError;
        }

        let body;

        try {
            body = await request.json();
        } catch {
            return NextResponse.json(
                {
                    error: "bad_request",
                    code: "bad_request",
                    message: "Invalid JSON body.",
                },
                { status: 400 }
            );
        }

        try {
            const result = await reserveMysteryBagCards(body || {});

            return NextResponse.json({
                reserved: result.reserved,
                requestedQuantity: result.requestedQuantity,
                reservedCount: result.reservedQuantity,
                remainingUnreservedUnits: result.remainingUnreservedUnits,
            });
        } catch (error) {
            return internalError(error, {
                event: "admin.mystery_bags.reservations.failure",
            });
        }
    });
}
