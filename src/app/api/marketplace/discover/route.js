import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { discoverOpenFor } from "@/lib/marketplace/discover-gate.js";
import { discoverRows } from "@/lib/marketplace/discover.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) =>
    NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

// Stage one of the rollout: owner only. See discover-gate.js — the condition is IMPORTED, never re-derived.
//
// ⚠️ NO TASTE PARAMETERS AND NO POST. The first cut asked two questions and used the answers to pick which
// category you landed in. With vertical navigation the categories ARE the chooser, so there is nothing to
// ask and nothing to persist — see the note at the top of discover.js.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/discover", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer || !discoverOpenFor(buyer.id)) return noStore({ open: false }, { status: 403 });

            const skipIds = (new URL(request.url).searchParams.get("skip") || "")
                .split(",").map((s) => s.trim()).filter(Boolean);

            return noStore({ open: true, rows: await discoverRows({ skipIds }) });
        } catch (error) {
            return internalError(error, { event: "discover.list.failure" });
        }
    });
}
