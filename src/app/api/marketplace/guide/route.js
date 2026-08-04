import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { claimGuideChapter, claimGuideStep, getGuide } from "@/lib/marketplace/guide.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Pathfinder. GET → the whole book plus where you are in it; POST { step } claims a browser-permission step,
// POST { chapter } collects a finished chapter's purse. Everything else completes itself from real activity.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/guide", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ signedIn: false, chapters: [] }, { headers: { "Cache-Control": "no-store" } });
            return NextResponse.json(await getGuide(buyer.id), { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "guide.get.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/guide", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            const b = await request.json().catch(() => ({}));
            const res = b?.chapter
                ? await claimGuideChapter(buyer.id, String(b.chapter))
                : await claimGuideStep(buyer.id, String(b?.step || ""));
            return NextResponse.json(res, { status: res?.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "guide.claim.failure" });
        }
    });
}
