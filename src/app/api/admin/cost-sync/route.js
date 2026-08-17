import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { costSyncSummary, seedCostSyncFromItemCosts, sweepCostSync, requeueFailedCostSync } from "@/lib/cogs/cost-sync.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A sweep is a serial walk of Square catalog writes with a read-back each — slow on purpose. The default
// 10s function budget would cut it mid-row and leave the attempt counted but the outcome unrecorded.
export const maxDuration = 300;

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// WHAT SQUARE IS NOT CARRYING, AND WHY.
//
// GET  → { counts, unreconciled, rows }   ?state=failed|pending|ok|skipped to list one bucket.
// POST { action: "sweep" | "seed" | "retry" }
//   sweep — push the next batch of unreconciled costs to Square and read each one back
//   seed  — one-off: queue every cost we hold from our own intake (see OWN_COST_SOURCES)
//   retry — put failed rows back in the queue, for after the cause is fixed
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/cost-sync", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "reports.view", logger);
        if (authError) return authError;
        try {
            const { searchParams } = new URL(request.url);
            const summary = await costSyncSummary({
                state: searchParams.get("state"),
                limit: searchParams.get("limit"),
            });
            return noStore(summary);
        } catch (error) {
            return internalError(error, { event: "admin.cost_sync.get.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/cost-sync", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "cogs.edit", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            const action = String(body?.action || "sweep");

            if (action === "seed") {
                const seeded = await seedCostSyncFromItemCosts();
                const { counts } = await costSyncSummary({ limit: 1 });
                logger.info("admin.cost_sync.seeded", seeded);
                return noStore({ ok: true, ...seeded, counts });
            }

            if (action === "retry") {
                const requeued = await requeueFailedCostSync();
                logger.info("admin.cost_sync.requeued", requeued);
                return noStore({ ok: true, ...requeued });
            }

            if (action !== "sweep") {
                return noStore({ error: `Unknown action "${action}".` }, { status: 400 });
            }

            const result = await sweepCostSync({ limit: body?.limit });
            logger.info("admin.cost_sync.swept", { attempted: result.attempted, synced: result.synced, failed: result.failed });
            return noStore({ ok: true, ...result });
        } catch (error) {
            return internalError(error, { event: "admin.cost_sync.post.failure" });
        }
    });
}
