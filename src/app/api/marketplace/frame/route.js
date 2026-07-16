import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { equipFrame } from "@/lib/marketplace/profile.js";
import { awardOnce } from "@/lib/marketplace/xp.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Equip a cosmetic profile frame. Body: { frame: "<id>" | "none" }. Validated by level server-side.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/frame", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const chosen = String(body?.frame || "none");
            const profile = await equipFrame(buyer.id, chosen);
            if (chosen !== "none") await awardOnce(buyer.id, "first_equip", { frame: chosen }); // onboarding: customized their look
            return noStore({ profile });
        } catch (error) {
            if (error?.message && !/database|query/i.test(error.message)) {
                return noStore({ error: error.message }, { status: 400 });
            }
            return internalError(error, { event: "marketplace.frame.equip.failure" });
        }
    });
}
