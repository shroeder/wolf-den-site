import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getSpinState, doSpin, buySpinToken } from "@/lib/marketplace/spin.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — the member's spin state (wheel, free-spin availability, tokens, gold).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/spin", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            return NextResponse.json(await getSpinState(buyer?.id || null), { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.spin.get.failure" });
        }
    });
}

// POST — { action: "spin" } to spin, { action: "buy" } to buy a spin token with gold.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/spin", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const res = body?.action === "buy" ? await buySpinToken(buyer.id) : await doSpin(buyer.id);
            return NextResponse.json(res, { status: res.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.spin.action.failure" });
        }
    });
}
