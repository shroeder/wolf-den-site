import { NextResponse } from "next/server";

import { requireAdminAppPermission } from "@/lib/admin-app/auth";
import { backfillRecentArrivalsToDiscord } from "@/lib/product-alerts/webhook-discord";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Admin-triggered Discord catch-up. Hit from the admin app (a "catch up" button) to re-announce
 * recent in-stock arrivals — e.g. anything missed while the old path was misbehaving. Posts to
 * Discord directly (same single-card $50 gate as the live webhook) and is idempotent via
 * last_posted_at, so it's safe to press more than once. Lookback defaults to 168h (7 days); override
 * with ?hours=N. Gated on the staff.manage permission (same as the integrations endpoints).
 */
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin-app/product-alerts/backfill", async ({ logger, internalError }) => {
        const gate = await requireAdminAppPermission(request, "staff.manage", logger);

        if (gate.response) {
            return gate.response;
        }

        try {
            const hoursParam = Number(new URL(request.url).searchParams.get("hours"));
            const lookbackHours = Number.isFinite(hoursParam) && hoursParam > 0 ? hoursParam : 168;

            const result = await backfillRecentArrivalsToDiscord({ lookbackHours });

            logger.info("admin_app.product_alerts.backfill.done", {
                userId: gate.session.user.id,
                ...result,
            });

            return NextResponse.json({ success: true, ...result }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin_app.product_alerts.backfill.failure" });
        }
    });
}
