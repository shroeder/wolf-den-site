import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { sendAdminSetupEmail } from "@/lib/admin/email";
import { createAdminSetupToken } from "@/lib/admin/setup-token";
import { db } from "@/lib/db";

export const runtime = "nodejs";

function errorResponse(error, status) {
    return NextResponse.json({ error }, { status });
}

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
    const authError = verifyAdminApiKey(request);

    if (authError) {
        return authError;
    }

    let body;

    try {
        body = await request.json();
    } catch {
        return errorResponse("invalid_json", 400);
    }

    const payload = normalizePayload(body);
    const payloadError = validatePayload(payload);

    if (payloadError) {
        return errorResponse(payloadError, 400);
    }

    try {
        const existingSlug = await db.queryOne("SELECT id FROM consignors WHERE slug = $1", [payload.slug]);

        if (existingSlug) {
            return errorResponse("slug_already_exists", 409);
        }

        const existingEmail = await db.queryOne("SELECT id FROM consignors WHERE email = $1", [payload.email]);

        if (existingEmail) {
            return errorResponse("email_already_exists", 409);
        }

        const createdRows = await db.query(
            `INSERT INTO consignors (slug, display_name, email, square_category_id, payout_rate, active)
             VALUES ($1, $2, $3, $4, $5, TRUE)
             RETURNING id, slug, display_name, email, square_category_id, payout_rate`,
            [payload.slug, payload.displayName, payload.email, payload.squareCategoryId, payload.payoutRate]
        );

        const consignor = createdRows[0];

        if (!consignor?.id) {
            return errorResponse("consignor_create_failed", 500);
        }

        const setupToken = await createAdminSetupToken(consignor.id);

        await sendAdminSetupEmail(consignor, setupToken);

        return NextResponse.json(
            {
                success: true,
                consignor: {
                    id: consignor.id,
                    slug: consignor.slug,
                    displayName: consignor.display_name,
                    email: consignor.email,
                    squareCategoryId: consignor.square_category_id,
                    payoutRate: Number(consignor.payout_rate),
                },
            },
            { status: 201 }
        );
    } catch {
        return errorResponse("internal_server_error", 500);
    }
}
