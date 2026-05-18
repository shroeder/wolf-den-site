import { NextResponse } from "next/server";

import { getAdminConsignorDetail, updateAdminConsignor } from "@/lib/admin/consignors";
import { verifyAdminApiKey } from "@/lib/admin/admin-auth";

export const runtime = "nodejs";

function normalizePatchPayload(body) {
    const updates = {};

    if (body?.displayName !== undefined) {
        updates.displayName = typeof body.displayName === "string" ? body.displayName.trim() : body.displayName;
    }

    if (body?.email !== undefined) {
        updates.email = typeof body.email === "string" ? body.email.trim().toLowerCase() : body.email;
    }

    if (body?.squareCategoryId !== undefined) {
        updates.squareCategoryId = typeof body.squareCategoryId === "string" ? body.squareCategoryId.trim() : body.squareCategoryId;
    }

    if (body?.payoutRate !== undefined) {
        updates.payoutRate = body.payoutRate;
    }

    if (body?.active !== undefined) {
        updates.active = body.active;
    }

    return updates;
}

function validatePatchPayload(updates) {
    if (updates.displayName !== undefined && (!updates.displayName || typeof updates.displayName !== "string")) {
        return "invalid_display_name";
    }

    if (updates.email !== undefined) {
        if (typeof updates.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email)) {
            return "invalid_email";
        }
    }

    if (updates.squareCategoryId !== undefined && (!updates.squareCategoryId || typeof updates.squareCategoryId !== "string")) {
        return "invalid_square_category_id";
    }

    if (updates.payoutRate !== undefined) {
        const payoutRate = Number(updates.payoutRate);

        if (!Number.isFinite(payoutRate) || payoutRate < 0 || payoutRate > 1) {
            return "invalid_payout_rate";
        }

        updates.payoutRate = payoutRate;
    }

    if (updates.active !== undefined && typeof updates.active !== "boolean") {
        return "invalid_active";
    }

    return null;
}

export async function GET(request, { params }) {
    const authError = verifyAdminApiKey(request);

    if (authError) {
        return authError;
    }

    const { id } = await params;

    try {
        const detail = await getAdminConsignorDetail(id);

        if (!detail) {
            return NextResponse.json({ error: "consignor_not_found" }, { status: 404 });
        }

        return NextResponse.json(detail, {
            headers: {
                "Cache-Control": "no-store",
            },
        });
    } catch {
        return NextResponse.json({ error: "internal_server_error" }, { status: 500 });
    }
}

export async function PATCH(request, { params }) {
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

    const updates = normalizePatchPayload(body);
    const payloadError = validatePatchPayload(updates);

    if (payloadError) {
        return NextResponse.json({ error: payloadError }, { status: 400 });
    }

    const { id } = await params;

    try {
        const result = await updateAdminConsignor(id, updates);

        if (result.error) {
            return NextResponse.json({ error: result.error }, { status: result.status || 400 });
        }

        return NextResponse.json({ success: true, consignor: result.consignor });
    } catch {
        return NextResponse.json({ error: "internal_server_error" }, { status: 500 });
    }
}
