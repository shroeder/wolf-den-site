import { NextResponse } from "next/server";

import { recomputePools } from "@/lib/marketplace/pack-pools.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// ── WHAT A CATEGORY PACK COSTS TOMORROW ──────────────────────────────────────────────────────────────────────
// docs/category-packs.md §4.2. Prices are derived from the live shelf — ceil(EV / $5) * $5 — and they are
// derived HERE rather than at open time, because a price recomputed on the way into a purchase is a price
// that can move between the screen quoting it and the member tapping it.
//
// It also decides which pools are open at all: a pool where one card carries more than 15% of the value
// closes itself, which is what keeps Yu-Gi-Oh shut until the shelf fixes it, with nobody having to remember.
//
// ⚠️ ONCE A NIGHT IS THE POINT, NOT A COMPROMISE. See the hold in recomputePools — a price may fall whenever
// it likes and may only rise after a week. Running this more often would not make prices fresher; it would
// make them flicker across a $5 boundary.
function isAuthorized(request) {
    const expected = process.env.CRON_SECRET;
    if (!expected) return false;
    return (request.headers.get("authorization") || "") === `Bearer ${expected}`;
}

export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/pack-pool-prices", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) {
                logger.warn("pack_pools.cron.unauthorized");
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }
            const pools = await recomputePools();
            return NextResponse.json({ success: true, pools });
        } catch (error) {
            return internalError(error, { event: "pack_pools.cron.failure" });
        }
    });
}
