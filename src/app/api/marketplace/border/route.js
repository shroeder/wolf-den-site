import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { equipBorder } from "@/lib/marketplace/profile.js";
import { awardOnce } from "@/lib/marketplace/xp.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Equip a cosmetic profile border. Body: { border: "<id>" | "none" }. Validated against the member's
// level server-side, so a locked frame can't be equipped by a crafted request.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/border", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const chosen = String(body?.border || "none");
            const profile = await equipBorder(buyer.id, chosen);
            if (chosen !== "none") await awardOnce(buyer.id, "first_equip", { border: chosen }); // onboarding: customized their look
            return noStore({ profile });
        } catch (error) {
            if (error?.message && !/database|query/i.test(error.message)) {
                return noStore({ error: error.message }, { status: 400 });
            }
            return internalError(error, { event: "marketplace.border.equip.failure" });
        }
    });
}
