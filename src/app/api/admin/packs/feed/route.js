import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { recentPackOpens } from "@/lib/marketplace/pack-telemetry.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── EVERY PACK OPEN, NEWEST FIRST ────────────────────────────────────────────────────────────────────────────
// Luke: "I want to know whenever somebody pulls a pack ... who it was, what they pulled, what pack they decided
// to open, how much they spent. So I want an alert on my admin app that I can click and it pulls up those
// details."
//
// This is what the alert opens onto. Separate from /telemetry, which is aggregates — opens by day, by tier, by
// pool — and cannot answer "what just happened", which is the only question a notification is ever about.
//
// ⚠️ `mystery.report` RATHER THAN `mystery.manage`. This is a reporting view: it names members and the money
// they spent and changes nothing. It sits with the telemetry screen's permission for that reason, not with the
// pull queue's, which is floor work that moves real cards.
//
// ?before=<iso> pages backwards. Keyset rather than OFFSET because the feed grows at the head: an offset page
// two re-reads rows that have shifted down since page one was drawn, and the duplicate is invisible.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/packs/feed", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "mystery.report", logger);
        if (authError) return authError;
        try {
            const url = new URL(request.url);
            const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 50));
            const beforeRaw = url.searchParams.get("before");
            const before = beforeRaw && !Number.isNaN(Date.parse(beforeRaw)) ? new Date(beforeRaw) : null;
            const opens = await recentPackOpens({ limit, before });
            return NextResponse.json(
                {
                    opens,
                    // The cursor for the next page, so the client never has to know the shape of the key.
                    nextBefore: opens.length === limit ? opens[opens.length - 1].at : null,
                },
                { headers: { "Cache-Control": "no-store" } },
            );
        } catch (error) {
            return internalError(error, { event: "admin.pack_feed.failure" });
        }
    });
}
