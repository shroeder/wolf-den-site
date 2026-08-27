import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getCasinoPlayerReport } from "@/lib/marketplace/casino-report.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── ONE MEMBER, ALL THE WAY DOWN ─────────────────────────────────────────────────────────────────────────────
// What they spent in coin, what they won in chips, on which cabinet, and out of which feature — pay line,
// bonus, keno, blackjack or bingo. Read off the coin and chip ledgers, same as the floor report beside it, so
// the two screens cannot disagree about a total. See casino-report.js.
//
// GET ?id=<buyer uuid>&days=1|7|30. Read-only.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/casino/player", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const url = new URL(request.url);
            const id = (url.searchParams.get("id") || "").trim();
            // A buyer id is a UUID, and a malformed one reaches Postgres as a cast error rather than an empty
            // result — which surfaces on the screen as a server failure instead of "no such member".
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
                return NextResponse.json({ error: "bad_id" }, { status: 400 });
            }
            const days = Number(url.searchParams.get("days")) || 7;
            const data = await getCasinoPlayerReport({ buyerId: id, days });
            if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
            return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.casino.player.failure" });
        }
    });
}
