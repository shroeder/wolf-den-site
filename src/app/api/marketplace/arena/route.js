import { NextResponse } from "next/server";

import { arenaBoard, clearBout, fightRound, getArenaState, startBout } from "@/lib/marketplace/arena.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Arena is OWNER-GATED. The gate lives in arena.js (ARENA_UNLOCKED) rather than here, so every entry point
// is covered by one switch instead of each route remembering to check.
const noStore = (body, init) => NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init?.headers || {}) } });

export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/arena", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer?.id) return noStore({ unlocked: false }, { status: 200 });
            const [state, board] = await Promise.all([getArenaState(buyer.id), arenaBoard().catch(() => [])]);
            return noStore({ ...state, board });
        } catch (error) {
            return internalError(error, { event: "arena.get.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/arena", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer?.id) return noStore({ error: "unauthorized" }, { status: 401 });
            const b = await request.json().catch(() => ({}));
            switch (String(b?.action || "")) {
                case "start": return noStore(await startBout(buyer.id));
                case "stance": return noStore(await fightRound(buyer.id, String(b?.stance || "")));
                case "dismiss": return noStore(await clearBout(buyer.id));
                default: return noStore({ error: "bad_action" }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "arena.act.failure" });
        }
    });
}
