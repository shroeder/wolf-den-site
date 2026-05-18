import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { createAdminConsignor } from "@/lib/admin/consignors";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

function normalizePayload(body) {
    return {
        slug: typeof body?.slug === "string" ? body.slug.trim().toLowerCase() : "",
        displayName: typeof body?.displayName === "string" ? body.displayName.trim() : "",
        email: typeof body?.email === "string" ? body.email.trim().toLowerCase() : "",
        squareCategoryId: typeof body?.squareCategoryId === "string" ? body.squareCategoryId.trim() : "",
        payoutRate: body?.payoutRate,
    };
}

function validatePayload(payload) {
    if (!payload.slug || !payload.displayName || !payload.email || !payload.squareCategoryId || payload.payoutRate === undefined) {
        return "missing_required_fields";
    }

    if (!/^[a-z0-9-]+$/.test(payload.slug)) {
        return "invalid_slug";
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
        return "invalid_email";
    }

    const payoutRate = Number(payload.payoutRate);

    if (!Number.isFinite(payoutRate) || payoutRate < 0 || payoutRate > 1) {
        return "invalid_payout_rate";
    }

    payload.payoutRate = payoutRate;

    return null;
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/consignors/create", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);

        if (authError) {
            return authError;
        }

        let body;

        try {
            body = await request.json();
        } catch {
            logger.warn("admin.consignors.create.invalid_json");

            return NextResponse.json({ error: "invalid_json" }, { status: 400 });
        }

        const payload = normalizePayload(body);
        const payloadError = validatePayload(payload);

        if (payloadError) {
            logger.warn("admin.consignors.create.validation_failure", {
                reason: payloadError,
            });

            return NextResponse.json({ error: payloadError }, { status: 400 });
        }

        try {
            const result = await createAdminConsignor(payload);

            if (result.error) {
                logger.warn("admin.consignors.create.failed", {
                    reason: result.error,
                });

                return NextResponse.json({ error: result.error }, { status: result.status || 400 });
            }

            logger.info("admin.consignors.create.success", {
                consignorId: result.consignor.id,
                slug: result.consignor.slug,
            });

            return NextResponse.json(
                {
                    success: true,
                    consignor: result.consignor,
                },
                { status: 201 }
            );
        } catch (error) {
            return internalError(error, {
                event: "admin.consignors.create.failure",
            });
        }
    });
}
