import { NextResponse } from "next/server";

import { runRecapDigest } from "@/lib/marketplace/recap-digest.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // a batch of individually-composed emails

// Weekly win-back recap for members push can't reach. The batching/cooldown/"is there anything to say" rules
// all live in runRecapDigest, so running this more often than intended can't turn into a mass mailing.
//
// ?dryRun=1 reports exactly who WOULD be emailed and why, without sending or stamping anything.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/recap-digest", async ({ internalError }) => {
        try {
            const url = new URL(request.url);
            const dryRun = ["1", "true", "yes"].includes(String(url.searchParams.get("dryRun") || "").toLowerCase());
            const limit = Number(url.searchParams.get("limit")) || undefined;
            const result = await runRecapDigest({ limit, dryRun });
            return NextResponse.json({ success: true, ...result }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "recap_digest.run.failure" });
        }
    });
}
