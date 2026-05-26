import { NextResponse } from "next/server";

import { getMysteryBagDashboardData } from "@/lib/mystery-bags";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request) {
    return withRequestLogging(request, "GET /api/mystery-bags", async ({ logger, internalError }) => {
        try {
            const data = await getMysteryBagDashboardData();

            logger.info("mystery_bags.list.success", {
                itemCount: data.metrics.itemCount,
                topCount: data.topCards.length,
            });

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
