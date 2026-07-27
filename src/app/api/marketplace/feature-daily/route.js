import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getFeatureDailies, claimFeatureDaily, getFeatureClaimCounts, FEATURE_DAILIES } from "@/lib/marketplace/feature-dailies.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID = new Set(Object.keys(FEATURE_DAILIES));

// Per-feature daily quests (farm/sailing). GET ?feature=farm → today's tasks; POST { feature, key } → claim.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/feature-daily", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            const params = new URL(request.url).searchParams;
            // ?counts=1 → claimable-task counts per feature (for nav/tab attention badges).
            if (params.get("counts")) return NextResponse.json({ counts: await getFeatureClaimCounts(buyer.id) }, { headers: { "Cache-Control": "no-store" } });
            const feature = params.get("feature") || "";
            if (!VALID.has(feature)) return NextResponse.json({ error: "bad_feature" }, { status: 400 });
            return NextResponse.json({ dailies: await getFeatureDailies(buyer.id, feature) }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "feature-daily.get.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/feature-daily", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            const b = await request.json().catch(() => ({}));
            const feature = String(b?.feature || "");
            if (!VALID.has(feature)) return NextResponse.json({ error: "bad_feature" }, { status: 400 });
            const res = await claimFeatureDaily(buyer.id, feature, String(b?.key || ""));
            return NextResponse.json(res, { status: res?.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "feature-daily.claim.failure" });
        }
    });
}
