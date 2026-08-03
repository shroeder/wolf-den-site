import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { hasAnswered, saveResponse, SYSTEMS } from "@/lib/marketplace/survey.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET  — should this member be asked, and what are the options?
// POST — record their answer (one row per member; answering again overwrites).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/survey", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            // The systems list rides along on the GET so the modal never hard-codes a copy of it — one source
            // of truth for the keys that end up in the database.
            if (!buyer) return NextResponse.json({ ask: false }, { headers: { "Cache-Control": "no-store" } });
            const answered = await hasAnswered(buyer.id);
            return NextResponse.json({ ask: !answered, systems: SYSTEMS }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.survey.get.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/survey", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ ok: false, error: "signed_out" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const r = await saveResponse(buyer.id, body);
            return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.survey.post.failure" });
        }
    });
}
