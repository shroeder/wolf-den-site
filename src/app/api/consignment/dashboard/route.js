import { NextResponse } from "next/server";

import { getConsignorDashboard } from "@/lib/consignment/portal-data";
import { getAuthenticatedConsignorFromCookies } from "@/lib/consignment/session";

export const runtime = "nodejs";

export async function GET() {
    try {
        const consignor = await getAuthenticatedConsignorFromCookies();

        if (!consignor) {
            return NextResponse.json({ error: "unauthorized" }, { status: 401 });
        }

        const dashboard = await getConsignorDashboard(consignor.id);

        return NextResponse.json(dashboard, {
            headers: {
                "Cache-Control": "no-store",
            },
        });
    } catch {
        return NextResponse.json({ error: "internal_server_error" }, { status: 500 });
    }
}
