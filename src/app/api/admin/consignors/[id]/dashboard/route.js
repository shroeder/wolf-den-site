import { NextResponse } from "next/server";

import { getAdminConsignorDashboard } from "@/lib/admin/consignors";
import { verifyAdminApiKey } from "@/lib/admin/admin-auth";

export const runtime = "nodejs";

export async function GET(request, { params }) {
    const authError = verifyAdminApiKey(request);

    if (authError) {
        return authError;
    }

    const { id } = await params;
    const lookbackDaysParam = new URL(request.url).searchParams.get("lookbackDays");
    const lookbackDays = lookbackDaysParam ? Number(lookbackDaysParam) : undefined;

    if (lookbackDays !== undefined && (!Number.isFinite(lookbackDays) || lookbackDays <= 0)) {
        return NextResponse.json({ error: "invalid_lookback_days" }, { status: 400 });
    }

    try {
        const result = await getAdminConsignorDashboard(id, {
            lookbackDays,
        });

        if (result.error) {
            return NextResponse.json({ error: result.error }, { status: result.status || 400 });
        }

        return NextResponse.json(result.dashboard, {
            headers: {
                "Cache-Control": "no-store",
            },
        });
    } catch {
        return NextResponse.json({ error: "internal_server_error" }, { status: 500 });
    }
}
