import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { createAdminConsignor } from "@/lib/admin/consignors";

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
    const authError = verifyAdminApiKey(request);

    if (authError) {
        return authError;
    }

    let body;

    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const payload = normalizePayload(body);
    const payloadError = validatePayload(payload);

    if (payloadError) {
        return NextResponse.json({ error: payloadError }, { status: 400 });
    }

    try {
        const result = await createAdminConsignor(payload);

        if (result.error) {
            return NextResponse.json({ error: result.error }, { status: result.status || 400 });
        }

        return NextResponse.json(
            {
                success: true,
                consignor: result.consignor,
            },
            { status: 201 }
        );
    } catch {
        return NextResponse.json({ error: "internal_server_error" }, { status: 500 });
    }
}
