import { NextResponse } from "next/server";

import { unsubscribeByToken } from "@/lib/outreach/unsubscribe";
import { withRequestLogging } from "@/lib/server-logger";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";

export async function GET(request) {
    return withRequestLogging(request, "GET /api/outreach/unsubscribe", async ({ internalError }) => {
        try {
            const { searchParams } = new URL(request.url);
            const ok = await unsubscribeByToken(searchParams.get("t") || "");
            const to = new URL("/marketplace", process.env.NEXT_PUBLIC_BASE_URL || SITE_URL);
            to.searchParams.set("unsubscribed", ok ? "1" : "invalid");
            return NextResponse.redirect(to);
        } catch (error) {
            return internalError(error, { event: "outreach.unsubscribe.failed" });
        }
    });
}
