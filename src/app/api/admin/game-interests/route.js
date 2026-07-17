import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getGameInterestReport } from "@/lib/marketplace/profile.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Admin: who plays what. GET ?game=magic filters the roster to that game (default: everyone who answered).
// Returns { counts, answered, members:[{ name, alias, email, interests }] }.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/game-interests", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const game = new URL(request.url).searchParams.get("game");
            return noStore(await getGameInterestReport({ game: game || null }));
        } catch (error) {
            return internalError(error, { event: "admin.game_interests.failure" });
        }
    });
}
