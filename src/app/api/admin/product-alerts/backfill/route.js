import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { reconcileInventory } from "@/lib/inventory-feed/reconcile";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Admin-triggered reconcile, hit from the accounting app's New-Arrival Alerts screen. Runs the same
 * unified reconcile as the cron/webhook: diffs current Square stock and posts new items / restocks /
 * price drops to Discord (no gate). ?force=1 re-posts recent changes even if already broadcast (the
 * "Re-post recent" button), for correcting a botched send.
 *
 * Auth via requireAdminAccess (same as the other /api/admin/* routes the app calls): a staff session
 * with remediations.run, or the legacy shared ADMIN_API_KEY the app sends today.
 *
 * Response keeps the field names the app already parses: posted / gated / considered / skipped.
 */
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/product-alerts/backfill", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "remediations.run", logger);

        if (authError) {
            return authError;
        }

        try {
            const force = ["1", "true", "yes"].includes(
                (new URL(request.url).searchParams.get("force") || "").toLowerCase()
            );

            const result = await reconcileInventory({ force });

            logger.info("admin.inventory_feed.reconcile.done", { force, ...result });

            return NextResponse.json(
                {
                    success: true,
                    posted: result.posted,
                    gated: 0,
                    considered: result.items,
                    skipped: result.discordSkipped || result.seeding || false,
                    new: result.new,
                    restock: result.restock,
                    priceDrop: result.priceDrop,
                    seeding: result.seeding,
                },
                { headers: { "Cache-Control": "no-store" } }
            );
        } catch (error) {
            return internalError(error, { event: "admin.inventory_feed.reconcile.failure" });
        }
    });
}
