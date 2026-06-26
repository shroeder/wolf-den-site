import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { syncStockIncreasesToDiscord } from "@/lib/product-alerts/webhook-discord";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Admin-triggered Discord catch-up. Hit from the accounting app ("Sync arrivals" button) to post any
 * in-stock item whose Square count is higher than our last-known value — the same quantity-increase
 * trigger as the live webhook, swept across the catalog. Recovers increases the live webhook missed.
 * Same single-card $50 gate; idempotent (records the new counts), so it's safe to press repeatedly.
 *
 * Auth via requireAdminAccess (same as the other /api/admin/* routes the app calls): accepts a staff
 * session with remediations.run, or the legacy shared ADMIN_API_KEY the app sends today.
 */
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/product-alerts/backfill", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "remediations.run", logger);

        if (authError) {
            return authError;
        }

        try {
            const url = new URL(request.url);
            const daysParam = Number(url.searchParams.get("days"));
            const lookbackDays = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : 14;
            const forceRepost = ["1", "true", "yes"].includes((url.searchParams.get("force") || "").toLowerCase());

            const result = await syncStockIncreasesToDiscord({ lookbackDays, forceRepost });

            logger.info("admin.product_alerts.sync.done", { ...result });

            return NextResponse.json({ success: true, ...result }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.product_alerts.sync.failure" });
        }
    });
}
