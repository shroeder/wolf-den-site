import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { backfillRecentArrivalsToDiscord } from "@/lib/product-alerts/webhook-discord";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Admin-triggered Discord catch-up. Hit from the accounting app ("catch up" button) to re-announce
 * recent in-stock arrivals — e.g. anything missed while the old path was misbehaving. Posts to
 * Discord directly (same single-card $50 gate as the live webhook) and is idempotent via
 * last_posted_at, so it's safe to press more than once. Lookback defaults to 168h (7 days); override
 * with ?hours=N.
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
            const hoursParam = Number(new URL(request.url).searchParams.get("hours"));
            const lookbackHours = Number.isFinite(hoursParam) && hoursParam > 0 ? hoursParam : 168;

            const result = await backfillRecentArrivalsToDiscord({ lookbackHours });

            logger.info("admin.product_alerts.backfill.done", { ...result });

            return NextResponse.json({ success: true, ...result }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.product_alerts.backfill.failure" });
        }
    });
}
