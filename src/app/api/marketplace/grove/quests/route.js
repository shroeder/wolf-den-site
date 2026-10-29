import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session";
import { groveOpen } from "@/lib/marketplace/grove.js";
import { questBoard, claimStep, claimDailyKey } from "@/lib/marketplace/grove-quests.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) =>
    NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

// ── HANDING IN A FINISHED STEP ───────────────────────────────────────────────────────────────────────────────
// The board itself rides the Grove session, so this exists for the WRITES — and for a reload after one, which
// is why GET answers too.
//
// ⚠️ NOTHING ABOUT THE REWARD COMES FROM THE REQUEST. The body names a step and nothing else; claimStep reads
// what that step asked for and what it pays out of the catalogue. A posted amount would make this a gold
// faucet with a text box attached.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/grove/quests", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer || !groveOpen(buyer.id)) return noStore({ error: "Not found." }, { status: 404 });
            return noStore({ ok: true, quests: await questBoard(buyer.id) });
        } catch (error) {
            return internalError(error, { event: "grove.quests.get.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/grove/quests", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer || !groveOpen(buyer.id)) return noStore({ error: "Not found." }, { status: 404 });

            const body = await request.json().catch(() => ({}));

            // The marshal's daily key is a write with no step attached, so it rides the same route rather
            // than earning an endpoint of its own.
            if (body?.daily) {
                const r = await claimDailyKey(buyer.id, Number(body.map) || 1);
                return noStore(r, { status: r.ok ? 200 : 409 });
            }

            const r = await claimStep(buyer.id, String(body?.stepId || ""));
            return noStore(r, { status: r.ok ? 200 : 409 });
        } catch (error) {
            return internalError(error, { event: "grove.quests.post.failure" });
        }
    });
}
