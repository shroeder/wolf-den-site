import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { getMysterySoldEventByIdempotencyKey } from "@/lib/mystery-bags";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function GET(request, { params }) {
    return withRequestLogging(request, "GET /api/admin/mystery-bags/idempotency/[key]", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);

        if (authError) {
            return authError;
        }

        const { key } = await params;

        if (!key || typeof key !== "string") {
            return NextResponse.json(
                {
                    error: "bad_request",
                    code: "bad_request",
                    message: "Missing idempotency key.",
                },
                { status: 400 }
            );
        }

        try {
            const event = await getMysterySoldEventByIdempotencyKey(key);

            if (!event) {
                return NextResponse.json(
                    {
                        error: "not_found",
                        code: "not_found",
                        message: "No sold event found for the provided key.",
                    },
                    { status: 404 }
                );
            }

            return NextResponse.json({ event });
        } catch (error) {
            return internalError(error, {
                event: "admin.mystery_bags.idempotency.failure",
                key,
            });
        }
    });
}
