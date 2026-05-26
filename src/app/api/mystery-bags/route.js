import { NextResponse } from "next/server";

import { getMysteryBagDashboardData } from "@/lib/mystery-bags";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function GET(request) {
    return withRequestLogging(request, "GET /api/mystery-bags", async ({ internalError }) => {
        try {
            const data = await getMysteryBagDashboardData();

            return NextResponse.json(data, {
                headers: {
                    "Cache-Control": "no-store",
                },
            });
        } catch (error) {
            return internalError(error, {
                event: "mystery_bags.list.failure",
            });
        }
    });
}
